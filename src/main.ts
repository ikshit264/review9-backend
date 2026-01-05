import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.use(cookieParser());

  // Parse allowed origins from env (comma-separated) - aligned with Senior Auth Engineer request
  const allowedOrigins = (
    process.env.APP_URLS ||
    process.env.ALLOWED_ORIGINS ||
    'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(Number(process.env.PORT) || 3000, '0.0.0.0'); // 🔥 REQUIRED FOR RENDER

  console.log(
    `🚀 HireAI Backend running on port ${Number(process.env.PORT) || 3000}`,
  );
}

bootstrap();
