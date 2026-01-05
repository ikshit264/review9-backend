import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { GetNotificationDto } from './dto/notification.dto';
import { BulkMailDto } from './dto/bulk-mail.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  // Public endpoint for testing
  @Get('send-test-email')
  async sendTestEmail(@Query('email') email?: string) {
    return this.notificationsService.sendTestInterviewEmail(
      email || 'taleraiy@rknec.edu',
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query() query: GetNotificationDto,
  ) {
    return this.notificationsService.findAll(userId, query);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bulk-mail')
  async bulkMail(@Body() dto: BulkMailDto) {
    return this.notificationsService.bulkMail(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(userId, notificationId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  async markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') notificationId: string,
  ) {
    return this.notificationsService.remove(userId, notificationId);
  }
}
