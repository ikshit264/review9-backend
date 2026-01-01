import { Module } from '@nestjs/common';
import { InterviewsController } from './interviews.controller';
import { InterviewsService } from './interviews.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommonModule } from '../common/common.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [CommonModule, NotificationsModule, AuthModule],
    controllers: [InterviewsController],
    providers: [InterviewsService],
    exports: [InterviewsService],
})
export class InterviewsModule { }
