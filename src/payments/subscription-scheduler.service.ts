import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { Plan } from '@prisma/client';
import { PAYMENT_CONFIG } from './payment.config';

@Injectable()
export class SubscriptionSchedulerService {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);

  constructor(private prisma: PrismaService) {}

  // Run daily at midnight to check for expired subscriptions
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredSubscriptions() {
    this.logger.log('Running expired subscriptions check...');

    try {
      const now = new Date();

      // Find users with expired subscriptions
      const expiredUsers = await this.prisma.user.findMany({
        where: {
          plan: {
            in: [Plan.PRO, Plan.ULTRA],
          },
          subscriptionExpiresAt: {
            lte: now,
          },
        },
      });

      this.logger.log(`Found ${expiredUsers.length} expired subscriptions`);

      for (const user of expiredUsers) {
        try {
          // Downgrade to FREE plan
          await this.prisma.user.update({
            where: { id: user.id },
            data: {
              plan: Plan.FREE,
              subscriptionExpiresAt: null,
            },
          });

          // Send expiration notification (in-app)
          await this.prisma.notification.create({
            data: {
              type: 'INAPP',
              title: 'Subscription Expired',
              message: `Your ${user.plan} subscription has expired. You have been downgraded to the FREE plan. Renew your subscription to continue enjoying premium features.`,
              email: user.email,
              userId: user.id,
              link: '/profile/billing',
            },
          });

          // Send email notification
          await this.prisma.notification.create({
            data: {
              type: 'EMAIL',
              title: 'Subscription Expired',
              message: `Your ${user.plan} subscription has expired. You have been downgraded to the FREE plan. Renew your subscription to continue enjoying premium features.`,
              email: user.email,
              userId: user.id,
            },
          });

          this.logger.log(
            `Downgraded user ${user.id} (${user.email}) from ${user.plan} to FREE`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to downgrade user ${user.id}: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log('Expired subscriptions check completed');
    } catch (error) {
      this.logger.error(
        `Expired subscriptions check failed: ${error.message}`,
        error.stack,
      );
    }
  }

  // DISABLED: Email reminders are now handled via frontend notifications
  // Users will see expiration warnings when they visit the billing page
  // Keeping this code for future reference if email reminders are needed again

  // Run daily at 9 AM to send expiration reminders
  // @Cron('0 9 * * *') // 9 AM every day
  // async sendExpirationReminders() {
  //     this.logger.log('Running expiration reminders check...');

  //     try {
  //         const now = new Date();

  //         // 3-day reminder
  //         await this.sendReminder(
  //             PAYMENT_CONFIG.NOTIFICATION_DAYS_BEFORE.FIRST_REMINDER,
  //             '3 Days Until Expiration',
  //             'Your subscription will expire in 3 days. Renew now to avoid interruption of service.',
  //         );

  //         // 1-day reminder
  //         await this.sendReminder(
  //             PAYMENT_CONFIG.NOTIFICATION_DAYS_BEFORE.FINAL_REMINDER,
  //             'Urgent: 1 Day Until Expiration',
  //             'Your subscription will expire tomorrow! Renew now to maintain access to premium features.',
  //         );

  //         this.logger.log('Expiration reminders sent successfully');
  //     } catch (error) {
  //         this.logger.error(`Expiration reminders failed: ${error.message}`, error.stack);
  //     }
  // }

  private async sendReminder(
    daysBeforeExpiration: number,
    title: string,
    message: string,
  ) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBeforeExpiration);

    // Set to start and end of day for comparison
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const usersToNotify = await this.prisma.user.findMany({
      where: {
        plan: {
          in: [Plan.PRO, Plan.ULTRA],
        },
        subscriptionExpiresAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    this.logger.log(
      `Sending ${daysBeforeExpiration}-day reminder to ${usersToNotify.length} users`,
    );

    for (const user of usersToNotify) {
      try {
        // Send in-app notification
        await this.prisma.notification.create({
          data: {
            type: 'INAPP',
            title,
            message: `${message} Current plan: ${user.plan}`,
            email: user.email,
            userId: user.id,
            link: '/payment',
          },
        });

        // Send email notification
        await this.prisma.notification.create({
          data: {
            type: 'EMAIL',
            title,
            message: `${message} Current plan: ${user.plan}. Renew your subscription to continue enjoying premium features.`,
            email: user.email,
            userId: user.id,
          },
        });

        this.logger.log(
          `Sent ${daysBeforeExpiration}-day reminder to user ${user.id} (${user.email})`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send reminder to user ${user.id}: ${error.message}`,
          error.stack,
        );
      }
    }
  }
}
