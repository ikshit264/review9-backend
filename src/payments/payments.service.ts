import {
  Injectable,
  BadRequestException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Plan, PaymentStatus } from '@prisma/client';
import DodoPayments from 'dodopayments';
import { Webhook } from 'standardwebhooks';
import { DodoWebhookPayload, WebhookHeaders } from './dto';
import {
  PAYMENT_CONFIG,
  getPlanConfig,
  getSubscriptionExpirationDate,
} from './payment.config';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private dodoClient: DodoPayments;
  private webhook: Webhook;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('DODO_PAYMENT_API_KEY') || '';
    const environment =
      this.configService.get<string>('DODO_ENVIRONMENT') || 'test_mode';
    const webhookSecret = this.configService.get<string>('DODO_WEBHOOK_SECRET');

    if (!apiKey) {
      this.logger.warn(
        'DODO_PAYMENT_API_KEY is not configured. Payment features will not work. ' +
        'Please add DODO_PAYMENT_API_KEY to your .env file to enable payments.',
      );
    } else {
      this.dodoClient = new DodoPayments({
        bearerToken: apiKey,
        environment: environment as 'test_mode' | 'live_mode',
      });
      this.logger.log('Dodo Payments client initialized successfully');
    }

    if (webhookSecret) {
      try {
        this.webhook = new Webhook(webhookSecret);
        this.logger.log('Webhook verification enabled');
      } catch (error) {
        this.logger.error(
          `Failed to initialize webhook with provided secret: ${error.message}. ` +
          'Webhook verification will be disabled. Please ensure DODO_WEBHOOK_SECRET is a valid base64-encoded string.',
        );
        this.logger.warn(
          'DODO_WEBHOOK_SECRET is invalid - webhook verification disabled',
        );
      }
    } else {
      this.logger.warn(
        'DODO_WEBHOOK_SECRET not configured - webhook verification disabled',
      );
    }
  }

  async createCheckoutSession(userId: string, plan: Plan, returnUrl?: string) {
    try {
      if (!this.dodoClient) {
        throw new InternalServerErrorException(
          'Payment system is not configured. Please contact support or configure DODO_PAYMENT_API_KEY in the environment variables.',
        );
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      if (user.plan !== Plan.FREE && user.subscriptionExpiresAt) {
        const now = new Date();
        if (user.subscriptionExpiresAt > now) {
          const daysRemaining = Math.ceil(
            (user.subscriptionExpiresAt.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24),
          );
          throw new BadRequestException(
            `You already have an active ${user.plan} subscription. It will expire in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}. Please wait until expiration to renew or upgrade.`,
          );
        }
      }

      if (user.plan === plan) {
        throw new BadRequestException(`You are already on the ${plan} plan`);
      }

      // Block plan changes (no upgrade/downgrade)
      if (user.plan !== Plan.FREE && user.plan !== plan) {
        throw new BadRequestException(
          `Upgrades and downgrades are currently disabled. You can only renew your current ${user.plan} plan.`,
        );
      }

      const planConfig = getPlanConfig(plan);

      const session = await this.dodoClient.checkoutSessions.create({
        product_cart: [
          {
            product_id: planConfig.productId,
            quantity: 1,
          },
        ],
        customer: {
          email: user.email,
          name: user.name,
        },
        minimal_address: true,
        return_url:
          returnUrl ||
          `${this.configService.get('FRONTEND_URL') || 'http://localhost:3000'}/payment/success`,
      } as any);

      this.logger.log(
        `Created checkout session for user ${userId}, plan ${plan}`,
      );

      return {
        checkoutUrl: session.checkout_url,
        plan,
        amount: planConfig.price,
        currency: planConfig.currency,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create checkout session: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to create checkout session',
      );
    }
  }

  async processWebhook(rawBody: string, headers: WebhookHeaders) {
    let webhookLogId: string;
    try {
      if (this.webhook) {
        await this.webhook.verify(rawBody, headers);
      }

      const payload: DodoWebhookPayload = JSON.parse(rawBody);

      const webhookLog = await this.prisma.paymentWebhookLog.create({
        data: {
          eventType: payload.event_type,
          dodoPaymentId: payload.payment_id,
          payload: payload as any,
          processed: false,
        },
      });
      webhookLogId = webhookLog.id;

      this.logger.log(
        `Received webhook event: ${payload.event_type}, payment_id: ${payload.payment_id}`,
      );

      if (payload.event_type === 'payment.succeeded') {
        const user = await this.prisma.user.findUnique({
          where: { email: payload.customer?.email },
        });

        if (!user) {
          throw new Error(`User not found for email: ${payload.customer?.email}`);
        }

        const plan = this.getPlanFromProductId(payload.product_id);
        if (!plan) {
          throw new Error(`Unknown product_id: ${payload.product_id}`);
        }

        await this.finalizePayment(
          user.id,
          plan,
          payload.payment_id,
          payload.product_id,
          payload.metadata,
        );

        await this.prisma.paymentWebhookLog.update({
          where: { id: webhookLogId },
          data: { processed: true },
        });
      }

      return { received: true };
    } catch (error) {
      if (webhookLogId) {
        await this.prisma.paymentWebhookLog.update({
          where: { id: webhookLogId },
          data: {
            processed: false,
            processingError: error.message,
          },
        });
      }

      this.logger.error(
        `Failed to process payment webhook: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async finalizePayment(
    userId: string,
    plan: Plan,
    dodoPaymentId: string,
    dodoProductId: string,
    metadata: any = {},
  ) {
    const planConfig = getPlanConfig(plan);
    const subscriptionEnd = getSubscriptionExpirationDate();

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.paymentTransaction.findUnique({
        where: { dodoPaymentId },
      });

      if (existing) {
        this.logger.log(`Payment ${dodoPaymentId} already processed, skipping.`);
        return;
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          plan,
          subscriptionExpiresAt: subscriptionEnd,
          lastPaymentAt: new Date(),
        },
      });

      await tx.paymentTransaction.create({
        data: {
          userId,
          plan,
          amount: planConfig.price,
          currency: planConfig.currency,
          dodoPaymentId,
          dodoProductId,
          status: PaymentStatus.SUCCEEDED,
          subscriptionStart: new Date(),
          subscriptionEnd,
          metadata: metadata || {},
        },
      });
    });

    this.logger.log(`Successfully finalized payment and upgraded user ${userId} to ${plan} plan`);
  }

  private getPlanFromProductId(productId: string): Plan | null {
    const proProductId = this.configService.get('DODO_PRO_PRODUCT_ID');
    const ultraProductId = this.configService.get('DODO_ULTRA_PRODUCT_ID');

    if (productId === proProductId) return Plan.PRO;
    if (productId === ultraProductId) return Plan.ULTRA;
    return null;
  }

  async verifyPayment(paymentId: string, userId: string) {
    try {
      let payment = await this.prisma.paymentTransaction.findFirst({
        where: {
          dodoPaymentId: paymentId,
          userId,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              plan: true,
              subscriptionExpiresAt: true,
            },
          },
        },
      });

      if (!payment && this.dodoClient) {
        this.logger.log(`Payment ${paymentId} not found in DB, fetching from Dodo Payments...`);
        try {
          const dodoPayment = (await this.dodoClient.payments.retrieve(paymentId)) as any;
          this.logger.log(`Dodo Payment status: ${dodoPayment.status}`);

          if (dodoPayment.status === 'succeeded') {
            const plan = this.getPlanFromProductId(dodoPayment.product_id);
            if (plan) {
              await this.finalizePayment(
                userId,
                plan,
                dodoPayment.payment_id,
                dodoPayment.product_id,
                dodoPayment.metadata,
              );

              payment = await this.prisma.paymentTransaction.findFirst({
                where: { dodoPaymentId: paymentId, userId },
                include: {
                  user: {
                    select: {
                      id: true,
                      email: true,
                      name: true,
                      plan: true,
                      subscriptionExpiresAt: true,
                    },
                  },
                },
              }) as any;
            }
          }
        } catch (dodoError) {
          this.logger.error(`Failed to fetch payment from Dodo Payments: ${dodoError.message}`);
        }
      }

      if (!payment) {
        return {
          verified: false,
          message: 'Payment not found or still processing',
        };
      }

      return {
        verified: true,
        payment: {
          id: payment.id,
          plan: payment.plan,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          subscriptionStart: payment.subscriptionStart,
          subscriptionEnd: payment.subscriptionEnd,
        },
        user: payment.user,
      };
    } catch (error) {
      this.logger.error(
        `Failed to verify payment: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Failed to verify payment');
    }
  }

  async getPaymentHistory(userId: string) {
    try {
      const payments = await this.prisma.paymentTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          plan: true,
          amount: true,
          currency: true,
          status: true,
          subscriptionStart: true,
          subscriptionEnd: true,
          createdAt: true,
        },
      });

      return payments;
    } catch (error) {
      this.logger.error(
        `Failed to get payment history: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to retrieve payment history',
      );
    }
  }
}
