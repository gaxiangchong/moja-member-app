import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import {
  resolveProductImageFile,
  resolvePublicImagesRoot,
} from './public-images';

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

  const publicImagesRoot = resolvePublicImagesRoot();
  const productsDir = resolve(publicImagesRoot, 'products');
  const logger = new Logger('StaticAssets');
  if (!existsSync(publicImagesRoot)) {
    logger.warn(`public/images not found (tried cwd and dist). Product photos may 404.`);
  } else {
    logger.log(`Serving /images from ${publicImagesRoot}`);
  }

  // Case-insensitive product filenames (Windows git vs Linux deploy).
  const http = app.getHttpAdapter().getInstance();
  http.get('/images/products/:filename', (req: { params: { filename: string } }, res, next) => {
    const filePath = resolveProductImageFile(req.params.filename);
    if (!filePath) return next();
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.sendFile(filePath);
  });

  // Committed static assets (shared by the member client and moja-sites).
  app.useStaticAssets(publicImagesRoot, {
    prefix: '/images/',
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  });

  if (existsSync(productsDir)) {
    const jasmineOk = resolveProductImageFile('jasmine_blanc.png');
    if (!jasmineOk) {
      logger.warn(
        'jasmine_blanc.png missing under public/images/products — commit and deploy the image file.',
      );
    }
  }

  const clientOrigins = process.env.CLIENT_WEB_ORIGIN?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const corsOrigins = [...(clientOrigins ?? [])];

  /** Also allow explicit public app URLs (avoids CORS misses when only BENTO_* is set). */
  for (const raw of [
    process.env.SHOP_WEB_BASE_URL?.trim(),
    process.env.BENTO_APP_PUBLIC_URL?.trim(),
    process.env.MEMBER_APP_PUBLIC_URL?.trim(),
  ]) {
    if (!raw) continue;
    try {
      const origin = new URL(raw.endsWith('/') ? raw : `${raw}/`).origin;
      if (!corsOrigins.includes(origin)) corsOrigins.push(origin);
    } catch {
      /* ignore invalid URL */
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
