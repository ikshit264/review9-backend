import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { SubscribeDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
    constructor(private billingService: BillingService) { }

    @Get('status')
    async getStatus(@CurrentUser('id') userId: string) {
        return this.billingService.getSubscriptionStatus(userId);
    }

    @Post('subscribe')
    async subscribe(
        @CurrentUser('id') userId: string,
        @Body() dto: SubscribeDto,
    ) {
        return this.billingService.subscribe(userId, dto);
    }
}
