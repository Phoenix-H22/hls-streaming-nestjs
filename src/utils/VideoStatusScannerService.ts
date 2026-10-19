import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Video } from '../videos/video.entity';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import slugify from 'slugify';

@Injectable()
export class VideoStatusScannerService implements OnModuleInit {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
  ) {}

  onModuleInit() {
    // Start periodic scan
    setInterval(() => this.checkForCompletedVideos(), 15 * 1000); // every 15s
  }

  async checkForCompletedVideos() {
    const processingVideos = await this.videoRepo.find({
      where: { status: 'processing' },
    });

    for (const video of processingVideos) {
      const safeTitle = slugify(video.title, { lower: true, strict: true });
      const m3u8Path = path.resolve(
        `./storage/videos/hls/${safeTitle}/${safeTitle}.m3u8`,
      );

      if (fs.existsSync(m3u8Path)) {
        video.status = 'completed';
        await this.videoRepo.save(video);
        console.log(`✅ Video ${video.title} marked as completed.`);
      }
    }
  }
}
