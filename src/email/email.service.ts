import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as SibApiV3Sdk from 'sib-api-v3-sdk';

@Injectable()
export class EmailService {
  private apiInstance: SibApiV3Sdk.TransactionalEmailsApi;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.initializeBrevo();
  }

  private initializeBrevo() {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');

    if (!apiKey) {
      this.logger.warn(
        '[EmailService] BREVO_API_KEY not found. Email service disabled.',
      );
      return;
    }

    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKeyAuth = defaultClient.authentications['api-key'];
    apiKeyAuth.apiKey = apiKey;

    this.apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    this.logger.log('[EmailService] Brevo service initialized successfully');
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean> {
    this.logger.log(`[EmailService] sendMail called for: ${to}`);

    if (!this.apiInstance) {
      this.logger.error('[EmailService] Brevo not initialized. Cannot send email.');
      return false;
    }

    const fromEmail = this.configService.get<string>('MAIL_FROM') || 'onboarding@resend.dev';
    const fromName = this.configService.get<string>('MAIL_FROM_NAME') || 'IntervAI';

    try {
      this.logger.log(`[EmailService] Sending email via Brevo to ${to}...`);

      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.htmlContent = html || text;
      sendSmtpEmail.textContent = text;
      sendSmtpEmail.sender = { name: fromName, email: fromEmail };
      sendSmtpEmail.to = [{ email: to }];

      const data = await this.apiInstance.sendTransacEmail(sendSmtpEmail);

      this.logger.log(`[EmailService] Email sent successfully via Brevo. Message ID: ${data.messageId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`[EmailService] Brevo Error while sending to ${to}: ${error.message || error}`);
      if (error.response && error.response.body) {
        this.logger.error(`[EmailService] Brevo Error details: ${JSON.stringify(error.response.body)}`);
      }
      return false;
    }
  }
}
