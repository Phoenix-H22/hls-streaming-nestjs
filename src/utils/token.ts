import * as crypto from 'crypto';
import { Req } from '@nestjs/common';

export function getStreamSecret(): string {
  const secret = process.env.STREAM_SECRET;
  if (!secret) throw new Error('STREAM_SECRET is not set');
  return secret;
}

export function generateToken(
  title: string,
  expires: number,
  ip: string,
): string {
  const secret = getStreamSecret();
  const payload = `${title}|${expires}|${ip}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyToken(
  slug: string,
  expires: number,
  req: Request,
  token: string,
): boolean {
  if (Date.now() > expires) return false;
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    ((req as any).connection?.remoteAddress ?? '');

  const validToken = generateToken(slug, expires, ip);
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(validToken));
}
