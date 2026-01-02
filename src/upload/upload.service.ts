import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
const pdfParse = require('pdf-parse');
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
const cloudinary = require('cloudinary').v2;
import { Readable } from 'stream';

interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  [key: string]: unknown;
}

interface PdfParseResult {
  text: string;
  [key: string]: unknown;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    // Initialize Cloudinary
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
        });
        this.logger.log('Cloudinary configured successfully');
      } catch (error) {
        this.logger.error('Failed to configure Cloudinary:', error);
      }
    } else {
      this.logger.warn('Cloudinary credentials not configured');
    }
  }

  /**
   * Upload resume to Cloudinary and extract text
   */
  async uploadResume(
    file: Express.Multer.File,
    userId?: string,
    candidateId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Only allow PDF files
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are allowed');
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size exceeds 10MB limit');
    }

    let extractedText = '';
    let resumeUrl = '';

    try {
      // Extract text from PDF
      this.logger.log(`Extracting text from PDF: ${file.originalname}`);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const pdfData = (await pdfParse(file.buffer)) as PdfParseResult;
      extractedText = String(pdfData?.text || '').trim();

      if (!extractedText || extractedText.length === 0) {
        this.logger.warn(`No text extracted from PDF: ${file.originalname}`);
        extractedText =
          '[Could not extract text from PDF - manual review required]';
      } else {
        this.logger.log(
          `Successfully extracted ${extractedText.length} characters from PDF`,
        );
      }
    } catch (error) {
      this.logger.error(`PDF parsing error for ${file.originalname}:`, error);
      extractedText =
        '[Could not extract text from PDF - manual review required]';
    }

    try {
      // Upload to Cloudinary
      this.logger.log(`Uploading PDF to Cloudinary: ${file.originalname}`);
      const uploadResult = await new Promise<CloudinaryUploadResult>(
        (resolve, reject) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                resource_type: 'raw',
                folder: 'resumes',
                public_id: `resume_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9]/g, '_')}`,
                format: 'pdf',
              },
              (
                error: Error | undefined,
                result: CloudinaryUploadResult | undefined,
              ) => {
                if (error) {
                  reject(
                    new Error(error.message || 'Cloudinary upload failed'),
                  );
                } else if (!result) {
                  reject(new Error('Cloudinary upload returned no result'));
                } else {
                  resolve(result);
                }
              },
            );

            // Convert buffer to stream
            const bufferStream = new Readable();
            bufferStream.push(file.buffer);
            bufferStream.push(null);
            bufferStream.pipe(uploadStream);
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        },
      );

      resumeUrl = uploadResult?.secure_url || '';
      this.logger.log(`Successfully uploaded to Cloudinary: ${resumeUrl}`);
    } catch (error) {
      this.logger.error(
        `Cloudinary upload error for ${file.originalname}:`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to upload resume to cloud storage',
      );
    }

    // Update user record if userId provided
    if (userId) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { resumeUrl },
      });
      this.logger.log(`Updated user ${userId} with resume URL`);
    }

    // Update candidate record if candidateId provided
    if (candidateId) {
      await this.prisma.candidate.update({
        where: { id: candidateId },
        data: {
          resumeText: extractedText,
        },
      });
      this.logger.log(`Updated candidate ${candidateId} with resume text`);
    }

    return {
      filename: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      resumeUrl,
      extractedText,
      userId,
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
