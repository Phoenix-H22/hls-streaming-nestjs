import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Render,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { StreamSigner } from './streaming/stream-signer';
import { clientIp } from './streaming/client-ip';
import { SLUG_PATTERN } from './videos/slug';
import { VideosService } from './videos/videos.service';

/** How long a watch page's playlist link stays valid. */
const PLAYBACK_TTL_SECONDS = 5 * 60;

@Controller()
export class AppController {
  constructor(
    private readonly videosService: VideosService,
    private readonly signer: StreamSigner,
  ) {}

  @Get('/')
  @Render('index')
  async index() {
    const videos = await this.videosService.findAll();
    return {
      videos: videos.map((video) => ({
        ...video,
        watchUrl:
          video.status === 'completed' && video.slug
            ? `/watch?video=${encodeURIComponent(video.slug)}`
            : null,
      })),
    };
  }

  @Get('watch')
  @Render('watch')
  async watch(@Query('video') slug: string, @Req() req: Request) {
    const video =
      typeof slug === 'string' && SLUG_PATTERN.test(slug)
        ? await this.videosService.findCompletedBySlug(slug)
        : null;
    if (!video) throw new NotFoundException('Video not found');

    const expires = Math.floor(Date.now() / 1000) + PLAYBACK_TTL_SECONDS;
    const token = this.signer.signPlaylist(slug, expires, clientIp(req));

    return {
      title: video.title,
      hlsUrl: `/secure/${slug}.m3u8?expires=${expires}&token=${token}`,
    };
  }
}
