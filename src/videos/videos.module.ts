import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HlsPackagerService } from './hls-packager.service';
import { Video } from './video.entity';
import { VideoRecoveryService } from './video-recovery.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [TypeOrmModule.forFeature([Video])],
  controllers: [VideosController],
  providers: [VideosService, HlsPackagerService, VideoRecoveryService],
  exports: [VideosService],
})
export class VideosModule {}
