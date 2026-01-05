import { IsEnum, IsString, IsOptional } from 'class-validator';
import { Plan } from '@prisma/client';

export class SubscribeDto {
  @IsEnum(Plan)
  plan: Plan;

  @IsString()
  @IsOptional()
  paymentMethodId?: string;

  @IsString()
  @IsOptional()
  stripeToken?: string;
}
