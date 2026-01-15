import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const host = this.configService.get<string>('MAIL_HOST');
    const port = this.configService.get<number>('MAIL_PORT');
    const user = this.configService.get<string>('MAIL_USER');
    const password = this.configService.get<string>('MAIL_PASSWORD');

    if (!host || !port || !user || !password) {
      this.logger.warn(
        'SMTP configuration incomplete. Email service disabled.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass: password,
      },
    });

    this.logger.log('SMTP transport initialized successfully');
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<boolean> {
    this.logger.log(`[EmailService] sendMail called for: ${to}`);

    if (!this.transporter) {
      this.logger.error('[EmailService] Email transport not initialized. Cannot send email.');
      return false;
    }

    const from =
      this.configService.get<string>('MAIL_FROM') ||
      this.configService.get<string>('MAIL_USER');

    try {
      this.logger.log(`[EmailService] Sending email from ${from} to ${to}...`);
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        text,
        html: html || text,
      });

      this.logger.log(`[EmailService] Email sent successfully to ${to}. MessageId: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`[EmailService] SMTP ERROR while sending to ${to}: ${error.message}`);
      if (error.code) this.logger.error(`[EmailService] Error Code: ${error.code}`);
      if (error.command) this.logger.error(`[EmailService] SMTP Command: ${error.command}`);
      return false;
    }
  }
}
