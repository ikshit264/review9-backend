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
      // Check if Dodo Payments is configured
      if (!this.dodoClient) {
        throw new InternalServerErrorException(
          'Payment system is not configured. Please contact support or configure DODO_PAYMENT_API_KEY in the environment variables.',
        );
      }

      // Get user details
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }

      // Block payment if user already has an active paid subscription
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

      // Validate plan upgrade
      if (user.plan === plan) {
        throw new BadRequestException(`You are already on the ${plan} plan`);
      }

      const planConfig = getPlanConfig(plan);

      // Create checkout session with Dodo Payments
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
        return_url:
          returnUrl ||
          `${this.configService.get('FRONTEND_URL') || 'http://localhost:3000'}/payment/success`,
      });

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
    try {
      // Verify webhook signature
      if (this.webhook) {
        await this.webhook.verify(rawBody, headers);
      }

      const payload: DodoWebhookPayload = JSON.parse(rawBody);

      // Log webhook event
      const webhookLog = await this.prisma.paymentWebhookLog.create({
        data: {
          eventType: payload.event_type,
          dodoPaymentId: payload.payment_id,
          payload: payload as any,
          processed: false,
        },
      });

      this.logger.log(
        `Received webhook event: ${payload.event_type}, payment_id: ${payload.payment_id}`,
      );

      // Process payment.succeeded event
      if (payload.event_type === 'payment.succeeded') {
        await this.handlePaymentSucceeded(payload, webhookLog.id);
      }

      return { received: true };
    } catch (error) {
      this.logger.error(
        `Webhook processing failed: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException('Webhook verification failed');
    }
  }

  private async handlePaymentSucceeded(
    payload: DodoWebhookPayload,
    webhookLogId: string,
  ) {
    try {
      // Find user by email
      const user = await this.prisma.user.findUnique({
        where: { email: payload.customer?.email },
      });

      if (!user) {
        throw new Error(`User not found for email: ${payload.customer?.email}`);
      }

      // Determine plan from product_id
      const plan = this.getPlanFromProductId(payload.product_id);
      if (!plan) {
        throw new Error(`Unknown product_id: ${payload.product_id}`);
      }

      const planConfig = getPlanConfig(plan);
      const subscriptionEnd = getSubscriptionExpirationDate();

      // Use transaction to ensure atomicity
      await this.prisma.$transaction(async (tx) => {
        // Update user plan and subscription dates
        await tx.user.update({
          where: { id: user.id },
          data: {
            plan,
            subscriptionExpiresAt: subscriptionEnd,
            lastPaymentAt: new Date(),
          },
        });

        // Create payment transaction record
        await tx.paymentTransaction.create({
          data: {
            userId: user.id,
            plan,
            amount: planConfig.price,
            currency: planConfig.currency,
            dodoPaymentId: payload.payment_id,
            dodoProductId: payload.product_id,
            status: PaymentStatus.SUCCEEDED,
            subscriptionStart: new Date(),
            subscriptionEnd,
            metadata: payload.metadata || {},
          },
        });

        // Mark webhook as processed
        await tx.paymentWebhookLog.update({
          where: { id: webhookLogId },
          data: { processed: true },
        });
      });

      this.logger.log(`Successfully upgraded user ${user.id} to ${plan} plan`);
    } catch (error) {
      // Log error in webhook log
      await this.prisma.paymentWebhookLog.update({
        where: { id: webhookLogId },
        data: {
          processed: false,
          processingError: error.message,
        },
      });

      this.logger.error(
        `Failed to process payment.succeeded: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private getPlanFromProductId(productId: string): 'PRO' | 'ULTRA' | null {
    const proProductId = this.configService.get('DODO_PRO_PRODUCT_ID');
    const ultraProductId = this.configService.get('DODO_ULTRA_PRODUCT_ID');

    if (productId === proProductId) return Plan.PRO;
    if (productId === ultraProductId) return Plan.ULTRA;
    return null;
  }

  async verifyPayment(paymentId: string, userId: string) {
    try {
      // Check if payment exists in our database
      const payment = await this.prisma.paymentTransaction.findFirst({
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
