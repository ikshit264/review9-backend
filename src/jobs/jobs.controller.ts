import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import {
  CreateJobDto,
  InviteCandidatesDto,
  UpdateJobDto,
  UpdateCandidateStatusDto,
} from './dto';
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
  constructor(private jobsService: JobsService) {}

  @Post()
  @Roles(Role.COMPANY)
  async createJob(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateJobDto,
    @Query('companyId') companyId?: string,
  ) {
    const targetId =
      user.role === Role.ADMIN && companyId ? companyId : user.id;
    return this.jobsService.createJob(targetId, user.plan || Plan.FREE, dto);
  }

  @Get()
  @Roles(Role.COMPANY)
  async getJobs(
    @CurrentUser() user: AuthUser,
    @Query('companyId') companyId?: string,
  ) {
    const targetId =
      user.role === Role.ADMIN && companyId ? companyId : user.id;
    return this.jobsService.getJobs(targetId, user.role);
  }

  @Get(':id')
  @Roles(Role.COMPANY)
  async getJob(
    @Param('id') jobId: string,
    @CurrentUser() user: AuthUser,
    @Query('companyId') companyId?: string,
  ) {
    const targetId =
      user.role === Role.ADMIN && companyId ? companyId : user.id;
    return this.jobsService.getJobById(jobId, targetId, user.role);
  }

  @Put(':id')
  @Roles(Role.COMPANY)
  async updateJob(
    @Param('id') jobId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateJobDto,
    @Query('companyId') companyId?: string,
  ) {
    const targetId =
      user.role === Role.ADMIN && companyId ? companyId : user.id;
    return this.jobsService.updateJob(
      jobId,
      targetId,
      user.plan || Plan.FREE,
      dto,
      user.role,
    );
  }

  @Post(':id/candidates')
  @Roles(Role.COMPANY)
  async inviteCandidates(
    @Param('id') jobId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteCandidatesDto,
    @Query('companyId') companyId?: string,
  ) {
    const targetId =
      user.role === Role.ADMIN && companyId ? companyId : user.id;
    return this.jobsService.inviteCandidates(
      jobId,
      targetId,
      user.plan || Plan.FREE,
      dto,
      user.role,
    );
  }

  @Get(':id/candidates')
  @Roles(Role.COMPANY)
  async getJobCandidates(
    @Param('id') jobId: string,
    @CurrentUser() user: AuthUser,
    @Query('companyId') companyId?: string,
  ) {
    const targetId =
      user.role === Role.ADMIN && companyId ? companyId : user.id;
    return this.jobsService.getJobCandidates(jobId, targetId, user.role);
  }

  @Get(':id/analytics')
  @Roles(Role.COMPANY)
  async getAnalytics(
    @Param('id') jobId: string,
    @CurrentUser() user: AuthUser,
    @Query('companyId') companyId?: string,
  ) {
    const targetId =
      user.role === Role.ADMIN && companyId ? companyId : user.id;
    return this.jobsService.getJobAnalytics(jobId, targetId, user.role);
  }

  @Get(':id/invitation-progress')
  @Roles(Role.COMPANY)
  async getInvitationProgress(
    @Param('id') jobId: string,
    @CurrentUser() user: AuthUser,
    @Query('companyId') companyId?: string,
  ) {
    const targetId =
      user.role === Role.ADMIN && companyId ? companyId : user.id;
    return this.jobsService.getInvitationProgress(jobId, targetId);
  }
}

@Controller('candidates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CandidatesController {
  constructor(private jobsService: JobsService) {}

  @Patch(':id/status')
  @Roles(Role.COMPANY)
  async updateStatus(
    @Param('id') candidateId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCandidateStatusDto,
    @Query('companyId') companyId?: string,
  ) {
    const targetId =
      user.role === Role.ADMIN && companyId ? companyId : user.id;
    return this.jobsService.updateCandidateStatus(
      candidateId,
      targetId,
      dto.status,
      user.role,
    );
  }

  @Patch(':id/resume')
  @UseGuards(JwtAuthGuard)
  async updateResume(
    @Param('id') candidateId: string,
    @CurrentUser() user: AuthUser,
    @Body('resumeText') resumeText: string,
  ) {
    return this.jobsService.updateCandidateResume(
      candidateId,
      resumeText,
      user.id,
      user.role,
    );
  }

  @Post(':id/re-interview')
  @Roles(Role.COMPANY)
  async reInterview(
    @Param('id') candidateId: string,
    @CurrentUser() user: AuthUser,
    @Body('newScheduledTime') newScheduledTime?: string,
    @Query('companyId') companyId?: string,
  ) {
    const targetId =
      user.role === Role.ADMIN && companyId ? companyId : user.id;
    return this.jobsService.reInterviewCandidate(
      candidateId,
      targetId,
      newScheduledTime,
      user.role,
    );
  }
}
@Controller('companies')
export class CompaniesController {
  constructor(private jobsService: JobsService) {}

  @Get(':id')
  async getCompany(@Param('id') companyId: string) {
    return this.jobsService.getCompanyPublic(companyId);
  }
}
