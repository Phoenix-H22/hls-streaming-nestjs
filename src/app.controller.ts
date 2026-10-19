import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
  Render,
  Req,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Video } from './videos/video.entity';
import { generateToken, verifyToken } from './utils/token';
import * as crypto from 'crypto';
import * as fs from 'node:fs';

@Controller()
export class AppController {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
  ) {}

  @Get('/')
  @Render('index')
  async index() {
    const videos = await this.videoRepo.find({
      order: { createdAt: 'DESC' },
    });
    const dummyIp = '127.0.0.1'; // or '0.0.0.0', or omit if you change logic

    // Attach signed URLs with 10 min expiry
    const now = Date.now();
    const expiresIn = 10 * 60 * 1000; // 10 minutes
    const signedVideos = videos.map((video) => {
      const slug = video.title.replace(/[^a-z0-9\-]/gi, '').toLowerCase();
      const expires = now + expiresIn;
      const token = generateToken(slug, expires, dummyIp);
      const signedUrl = `/watch?title=${slug}&expires=${expires}&token=${token}`;
      return { ...video, signedUrl };
    });

    return { videos: signedVideos };
  }

  private getSignedUrl(title: string): string {
    const expiresIn = 10 * 60 * 1000; // 10 mins
    const expiresAt = Date.now() + expiresIn;
    const token = Buffer.from(`${title}:${expiresAt}`).toString('base64url');
    return `/watch?token=${token}`;
  }

  @Get('watch')
  @Render('watch')
  async watch(@Query('title') title: string, @Req() req: Request) {
    const safeTitle = title.replace(/[^a-z0-9\-]/gi, '').toLowerCase();
    const m3u8Path = `./storage/videos/hls/${safeTitle}/${safeTitle}.m3u8`;

    if (!fs.existsSync(m3u8Path)) {
      throw new BadRequestException('Video not found');
    }

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      ((req as any).connection?.remoteAddress ?? '');
    const expires = Math.floor(Date.now() / 1000) + 60 * 5;
    const token = generateToken(safeTitle, expires, ip);

    return {
      hlsUrl: `/secure/${safeTitle}.m3u8?expires=${expires}&token=${token}`,
    };
  }

  getHello() {
    return undefined;
  }
}
