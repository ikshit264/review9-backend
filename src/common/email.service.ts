import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface InviteEmailData {
  to: string;
  candidateName: string;
  jobTitle: string;
  companyName: string;
  scheduledTime: Date;
  interviewLink: string;
  notes?: string | null;
}

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

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .note { background: #fff3cd; padding: 15px; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Interview Invitation</h1>
              <p>${data.jobTitle} at ${data.companyName}</p>
            </div>
            <div class="content">
              <p>Hello ${data.candidateName},</p>
              <p>You are invited to a remote AI-powered interview for the position of <strong>${data.jobTitle}</strong> at <strong>${data.companyName}</strong>.</p>
              
              <p><strong>Scheduled Time:</strong> ${formattedTime} (UTC)</p>
              
              <a href="${data.interviewLink}" class="button">Join Interview</a>
              
              <p>Please ensure you:</p>
              <ul>
                <li>Have a stable internet connection</li>
                <li>Use a desktop/laptop with webcam and microphone</li>
                <li>Are in a quiet, well-lit environment</li>
                <li>Have your resume ready to upload</li>
              </ul>
              
              ${data.notes ? `<div class="note"><strong>Note from Company:</strong><br>${data.notes}</div>` : ''}
              
              <p>Best of luck!</p>
              <p>The HireAI Team</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const mailData = {
      from: this.configService.get<string>('MAIL_FROM') || 'noreply@hireai.com',
      to: data.to,
      subject: `Interview Invite: ${data.jobTitle} at ${data.companyName}`,
      html,
    };

    this.logger.log(`Preparing to send interview invitation email to ${data.to}`);

    try {
      const mailEnabled = this.configService.get<string>('MAIL_ENABLED') !== 'false';

      if (!mailEnabled) {
        this.logger.warn(`Mail disabled (MAIL_ENABLED=false). Invitation to ${data.to} log-only.`);
        return;
      }

      await this.transporter.sendMail(mailData);
      this.logger.log(`Successfully sent interview invitation email to ${data.to}`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send interview invitation email to ${data.to}:`, errorMessage);
      
      // Throw error for critical email failures
      if (error && typeof error === 'object' && 'response' in error && 
          typeof error.response === 'string' && error.response.includes('Maximum credits exceeded')) {
        throw new InternalServerErrorException(
          `Email service quota exceeded. Failed to send invitation to ${data.to}. Please contact support.`
        );
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new InternalServerErrorException(
          `Failed to send interview invitation email to ${data.to}. Error: ${errorMessage}`
        );
      }
    }
  }
}
