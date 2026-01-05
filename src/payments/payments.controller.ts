import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Headers,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreateCheckoutDto } from './dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';
import { Request } from 'express';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('create-checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckout(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.paymentsService.createCheckoutSession(
      userId,
      dto.plan,
      dto.returnUrl,
    );
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('webhook-id') webhookId: string,
    @Headers('webhook-signature') webhookSignature: string,
    @Headers('webhook-timestamp') webhookTimestamp: string,
  ) {
    const rawBody = req.rawBody?.toString('utf-8') || '';

    const headers = {
      'webhook-id': webhookId || '',
      'webhook-signature': webhookSignature || '',
      'webhook-timestamp': webhookTimestamp || '',
    };

    return this.paymentsService.processWebhook(rawBody, headers);
  }

  @Get('verify/:paymentId')
  @UseGuards(JwtAuthGuard)
  async verifyPayment(
    @Param('paymentId') paymentId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentsService.verifyPayment(paymentId, userId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getPaymentHistory(@CurrentUser('id') userId: string) {
    return this.paymentsService.getPaymentHistory(userId);
  }
}
