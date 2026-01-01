import { Controller, Post, Get, Param, UseGuards, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { Role } from '@prisma/client';

@Controller('upload')
export class UploadController {
    constructor(private uploadService: UploadService) { }

    @Post('resume')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    }))
    async uploadResume(
        @UploadedFile() file: Express.Multer.File,
        @Query('candidateId') candidateId?: string,
    ) {
        return this.uploadService.uploadResume(file, candidateId);
    }

    @Get('resume/:id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.COMPANY)
    async getResume(
        @Param('id') candidateId: string,
        @CurrentUser('id') companyId: string,
    ) {
        return this.uploadService.getResume(candidateId, companyId);
    }
}
