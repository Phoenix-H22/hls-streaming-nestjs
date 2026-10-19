import {
  Controller,
  Get,
  NotFoundException,
  Query,
  Render,
  Req,
} from '@nestjs/common';
import { generateToken } from './utils/token';
import { SLUG_PATTERN } from './videos/slug';
import { VideosService } from './videos/videos.service';

@Controller()
export class AppController {
  constructor(private readonly videosService: VideosService) {}

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

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      ((req as any).connection?.remoteAddress ?? '');
    const expires = Math.floor(Date.now() / 1000) + 60 * 5;
    const token = generateToken(slug, expires, ip);

    return {
      title: video.title,
      hlsUrl: `/secure/${slug}.m3u8?expires=${expires}&token=${token}`,
    };
  }
}
