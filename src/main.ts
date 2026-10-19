import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Playback tokens are bound to the client IP. Behind a reverse proxy, Express
  // must trust it to read X-Forwarded-For; by default only a local proxy is trusted.
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');

  // storage/ is not served statically: playback goes through the signed /secure routes.
  app.setViewEngine('ejs');
  app.setBaseViewsDir(join(__dirname, '..', 'views'));

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Keeps the Referer header the /secure routes check on same-origin requests.
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3006));
}
void bootstrap();
