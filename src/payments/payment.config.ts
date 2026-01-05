import { Plan } from '@prisma/client';

export interface PlanConfig {
  price: number;
  currency: string;
  productId: string;
  checkoutUrl: string;
  features: string[];
}

export const PAYMENT_CONFIG = {
  SUBSCRIPTION_DURATION_DAYS: 30,
  NOTIFICATION_DAYS_BEFORE: {
    FIRST_REMINDER: 3,
    FINAL_REMINDER: 1,
  },
  PLANS: {
    PRO: {
      price: 9,
      currency: 'USD',
      productId: process.env.DODO_PRO_PRODUCT_ID || 'pdt_0NVTaRq2HjjmZVgRubggy',
      checkoutUrl: `https://checkout.dodopayments.com/buy/${process.env.DODO_PRO_PRODUCT_ID || 'pdt_0NVTaRq2HjjmZVgRubggy'}?quantity=1`,
      features: [
        'Interactive interviews',
        'Eye tracking',
        'Full analytics',
        'Priority support',
        'Unlimited candidates per job',
      ],
    } as PlanConfig,
    ULTRA: {
      price: 27,
      currency: 'USD',
      productId:
        process.env.DODO_ULTRA_PRODUCT_ID || 'pdt_0NVTaZDXBzf0qEwZo2cX5',
      checkoutUrl: `https://checkout.dodopayments.com/buy/${process.env.DODO_ULTRA_PRODUCT_ID || 'pdt_0NVTaZDXBzf0qEwZo2cX5'}?quantity=1`,
      features: [
        'All Pro features',
        'Multi-face detection',
        'Screen recording',
        'Priority AI scoring',
        'Custom branding',
        'Advanced proctoring',
      ],
    } as PlanConfig,
  },
} as const;

export const getPlanConfig = (plan: Plan): PlanConfig => {
  const planKey = plan as 'PRO' | 'ULTRA';
  return PAYMENT_CONFIG.PLANS[planKey];
};

export const getSubscriptionExpirationDate = (): Date => {
  const now = new Date();
  now.setDate(now.getDate() + PAYMENT_CONFIG.SUBSCRIPTION_DURATION_DAYS);
  return now;
};
