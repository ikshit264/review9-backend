import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, InviteCandidatesDto, UpdateJobDto } from './dto';
import { Plan, Role, CandidateStatus, Status, Prisma, NotificationType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../common/email.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
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
  ) { }

  private parseUtcDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    // If it already has timezone info, parse normally
    if (dateStr.includes('Z') || dateStr.includes('+') || (dateStr.split('-').length > 3)) {
      return new Date(dateStr);
    }
    // Otherwise, treat it as UTC by appending 'Z'
    return new Date(`${dateStr}Z`);
  }

  async createJob(userId: string, userPlan: Plan, dto: CreateJobDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    // Admin can create jobs for any companyId if it was passed in controller,
    // but here userId is already the targetId.
    if (user?.role !== Role.COMPANY && user?.role !== Role.ADMIN) {
      throw new ForbiddenException('Only companies and admins can create jobs');
    }

    // Validate time gap (minimum 30 minutes)
    const startTime = this.parseUtcDate(dto.interviewStartTime);
    const endTime = this.parseUtcDate(dto.interviewEndTime);
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
        interviewStartTime: this.parseUtcDate(dto.interviewStartTime),
        interviewEndTime: this.parseUtcDate(dto.interviewEndTime),
        planAtCreation: userPlan ?? Plan.FREE,
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
    const appUrl =
      this.configService.get<string>('APP_URL') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:3000';
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

        // Check if candidate already has an account
        const candidateUser = await this.prisma.user.findUnique({
          where: { email: candidate.email },
        });

        const needsRegistration = !candidateUser;
        const registrationLink = `${appUrl}/register?email=${encodeURIComponent(candidate.email)}`;

        // Send email
        await this.emailService.sendInterviewInvite({
          to: candidate.email,
          candidateName: candidate.name,
          jobTitle: job.title,
          companyName: job.company.name,
          companyDescription: job.company.bio,
          scheduledTime: job.interviewStartTime,
          interviewLink: `${appUrl}/interview/${candidate.interviewLink}`,
          registrationLink,
          needsRegistration,
          notes: job.notes,
        });

        await this.notificationsService.create(
          {
            title: 'New Interview Scheduled',
            message: `${job.company.name} has scheduled an interview for ${job.title} on ${job.interviewStartTime.toLocaleString()} (UTC).`,
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

    if (progress) {
      progress.completed = true;
    }
  }

  getInvitationProgress(jobId: string, userId: string) {
    const progressKey = `${jobId}-${userId}`;
    const progress = this.invitationProgress.get(progressKey);

    if (!progress) {
      return { found: false };
    }

    return {
      found: true,
      ...progress,
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

    const job = await this.prisma.job.findFirst({
      where,
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // Admin bypasses limits
    const isAdmin = requesterRole === Role.ADMIN;

    // Enforce plan restrictions on update
    const jobSettings = {
      tabTracking: dto.tabTracking ?? job.tabTracking,
      eyeTracking: dto.eyeTracking ?? job.eyeTracking,
      multiFaceDetection: dto.multiFaceDetection ?? job.multiFaceDetection,
      fullScreenMode: dto.fullScreenMode ?? job.fullScreenMode,
      noTextTyping: dto.noTextTyping ?? job.noTextTyping,
    };

    if (!isAdmin) {
      if (userPlan === Plan.FREE) {
        jobSettings.eyeTracking = false;
        jobSettings.multiFaceDetection = false;
      }
      if (userPlan === Plan.PRO) {
        jobSettings.multiFaceDetection = false;
      }
    }

    const updatedData: Prisma.JobUpdateInput = {
      title: dto.title ?? job.title,
      roleCategory: dto.roleCategory ?? job.roleCategory,
      description: dto.description ?? job.description,
      notes: dto.notes ?? job.notes,
      customQuestions: dto.customQuestions ?? job.customQuestions,
      aiSpecificRequirements:
        dto.aiSpecificRequirements ?? job.aiSpecificRequirements,
      ...jobSettings,
    };

    if (dto.interviewStartTime) {
      updatedData.interviewStartTime = this.parseUtcDate(dto.interviewStartTime);
    }
    if (dto.interviewEndTime) {
      updatedData.interviewEndTime = this.parseUtcDate(dto.interviewEndTime);
    }

    const updatedJob = await this.prisma.job.update({
      where: { id: jobId },
      data: updatedData,
      include: { company: true },
    });

    // Send bulk mail if schedule changed and requested
    if (dto.notifyCandidates && (dto.interviewStartTime || dto.interviewEndTime)) {
      this.logger.log(`[JobsService] Triggering schedule update bulk mail for job: ${jobId}`);
      // Don't await, let it run in background
      this.notificationsService
        .sendScheduleUpdateBulkMail(jobId, updatedJob.company.name)
        .catch((err) =>
          this.logger.error(
            `[JobsService] Failed to send schedule update bulk mail: ${err.message}`,
          ),
        );
    }

    return updatedJob;
  }

  async deleteJob(jobId: string, userId: string, requesterRole?: Role) {
    const where: Prisma.JobWhereInput = { id: jobId };
    if (requesterRole !== Role.ADMIN) {
      where.companyId = userId;
    }

    const job = await this.prisma.job.findFirst({
      where,
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    await this.prisma.job.delete({
      where: { id: jobId },
    });

    return { success: true };
  }

  async getJobCandidates(jobId: string, userId: string, requesterRole?: Role) {
    // Check if job exists and belongs to company
    const whereJob: Prisma.JobWhereInput = { id: jobId };
    if (requesterRole !== Role.ADMIN) {
      whereJob.companyId = userId;
    }

    const job = await this.prisma.job.findFirst({
      where: whereJob,
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    // First get all candidates
    const candidates = await this.prisma.candidate.findMany({
      where: { jobId },
      orderBy: { invitedAt: 'desc' },
    });

    // Then for each candidate, find their latest session and score
    // We can do this efficiently by fetching sessions for the job
    const sessions = await this.prisma.interviewSession.findMany({
      where: { jobId },
      orderBy: { startTime: 'desc' },
      include: {
        candidate: {
          select: { email: true }
        }
      }
    });

    // Map sessions to candidates by email
    return candidates.map(candidate => {
      const latestSession = sessions.find(s => s.candidate.email === candidate.email);
      return {
        ...candidate,
        score: latestSession?.overallScore || null,
        sessionId: latestSession?.id || null,
        sessionStatus: latestSession?.status || null,
        // Also add sessions array for compatibility if needed
        sessions: latestSession ? [latestSession] : []
      };
    });
  }

  async updateCandidateStatus(
    candidateId: string,
    userId: string,
    status: CandidateStatus,
    requesterRole?: Role,
  ) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { job: true },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }

    // Verify ownership (Admin bypasses)
    if (requesterRole !== Role.ADMIN && candidate.job.companyId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this candidate',
      );
    }

    return this.prisma.candidate.update({
      where: { id: candidateId },
      data: { status },
    });
  }

  async updateCandidateResume(candidateId: string, resumeText: string, userId: string, requesterRole?: Role) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { job: true },
    });

    if (!candidate) throw new NotFoundException('Candidate not found');

    return this.prisma.candidate.update({
      where: { id: candidateId },
      data: { resumeText },
    });
  }

  async resendInvite(
    jobId: string,
    userId: string,
    dto: { name: string; email: string },
    requesterRole?: Role,
  ) {
    const where: Prisma.JobWhereInput = { id: jobId };
    if (requesterRole !== Role.ADMIN) {
      where.companyId = userId;
    }

    const job = await this.prisma.job.findFirst({
      where: where,
      include: { company: true },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const candidate = await this.prisma.candidate.findFirst({
      where: { jobId, email: dto.email },
    });

    if (!candidate) {
      throw new NotFoundException('Candidate not found in this job');
    }

    const appUrl =
      this.configService.get<string>('APP_URL') ||
      this.configService.get<string>('FRONTEND_URL') ||
      'http://localhost:3000';

    const candidateUser = await this.prisma.user.findUnique({
      where: { email: candidate.email },
    });

    const needsRegistration = !candidateUser;
    const registrationLink = `${appUrl}/register?email=${encodeURIComponent(candidate.email)}`;

    await this.emailService.sendInterviewInvite({
      to: candidate.email,
      candidateName: candidate.name,
      jobTitle: job.title,
      companyName: job.company.name,
      companyDescription: job.company.bio,
      scheduledTime: job.interviewStartTime,
      interviewLink: `${appUrl}/interview/${candidate.interviewLink}`,
      registrationLink,
      needsRegistration,
      notes: job.notes,
    });

    return { success: true };
  }

  async reInterviewCandidate(
    candidateId: string,
    userId: string,
    newScheduledTime: string | null = null,
    requesterRole?: Role,
  ) {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { job: true },
    });

    if (!candidate) throw new NotFoundException('Candidate not found');

    if (requesterRole !== Role.ADMIN && candidate.job.companyId !== userId) {
      throw new ForbiddenException('Not your candidate');
    }

    // Change status back to INVITED (or similar)
    // Mark as re-interviewed
    await this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        status: CandidateStatus.INVITED,
        isReInterviewed: true,
      },
    });

    return { success: true };
  }

  async getJobAnalytics(jobId: string, userId: string, requesterRole?: Role) {
    const where: Prisma.JobWhereInput = { id: jobId };
    if (requesterRole !== Role.ADMIN) {
      where.companyId = userId;
    }

    const job = await this.prisma.job.findFirst({
      where: where,
      include: {
        candidates: true,
        sessions: {
          include: {
            proctoringLogs: true,
            responses: true,
          },
        },
      },
    });

    if (!job) throw new NotFoundException('Job not found');

    const totalCandidates = job.candidates.length;
    const completedSessions = job.sessions.filter(
      (s) => s.status === Status.COMPLETED,
    );
    const completionRate =
      totalCandidates > 0
        ? (completedSessions.length / totalCandidates) * 100
        : 0;

    // Integrity scoring (based on proctoring logs)
    let totalIncidents = 0;
    const incidentCounts = {
      tab_switch: 0,
      eye_distraction: 0,
      multiple_faces: 0,
      no_face: 0,
      other: 0,
    };

    job.sessions.forEach((s) => {
      s.proctoringLogs.forEach((log) => {
        totalIncidents++;
        if (log.type.toLowerCase().includes('tab'))
          incidentCounts.tab_switch++;
        else if (log.type.toLowerCase().includes('face'))
          incidentCounts.multiple_faces++;
        else if (log.type.toLowerCase().includes('eye'))
          incidentCounts.eye_distraction++;
        else incidentCounts.other++;
      });
    });

    const integrityRate =
      completedSessions.length > 0
        ? Math.max(0, 100 - (totalIncidents / completedSessions.length) * 5)
        : 100;

    // Score distribution
    const scoreDistribution = [0, 0, 0, 0, 0]; // 0-20, 21-40, 41-60, 61-80, 81-100
    completedSessions.forEach((s) => {
      const score = s.overallScore || 0;
      const index = Math.min(4, Math.floor(score / 20));
      scoreDistribution[index]++;
    });

    // Fit candidates count
    const fitCandidates = completedSessions.filter(
      (s) => (s.overallScore || 0) >= 70,
    ).length;

    // Status mapping
    const statusCounts: Record<string, number> = {};
    job.candidates.forEach((c) => {
      statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
    });

    return {
      completionRate,
      integrityRate,
      fitCandidates,
      completedSessions: completedSessions.length,
      timeSavedHours: completedSessions.length * 0.5, // 30 mins saved per interview
      scoreDistribution,
      incidentCounts,
      statusCounts,
    };
  }

  async getCompanyPublic(companyId: string) {
    const company = await this.prisma.user.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        email: true,
        bio: true,
        plan: true,
      },
    });

    if (!company) throw new NotFoundException('Company not found');
    return company;
  }
}
