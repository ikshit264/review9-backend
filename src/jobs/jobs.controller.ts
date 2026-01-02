import { Controller, Post, Get, Put, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto, InviteCandidatesDto, UpdateJobDto, UpdateCandidateStatusDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { Role, Plan } from '@prisma/client';

interface AuthUser {
    id: string;
    email: string;
    role: Role;
    plan?: Plan; // Optional, only for COMPANY users
}

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
    constructor(private jobsService: JobsService) { }

    @Post()
    @Roles(Role.COMPANY)
    async createJob(@CurrentUser() user: AuthUser, @Body() dto: CreateJobDto) {
        return this.jobsService.createJob(user.id, user.plan || Plan.FREE, dto);
    }

    @Get()
    @Roles(Role.COMPANY)
    async getJobs(@CurrentUser('id') userId: string) {
        return this.jobsService.getJobs(userId);
    }

    @Get(':id')
    @Roles(Role.COMPANY)
    async getJob(@Param('id') jobId: string, @CurrentUser('id') userId: string) {
        return this.jobsService.getJobById(jobId, userId);
    }

    @Put(':id')
    @Roles(Role.COMPANY)
    async updateJob(
        @Param('id') jobId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: UpdateJobDto,
    ) {
        return this.jobsService.updateJob(jobId, user.id, user.plan || Plan.FREE, dto);
    }

    @Post(':id/candidates')
    @Roles(Role.COMPANY)
    async inviteCandidates(
        @Param('id') jobId: string,
        @CurrentUser() user: AuthUser,
        @Body() dto: InviteCandidatesDto,
    ) {
        return this.jobsService.inviteCandidates(jobId, user.id, user.plan || Plan.FREE, dto);
    }

    @Get(':id/candidates')
    @Roles(Role.COMPANY)
    async getJobCandidates(
        @Param('id') jobId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.jobsService.getJobCandidates(jobId, userId);
    }

    @Get(':id/analytics')
    @Roles(Role.COMPANY)
    async getAnalytics(@Param('id') jobId: string, @CurrentUser('id') userId: string) {
        return this.jobsService.getJobAnalytics(jobId, userId);
    }

    @Get(':id/invitation-progress')
    @Roles(Role.COMPANY)
    async getInvitationProgress(
        @Param('id') jobId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.jobsService.getInvitationProgress(jobId, userId);
    }
}

@Controller('candidates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CandidatesController {
    constructor(private jobsService: JobsService) { }

    @Patch(':id/status')
    @Roles(Role.COMPANY)
    async updateStatus(
        @Param('id') candidateId: string,
        @CurrentUser('id') userId: string,
        @Body() dto: UpdateCandidateStatusDto,
    ) {
        return this.jobsService.updateCandidateStatus(candidateId, userId, dto.status);
    }

    @Patch(':id/resume')
    @UseGuards(JwtAuthGuard)
    async updateResume(
        @Param('id') candidateId: string,
        @CurrentUser('id') userId: string,
        @Body('resumeText') resumeText: string,
    ) {
        // Verify the candidate belongs to the authenticated user
        return this.jobsService.updateCandidateResume(candidateId, resumeText, userId);
    }

    @Post(':id/re-interview')
    @Roles(Role.COMPANY)
    async reInterview(
        @Param('id') candidateId: string,
        @CurrentUser('id') userId: string,
        @Body('newScheduledTime') newScheduledTime?: string,
    ) {
        return this.jobsService.reInterviewCandidate(candidateId, userId, newScheduledTime);
    }
}
@Controller('companies')
export class CompaniesController {
    constructor(private jobsService: JobsService) { }

    @Get(':id')
    async getCompany(@Param('id') companyId: string) {
        return this.jobsService.getCompanyPublic(companyId);
    }
}
