import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { GeminiService } from './gemini.service';
import { GeminiController } from './gemini.controller';
import { GeolocationService } from './geolocation.service';

@Module({
    controllers: [GeminiController],
    providers: [EmailService, GeminiService, GeolocationService],
    exports: [EmailService, GeminiService, GeolocationService],
})
export class CommonModule { }
