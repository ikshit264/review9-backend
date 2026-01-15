import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { JobsModule } from './jobs/jobs.module';
import { InterviewsModule } from './interviews/interviews.module';
import { BillingModule } from './billing/billing.module';
import { PaymentsModule } from './payments/payments.module';
import { UploadModule } from './upload/upload.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      ignoreEnvFile: false,
      expandVariables: false, // Don't expand variables
      cache: false, // Don't cache
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    EmailModule,
    AuthModule,
    JobsModule,
    InterviewsModule,
    BillingModule,
    PaymentsModule,
    UploadModule,
    NotificationsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule { }
