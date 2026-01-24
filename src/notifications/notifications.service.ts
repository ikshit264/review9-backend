import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateNotificationDto,
  GetNotificationDto,
} from './dto/notification.dto';
import { BulkMailDto } from './dto/bulk-mail.dto';
import { NotificationType } from '@prisma/client';
import { EmailService } from '../email/email.service';
import {
  getProfessionalEmailLayout,
  getScheduleUpdateEmailLayout,
} from '../common/email.templates';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) { }

  async create(dto: CreateNotificationDto, userId?: string) {
    return this.prisma.notification.create({
      data: {
        ...dto,
        userId: userId || null,
      },
    });
  }

  async createForEmail(
    email: string,
    dto: Omit<CreateNotificationDto, 'email'>,
    sendEmail: boolean = true,
  ) {
    this.logger.log(`Creating notification for email: ${email}`);

    const notification = await this.prisma.notification.create({
      data: {
        ...dto,
        email,
        userId: null,
      },
    });

    // Send email notification if enabled
    this.logger.log(`Notification created in DB for ${email}. Type: ${dto.type}. sendEmail flag: ${sendEmail}`);

    if (
      (sendEmail && dto.type === NotificationType.EMAIL) ||
      dto.type === NotificationType.SYSTEM
    ) {
      this.logger.log(`Attempting to send email to ${email} via EmailService...`);
      const sent = await this.emailService.sendMail(
        email,
        dto.title,
        dto.message,
        getProfessionalEmailLayout({
          title: dto.title,
          message: dto.message,
          buttonText: dto.link
            ? dto.title.toLowerCase().includes('verify')
              ? 'Verify Email'
              : 'View Details'
            : undefined,
          buttonLink: dto.link,
          footerText: 'You received this notification from your IntervAI account.',
        }),
      );
      this.logger.log(`EmailService.sendMail returned: ${sent}`);
    } else {
      this.logger.warn(`Email sending skipped. Condition not met: type=${dto.type}, sendEmail=${sendEmail}`);
    }

    return notification;
  }

  async createMany(userIds: string[], dto: CreateNotificationDto) {
    return this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        ...dto,
        userId,
      })),
    });
  }

  async attachNotificationsToUser(email: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        email,
        userId: null,
      },
      data: {
        userId,
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Attached ${result.count} notifications to user ${userId} (${email})`,
      );
    }

    return result;
  }

  async findAll(userId: string, query: GetNotificationDto) {
    const { since, cursor, take = 20 } = query;

    // Build where clause
    const where: {
      userId: string;
      createdAt?: { gte: Date };
      id?: { lt: string };
    } = {
      userId,
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    };

    const [notifications, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: take + 1, // Fetch one extra to determine if there are more
      }),
      this.prisma.notification.count({
        where: { userId, read: false },
      }),
    ]);

    // Check if there are more notifications
    const hasMore = notifications.length > take;
    const notificationsToReturn = hasMore
      ? notifications.slice(0, take)
      : notifications;
    const nextCursor = hasMore
      ? notificationsToReturn[notificationsToReturn.length - 1].id
      : null;

    return {
      notifications: notificationsToReturn,
      unreadCount,
      nextCursor,
      hasMore,
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this notification',
      );
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async remove(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this notification',
      );
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return { success: true };
  }

  async bulkMail(dto: import('./dto/bulk-mail.dto').BulkMailDto) {
    this.logger.log(
      `Starting bulk mail to ${dto.recipients.length} recipients`,
    );

    const results = {
      total: dto.recipients.length,
      succeeded: 0,
      failed: 0,
      details: [] as Array<{
        email: string;
        status: 'success' | 'error';
        error?: string;
      }>,
    };

    for (const recipient of dto.recipients) {
      try {
        // Send email
        const emailSent = await this.emailService.sendMail(
          recipient.email,
          dto.subject,
          dto.textContent || dto.htmlContent,
          dto.htmlContent,
        );

        if (!emailSent) {
          throw new Error('Email service failed to send');
        }

        // Create notification if requested
        if (dto.createNotification && dto.notificationTitle) {
          await this.createForEmail(
            recipient.email,
            {
              type: NotificationType.EMAIL,
              title: dto.notificationTitle,
              message: dto.notificationMessage || dto.subject,
              link: dto.notificationLink,
            },
            false, // Don't send email again
          );
        }

        results.succeeded++;
        results.details.push({
          email: recipient.email,
          status: 'success',
        });

        this.logger.log(`Successfully sent email to ${recipient.email}`);
      } catch (error) {
        results.failed++;
        results.details.push({
          email: recipient.email,
          status: 'error',
          error: error.message || 'Failed to send email',
        });

        this.logger.error(
          `Failed to send email to ${recipient.email}:`,
          error.message,
        );
      }
    }

    this.logger.log(
      `Bulk mail completed: ${results.succeeded} succeeded, ${results.failed} failed`,
    );
    return results;
  }

  async sendTestInterviewEmail(email: string) {
    this.logger.log(`Sending test interview email to: ${email}`);

    const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
    const testInterviewLink = `${appUrl}/interview/test-me`;

    const htmlContent = getProfessionalEmailLayout({
      title: 'Test Interview Invitation',
      message: 'This is a **test interview invitation** from the IntervAI platform. You can use this to experience our AI-powered interview environment firsthand. No signup is required for this test.',
      details: [
        { label: 'Position', value: 'Full Stack Developer (Test)' },
        { label: 'Company', value: 'IntervAI Demo' },
        { label: 'Duration', value: '25 minutes' }
      ],
      buttonText: '🚀 Start Test Interview',
      buttonLink: testInterviewLink,
      footerText: 'Note: This is a test environment. Data collected here is for demonstration purposes only.'
    });

    const textContent = `
Test Interview Invitation - IntervAI Platform

Position: Full Stack Developer (Test)
Company: IntervAI Demo
Duration: 25 minutes

Start your test interview here:
${testInterviewLink}

This is a test environment where you can experience our AI-powered interview platform.

Best of luck!
The IntervAI Team
        `;

    try {
      const emailSent = await this.emailService.sendMail(
        email,
        '🎯 Test Interview Invitation - IntervAI Platform',
        textContent,
        htmlContent,
      );

      if (!emailSent) {
        return {
          success: false,
          message: 'Email service failed to send',
          email,
        };
      }

      // Also create a notification
      await this.createForEmail(
        email,
        {
          type: NotificationType.EMAIL,
          title: 'Test Interview Invitation',
          message:
            'You have been invited to a test interview. Click to start your AI-powered interview experience.',
          link: '/interview/test-me',
        },
        false, // Don't send email again
      );

      this.logger.log(`Test email sent successfully to ${email}`);
      return {
        success: true,
        message: 'Test interview invitation sent successfully',
        email,
        interviewLink: testInterviewLink,
      };
    } catch (error) {
      this.logger.error(
        `Failed to send test email to ${email}:`,
        error.message,
      );
      return {
        success: false,
        message: error.message || 'Failed to send test email',
        email,
      };
    }
  }

  async sendScheduleUpdateBulkMail(jobId: string, companyName: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: { candidates: true },
    });

    if (!job) {
      this.logger.error(`[NotificationsService] Job not found for bulk mail: ${jobId}`);
      return;
    }

    this.logger.log(`[NotificationsService] Sending schedule update bulk mail for job: ${job.title} to ${job.candidates.length} candidates`);

    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    for (const candidate of job.candidates) {
      if (candidate.status === 'REJECTED' || candidate.status === 'COMPLETED') continue;

      const interviewLink = `${appUrl}/interview/${candidate.interviewLink}`;

      const htmlContent = getScheduleUpdateEmailLayout({
        title: 'Interview Schedule Updated',
        message: `The interview schedule for <strong>${job.title}</strong> at <strong>${companyName}</strong> has been updated.`,
        details: [
          { label: 'Position', value: job.title },
          { label: 'Company', value: companyName },
          { label: 'Start Time (UTC)', value: job.interviewStartTime.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'long', timeStyle: 'short' }) + ' UTC' },
          { label: 'End Time (UTC)', value: job.interviewEndTime.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'long', timeStyle: 'short' }) + ' UTC' }
        ],
        buttonText: 'Verify Updated Schedule',
        buttonLink: interviewLink,
        candidateName: candidate.name,
      });

      const textContent = `
Your interview schedule for ${job.title} at ${companyName} has been updated.

Updated Schedule (UTC):
Start: ${job.interviewStartTime.toLocaleString('en-US', { timeZone: 'UTC' })} UTC
End: ${job.interviewEndTime.toLocaleString('en-US', { timeZone: 'UTC' })} UTC

Access your interview environment here:
${interviewLink}

Timings are in UTC.
      `;

      await this.emailService.sendMail(
        candidate.email,
        `📅 Updated Schedule: ${job.title} at ${companyName}`,
        textContent,
        htmlContent,
      );

      // Also create an in-app notification
      await this.createForEmail(candidate.email, {
        type: NotificationType.EMAIL,
        title: 'Interview Schedule Updated',
        message: `Your interview for ${job.title} has a new schedule. Please check your email for details.`,
        link: `/interview/${candidate.interviewLink}`
      }, false);
    }
  }
}
