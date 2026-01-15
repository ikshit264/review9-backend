import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('MAIL_HOST') || 'smtp.sendgrid.net',
      port: this.configService.get<number>('MAIL_PORT') || 587,
      auth: {
        user: this.configService.get<string>('MAIL_USER') || '',
        pass: this.configService.get<string>('MAIL_PASSWORD') || '',
      },
    });
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

    const mailData = {
      from: this.configService.get<string>('MAIL_FROM') || 'noreply@entrext.in',
      to: data.to,
      subject: `[Interview Invitation] ${data.jobTitle} at ${data.companyName}`,
      html,
    };

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

      await this.transporter.sendMail(mailData);
      this.logger.log(
        `Successfully sent interview invitation email to ${data.to}`,
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
        'response' in error &&
        typeof error.response === 'string' &&
        error.response.includes('Maximum credits exceeded')
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
