import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { storagePaths } from '../storage-paths';
import { SLUG_PATTERN } from '../videos/slug';
import { clientIp } from './client-ip';
import { StreamSigner } from './stream-signer';

const PLAYLIST_FILE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.m3u8$/;

@Controller('secure')
export class StreamController {
  private readonly appOrigin?: string;

  constructor(
    private readonly signer: StreamSigner,
    config: ConfigService,
  ) {
    this.appOrigin = config.get<string>('APP_ORIGIN')?.replace(/\/+$/, '');
  }

  /** Serves the playlist with every segment URL rewritten to a signed /secure URL. */
  @Get(':file')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  @Header('Cache-Control', 'no-store')
  async playlist(
    @Param('file') file: string,
    @Query('expires') expires: string,
    @Query('token') token: string,
    @Req() req: Request,
  ): Promise<string> {
    const slug = PLAYLIST_FILE.exec(file)?.[1];
    const expiry = this.checkRequest(req, expires, token);
    if (
      !slug ||
      !this.signer.verifyPlaylist(slug, expiry, clientIp(req), token)
    ) {
      throw new ForbiddenException('Invalid or expired link');
    }

    const playlist = await readFile(storagePaths.playlist(slug), 'utf8').catch(
      () => {
        throw new NotFoundException('Video not found');
      },
    );
    return this.signer.rewritePlaylist(playlist, slug, expiry);
  }

  @Get(':slug/:segment')
  @Header('Content-Type', 'video/mp2t')
  async segment(
    @Param('slug') slug: string,
    @Param('segment') segment: string,
    @Query('expires') expires: string,
    @Query('token') token: string,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const expiry = this.checkRequest(req, expires, token);
    if (
      !SLUG_PATTERN.test(slug) ||
      !isSegmentOf(slug, segment) ||
      !this.signer.verifySegment(slug, segment, expiry, token)
    ) {
      throw new ForbiddenException('Invalid or expired link');
    }

    const filePath = storagePaths.segment(slug, segment);
    await access(filePath).catch(() => {
      throw new NotFoundException('Segment not found');
    });
    return new StreamableFile(createReadStream(filePath));
  }

  /** Shared checks for both routes; returns the parsed expiry (Unix seconds). */
  private checkRequest(req: Request, expires: string, token: string): number {
    const expiry = Number(expires);
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof token !== 'string' ||
      !Number.isInteger(expiry) ||
      expiry < now ||
      !this.isAllowedReferer(req)
    ) {
      throw new ForbiddenException('Invalid or expired link');
    }
    return expiry;
  }

  /** When APP_ORIGIN is set, media must be requested from this app's own pages. */
  private isAllowedReferer(req: Request): boolean {
    if (!this.appOrigin) return true;
    return (req.get('referer') ?? '').startsWith(`${this.appOrigin}/`);
  }
}

/** FFmpeg names segments "<slug><n>.ts"; anything else is rejected before touching the disk. */
function isSegmentOf(slug: string, segment: string): boolean {
  return (
    segment.startsWith(slug) && /^\d+\.ts$/.test(segment.slice(slug.length))
  );
}
