import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC-SHA256 signatures for playback URLs. The playlist token is bound to
 * the viewer's IP; segment tokens are derived per segment and share the
 * playlist's expiry, so a rewritten playlist cannot be replayed for long.
 */
export class StreamSigner {
  constructor(private readonly secret: string) {}

  signPlaylist(slug: string, expires: number, ip: string): string {
    return this.sign(`${slug}|${expires}|${ip}`);
  }

  signSegment(slug: string, segment: string, expires: number): string {
    return this.sign(`${slug}/${segment}|${expires}`);
  }

  verifyPlaylist(slug: string, expires: number, ip: string, token: string) {
    return safeEqual(token, this.signPlaylist(slug, expires, ip));
  }

  verifySegment(slug: string, segment: string, expires: number, token: string) {
    return safeEqual(token, this.signSegment(slug, segment, expires));
  }

  /** Replaces every segment line with a signed /secure URL; tags pass through unchanged. */
  rewritePlaylist(playlist: string, slug: string, expires: number): string {
    return playlist
      .split('\n')
      .map((line) => {
        const segment = line.trim();
        if (!segment.endsWith('.ts')) return line;
        const token = this.signSegment(slug, segment, expires);
        return `/secure/${slug}/${segment}?expires=${expires}&token=${token}`;
      })
      .join('\n');
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('hex');
  }
}

function safeEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
