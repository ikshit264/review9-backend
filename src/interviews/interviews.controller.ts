import { Controller, Post, Get, Body, Param, UseGuards, Res, Query } from '@nestjs/common';
import { InterviewsService } from './interviews.service';
import { JwtService } from '@nestjs/jwt';
import { SaveResponseDto, ProctoringLogDto, PauseInterviewDto, RespondDto, StartInterviewDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { CurrentUser, Roles } from '../auth/decorators';
import { Role, Plan } from '@prisma/client';
import { Response } from 'express';

interface AuthUser {
    id: string;
    email: string;
    role: Role;
    plan?: Plan;
}

@Controller('interviews')
export class InterviewsController {
    constructor(
        private interviewsService: InterviewsService,
        private jwtService: JwtService
    ) { }

    @Get('test-me')
    async getTestSession(
        @Query('plan') plan: Plan | undefined,
        @Res({ passthrough: true }) res: Response
    ) {
        const { session, user, candidate } = await this.interviewsService.getOrCreateTestEnvironment(plan);

        // Generate JWT bypass
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            sessionToken: user.activeSessionToken
        };
        const accessToken = this.jwtService.sign(payload);

        // Set JWT token in HTTP-only cookie
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        return {
            sessionId: session.id,
            user,
            candidate,
            interviewToken: candidate.interviewLink
        };
    }

    @Get('my-invitations')
    @UseGuards(JwtAuthGuard)
    async getMyInvitations(@CurrentUser('email') email: string) {
        return this.interviewsService.getCandidateInvitations(email);
    }

    // Public endpoint - candidate opens interview link
    @Get('token/:token')
    async getInterviewByToken(@Param('token') token: string) {
        return this.interviewsService.getInterviewByToken(token);
    }

    // Public endpoint - check interview status for polling
    @Get('token/:token/status')
    async getInterviewStatus(@Param('token') token: string) {
        return this.interviewsService.getInterviewByToken(token);
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard)
    async getSession(
        @Param('id') sessionId: string,
        @Query('companyId') companyId?: string
    ) {
        return this.interviewsService.getInterviewSession(sessionId);
    }

    @Post(':token/start')
    @UseGuards(JwtAuthGuard)
    async startInterview(
        @Param('token') token: string,
        @Body() dto: StartInterviewDto,
        @CurrentUser('id') userId: string,
    ) {
        // Ensure token from param is used in DTO
        dto.interviewToken = token;
        return this.interviewsService.startInterview(dto, userId);
    }

    @Post(':id/transcript')
    @UseGuards(JwtAuthGuard)
    async saveTranscript(
        @Param('id') sessionId: string,
        @Body() dto: SaveResponseDto,
    ) {
        return this.interviewsService.saveTranscript(sessionId, dto);
    }

    @Post(':id/proctoring')
    @UseGuards(JwtAuthGuard)
    async logProctoringEvent(
        @Param('id') sessionId: string,
        @Body() dto: ProctoringLogDto,
    ) {
        return this.interviewsService.logProctoringEvent(sessionId, dto);
    }

    @Post(':id/complete')
    @UseGuards(JwtAuthGuard)
    async completeInterview(@Param('id') sessionId: string) {
        return this.interviewsService.completeInterview(sessionId);
    }

    @Post(':id/pause')
    @UseGuards(JwtAuthGuard)
    async pauseInterview(
        @Param('id') sessionId: string,
        @Body() dto: PauseInterviewDto,
    ) {
        return this.interviewsService.pauseInterview(sessionId, dto.reason);
    }

    @Post(':id/resume')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.COMPANY)
    async resumeInterview(
        @Param('id') sessionId: string,
        @CurrentUser() user: AuthUser,
        @Query('companyId') companyId?: string
    ) {
        const targetId = (user.role === Role.ADMIN && companyId) ? companyId : user.id;
        return this.interviewsService.resumeInterview(sessionId, targetId, user.role);
    }

    @Post(':id/acknowledge-warning')
    @UseGuards(JwtAuthGuard)
    async acknowledgeWarning(
        @Param('id') sessionId: string,
        @CurrentUser('id') userId: string,
    ) {
        return this.interviewsService.acknowledgeWarning(sessionId, userId);
    }

    @Get(':id/initial-questions')
    @UseGuards(JwtAuthGuard)
    async getInitialQuestions(@Param('id') sessionId: string) {
        return this.interviewsService.getInitialQuestions(sessionId);
    }

    @Post(':id/respond')
    @UseGuards(JwtAuthGuard)
    async respondToInterview(
        @Param('id') sessionId: string,
        @Body() dto: RespondDto,
        @Res() res: Response,
    ) {
        return this.interviewsService.respondToInterview(sessionId, dto.answer, res);
    }

    @Post(':id/respond-sync')
    @UseGuards(JwtAuthGuard)
    async respondToInterviewSync(
        @Param('id') sessionId: string,
        @Body() dto: RespondDto,
    ) {
        return this.interviewsService.respondToInterviewSync(sessionId, dto.answer);
    }

    @Get(':id/evaluation')
    @UseGuards(JwtAuthGuard)
    async getEvaluation(
        @Param('id') sessionId: string,
        @Query('companyId') companyId?: string
    ) {
        return this.interviewsService.getEvaluation(sessionId);
    }

    @Get(':id/report')
    @UseGuards(JwtAuthGuard)
    async getSessionReport(
        @Param('id') sessionId: string,
        @Query('companyId') companyId?: string
    ) {
        return this.interviewsService.getSessionReport(sessionId);
    }
}
