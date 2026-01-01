import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Plan } from '@prisma/client';
import { SubscribeDto } from './dto';

interface PlanLimits {
    maxCandidatesPerJob: number;
    features: string[];
}

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
    FREE: {
        maxCandidatesPerJob: 30,
        features: ['Basic interview', 'Tab tracking only', 'Limited analytics'],
    },
    PRO: {
        maxCandidatesPerJob: -1, // Unlimited
        features: ['Interactive interviews', 'Eye tracking', 'Full analytics', 'Priority support'],
    },
    ULTRA: {
        maxCandidatesPerJob: -1,
        features: ['All Pro features', 'Multi-face detection', 'Screen recording', 'Priority AI scoring', 'Custom branding'],
    },
};

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
        const limits = PLAN_LIMITS[currentPlan];

        // Calculate usage
        const totalJobs = user.jobs.length;
        const totalCandidates = user.jobs.reduce((sum, job) => sum + job._count.candidates, 0);

        // Check if any job is near limit (FREE plan only)
        let nearLimit = false;
        if (currentPlan === Plan.FREE) {
            nearLimit = user.jobs.some(job => job._count.candidates >= 25);
        }

        return {
            plan: currentPlan,
            limits,
            usage: {
                totalJobs,
                totalCandidates,
                candidatesPerJobLimit: limits.maxCandidatesPerJob,
            },
            nearLimit,
            canUpgrade: currentPlan !== Plan.ULTRA,
            pricing: {
                PRO: { monthly: 49, yearly: 470 },
                ULTRA: { monthly: 99, yearly: 950 },
            },
        };
    }

    async subscribe(userId: string, dto: SubscribeDto) {
        // In production, integrate with Stripe/Razorpay here
        // For now, just update the plan directly

        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw new BadRequestException('User not found');
        }

        // Validate plan upgrade path
        const planOrder = { FREE: 0, PRO: 1, ULTRA: 2 };
        if (planOrder[dto.plan] <= planOrder[user.plan || 'FREE']) {
            throw new BadRequestException('Cannot downgrade or select same plan');
        }

        // TODO: Process payment with Stripe
        // const stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY'));
        // await stripe.charges.create({ ... });

        // Update user plan
        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { plan: dto.plan },
            select: { id: true, email: true, name: true, plan: true },
        });

        return {
            success: true,
            message: `Successfully upgraded to ${dto.plan}`,
            user: updatedUser,
            features: PLAN_LIMITS[dto.plan].features,
        };
    }
}
