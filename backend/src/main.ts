import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const host = (process.env.HOST ?? 'localhost').trim() || 'localhost';
  const rawPort = (process.env.PORT ?? '3000').trim();
  const port = Number.parseInt(rawPort, 10) || 3000;
  
  app.use(helmet());

  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173,https://smartroute.uz').split(',').map(o => o.trim());
  // Enable CORS with restricted origins
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  // Hikvision devices can send XML or multipart payloads.
  app.use(express.raw({ type: ['multipart/form-data', 'multipart/*', 'application/octet-stream'], limit: '20mb' }));
  app.use(express.text({ type: ['application/xml', 'text/xml'], limit: '5mb' }));
  
  await app.listen(port, host);
  console.log(`SmartRoute Backend Application is running on: http://${host}:${port}`);
}
bootstrap();
