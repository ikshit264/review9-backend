import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.initializeResend();
  }

  private initializeResend() {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        '[EmailService] RESEND_API_KEY not found. Email service disabled.',
      );
      return;
    }

    this.resend = new Resend(apiKey);
    this.logger.log('[EmailService] Resend service initialized successfully');
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean> {
    this.logger.log(`[EmailService] sendMail called for: ${to}`);

    if (!this.resend) {
      this.logger.error('[EmailService] Resend not initialized. Cannot send email.');
      return false;
    }

    const from =
      this.configService.get<string>('MAIL_FROM') ||
      'onboarding@resend.dev'; // Default Resend test email if not set

    try {
      this.logger.log(`[EmailService] Sending email via Resend to ${to}...`);

      const { data, error } = await this.resend.emails.send({
        from: from,
        to: [to],
        subject: subject,
        text: text,
        html: html || text,
      });

      if (error) {
        this.logger.error(`[EmailService] Resend Error: ${JSON.stringify(error)}`);
        return false;
      }

      this.logger.log(`[EmailService] Email sent successfully via Resend. ID: ${data?.id}`);
      return true;
    } catch (error: any) {
      this.logger.error(`[EmailService] Unexpected Error while sending to ${to}: ${error.message}`);
      return false;
    }
  }
}
