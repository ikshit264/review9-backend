import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Plan } from '@prisma/client';
import { SubscribeDto } from './dto';
import { getPlanConfig } from '../config/plan.config';

@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) { }

  async getSubscriptionStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        jobs: {
          include: {
            _count: { select: { candidates: true } },
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const currentPlan = user.plan || Plan.FREE;
    const limits = getPlanConfig(currentPlan);

    // Calculate usage
    const totalJobs = user.jobs.length;
    const totalCandidates = user.jobs.reduce(
      (sum, job) => sum + job._count.candidates,
      0,
    );

    // Check if any job is near limit (FREE plan only)
    let nearLimit = false;
    if (currentPlan === Plan.FREE) {
      const threshold = Math.floor(limits.maxCandidatesPerJob * 0.8); // 80% of limit
      nearLimit = user.jobs.some((job) => job._count.candidates >= threshold);
    }

    // Calculate days until expiration (for PRO/ULTRA users)
    let daysUntilExpiration: number | null = null;
    if (user.subscriptionExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(user.subscriptionExpiresAt);
      const diffTime = expiresAt.getTime() - now.getTime();
      daysUntilExpiration = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    return {
      plan: currentPlan,
      limits: {
        maxJobs: limits.maxJobs,
        maxCandidatesPerJob: limits.maxCandidatesPerJob,
        features: this.getPlanFeatures(currentPlan),
      },
      usage: {
        totalJobs,
        totalCandidates,
        candidatesPerJobLimit: limits.maxCandidatesPerJob,
      },
      subscription: {
        expiresAt: user.subscriptionExpiresAt,
        lastPaymentAt: user.lastPaymentAt,
        daysUntilExpiration,
        isExpiringSoon:
          daysUntilExpiration !== null && daysUntilExpiration <= 7,
      },
      nearLimit,
      canUpgrade: currentPlan !== Plan.ULTRA,
      pricing: {
        PRO: { monthly: 9 },
        ULTRA: { monthly: 27 },
      },
    };
  }

  async subscribe(userId: string, dto: SubscribeDto) {
    // DISABLED: Plan activation must go through Dodo Payments portal
    throw new BadRequestException('All payments must be processed through the secure payment portal.');
  }

  private getPlanFeatures(plan: Plan): string[] {
    const features: Record<Plan, string[]> = {
      FREE: [
        'Basic interview',
        'Full screen mode only',
        'Limited analytics',
        'Up to 5 jobs',
        'Up to 30 candidates per job',
      ],
      PRO: [
        'Interactive interviews',
        'Eye tracking',
        'Face detection',
        'Browser safety',
        'Full analytics',
        'Priority support',
        'Up to 15 jobs',
        'Unlimited candidates',
      ],
      ULTRA: [
        'All Pro features',
        'Multi-face detection',
        'Screen recording',
        'Priority AI scoring',
        'Custom branding',
        'Unlimited jobs',
        'Unlimited candidates',
      ],
    };
    return features[plan];
  }
}
