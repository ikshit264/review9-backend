import { Controller, Post, Get, Body, UseGuards, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import { SubscribeDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Role } from '@prisma/client';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
    constructor(private billingService: BillingService) { }

    @Get('status')
    async getStatus(
        @CurrentUser('id') userId: string,
        @Query('companyId') companyId?: string,
        @CurrentUser('role') role?: Role,
    ) {
        const targetId = (role === Role.ADMIN && companyId) ? companyId : userId;
        return this.billingService.getSubscriptionStatus(targetId);
    }

    @Post('subscribe')
    async subscribe(
        @CurrentUser('id') userId: string,
        @Body() dto: SubscribeDto,
        @Query('companyId') companyId?: string,
        @CurrentUser('role') role?: Role,
    ) {
        const targetId = (role === Role.ADMIN && companyId) ? companyId : userId;
        return this.billingService.subscribe(targetId, dto);
    }
}
