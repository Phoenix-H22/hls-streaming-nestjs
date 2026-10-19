// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // storage/ is not served statically: playback goes through the signed /secure routes
  app.setViewEngine('ejs');
  app.setBaseViewsDir(join(__dirname, '..', 'views')); // مجلد القوالب
  // Add security headers on every response
  app.use((req, res, next) => {
    // Only your domain may embed this site in an iframe
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://hls-nest.phoenixtechs.net");
    // Legacy header for older browsers
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // أو ALLOW-FROM https://yourdomain.com
    next();
  });
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });


  app.enableCors({ origin: true, credentials: true });
  await app.listen(3006);
}
bootstrap();
