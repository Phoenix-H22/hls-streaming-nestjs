import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { rm } from 'node:fs/promises';
import { storagePaths } from '../storage-paths';
import { MAX_CHUNK_BYTES, UploadChunkDto } from './upload-chunk.dto';
import { Video } from './video.entity';
import { ChunkResult, VideosService } from './videos.service';

@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  listVideos(): Promise<Video[]> {
    return this.videosService.findAll();
  }

  @Post('upload-chunk')
  @UseInterceptors(
    FileInterceptor('video', {
      dest: storagePaths.incomingChunks,
      limits: { fileSize: MAX_CHUNK_BYTES, files: 1 },
    }),
  )
  async uploadChunk(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<ChunkResult> {
    if (!file) throw new BadRequestException('Missing video chunk.');

    // Validated here rather than with a pipe so the temporary file Multer
    // already wrote can be removed when the request is rejected.
    try {
      const dto = await validateChunk(body);
      return await this.videosService.receiveChunk(dto, file.path);
    } catch (error) {
      await rm(file.path, { force: true });
      throw error;
    }
  }
}

async function validateChunk(
  body: Record<string, unknown>,
): Promise<UploadChunkDto> {
  const dto = plainToInstance(UploadChunkDto, body);
  const errors = await validate(dto, { whitelist: true });
  if (errors.length) {
    throw new BadRequestException(
      errors.flatMap((error) => Object.values(error.constraints ?? {})),
    );
  }
  if (dto.chunkNumber > dto.totalChunks) {
    throw new BadRequestException('chunkNumber cannot exceed totalChunks.');
  }
  return dto;
}
