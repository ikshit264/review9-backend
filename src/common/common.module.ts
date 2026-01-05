import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { GeminiService } from './gemini.service';
import { GeminiController } from './gemini.controller';
import { GeolocationService } from './geolocation.service';
import { TimeWindowService } from './time-window.service';

@Module({
  controllers: [GeminiController],
  providers: [
    EmailService,
    GeminiService,
    GeolocationService,
    TimeWindowService,
  ],
  exports: [EmailService, GeminiService, GeolocationService, TimeWindowService],
})
export class CommonModule {}
