import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, InviteCandidatesDto, UpdateJobDto } from './dto';
import { Plan, Role, CandidateStatus, Status, Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../common/email.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';
import { TimeWindowService } from '../common/time-window.service';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  // In-memory progress tracking for invitation sending
  private invitationProgress = new Map<
    string,
    {
      total: number;
      current: number;
      succeeded: number;
      failed: number;
      details: Array<{
        email: string;
        status: 'pending' | 'sending' | 'success' | 'error';
        error?: string;
      }>;
      completed: boolean;
    }
  >();

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
    private timeWindowService: TimeWindowService,
  ) {}

  async createJob(userId: string, userPlan: Plan, dto: CreateJobDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    // Admin can create jobs for any companyId if it was passed in controller,
    // but here userId is already the targetId.
    if (user?.role !== Role.COMPANY && user?.role !== Role.ADMIN) {
      throw new ForbiddenException('Only companies and admins can create jobs');
    }

    // Validate time gap (minimum 30 minutes)
    const startTime = new Date(dto.interviewStartTime);
    const endTime = new Date(dto.interviewEndTime);
    const diffMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);

    if (diffMinutes < 0) {
      throw new BadRequestException(
        'Interview end time cannot be before start time',
      );
    }

    if (diffMinutes < 30) {
      throw new BadRequestException(
        'Interview end time must be at least 30 minutes after start time',
      );
    }

    // Bypassed for ADMIN
    const isAdmin = user?.role === Role.ADMIN;

    // Enforce FREE plan job limit (5 jobs max)
    if (!isAdmin && userPlan === Plan.FREE) {
      const existingJobCount = await this.prisma.job.count({
        where: { companyId: userId },
      });
      if (existingJobCount >= 5) {
        throw new ForbiddenException(
          'Free plan limited to 5 jobs. Upgrade to Pro for more jobs.',
        );
      }
    }

    // Enforce plan restrictions
    const jobSettings = {
      tabTracking: dto.tabTracking ?? true,
      eyeTracking: dto.eyeTracking ?? false,
      multiFaceDetection: dto.multiFaceDetection ?? false,
      fullScreenMode: dto.fullScreenMode ?? false,
      noTextTyping: dto.noTextTyping ?? false,
    };

    // Apply plan-based feature restrictions (Bypassed for ADMIN)
    if (!isAdmin) {
      if (userPlan === Plan.FREE) {
        jobSettings.eyeTracking = false;
        jobSettings.multiFaceDetection = false;
      }

      if (userPlan === Plan.PRO) {
        jobSettings.multiFaceDetection = false;
      }
    }

    const job = await this.prisma.job.create({
      data: {
        title: dto.title,
        roleCategory: dto.roleCategory,
        description: dto.description,
        notes: dto.notes,
        companyId: userId,
        interviewStartTime: new Date(dto.interviewStartTime),
        interviewEndTime: new Date(dto.interviewEndTime),
        planAtCreation: userPlan ?? Plan.FREE,
        timezone: dto.timezone,
        customQuestions: dto.customQuestions || [],
        aiSpecificRequirements: dto.aiSpecificRequirements,
        ...jobSettings,
      },
    });

    return job;
  }

  async getJobs(userId: string, requesterRole?: Role) {
    const where: Prisma.JobWhereInput =
      requesterRole === Role.ADMIN && !userId ? {} : { companyId: userId };
    const jobs = await this.prisma.job.findMany({
      where,
      include: {
        _count: {
          select: { candidates: true, sessions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((job) => ({
      ...job,
      candidateCount: job._count.candidates,
      sessionCount: job._count.sessions,
      candidates: [], // Emulating empty for compatibility or just remove dependency
    }));
  }

  async getJobById(jobId: string, userId: string, requesterRole?: Role) {
    const where: Prisma.JobWhereInput = { id: jobId };
    if (requesterRole !== Role.ADMIN) {
      where.companyId = userId;
    }

    const job = await this.prisma.job.findFirst({
      where,
      include: {
        _count: {
          select: { candidates: true, sessions: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job;
  }

  async inviteCandidates(
    jobId: string,
    userId: string,
    userPlan: Plan,
    dto: InviteCandidatesDto,
    requesterRole?: Role,
  ) {
    const where: Prisma.JobWhereInput = { id: jobId };
    if (requesterRole !== Role.ADMIN) {
      where.companyId = userId;
    }

    const job = await this.prisma.job.findFirst({
      where,
      include: { candidates: true, company: true },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Enforce FREE plan candidate limit (Bypassed for ADMIN)
    if (userPlan === Plan.FREE && requesterRole !== Role.ADMIN) {
      const totalCandidates = job.candidates.length + dto.candidates.length;
      if (totalCandidates > 30) {
        throw new ForbiddenException(
          'Free plan limited to 30 candidates per job. Upgrade to Pro for unlimited.',
        );
      }
    }

    // Initialize progress tracking
    const progressKey = `${jobId}-${userId}`;
    this.invitationProgress.set(progressKey, {
      total: dto.candidates.length,
      current: 0,
      succeeded: 0,
      failed: 0,
      details: dto.candidates.map((c) => ({
        email: c.email,
        status: 'pending',
      })),
      completed: false,
    });

    // Process invitations wirelessly (don't await - fire and forget)
    this.processInvitationsAsync(
      jobId,
      userId,
      userPlan,
      dto,
      job,
      progressKey,
    ).catch((err) => console.error('[Jobs] Invitation processing error:', err));

    return {
      message: 'Invitation processing started',
      progressKey,
      total: dto.candidates.length,
    };
  }

  private async processInvitationsAsync(
    jobId: string,
    userId: string,
    userPlan: Plan,
    dto: InviteCandidatesDto,
    job: Prisma.JobGetPayload<{ include: { company: true } }>,
    progressKey: string,
  ) {
    const appUrl = this.configService.get<string>('APP_URL');
    const progress = this.invitationProgress.get(progressKey);

    for (let i = 0; i < dto.candidates.length; i++) {
      const candidateDto = dto.candidates[i];

      try {
        // Update status to sending
        if (progress) {
          progress.details[i].status = 'sending';
          progress.current = i + 1;
        }

        // Check if candidate already exists for this job
        let candidate = await this.prisma.candidate.findFirst({
          where: {
            jobId,
            email: candidateDto.email,
          },
        });

        if (candidate) {
          candidate = await this.prisma.candidate.update({
            where: { id: candidate.id },
            data: {
              name: candidateDto.name,
              invitedAt: new Date(),
            },
          });
        } else {
          const interviewLink = uuidv4();
          candidate = await this.prisma.candidate.create({
            data: {
              jobId,
              name: candidateDto.name,
              email: candidateDto.email,
              interviewLink,
              invitedAt: new Date(),
            },
          });
        }

        // Send email
        await this.emailService.sendInterviewInvite({
          to: candidate.email,
          candidateName: candidate.name,
          jobTitle: job.title,
          companyName: job.company.name,
          scheduledTime: job.interviewStartTime,
          interviewLink: `${appUrl}/interview/${candidate.interviewLink}`,
          notes: job.notes,
        });

        const candidateUser = await this.prisma.user.findUnique({
          where: { email: candidate.email },
        });

        const duration =
          job.planAtCreation === Plan.FREE ? '25 mins' : 'Unlimited';
        await this.notificationsService.create(
          {
            title: 'New Interview Scheduled',
            message: `${job.company.name} has scheduled an interview for ${job.title} on ${job.interviewStartTime.toLocaleString()}. Duration: ${duration}.`,
            link: `/interview/${candidate.interviewLink}`,
            type: NotificationType.INAPP,
            email: candidate.email,
          },
          candidateUser?.id,
        );

        if (progress) {
          progress.details[i].status = 'success';
          progress.succeeded++;
        }
      } catch (error: any) {
        console.error(`[Jobs] Failed to invite ${candidateDto.email}:`, error);
        if (progress) {
          progress.details[i].status = 'error';
          progress.details[i].error = error.message;
          progress.failed++;
        }
      }
    }

    if (progress) progress.completed = true;

    setTimeout(
      () => {
        this.invitationProgress.delete(progressKey);
      },
      5 * 60 * 1000,
    );
  }

  async getJobAnalytics(jobId: string, userId: string, requesterRole?: Role) {
    const where: Prisma.JobWhereInput = { id: jobId };
    if (requesterRole !== Role.ADMIN) {
      where.companyId = userId;
    }

    const job = await this.prisma.job.findFirst({
      where,
      include: {
        candidates: true,
        sessions: {
          include: {
            evaluation: true,
            proctoringLogs: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const totalCandidates = job.candidates.length;
    const completedSessions = job.sessions.filter(
      (s) => s.status === Status.COMPLETED,
    ).length;
    const fitCandidates = job.sessions.filter(
      (s) => s.evaluation?.isFit,
    ).length;
    const unfitCandidates = job.sessions.filter(
      (s) => s.evaluation && !s.evaluation.isFit,
    ).length;

    const incidentCounts = {
      tab_switch: 0,
      eye_distraction: 0,
      multiple_faces: 0,
      no_face: 0,
      other: 0,
    };

    let totalIncidents = 0;
    job.sessions.forEach((session) => {
      session.proctoringLogs.forEach((log) => {
        totalIncidents++;
        if (log.type in incidentCounts) {
          incidentCounts[log.type as keyof typeof incidentCounts]++;
        } else {
          incidentCounts.other++;
        }
      });
    });

    const scoreDistribution = [0, 0, 0, 0, 0, 0, 0];
    let totalScore = 0;
    let scoredSessions = 0;

    job.sessions.forEach((session) => {
      if (session.evaluation?.overallScore !== undefined) {
        const score = session.evaluation.overallScore;
        totalScore += score;
        scoredSessions++;
        if (score <= 20) scoreDistribution[0]++;
        else if (score <= 40) scoreDistribution[1]++;
        else if (score <= 50) scoreDistribution[2]++;
        else if (score <= 60) scoreDistribution[3]++;
        else if (score <= 70) scoreDistribution[4]++;
        else if (score <= 80) scoreDistribution[5]++;
        else scoreDistribution[6]++;
      }
    });

    const statusCounts = {
      pending: job.candidates.filter(
        (c) => c.status === CandidateStatus.PENDING,
      ).length,
      invited: job.candidates.filter(
        (c) => c.status === CandidateStatus.INVITED,
      ).length,
      review: job.candidates.filter((c) => c.status === CandidateStatus.REVIEW)
        .length,
      rejected: job.candidates.filter(
        (c) => c.status === CandidateStatus.REJECTED,
      ).length,
      considered: job.candidates.filter(
        (c) => c.status === CandidateStatus.CONSIDERED,
      ).length,
      shortlisted: job.candidates.filter(
        (c) => c.status === CandidateStatus.SHORTLISTED,
      ).length,
    };

    return {
      totalCandidates,
      completedSessions,
      fitCandidates,
      unfitCandidates,
      pendingCandidates: totalCandidates - completedSessions,
      completionRate:
        totalCandidates > 0
          ? Math.round((completedSessions / totalCandidates) * 100)
          : 0,
      avgScore:
        scoredSessions > 0 ? Math.round(totalScore / scoredSessions) : 0,
      integrityRate:
        completedSessions > 0
          ? Math.round(
              ((completedSessions * 10 - totalIncidents) /
                (completedSessions * 10)) *
                100,
            )
          : 100,
      timeSavedHours: Math.round(completedSessions * 0.75),
      incidentCounts,
      scoreDistribution,
      statusCounts,
    };
  }

  async updateJob(
    jobId: string,
    userId: string,
    userPlan: Plan,
    dto: UpdateJobDto,
    requesterRole?: Role,
  ) {
    const where: Prisma.JobWhereInput = { id: jobId };
    if (requesterRole !== Role.ADMIN) {
      where.companyId = userId;
    }

    const job = await this.prisma.job.findFirst({ where });
    if (!job) throw new NotFoundException('Job not found');

    const updateData: Prisma.JobUpdateInput = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.roleCategory !== undefined)
      updateData.roleCategory = dto.roleCategory;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.interviewStartTime)
      updateData.interviewStartTime = new Date(dto.interviewStartTime);
    if (dto.interviewEndTime)
      updateData.interviewEndTime = new Date(dto.interviewEndTime);
    if (dto.tabTracking !== undefined) updateData.tabTracking = dto.tabTracking;
    if (dto.eyeTracking !== undefined) updateData.eyeTracking = dto.eyeTracking;
    if (dto.multiFaceDetection !== undefined)
      updateData.multiFaceDetection = dto.multiFaceDetection;
    if (dto.fullScreenMode !== undefined)
      updateData.fullScreenMode = dto.fullScreenMode;
    if (dto.noTextTyping !== undefined)
      updateData.noTextTyping = dto.noTextTyping;
    if (dto.customQuestions !== undefined)
      updateData.customQuestions = dto.customQuestions;
    if (dto.aiSpecificRequirements !== undefined)
      updateData.aiSpecificRequirements = dto.aiSpecificRequirements;
    if (dto.timezone !== undefined) updateData.timezone = dto.timezone;

    if (userPlan === Plan.FREE && requesterRole !== Role.ADMIN) {
      updateData.eyeTracking = false;
      updateData.multiFaceDetection = false;
    }

    return this.prisma.job.update({
      where: { id: jobId },
      data: updateData,
    });
  }

  async getJobCandidates(jobId: string, userId: string, requesterRole?: Role) {
    const where: Prisma.JobWhereInput = { id: jobId };
    if (requesterRole !== Role.ADMIN) {
      where.companyId = userId;
    }

    const job = await this.prisma.job.findFirst({
      where,
      include: {
        candidates: true,
        sessions: {
          include: {
            evaluation: true,
            candidate: { select: { id: true, email: true } },
          },
        },
      },
    });

    if (!job) throw new NotFoundException('Job not found');

    return job.candidates.map((candidate) => {
      const session = job.sessions.find(
        (s) => s.candidate.email === candidate.email,
      );
      return this.mapCandidateWithSession(candidate, session);
    });
  }

  private mapCandidateWithSession(
    candidate: Prisma.CandidateGetPayload<Record<string, never>>,
    session?: Prisma.InterviewSessionGetPayload<{
      include: { evaluation: true };
    }>,
  ) {
    let status = candidate.status;
    const finalStatuses: CandidateStatus[] = [
      CandidateStatus.COMPLETED,
      CandidateStatus.REJECTED,
      CandidateStatus.CONSIDERED,
      CandidateStatus.SHORTLISTED,
      CandidateStatus.EXPIRED,
    ];

    if (session && !finalStatuses.includes(candidate.status)) {
      if (session.status === Status.ONGOING) status = CandidateStatus.REVIEW;
      else if (session.status === Status.COMPLETED)
        status = CandidateStatus.REVIEW;
    }

    return {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      status: status,
      invitedAt: candidate.invitedAt,
      createdAt: candidate.createdAt,
      interviewLink: candidate.interviewLink,
      sessionId: session?.id,
      score: session?.evaluation?.overallScore,
      isFit: session?.evaluation?.isFit,
      completedAt: session?.endTime,
      resumeText: candidate.resumeText,
    };
  }

  async updateCandidateStatus(
    candidateId: string,
    userId: string,
    status: string,
    requesterRole?: Role,
  ) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId },
      include: { job: true },
    });

    if (!candidate) throw new NotFoundException('Candidate not found');

    if (requesterRole !== Role.ADMIN && candidate.job.companyId !== userId) {
      throw new ForbiddenException('You do not have access to this candidate');
    }

    return this.prisma.candidate.update({
      where: { id: candidateId },
      data: { status: status as any },
    });
  }

  async updateCandidateResume(
    candidateId: string,
    resumeText: string,
    userId: string,
    requesterRole?: Role,
  ) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { job: true },
    });

    if (!candidate) throw new NotFoundException('Candidate not found');

    if (requesterRole !== Role.ADMIN) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.email !== candidate.email) {
        throw new ForbiddenException(
          'You do not have permission to update this resume',
        );
      }
    }

    return this.prisma.candidate.update({
      where: { id: candidateId },
      data: { resumeText },
    });
  }

  async reInterviewCandidate(
    candidateId: string,
    userId: string,
    newScheduledTime?: string,
    requesterRole?: Role,
  ) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { job: { include: { company: true } } },
    });

    if (!candidate) throw new NotFoundException('Candidate not found');

    if (requesterRole !== Role.ADMIN && candidate.job.companyId !== userId) {
      throw new ForbiddenException('You do not have access to this candidate');
    }

    const now = new Date();
    const startTime = newScheduledTime ? new Date(newScheduledTime) : now;
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        status: CandidateStatus.INVITED,
        invitedAt: new Date(),
        interviewStartTime: startTime,
        interviewEndTime: endTime,
        isReInterviewed: true,
      },
    });

    await this.prisma.interviewSession.deleteMany({
      where: { jobId: candidate.jobId, candidate: { email: candidate.email } },
    });

    const appUrl = this.configService.get<string>('APP_URL');
    await this.emailService.sendInterviewInvite({
      to: candidate.email,
      candidateName: candidate.name,
      jobTitle: candidate.job.title,
      companyName: candidate.job.company.name,
      scheduledTime: startTime,
      interviewLink: `${appUrl}/interview/${candidate.interviewLink}`,
      notes: candidate.job.notes,
    });

    return { message: 'Re-interview scheduled' };
  }

  async getCompanyPublic(companyId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: companyId },
      include: {
        jobs: {
          select: {
            id: true,
            title: true,
            roleCategory: true,
            description: true,
          },
        },
      },
    });

    if (!user || user.role !== 'COMPANY')
      throw new NotFoundException('Company profile not found');
    return user;
  }

  async getInvitationProgress(jobId: string, userId: string) {
    const progressKey = `${jobId}-${userId}`;
    const progress = this.invitationProgress.get(progressKey);
    if (!progress) return { found: false, message: 'No active process' };
    return { found: true, ...progress };
  }
}
