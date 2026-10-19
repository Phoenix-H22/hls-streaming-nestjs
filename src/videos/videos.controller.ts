import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { VideosService } from './videos.service';
import * as fs from 'fs';
import * as path from 'path';
import { Get } from '@nestjs/common';
import { Video } from './video.entity';
import slugify from 'slugify';
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}
  @Get()
  async listVideos(): Promise<Video[]> {
    return this.videosService.findAll();
  }
  @Post('upload-chunk')
  @UseInterceptors(
    FileInterceptor('video', {
      storage: diskStorage({
        destination: './storage/temp_chunks',
        filename: (req, file, cb) => {
          const chunkNumber = req.body.chunkNumber || 'undefined';
          cb(null, `chunk_${chunkNumber}`);
        },
      }),
    }),
  )
  async uploadChunk(
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title: string,
    @Body('chunkNumber') chunkNumber: string,
    @Body('totalChunks') totalChunks: string,
  ) {
    if (!title || !chunkNumber || !totalChunks) {
      throw new BadRequestException('Missing required fields.');
    }
    const safeTitle = slugify(title, { lower: true, strict: true });

    // Move the chunk to a dedicated folder based on title
    const chunkDir = `./storage/temp_chunks/${safeTitle}.mp4`;
    const oldPath = file.path;
    const newDir = path.resolve(chunkDir);
    const newPath = path.join(newDir, `chunk_${chunkNumber}`);

    fs.mkdirSync(newDir, { recursive: true });
    fs.renameSync(oldPath, newPath);

    const isComplete = await this.videosService.checkAllChunksExist(
      safeTitle,
      +totalChunks,
    );

    if (isComplete) {
      await this.videosService.mergeChunks(safeTitle, +totalChunks);
    }

    return { status: true, complete: isComplete };
  }
}
