import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const host = process.env.HOST ?? '0.0.0.0';
  const port = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;
  
  // Enable CORS since frontend is on Vite (port 5173 usually) and backend will be on port 3000
  app.enableCors();
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  // Hikvision devices can send XML or multipart payloads.
  app.use(express.raw({ type: ['multipart/form-data', 'multipart/*', 'application/octet-stream'], limit: '20mb' }));
  app.use(express.text({ type: ['application/xml', 'text/xml'], limit: '5mb' }));
  
  await app.listen(port, host);
  console.log(`SmartRoute Backend Application is running on: http://${host}:${port}`);
}
bootstrap();
