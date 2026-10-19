import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import { IsNull, Repository } from 'typeorm';
import { storagePaths } from '../storage-paths';
import { HlsPackagerService } from './hls-packager.service';
import { toSlug } from './slug';
import { Video } from './video.entity';

/**
 * Brings the videos table back in line with the files on disk at startup:
 * gives older rows a slug and settles conversions a restart interrupted.
 */
@Injectable()
export class VideoRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(VideoRecoveryService.name);

  constructor(
    @InjectRepository(Video)
    private readonly videos: Repository<Video>,
    private readonly packager: HlsPackagerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.backfillSlugs();
    await this.settleInterruptedConversions();
  }

  /** Rows created before slugs were stored used the slugified title for their files. */
  private async backfillSlugs(): Promise<void> {
    const rows = await this.videos.find({
      where: { slug: IsNull() },
      order: { id: 'ASC' },
    });
    for (const video of rows) {
      const slug = toSlug(video.title);
      if (await this.videos.existsBy({ slug })) {
        this.logger.warn(
          `Video #${video.id} shares slug "${slug}" with another row; left without a slug.`,
        );
        continue;
      }
      await this.videos.update(video.id, { slug });
    }
  }

  private async settleInterruptedConversions(): Promise<void> {
    const processing = await this.videos.findBy({ status: 'processing' });
    for (const video of processing) {
      const { slug } = video;
      if (!slug) {
        await this.videos.update(video.id, { status: 'failed' });
      } else if (existsSync(storagePaths.playlist(slug))) {
        await this.videos.update(video.id, { status: 'completed' });
      } else if (existsSync(storagePaths.original(slug))) {
        this.logger.log(`Restarting HLS packaging for "${slug}".`);
        this.packager.start({ ...video, slug });
      } else {
        await this.videos.update(video.id, { status: 'failed' });
      }
    }
  }
}
