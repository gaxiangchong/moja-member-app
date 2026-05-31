import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const uploadsRoot = resolve(process.cwd(), 'data', 'uploads');
  mkdirSync(uploadsRoot, { recursive: true });
  app.useStaticAssets(uploadsRoot, {
    prefix: '/uploads/',
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  });

  // Committed static assets (shared by the member client and moja-sites).
  // e.g. public/images/products/<file> is served at /images/products/<file>.
  const publicImagesRoot = resolve(process.cwd(), 'public', 'images');
  app.useStaticAssets(publicImagesRoot, {
    prefix: '/images/',
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  });

  const clientOrigins = process.env.CLIENT_WEB_ORIGIN?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const shopOrigin = process.env.SHOP_WEB_BASE_URL?.trim();
  const corsOrigins = [...(clientOrigins ?? [])];
  if (shopOrigin) {
    try {
      const origin = new URL(
        shopOrigin.endsWith('/') ? shopOrigin : `${shopOrigin}/`,
      ).origin;
      if (!corsOrigins.includes(origin)) corsOrigins.push(origin);
    } catch {
      /* ignore invalid SHOP_WEB_BASE_URL */
    }
  }
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-admin-api-key',
      'x-ops-api-key',
      'Accept',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.listen(process.env.PORT ?? 3153);
}
void bootstrap();
