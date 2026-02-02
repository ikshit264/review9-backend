import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface InviteEmailData {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyDescription?: string | null;
  scheduledTime: Date;
  interviewLink: string;
  registrationLink?: string | null;
  needsRegistration: boolean;
  notes?: string | null;
}

import { getProfessionalEmailLayout } from './email.templates';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;

  constructor(private configService: ConfigService) {
    this.initializeResend();
  }

  private initializeResend() {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        '[CommonEmailService] RESEND_API_KEY not found. Email service disabled.',
      );
      return;
    }

    this.resend = new Resend(apiKey);
    this.logger.log('[CommonEmailService] Resend service initialized successfully');
  }

  async sendInterviewInvite(data: InviteEmailData): Promise<void> {
    const formattedTime = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(data.scheduledTime);

    const html = getProfessionalEmailLayout({
      title: 'Interview Invitation',
      candidateName: data.candidateName,
      message: `You have been invited to a technical assessment for the **${data.jobTitle}** position at **${data.companyName}**. This interview will be conducted by our autonomous AI assessment agent.`,
      details: [
        { label: 'Position', value: data.jobTitle },
        { label: 'Company', value: data.companyName },
        { label: 'Scheduled Time', value: `${formattedTime} (UTC)` },
      ],
      buttonText: data.needsRegistration ? 'Register & Join' : 'Start Interview',
      buttonLink: data.needsRegistration ? data.registrationLink : data.interviewLink,
      footerText: data.companyDescription ? `About ${data.companyName}: ${data.companyDescription}` : undefined
    });

    const fromEmail = this.configService.get<string>('MAIL_FROM') || 'onboarding@resend.dev';
    const fromName = this.configService.get<string>('MAIL_FROM_NAME') || 'IntervAI';
    const subject = `[Interview Invitation] ${data.jobTitle} at ${data.companyName}`;

    this.logger.log(
      `Preparing to send interview invitation email to ${data.to}`,
    );

    try {
      const mailEnabled =
        this.configService.get<string>('MAIL_ENABLED') !== 'false';

      if (!mailEnabled) {
        this.logger.warn(
          `Mail disabled (MAIL_ENABLED=false). Invitation to ${data.to} log-only.`,
        );
        return;
      }

      if (!this.resend) {
        this.logger.error('[CommonEmailService] Resend not initialized. Cannot send email.');
        throw new InternalServerErrorException(
          'Email service not configured properly.',
        );
      }

      const { data: resendData, error } = await this.resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: [data.to],
        subject: subject,
        html: html,
      });

      if (error) {
        this.logger.error(
          `Failed to send interview invitation email to ${data.to}: ${error.message}`,
        );
        throw new InternalServerErrorException(
          `Failed to send interview invitation email to ${data.to}. Error: ${error.message}`,
        );
      }

      this.logger.log(
        `Successfully sent interview invitation email to ${data.to}. Message ID: ${resendData?.id}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send interview invitation email to ${data.to}:`,
        errorMessage,
      );

      // Throw error for critical email failures
      if (
        error &&
        typeof error === 'object' &&
        'message' in error &&
        typeof error.message === 'string' &&
        error.message.includes('quota')
      ) {
        throw new InternalServerErrorException(
          `Email service quota exceeded. Failed to send invitation to ${data.to}. Please contact support.`,
        );
      } else {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        throw new InternalServerErrorException(
          `Failed to send interview invitation email to ${data.to}. Error: ${errorMessage}`,
        );
      }
    }
  }
}
