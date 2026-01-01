import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJobDto, InviteCandidatesDto } from './dto';
import { Plan, Role, CandidateStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../common/email.service';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client'

@Injectable()
export class JobsService {
    // In-memory progress tracking for invitation sending
    private invitationProgress = new Map<string, {
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
    }>();

    constructor(
        private prisma: PrismaService,
        private emailService: EmailService,
        private configService: ConfigService,
        private notificationsService: NotificationsService,
    ) { }

    async createJob(userId: string, userPlan: Plan, dto: CreateJobDto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (user?.role !== Role.COMPANY) {
            throw new ForbiddenException('Only companies can create jobs');
        }

        // Validate time gap (minimum 30 minutes)
        const startTime = new Date(dto.interviewStartTime);
        const endTime = new Date(dto.interviewEndTime);
        const diffMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);

        if (diffMinutes < 0) {
            throw new BadRequestException(
                'Interview end time cannot be before start time'
            );
        }

        if (diffMinutes < 30) {
            throw new BadRequestException(
                'Interview end time must be at least 30 minutes after start time'
            );
        }

        // Enforce plan restrictions
        let jobSettings = {
            tabTracking: dto.tabTracking ?? true,
            eyeTracking: dto.eyeTracking ?? false,
            multiFaceDetection: dto.multiFaceDetection ?? false,
            screenRecording: dto.screenRecording ?? false,
            fullScreenMode: dto.fullScreenMode ?? false,
            noTextTyping: dto.noTextTyping ?? false,
        };

        if (userPlan === Plan.FREE) {
            jobSettings.eyeTracking = false;
            jobSettings.multiFaceDetection = false;
            jobSettings.screenRecording = false;
        }

        if (userPlan === Plan.PRO) {
            jobSettings.multiFaceDetection = false;
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

    async getJobs(userId: string) {
        const jobs = await this.prisma.job.findMany({
            where: { companyId: userId },
            include: {
                candidates: true,
                sessions: {
                    include: {
                        candidate: { select: { email: true } }
                    }
                },
                _count: {
                    select: { candidates: true, sessions: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return jobs.map(job => ({
            ...job,
            candidates: job.candidates.map(candidate => {
                const session = job.sessions.find(s => s.candidate.email === candidate.email);
                return this.mapCandidateWithSession(candidate, session);
            })
        }));
    }

    async getJobById(jobId: string, userId: string) {
        const job = await this.prisma.job.findFirst({
            where: { id: jobId, companyId: userId },
            include: {
                candidates: true,
                sessions: {
                    include: {
                        evaluation: true,
                        candidate: { select: { id: true, email: true } }
                    },
                },
            },
        });

        if (!job) {
            throw new NotFoundException('Job not found');
        }

        return {
            ...job,
            candidates: job.candidates.map(candidate => {
                const session = job.sessions.find(s => s.candidate.email === candidate.email);
                return this.mapCandidateWithSession(candidate, session);
            })
        };
    }

    async inviteCandidates(jobId: string, userId: string, userPlan: Plan, dto: InviteCandidatesDto) {
        const job = await this.prisma.job.findFirst({
            where: { id: jobId, companyId: userId },
            include: { candidates: true, company: true },
        });

        if (!job) {
            throw new NotFoundException('Job not found');
        }

        // Enforce FREE plan candidate limit
        if (userPlan === Plan.FREE) {
            const totalCandidates = job.candidates.length + dto.candidates.length;
            if (totalCandidates > 30) {
                throw new ForbiddenException('Free plan limited to 30 candidates per job. Upgrade to Pro for unlimited.');
            }
        }

        // Initialize progress tracking
        const progressKey = `${jobId}-${userId}`;
        this.invitationProgress.set(progressKey, {
            total: dto.candidates.length,
            current: 0,
            succeeded: 0,
            failed: 0,
            details: dto.candidates.map(c => ({
                email: c.email,
                status: 'pending',
            })),
            completed: false,
        });

        // Process invitations asynchronously (don't await - fire and forget)
        this.processInvitationsAsync(jobId, userId, userPlan, dto, job, progressKey)
            .catch(err => console.error('[Jobs] Invitation processing error:', err));

        // Return immediately so frontend can start polling
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
        job: any,
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

                // Check if candidate already exists for this job (fetch fresh from DB to avoid stale reference)
                let candidate = await this.prisma.candidate.findFirst({
                    where: {
                        jobId,
                        email: candidateDto.email
                    }
                });

                if (candidate) {
                    // RESEND logic: update invitedAt and possibly name if changed
                    candidate = await this.prisma.candidate.update({
                        where: { id: candidate.id },
                        data: {
                            name: candidateDto.name,
                            invitedAt: new Date()
                        }
                    });
                } else {
                    // CREATE new candidate
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

                // Send email invitation
                await this.emailService.sendInterviewInvite({
                    to: candidate.email,
                    candidateName: candidate.name,
                    jobTitle: job.title,
                    companyName: job.company.name,
                    scheduledTime: job.interviewStartTime,
                    interviewLink: `${appUrl}/interview/${candidate.interviewLink}`,
                    notes: job.notes,
                });

                // Create email-anchored notification for ALL candidates (even if not signed up yet)
                const candidateUser = await this.prisma.user.findUnique({
                    where: { email: candidate.email }
                });

                const duration = job.planAtCreation === Plan.FREE ? '25 mins' : 'Unlimited';
                await this.notificationsService.create({
                    title: 'New Interview Scheduled',
                    message: `${job.company.name} has scheduled an interview for ${job.title} on ${job.interviewStartTime.toLocaleString()}. Duration: ${duration}.`,
                    link: `/interview/${candidate.interviewLink}`,
                    type: NotificationType.INAPP,
                    email: candidate.email
                }, candidateUser?.id); // Pass userId if exists, otherwise null for email-anchored

                // Update status to success
                if (progress) {
                    progress.details[i].status = 'success';
                    progress.succeeded++;
                }

            } catch (error) {
                console.error(`[Jobs] Failed to invite ${candidateDto.email}:`, error);
                if (progress) {
                    progress.details[i].status = 'error';
                    progress.details[i].error = error.message || 'Failed to send invitation';
                    progress.failed++;
                }
            }
        }

        // Mark as completed
        if (progress) {
            progress.completed = true;
        }

        // Clean up progress after 5 minutes
        setTimeout(() => {
            this.invitationProgress.delete(progressKey);
            console.log(`[Jobs] Cleaned up progress for ${progressKey}`);
        }, 5 * 60 * 1000);
    }

    async getJobAnalytics(jobId: string, userId: string) {
        const job = await this.prisma.job.findFirst({
            where: { id: jobId, companyId: userId },
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
        const completedSessions = job.sessions.filter(s => s.status === 'COMPLETED').length;
        const fitCandidates = job.sessions.filter(s => s.evaluation?.isFit).length;
        const unfitCandidates = job.sessions.filter(s => s.evaluation && !s.evaluation.isFit).length;

        // Aggregate proctoring incidents
        const incidentCounts = {
            tab_switch: 0,
            eye_distraction: 0,
            multiple_faces: 0,
            no_face: 0,
            other: 0,
        };

        let totalIncidents = 0;
        job.sessions.forEach(session => {
            session.proctoringLogs.forEach(log => {
                totalIncidents++;
                if (log.type in incidentCounts) {
                    incidentCounts[log.type as keyof typeof incidentCounts]++;
                } else {
                    incidentCounts.other++;
                }
            });
        });

        // Score distribution (7 buckets)
        const scoreDistribution = [0, 0, 0, 0, 0, 0, 0]; // 0-20, 20-40, 40-50, 50-60, 60-70, 70-80, 80-100
        let totalScore = 0;
        let scoredSessions = 0;

        job.sessions.forEach(session => {
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

        // Status counts (using string comparison until prisma generate runs)
        const statusCounts = {
            pending: job.candidates.filter((c: any) => c.status === 'PENDING').length,
            invited: job.candidates.filter((c: any) => c.status === 'INVITED').length,
            review: job.candidates.filter((c: any) => c.status === 'REVIEW').length,
            rejected: job.candidates.filter((c: any) => c.status === 'REJECTED').length,
            considered: job.candidates.filter((c: any) => c.status === 'CONSIDERED').length,
            shortlisted: job.candidates.filter((c: any) => c.status === 'SHORTLISTED').length,
        };

        // Calculate metrics
        const completionRate = totalCandidates > 0 ? Math.round((completedSessions / totalCandidates) * 100) : 0;
        const avgScore = scoredSessions > 0 ? Math.round(totalScore / scoredSessions) : 0;
        const integrityRate = completedSessions > 0
            ? Math.round(((completedSessions * 10 - totalIncidents) / (completedSessions * 10)) * 100)
            : 100;
        const timeSavedHours = Math.round(completedSessions * 0.75); // ~45 min per interview saved

        return {
            totalCandidates,
            completedSessions,
            fitCandidates,
            unfitCandidates,
            pendingCandidates: totalCandidates - completedSessions,
            completionRate,
            avgScore,
            integrityRate,
            timeSavedHours,
            incidentCounts,
            scoreDistribution,
            statusCounts,
        };
    }

    async updateJob(jobId: string, userId: string, userPlan: Plan, dto: any) {
        const job = await this.prisma.job.findFirst({
            where: { id: jobId, companyId: userId },
        });

        if (!job) {
            throw new NotFoundException('Job not found');
        }

        // Enforce plan restrictions on proctoring settings
        const updateData: any = { ...dto };

        if (dto.interviewStartTime) {
            updateData.interviewStartTime = new Date(dto.interviewStartTime);
        }
        if (dto.interviewEndTime) {
            updateData.interviewEndTime = new Date(dto.interviewEndTime);
        }

        if (userPlan === Plan.FREE) {
            updateData.eyeTracking = false;
            updateData.multiFaceDetection = false;
            updateData.screenRecording = false;
        }

        if (userPlan === Plan.PRO) {
            updateData.multiFaceDetection = false;
        }

        return this.prisma.job.update({
            where: { id: jobId },
            data: {
                ...updateData,
                timezone: dto.timezone || job.timezone,
                fullScreenMode: dto.fullScreenMode !== undefined ? dto.fullScreenMode : job.fullScreenMode,
                noTextTyping: dto.noTextTyping !== undefined ? dto.noTextTyping : job.noTextTyping,
                customQuestions: dto.customQuestions !== undefined ? dto.customQuestions : job.customQuestions,
                aiSpecificRequirements: dto.aiSpecificRequirements !== undefined ? dto.aiSpecificRequirements : job.aiSpecificRequirements,
            },
        });
    }

    async getJobCandidates(jobId: string, userId: string) {
        const job = await this.prisma.job.findFirst({
            where: { id: jobId, companyId: userId },
            include: {
                candidates: true,
                sessions: {
                    include: {
                        evaluation: true,
                        candidate: { select: { id: true, email: true } }
                    },
                },
            },
        });

        if (!job) {
            throw new NotFoundException('Job not found');
        }

        // Map candidates with their session data
        const candidatesWithData = job.candidates.map(candidate => {
            const session = job.sessions.find(s => s.candidate.email === candidate.email);
            return this.mapCandidateWithSession(candidate, session);
        });

        // Return array directly, not wrapped in object
        return candidatesWithData;
    }

    private mapCandidateWithSession(candidate: any, session?: any) {
        return {
            id: candidate.id,
            name: candidate.name,
            email: candidate.email,
            status: session ? session.status : candidate.status,
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

    async updateCandidateStatus(candidateId: string, userId: string, status: string) {
        // Verify the candidate belongs to a job owned by this user
        const candidate = await this.prisma.candidate.findFirst({
            where: { id: candidateId },
            include: { job: true },
        });

        if (!candidate) {
            throw new NotFoundException('Candidate not found');
        }

        if (candidate.job.companyId !== userId) {
            throw new ForbiddenException('You do not have access to this candidate');
        }

        return this.prisma.candidate.update({
            where: { id: candidateId },
            data: { status: status as any },
        });
    }

    async updateCandidateResume(candidateId: string, resumeText: string) {
        return this.prisma.candidate.update({
            where: { id: candidateId },
            data: { resumeText },
        });
    }

    async reInterviewCandidate(candidateId: string, userId: string, newScheduledTime?: string) {
        console.log(`[Jobs] Re-interview request for candidate ID: ${candidateId} by user: ${userId}`);
        const candidate = await this.prisma.candidate.findUnique({
            where: { id: candidateId },
            include: {
                job: {
                    include: {
                        company: { select: { id: true, name: true } }
                    }
                }
            },
        });

        if (!candidate) {
            console.warn(`[Jobs] Candidate not found: ${candidateId}`);
            throw new NotFoundException('Candidate not found');
        }

        if (candidate.job.companyId !== userId) {
            console.error(`[Jobs] Unauthorized re-interview attempt by ${userId} for candidate ${candidateId}`);
            throw new ForbiddenException('You do not have access to this candidate');
        }

        console.log(`[Jobs] Resetting status to INVITED for ${candidate.name} (${candidate.email})`);

        // CRITICAL FIX: Always extend interview window for re-interviews
        // If newScheduledTime provided, use it; otherwise use current time
        const now = new Date();
        const startTime = newScheduledTime ? new Date(newScheduledTime) : now;
        const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours after start

        console.log(`[Jobs] Extending interview window for candidate: Start=${startTime.toISOString()}, End=${endTime.toISOString()}`);

        // Reset candidate status
        await this.prisma.candidate.update({
            where: { id: candidateId },
            data: {
                status: CandidateStatus.INVITED,
                invitedAt: new Date(),
                interviewStartTime: startTime,
                interviewEndTime: endTime,
                isReInterviewed: true,
            }
        });

        console.log(`[Jobs] Deleting previous sessions for candidate email: ${candidate.email} on job: ${candidate.jobId}`);
        // Delete previous session to allow a fresh start
        const deleteResult = await this.prisma.interviewSession.deleteMany({
            where: {
                jobId: candidate.jobId,
                candidate: { email: candidate.email }
            }
        });

        // Send new email invitation
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

        // Create email-anchored notification for ALL candidates (even if not signed up yet)
        const candidateUser = await this.prisma.user.findUnique({
            where: { email: candidate.email }
        });

        const duration = candidate.job.planAtCreation === Plan.FREE ? '25 mins' : 'Unlimited';
        await this.notificationsService.create({
            title: 'Re-Interview Scheduled',
            message: `${candidate.job.company.name} has requested a re-interview for ${candidate.job.title}. You can start immediately. Duration: ${duration}. Valid until: ${endTime.toLocaleString()}.`,
            link: `/interview/${candidate.interviewLink}`,
            type: NotificationType.INAPP,
            email: candidate.email
        }, candidateUser?.id); // Pass userId if exists, otherwise null for email-anchored

        console.log(`[Jobs] Deleted ${deleteResult.count} previous sessions. Re-interview reset complete. Window: ${startTime.toISOString()} to ${endTime.toISOString()}`);
        return {
            ...deleteResult,
            message: 'Re-interview scheduled and notifications sent',
            interviewWindow: {
                start: startTime,
                end: endTime,
                validFor: '2 hours'
            }
        };
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

        if (!user || user.role !== 'COMPANY') {
            throw new NotFoundException('Company profile not found');
        }

        return user;
    }

    /**
     * Get current progress of invitation sending (for polling)
     */
    async getInvitationProgress(jobId: string, userId: string) {
        const progressKey = `${jobId}-${userId}`;
        const progress = this.invitationProgress.get(progressKey);

        if (!progress) {
            return {
                found: false,
                message: 'No active invitation process found',
            };
        }

        return {
            found: true,
            ...progress,
        };
    }
}

