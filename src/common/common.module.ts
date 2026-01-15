import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { GeminiService } from './gemini.service';
import { GeminiController } from './gemini.controller';
import { TimeWindowService } from './time-window.service';

@Module({
  controllers: [GeminiController],
  providers: [
    EmailService,
    GeminiService,
    TimeWindowService,
  ],
  exports: [EmailService, GeminiService, TimeWindowService],
})
export class CommonModule { }
