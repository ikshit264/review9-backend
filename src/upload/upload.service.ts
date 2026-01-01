import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
// Note: In production, use pdf-parse package for PDF text extraction
// import * as pdfParse from 'pdf-parse';

@Injectable()
export class UploadService {
    constructor(private prisma: PrismaService) { }

    async uploadResume(file: Express.Multer.File, candidateId?: string) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        const allowedMimes = ['application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

        if (!allowedMimes.includes(file.mimetype)) {
            throw new BadRequestException('Only PDF and Word documents are allowed');
        }

        // Extract text from PDF/Word
        let extractedText = '';

        try {
            if (file.mimetype === 'application/pdf') {
                // In production: use pdf-parse
                // const pdfData = await pdfParse(file.buffer);
                // extractedText = pdfData.text;
                extractedText = `[Resume content extracted from ${file.originalname}]`;
            } else {
                // For Word docs, use mammoth or similar
                extractedText = `[Resume content extracted from ${file.originalname}]`;
            }
        } catch (error) {
            console.error('PDF parsing error:', error);
            extractedText = '[Could not extract text - manual review required]';
        }

        // If candidateId provided, update candidate record
        if (candidateId) {
            await this.prisma.candidate.update({
                where: { id: candidateId },
                data: { resumeText: extractedText },
            });
        }

        return {
            filename: file.originalname,
            size: file.size,
            mimeType: file.mimetype,
            extractedText,
            candidateId,
        };
    }

    async getResume(candidateId: string, companyId: string) {
        const candidate = await this.prisma.candidate.findUnique({
            where: { id: candidateId },
            include: {
                job: { select: { companyId: true } },
            },
        });

        if (!candidate) {
            throw new BadRequestException('Candidate not found');
        }

        // Verify company owns this job
        if (candidate.job.companyId !== companyId) {
            throw new BadRequestException('Unauthorized access');
        }

        return {
            candidateId: candidate.id,
            candidateName: candidate.name,
            resumeText: candidate.resumeText,
        };
    }
}
