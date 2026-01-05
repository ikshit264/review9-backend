import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Plan } from '@prisma/client';

export class CreateCheckoutDto {
  @IsEnum(Plan)
  plan: Plan;

  @IsOptional()
  @IsString()
  returnUrl?: string;
}
