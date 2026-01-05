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

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

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
    if (
      (sendEmail && dto.type === NotificationType.EMAIL) ||
      dto.type === NotificationType.SYSTEM
    ) {
      await this.emailService.sendMail(
        email,
        dto.title,
        dto.message,
        `<div style="font-family: Arial, sans-serif;">
                    <h2>${dto.title}</h2>
                    <p>${dto.message}</p>
                    ${dto.link ? `<a href="${dto.link}" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px;">View Details</a>` : ''}
                </div>`,
      );
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

    const testInterviewLink = `${process.env.APP_URL || 'http://localhost:3000'}/interview/test-me`;

    const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; }
                    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                    .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
                    .note { background: #fff3cd; padding: 15px; border-radius: 5px; margin-top: 20px; border-left: 4px solid #ffc107; }
                    .badge { display: inline-block; background: #28a745; color: white; padding: 5px 10px; border-radius: 3px; font-size: 12px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎯 Test Interview Invitation</h1>
                        <p>AI-Powered Interview Platform - FREE Plan</p>
                    </div>
                    <div class="content">
                        <p>Hello,</p>
                        <p>This is a <strong>test interview invitation</strong> from the HireAI platform.</p>
                        
                        <p><span class="badge">FREE PLAN</span></p>
                        
                        <p><strong>Position:</strong> Full Stack Developer (Test)</p>
                        <p><strong>Company:</strong> HireAI Demo</p>
                        <p><strong>Duration:</strong> 25 minutes</p>
                        
                        <a href="${testInterviewLink}" class="button">🚀 Start Test Interview</a>
                        
                        <p><strong>What to expect:</strong></p>
                        <ul>
                            <li>AI-powered technical interview</li>
                            <li>Real-time conversation with AI interviewer</li>
                            <li>Automatic evaluation and scoring</li>
                            <li>No signup required for testing</li>
                        </ul>
                        
                        <div class="note">
                            <strong>📝 Note:</strong> This is a test environment. You can try the interview process without any real consequences. The FREE plan includes basic proctoring and a 25-minute interview duration.
                        </div>
                        
                        <p style="margin-top: 30px;">
                            <strong>Interview Link:</strong><br>
                            <a href="${testInterviewLink}">${testInterviewLink}</a>
                        </p>
                        
                        <p style="margin-top: 30px; color: #666; font-size: 14px;">
                            Best of luck!<br>
                            The HireAI Team
                        </p>
                    </div>
                </div>
            </body>
            </html>
        `;

    const textContent = `
Test Interview Invitation - HireAI Platform

Position: Full Stack Developer (Test)
Company: HireAI Demo
Plan: FREE (25 minutes)

Start your test interview here:
${testInterviewLink}

This is a test environment where you can experience our AI-powered interview platform.

Best of luck!
The HireAI Team
        `;

    try {
      const emailSent = await this.emailService.sendMail(
        email,
        '🎯 Test Interview Invitation - HireAI Platform (FREE Plan)',
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
}
