import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { Repository } from 'typeorm';
import { storagePaths, toStoredPath } from '../storage-paths';
import { HlsPackagerService } from './hls-packager.service';
import { mergeChunks } from './merge-chunks';
import { uniqueSlug } from './slug';
import { UploadChunkDto } from './upload-chunk.dto';
import { Video } from './video.entity';

export interface ChunkResult {
  complete: boolean;
  slug?: string;
}

@Injectable()
export class VideosService {
  /** Upload ids whose final chunk is being merged, so a retried last chunk cannot merge twice. */
  private readonly finalizing = new Set<string>();

  constructor(
    @InjectRepository(Video)
    private readonly videos: Repository<Video>,
    private readonly packager: HlsPackagerService,
  ) {}

  findAll(): Promise<Video[]> {
    return this.videos.find({ order: { createdAt: 'DESC' } });
  }

  findCompletedBySlug(slug: string): Promise<Video | null> {
    return this.videos.findOneBy({ slug, status: 'completed' });
  }

  /** Stores one chunk; when it was the last missing one, merges the upload and starts packaging. */
  async receiveChunk(
    dto: UploadChunkDto,
    tempPath: string,
  ): Promise<ChunkResult> {
    await mkdir(storagePaths.uploadDir(dto.uploadId), { recursive: true });
    await rename(tempPath, storagePaths.chunk(dto.uploadId, dto.chunkNumber));

    if (
      this.finalizing.has(dto.uploadId) ||
      !(await this.hasAllChunks(dto.uploadId, dto.totalChunks))
    ) {
      return { complete: false };
    }

    this.finalizing.add(dto.uploadId);
    try {
      const video = await this.finalizeUpload(dto);
      return { complete: true, slug: video.slug };
    } finally {
      this.finalizing.delete(dto.uploadId);
    }
  }

  private async hasAllChunks(
    uploadId: string,
    totalChunks: number,
  ): Promise<boolean> {
    for (let n = 1; n <= totalChunks; n++) {
      try {
        await access(storagePaths.chunk(uploadId, n));
      } catch {
        return false;
      }
    }
    return true;
  }

  private async finalizeUpload(
    dto: UploadChunkDto,
  ): Promise<Video & { slug: string }> {
    const slug = await uniqueSlug(dto.title, (candidate) =>
      this.isSlugTaken(candidate),
    );
    const originalPath = storagePaths.original(slug);
    const chunkPaths = Array.from({ length: dto.totalChunks }, (_, i) =>
      storagePaths.chunk(dto.uploadId, i + 1),
    );

    await mergeChunks(chunkPaths, originalPath);
    await rm(storagePaths.uploadDir(dto.uploadId), {
      recursive: true,
      force: true,
    });

    const video = await this.videos.save({
      title: dto.title,
      slug,
      originalPath: toStoredPath(originalPath),
      path: toStoredPath(storagePaths.playlist(slug)),
      uploadTarget: 'local',
      progress: 100,
      status: 'processing',
    });
    const saved = { ...video, slug };
    this.packager.start(saved);
    return saved;
  }

  /** Checks files as well as rows: uploads made before slugs were stored may own a folder without a slug. */
  private async isSlugTaken(slug: string): Promise<boolean> {
    return (
      existsSync(storagePaths.original(slug)) ||
      existsSync(storagePaths.hlsDir(slug)) ||
      (await this.videos.existsBy({ slug }))
    );
  }
}
