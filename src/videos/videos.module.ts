import { Module } from '@nestjs/common';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Video } from './video.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Video])],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [TypeOrmModule], // ✅ علشان نقدر نستخدم Video repo بره
})
export class VideosModule {}
