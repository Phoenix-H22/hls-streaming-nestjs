import type { Request } from 'express';

/** Relies on Express "trust proxy" (set in main.ts) to read X-Forwarded-For safely. */
export function clientIp(req: Request): string {
  return req.ip ?? '';
}
