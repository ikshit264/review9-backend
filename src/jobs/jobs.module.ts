import { Module } from '@nestjs/common';
import {
  JobsController,
  CandidatesController,
  CompaniesController,
} from './jobs.controller';
import { JobsService } from './jobs.service';
import { CommonModule } from '../common/common.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CommonModule, NotificationsModule],
  controllers: [JobsController, CandidatesController, CompaniesController],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
