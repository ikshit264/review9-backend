import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { NotificationsService } from './notifications/notifications.service';

@Controller('health')
export class AppController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get()
    getHealth() {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            message: 'Service is healthy',
        };
    }

    @Post('test-email')
    async testEmail(@Body('email') email: string) {
        if (!email) {
            return {
                success: false,
                message: 'Email is required in the request body',
            };
        }
        return this.notificationsService.sendTestInterviewEmail(email);
    }
}
