import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import { Repository } from 'typeorm';
import { storagePaths } from '../storage-paths';
import { Video } from './video.entity';

const STDERR_TAIL_BYTES = 2000;

interface FfmpegResult {
  exitCode: number | null;
  stderrTail: string;
}

/**
 * Packages an uploaded MP4 as HLS (stream copy, 10-second segments) and
 * records the outcome on the video row.
 */
@Injectable()
export class HlsPackagerService {
  private readonly logger = new Logger(HlsPackagerService.name);

  constructor(
    @InjectRepository(Video)
    private readonly videos: Repository<Video>,
  ) {}

  /** Starts packaging in the background; the row moves to completed or failed when FFmpeg exits. */
  start(video: Video & { slug: string }): void {
    this.package(video).catch((error: unknown) => {
      this.logger.error(
        `Packaging crashed for "${video.slug}"`,
        error as Error,
      );
    });
  }

  private async package(video: Video & { slug: string }): Promise<void> {
    const outputDir = storagePaths.hlsDir(video.slug);
    const playlist = storagePaths.playlist(video.slug);
    await mkdir(outputDir, { recursive: true });

    const { exitCode, stderrTail } = await runFfmpeg([
      '-y',
      '-i',
      storagePaths.original(video.slug),
      '-codec',
      'copy',
      '-start_number',
      '0',
      '-hls_time',
      '10',
      '-hls_list_size',
      '0',
      '-hls_segment_filename',
      path.join(outputDir, `${video.slug}%d.ts`),
      '-f',
      'hls',
      playlist,
    ]);

    const succeeded = exitCode === 0 && existsSync(playlist);
    if (!succeeded) {
      this.logger.error(
        `FFmpeg failed for "${video.slug}" (exit ${exitCode}):\n${stderrTail}`,
      );
    }
    await this.videos.update(video.id, {
      status: succeeded ? 'completed' : 'failed',
    });
  }
}

function runFfmpeg(args: string[]): Promise<FfmpegResult> {
  return new Promise((resolve) => {
    let stderrTail = '';
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    ffmpeg.stderr.on('data', (data: Buffer) => {
      stderrTail = (stderrTail + data.toString()).slice(-STDERR_TAIL_BYTES);
    });
    // 'error' fires when FFmpeg cannot be started at all (for example, not on PATH).
    ffmpeg.on('error', (error) =>
      resolve({ exitCode: null, stderrTail: error.message }),
    );
    ffmpeg.on('close', (exitCode) => resolve({ exitCode, stderrTail }));
  });
}
