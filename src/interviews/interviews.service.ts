import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../common/gemini.service';
import { TimeWindowService } from '../common/time-window.service';
import { SaveResponseDto, ProctoringLogDto, StartInterviewDto } from './dto';
import {
  Status,
  CandidateStatus,
  NotificationType,
  Role,
  Plan,
  Prisma,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { Response } from 'express';

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    private prisma: PrismaService,
    private geminiService: GeminiService,
    private notificationsService: NotificationsService,
    private timeWindowService: TimeWindowService,
  ) {}

  async getInterviewByToken(token: string) {
    this.logger.log(`Searching for candidate with token: ${token}`);

    type CandidateWithJob = Prisma.CandidateGetPayload<{
      include: {
        job: {
          include: {
            company: {
              select: {
                id: true;
                name: true;
              };
            };
          };
        };
      };
    }>;

    let candidate: CandidateWithJob | null;
    if (token === 'test-me' || token === 'test-session-token') {
      // Virtual token or stable token for automated testing
      await this.getOrCreateTestEnvironment();
      candidate = await this.prisma.candidate.findFirst({
        where: { email: 'test-candidate@example.com' },
        include: {
          job: {
            include: {
              company: { select: { id: true, name: true } },
            },
          },
        },
      });
    } else {
      // Try by link first
      candidate = await this.prisma.candidate.findUnique({
        where: { interviewLink: token },
        include: {
          job: {
            include: {
              company: { select: { id: true, name: true } },
            },
          },
        },
      });

      // Fallback: try by ID if token looks like a UUID
      if (
        !candidate &&
        token.match(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        )
      ) {
        candidate = await this.prisma.candidate.findUnique({
          where: { id: token },
          include: {
            job: {
              include: {
                company: { select: { id: true, name: true } },
              },
            },
          },
        });
      }
    }

    if (!candidate) {
      this.logger.warn(`Candidate NOT FOUND for token: ${token}`);
      throw new NotFoundException('Interview not found');
    }
    this.logger.log(
      `Found candidate: ${candidate.name} (${candidate.email}) for job: ${candidate.job.title}`,
    );

    // Use centralized time window calculation
    const timeWindow = this.timeWindowService.calculateTimeWindow(
      candidate.interviewStartTime,
      candidate.interviewEndTime,
      candidate.job.interviewStartTime,
      candidate.job.interviewEndTime,
      candidate.isReInterviewed,
    );

    // Auto-expire if past end time and status is still INVITED
    // BUT: Don't expire if there's an ongoing session OR if time is still left
    if (candidate.status === CandidateStatus.INVITED && timeWindow.isExpired) {
      // Check if there's an ongoing session
      const ongoingSession = await this.prisma.interviewSession.findFirst({
        where: {
          jobId: candidate.jobId,
          candidate: { email: candidate.email },
          status: Status.ONGOING,
        },
      });

      // Only expire if no ongoing session AND time has actually expired
      if (!ongoingSession && timeWindow.isExpired) {
        this.logger.log(
          `Auto-expiring candidate ${candidate.id} - no ongoing session and time expired`,
        );
        candidate = await this.prisma.candidate.update({
          where: { id: candidate.id },
          data: { status: CandidateStatus.EXPIRED },
          include: {
            job: {
              include: {
                company: { select: { id: true, name: true } },
              },
            },
          },
        });
      }
    }

    return {
      candidateId: candidate.id,
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      status: candidate.status,
      interviewStartTime: timeWindow.startTime,
      interviewEndTime: timeWindow.endTime,
      isReInterviewed: candidate.isReInterviewed,
      canStartNow: timeWindow.canStartNow,
      isExpired: timeWindow.isExpired,
      isBeforeStart: timeWindow.isBeforeStart,
      timeUntilStart: timeWindow.timeUntilStart,
      timeUntilEnd: timeWindow.timeUntilEnd,
      job: {
        id: candidate.job.id,
        title: candidate.job.title,
        roleCategory: candidate.job.roleCategory,
        description: candidate.job.description,
        interviewStartTime: candidate.job.interviewStartTime,
        interviewEndTime: candidate.job.interviewEndTime,
        tabTracking: candidate.job.tabTracking,
        eyeTracking: candidate.job.eyeTracking,
        multiFaceDetection: candidate.job.multiFaceDetection,
        fullScreenMode: candidate.job.fullScreenMode,
        noTextTyping: candidate.job.noTextTyping,
        planAtCreation: candidate.job.planAtCreation,
        companyName: candidate.job.company.name,
        companyId: candidate.job.company.id,
        timezone: candidate.job.timezone,
      },
    };
  }

  async getInterviewSession(sessionId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        responses: { orderBy: { timestamp: 'asc' } },
        proctoringLogs: { orderBy: { timestamp: 'desc' } },
        job: true,
        candidate: { select: { id: true, name: true, email: true } },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  async startInterview(dto: StartInterviewDto, userId: string) {
    const { interviewToken: token, resumeUrl, resumeText } = dto;
    const candidate = await this.prisma.candidate.findUnique({
      where: { interviewLink: token },
      include: { job: true },
    });

    if (!candidate) {
      throw new NotFoundException('Interview not found');
    }

    // Check user profile completion
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isProfileComplete) {
      throw new ForbiddenException(
        'Please complete your profile before starting the interview',
      );
    }

    // Use centralized time window calculation
    const timeWindow = this.timeWindowService.calculateTimeWindow(
      candidate.interviewStartTime,
      candidate.interviewEndTime,
      candidate.job.interviewStartTime,
      candidate.job.interviewEndTime,
      candidate.isReInterviewed,
    );

    if (timeWindow.isBeforeStart) {
      throw new ForbiddenException(
        `Interview has not started yet. It will begin at ${timeWindow.startTime.toLocaleString()}`,
      );
    }

    if (timeWindow.isExpired) {
      throw new ForbiddenException(
        'Interview window has expired. Please contact the company for a re-interview.',
      );
    }

    // Status validation
    if (
      candidate.status === CandidateStatus.REVIEW ||
      candidate.status === CandidateStatus.COMPLETED ||
      candidate.status === CandidateStatus.REJECTED ||
      candidate.status === CandidateStatus.CONSIDERED ||
      candidate.status === CandidateStatus.SHORTLISTED
    ) {
      throw new ForbiddenException('Interview already completed');
    }

    if (candidate.status === CandidateStatus.EXPIRED) {
      throw new ForbiddenException(
        'Interview window has expired. Please contact the company for a re-interview.',
      );
    }

    if (candidate.status !== CandidateStatus.INVITED) {
      throw new ForbiddenException(
        'You must accept the interview invitation before starting',
      );
    }

    // Check if session already exists
    let existingSession = await this.prisma.interviewSession.findFirst({
      where: { candidateId: userId, jobId: candidate.jobId },
    });

    // For test mode, allow restarting by deleting previous session
    // For test mode, allow restarting by resetting session
    if (
      existingSession &&
      (candidate.interviewLink === 'test-session-token' ||
        candidate.interviewLink?.startsWith('test-me-token-'))
    ) {
      existingSession = await this.prisma.interviewSession.update({
        where: { id: existingSession.id },
        data: {
          status: Status.ONGOING,
          hasStarted: true,
          isFlagged: false,
          warningCount: 0,
          isInterrupted: false,
          startTime: new Date(),
          endTime: null,
        },
      });
    }

    if (existingSession) {
      if (existingSession.status === Status.PAUSED) {
        throw new ForbiddenException(
          'Interview is paused due to malpractice. Please contact the company to resume.',
        );
      }
      if (
        existingSession.hasStarted &&
        existingSession.status === Status.COMPLETED
      ) {
        throw new ForbiddenException('Interview already completed');
      }

      // If it was just idle (not started but session exists), allow starting
      if (!existingSession.hasStarted) {
        await this.prisma.interviewSession.update({
          where: { id: existingSession.id },
          data: { hasStarted: true, status: Status.ONGOING },
        });
      }

      return existingSession;
    }

    // Create new session
    const session = await this.prisma.interviewSession.create({
      data: {
        candidateId: userId,
        jobId: candidate.jobId,
        status: Status.ONGOING,
        hasStarted: true,
      },
    });

    // Update candidate status to REVIEW (interview in progress)
    // This indicates the interview has started and is ongoing
    const candidateUpdateData: Prisma.CandidateUpdateInput = {
      status: CandidateStatus.REVIEW, // Interview is now in progress
    };

    // Update candidate with resume text for AI use
    if (resumeText) {
      candidateUpdateData.resumeText = resumeText;

      // Also update the user's resume URL if provided
      if (resumeUrl) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { resumeUrl },
        });
      }
    } else {
      // If no resume provided, check if user has one in profile
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user?.resumeUrl && !candidate.resumeText) {
        // User has a resume URL but candidate doesn't have resume text yet
        // Resume text should be extracted separately if needed
      }
    }

    // Update candidate status to REVIEW (interview started/in progress)
    await this.prisma.candidate.update({
      where: { id: candidate.id },
      data: candidateUpdateData,
    });

    this.logger.log(
      `Candidate ${candidate.id} status updated to REVIEW (interview started)`,
    );

    return session;
  }

  async pauseInterview(sessionId: string, reason: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        job: {
          include: { company: true },
        },
      },
    });

    if (!session) throw new NotFoundException('Session not found');

    const updatedSession = await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: Status.PAUSED,
        isInterrupted: true,
        malpracticeCount: { increment: 1 },
      },
    });

    // Notify company about malpractice
    await this.notificationsService.create(
      {
        title: 'Interview Paused - Malpractice Detected',
        message: `Candidate session ${sessionId} paused. Reason: ${reason}`,
        link: `/dashboard`,
        type: NotificationType.INAPP,
        email: session.job.company?.email || '',
      },
      session.job.companyId,
    );

    return updatedSession;
  }

  async resumeInterview(sessionId: string, userId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { job: true },
    });

    if (!session) throw new NotFoundException('Session not found');

    // Verify company ownership
    if (session.job.companyId !== userId) {
      throw new ForbiddenException(
        'Only the company can resume this interview',
      );
    }

    return this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: Status.ONGOING,
        isInterrupted: false,
      },
    });
  }

  async getInitialQuestions(sessionId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { job: { include: { company: true } } },
    });

    if (!session) throw new NotFoundException('Session not found');

    // Fetch candidate's resume for context
    const user = await this.prisma.user.findUnique({
      where: { id: session.candidateId },
    });
    const candidate = await this.prisma.candidate.findUnique({
      where: {
        jobId_email: { jobId: session.jobId, email: user?.email || '' },
      },
    });

    // Determine number of questions based on plan
    const plan = session.job.planAtCreation;
    // FREE: 12 questions upfront. PRO/ULTRA: Interactive (start with 1)
    const count = plan === 'FREE' ? 12 : 1;

    const questions = await this.geminiService.generateQuestions(
      {
        jobTitle: session.job.title,
        jobDescription: session.job.description,
        roleCategory: session.job.roleCategory,
        resumeText: candidate?.resumeText || '',
        customQuestions: session.job.customQuestions,
        aiSpecificRequirements: session.job.aiSpecificRequirements,
      },
      count,
    );

    return questions;
  }

  /**
   * Shared logic for getting session and context
   */
  private async getSessionContext(sessionId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        job: true,
        responses: { orderBy: { timestamp: 'asc' } },
      },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== Status.ONGOING)
      throw new ForbiddenException('Interview is not active');

    const context = {
      jobTitle: session.job.title,
      jobDescription: session.job.description,
      resumeText: '', // Potentially fetch this if needed
    };

    const history = session.responses.map((r) => ({
      question: r.questionText,
      answer: r.candidateAnswer,
    }));

    const lastResponse = session.responses[session.responses.length - 1];
    const lastQuestionText = lastResponse?.questionText || 'Initial Question';

    return { session, context, history, lastQuestionText };
  }

  /**
   * Shared logic for saving response and rating
   */
  private async saveResponseAndRate(
    sessionId: string,
    answer: string,
    fullAIText: string,
    lastQuestionText: string,
    planAtCreation: Plan,
  ) {
    // Rate the answer (for PRO/ULTRA plans)
    let techScore: number | null = null;
    let commScore: number | null = null;
    let overfitScore: number | null = null;
    let aiFlagged = false;
    let turnFeedback: string | null = null;

    if (planAtCreation !== 'FREE') {
      try {
        const rating = await this.geminiService.rateTurn(
          lastQuestionText,
          answer,
        );
        techScore = rating.techScore;
        commScore = rating.commScore;
        overfitScore = rating.overfitScore;
        aiFlagged = rating.aiFlagged;
        turnFeedback = rating.feedback;
      } catch (e) {
        this.logger.error('Turn rating failed:', e);
      }
    }

    // Save response to database
    await this.prisma.interviewResponse.create({
      data: {
        sessionId,
        questionText: lastQuestionText,
        candidateAnswer: answer,
        aiAcknowledgment: fullAIText.split('?')[0] || '',
        techScore,
        commScore,
        overfitScore,
        aiFlagged,
        turnFeedback,
      },
    });

    // Log proctoring event if AI flagged
    if (aiFlagged) {
      await this.logProctoringEvent(sessionId, {
        type: 'AI_DETECTION',
        severity: 'high',
      });
    }
  }

  async respondToInterview(sessionId: string, answer: string, res: Response) {
    try {
      // Set headers for streaming
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      // Get session context
      const { session, context, history, lastQuestionText } =
        await this.getSessionContext(sessionId);

      // Stream AI response
      const stream = this.geminiService.getStreamResponse(
        context,
        history,
        answer,
      );
      let fullAIText = '';

      for await (const chunk of stream) {
        fullAIText += chunk;
        res.write(chunk);
      }

      // Save response and rate (async, don't wait)
      this.saveResponseAndRate(
        sessionId,
        answer,
        fullAIText,
        lastQuestionText,
        session.job.planAtCreation,
      ).catch((err) => this.logger.error('Failed to save response:', err));

      res.end();
    } catch (error) {
      this.logger.error('Streaming error:', error);
      if (!res.headersSent) {
        res.status(500).end('Error generating response');
      }
    }
  }

  async respondToInterviewSync(sessionId: string, answer: string) {
    // Get session context
    const { session, context, history, lastQuestionText } =
      await this.getSessionContext(sessionId);

    // Get AI response stream
    const stream = this.geminiService.getStreamResponse(
      context,
      history,
      answer,
    );
    let fullAIText = '';

    for await (const chunk of stream) {
      fullAIText += chunk;
    }

    // Save response and rate
    await this.saveResponseAndRate(
      sessionId,
      answer,
      fullAIText,
      lastQuestionText,
      session.job.planAtCreation,
    );

    return { reply: fullAIText };
  }

  async saveTranscript(sessionId: string, dto: SaveResponseDto) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: { job: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== Status.ONGOING) {
      throw new BadRequestException('Session is not active');
    }

    // Rate the turn for ALL plans (not just PRO/ULTRA)
    let techScore: number | null = null;
    let commScore: number | null = null;
    let overfitScore: number | null = null;
    let aiFlagged = false;
    let turnFeedback: string | null = null;
    try {
      const rating = await this.geminiService.rateTurn(
        dto.questionText,
        dto.candidateAnswer,
      );
      techScore = rating.techScore;
      commScore = rating.commScore;
      overfitScore = rating.overfitScore;
      aiFlagged = rating.aiFlagged;
      turnFeedback = rating.feedback;
    } catch (e) {
      console.error('Turn rating failed:', e);
      // Continue even if rating fails
    }

    const response = await this.prisma.interviewResponse.create({
      data: {
        sessionId,
        questionText: dto.questionText,
        candidateAnswer: dto.candidateAnswer,
        aiAcknowledgment: dto.aiAcknowledgment,
        techScore,
        commScore,
        overfitScore,
        aiFlagged,
        turnFeedback,
      },
    });

    // Log proctoring event if AI flagged
    if (aiFlagged) {
      await this.logProctoringEvent(sessionId, {
        type: 'AI_DETECTION',
        severity: 'high',
      });
    }

    return response;
  }

  async logProctoringEvent(sessionId: string, dto: ProctoringLogDto) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const log = await this.prisma.proctoringLog.create({
      data: {
        sessionId,
        type: dto.type,
        severity: dto.severity,
      },
    });

    // 3-Strike Logic
    if (dto.severity === 'high') {
      const newWarningCount = session.warningCount + 1;

      if (newWarningCount > 3) {
        // Flagging on 4th warning
        await this.prisma.interviewSession.update({
          where: { id: sessionId },
          data: {
            isFlagged: true,
            status: Status.PAUSED, // Paused for review instead of FAILED
            warningCount: newWarningCount,
          },
        });
        return {
          log,
          status: 'FLAGGED',
          warningCount: newWarningCount,
          terminated: false,
        };
      } else {
        // Pause for 1st and 2nd warning
        await this.prisma.interviewSession.update({
          where: { id: sessionId },
          data: {
            status: Status.PAUSED,
            warningCount: newWarningCount,
            isInterrupted: true,
          },
        });
        return {
          log,
          status: 'WARNING',
          warningCount: newWarningCount,
          terminated: false,
        };
      }
    }

    return { log, status: 'LOGGED', terminated: false };
  }

  async acknowledgeWarning(sessionId: string, userId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) throw new NotFoundException('Session not found');
    if (session.candidateId !== userId)
      throw new ForbiddenException('Unauthorized');

    if (session.status !== Status.PAUSED || !session.isInterrupted) {
      return session;
    }

    return this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: Status.ONGOING,
        isInterrupted: false,
      },
    });
  }

  async completeInterview(sessionId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        responses: true,
        job: true,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // Get candidate by matching user email with candidate email
    const candidateUser = await this.prisma.user.findUnique({
      where: { id: session.candidateId },
    });

    const candidate = await this.prisma.candidate.findFirst({
      where: {
        jobId: session.jobId,
        email: candidateUser?.email || '',
      },
    });

    // Trigger Gemini evaluation
    const evaluation = await this.geminiService.evaluateInterview({
      jobTitle: session.job.title,
      jobDescription: session.job.description,
      roleCategory: session.job.roleCategory,
      resumeText: candidate?.resumeText || '',
      responses: session.responses.map((r) => ({
        question: r.questionText,
        answer: r.candidateAnswer,
      })),
      aiSpecificRequirements: session.job.aiSpecificRequirements,
    });

    // Save evaluation
    const savedEvaluation = await this.prisma.finalEvaluation.upsert({
      where: { sessionId },
      update: {
        overallScore: evaluation.overallScore,
        isFit: evaluation.isFit,
        reasoning: evaluation.reasoning,
        behavioralNote: evaluation.behavioralNote,
        metrics: evaluation.metrics,
      },
      create: {
        sessionId,
        overallScore: evaluation.overallScore,
        isFit: evaluation.isFit,
        reasoning: evaluation.reasoning,
        behavioralNote: evaluation.behavioralNote,
        metrics: evaluation.metrics,
      },
    });

    // Update session status
    await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: Status.COMPLETED,
        endTime: new Date(),
        overallScore: evaluation.overallScore,
      },
    });

    // Update candidate status to COMPLETED
    if (candidate) {
      await this.prisma.candidate.update({
        where: { id: candidate.id },
        data: { status: CandidateStatus.COMPLETED },
      });

      // Notify Company
      const company = await this.prisma.user.findUnique({
        where: { id: session.job.companyId },
      });
      await this.notificationsService.create(
        {
          title: 'Interview Completed',
          message: `Candidate ${candidate.name} has completed the interview for ${session.job.title}. Result: ${evaluation.isFit ? 'Fit' : 'Unfit'} (${evaluation.overallScore}%)`,
          link: `/dashboard`, // or details page
          type: NotificationType.INAPP,
          email: company?.email || '',
        },
        session.job.companyId,
      );
    }

    return savedEvaluation;
  }

  async getEvaluation(sessionId: string) {
    const evaluation = await this.prisma.finalEvaluation.findUnique({
      where: { sessionId },
      include: {
        session: {
          include: {
            job: { select: { title: true, roleCategory: true } },
            candidate: { select: { name: true, email: true } },
            responses: true,
            proctoringLogs: true,
          },
        },
      },
    });

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    return evaluation;
  }

  async getSessionReport(sessionId: string) {
    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      include: {
        job: {
          include: { company: true },
        },
        candidate: true,
        responses: {
          orderBy: { timestamp: 'asc' },
        },
        evaluation: true,
        proctoringLogs: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      session: {
        id: session.id,
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        overallScore: session.overallScore,
        isFlagged: session.isFlagged,
        warningCount: session.warningCount,
        malpracticeCount: session.malpracticeCount,
      },
      job: {
        title: session.job.title,
        description: session.job.description,
        roleCategory: session.job.roleCategory,
        company: session.job.company?.name,
      },
      candidate: session.candidate
        ? {
            name: session.candidate.name,
            email: session.candidate.email,
          }
        : null,
      responses: session.responses.map((r) => ({
        id: r.id,
        questionText: r.questionText,
        candidateAnswer: r.candidateAnswer,
        aiAcknowledgment: r.aiAcknowledgment,
        techScore: r.techScore,
        commScore: r.commScore,
        overfitScore: r.overfitScore,
        aiFlagged: r.aiFlagged,
        turnFeedback: r.turnFeedback,
        timestamp: r.timestamp,
      })),
      evaluation: session.evaluation,
      proctoringLogs: session.proctoringLogs.map((log) => ({
        id: log.id,
        type: log.type,
        severity: log.severity,
        timestamp: log.timestamp,
      })),
    };
  }

  async getCandidateInvitations(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    const invitations = await this.prisma.candidate.findMany({
      where: { email },
      include: {
        job: {
          include: {
            company: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Map invitations with their relative sessions if user exists
    type SessionSelect = {
      id: string;
      status: Status;
      hasStarted: boolean;
      startTime: Date | null;
      endTime: Date | null;
    };

    const result: Array<typeof invitations[0] & {
      session: SessionSelect | null;
      currentStatus: string;
    }> = [];
    for (const invitation of invitations) {
      let session: SessionSelect | null = null;
      if (user) {
        session = await this.prisma.interviewSession.findFirst({
          where: { candidateId: user.id, jobId: invitation.jobId },
          select: {
            id: true,
            status: true,
            hasStarted: true,
            startTime: true,
            endTime: true,
          },
        });
      }

      result.push({
        ...invitation,
        session: session || null,
        interviewStartTime: invitation.interviewStartTime,
        interviewEndTime: invitation.interviewEndTime,
        isReInterviewed: invitation.isReInterviewed,
        // Override status if session exists to reflect current state
        currentStatus: session
          ? session.status === Status.COMPLETED
            ? 'COMPLETED'
            : session.hasStarted
              ? 'ONGOING'
              : session.status
          : invitation.status,
      });
    }

    return result;
  }

  private async terminateSession(sessionId: string, status: Status) {
    await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status,
        endTime: new Date(),
      },
    });

    const session = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
    });

    if (session) {
      // Set candidate to REVIEW status when session terminates
      await this.prisma.candidate.updateMany({
        where: { jobId: session.jobId },
        data: { status: CandidateStatus.REVIEW },
      });
    }
  }

  async getOrCreateTestEnvironment(requestedPlan?: Plan) {
    const planToUse = requestedPlan || Plan.FREE;
    // 1. Create/Find Test Company
    let company = await this.prisma.user.findFirst({
      where: { email: 'test-company@example.com' },
    });

    if (!company) {
      company = await this.prisma.user.create({
        data: {
          email: 'test-company@example.com',
          password: 'test-password',
          name: 'Test Company',
          role: Role.COMPANY,
          isProfileComplete: true,
        },
      });
    }

    // 2. Create/Find Test Job
    let job = await this.prisma.job.findFirst({
      where: { title: 'Full Stack Intern - Test', companyId: company.id },
    });

    if (!job) {
      job = await this.prisma.job.create({
        data: {
          title: 'Full Stack Intern - Test',
          description:
            'This is a test job for a Full Stack Intern position. Requirements: React, Node.js, Prisma, PostgreSQL.',
          roleCategory: 'Engineering',
          company: { connect: { id: company.id } }, // Use relation connection
          planAtCreation: planToUse,
          interviewStartTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Started yesterday
          interviewEndTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Ends in 7 days
          tabTracking: true,
          eyeTracking: true,
          multiFaceDetection: true,
          fullScreenMode: true,
          noTextTyping: true,
        },
      });
    } else if (job.planAtCreation !== planToUse) {
      // Update existing test job to requested plan
      job = await this.prisma.job.update({
        where: { id: job.id },
        data: {
          planAtCreation: planToUse,
          tabTracking: true,
          eyeTracking: true,
          multiFaceDetection: true,
          fullScreenMode: true,
          noTextTyping: true,
        },
      });
    }

    // 3. Create/Find Test User (Candidate)
    let candidateUser = await this.prisma.user.findFirst({
      where: { email: 'test-candidate@example.com' },
    });

    if (!candidateUser) {
      candidateUser = await this.prisma.user.create({
        data: {
          email: 'test-candidate@example.com',
          password: 'test-password',
          name: 'Test Candidate',
          role: Role.CANDIDATE,
          plan: planToUse,
          isProfileComplete: true,
          activeSessionToken: 'test-session-token',
        },
      });
    } else if (candidateUser.plan !== planToUse) {
      // Update candidate user plan to match requested test mode
      candidateUser = await this.prisma.user.update({
        where: { id: candidateUser.id },
        data: { plan: planToUse },
      });
    }

    // 4. Create/Find Test Candidate Record for the job
    let candidate = await this.prisma.candidate.findUnique({
      where: { jobId_email: { jobId: job.id, email: candidateUser.email } },
    });

    const resumeText = `
            EXPERIENCE
            Full Stack Development Personal Projects
            - Built a robust task management application using React, Node.js, and MongoDB.
            - Implemented user authentication with JWT and secure password hashing.
            - Designed and integrated a responsive user interface with CSS3 and Tailwind CSS.
 
            SKILLS
            - Languages: JavaScript (ES6+), HTML5, CSS3, SQL
            - Frameworks/Libraries: React, Node.js, Express, Next.js
            - Tools: Git, Docker, Prisma, PostgreSQL
            - Soft Skills: Problem-solving, Team collaboration, Technical writing
        `;

    if (!candidate) {
      candidate = await this.prisma.candidate.create({
        data: {
          jobId: job.id,
          email: candidateUser.email,
          name: candidateUser.name,
          interviewLink: 'test-session-token', // Stable token
          status: CandidateStatus.INVITED,
          resumeText,
        },
      });
    } else {
      // Update token to make it stable
      candidate = await this.prisma.candidate.update({
        where: { id: candidate.id },
        data: {
          status: CandidateStatus.INVITED,
          interviewLink: 'test-session-token', // Stable token
          resumeText,
        },
      });
    }

    // 5. Create/Find Interview Session
    let session = await this.prisma.interviewSession.findFirst({
      where: { candidateId: candidateUser.id, jobId: job.id },
    });

    if (session && session.status === Status.COMPLETED) {
      // If previous test session completed, delete it or reset it to allow re-testing
      await this.prisma.interviewSession.delete({ where: { id: session.id } });
      session = null;
    }

    if (!session) {
      session = await this.prisma.interviewSession.create({
        data: {
          candidateId: candidateUser.id,
          jobId: job.id,
          status: Status.ONGOING,
          hasStarted: true,
        },
      });
    }

    return {
      session,
      user: candidateUser,
      candidate,
    };
  }
}
