import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { storagePaths } from '../storage-paths';
import { HlsPackagerService } from './hls-packager.service';
import { Video } from './video.entity';
import { VideosController } from './videos.controller';
import { ChunkResult, VideosService } from './videos.service';

/** In-memory stand-in for the MySQL repository (persistence is a side effect here). */
class InMemoryVideos {
  rows: Video[] = [];

  save(data: Partial<Video>): Promise<Video> {
    const row = Object.assign(new Video(), data, { id: this.rows.length + 1 });
    this.rows.push(row);
    return Promise.resolve(row);
  }

  existsBy(where: Partial<Video>): Promise<boolean> {
    return Promise.resolve(this.rows.some((row) => row.slug === where.slug));
  }
}

/** Replaces the FFmpeg child process, which is outside what these tests cover. */
class RecordingPackager {
  started: string[] = [];
  start(video: Video & { slug: string }) {
    this.started.push(video.slug);
  }
}

function setup() {
  const videos = new InMemoryVideos();
  const packager = new RecordingPackager();
  const service = new VideosService(
    videos as unknown as Repository<Video>,
    packager as unknown as HlsPackagerService,
  );
  return { videos, packager, controller: new VideosController(service) };
}

/** Writes a file where Multer would have put it and returns the upload field. */
async function multerFile(data: string | Buffer): Promise<Express.Multer.File> {
  await mkdir(storagePaths.incomingChunks, { recursive: true });
  const path = join(storagePaths.incomingChunks, randomUUID());
  await writeFile(path, data);
  return { path } as Express.Multer.File;
}

async function uploadFile(
  controller: VideosController,
  title: string,
  parts: string[],
): Promise<ChunkResult | undefined> {
  const uploadId = randomUUID();
  let result: ChunkResult | undefined;
  for (const [index, part] of parts.entries()) {
    result = await controller.uploadChunk(await multerFile(part), {
      uploadId,
      title,
      chunkNumber: String(index + 1),
      totalChunks: String(parts.length),
    });
  }
  return result;
}

describe('chunked upload', () => {
  test('chunks arriving out of order are merged in chunk order once the last one lands', async () => {
    const { controller, videos, packager } = setup();
    const uploadId = randomUUID();
    const body = (chunkNumber: number) => ({
      uploadId,
      title: 'My Clip',
      chunkNumber: String(chunkNumber),
      totalChunks: '2',
    });

    const first = await controller.uploadChunk(
      await multerFile('BBB'),
      body(2),
    );
    const second = await controller.uploadChunk(
      await multerFile('AAA'),
      body(1),
    );

    expect(first).toEqual({ complete: false });
    expect(second).toEqual({ complete: true, slug: 'my-clip' });
    expect(await readFile(storagePaths.original('my-clip'), 'utf8')).toBe(
      'AAABBB',
    );
    expect(existsSync(storagePaths.uploadDir(uploadId))).toBe(false);
    expect(videos.rows).toMatchObject([
      { slug: 'my-clip', status: 'processing' },
    ]);
    expect(packager.started).toEqual(['my-clip']);
  });

  test('uploading the same title again keeps the first video and gets its own slug', async () => {
    const { controller } = setup();

    await uploadFile(controller, 'Same Title', ['first']);
    const second = await uploadFile(controller, 'Same Title', ['second']);

    expect(second).toEqual({ complete: true, slug: 'same-title-2' });
    expect(await readFile(storagePaths.original('same-title'), 'utf8')).toBe(
      'first',
    );
    expect(await readFile(storagePaths.original('same-title-2'), 'utf8')).toBe(
      'second',
    );
  });

  // Regression: chunkNumber and title used to be joined into file paths unchecked,
  // so "../" sequences could write outside storage/temp_chunks.
  test.each([
    ['a path-traversal chunk number', { chunkNumber: '../../escape' }],
    ['an upload id that is not a UUID', { uploadId: '../shared' }],
    ['a chunk number above the total', { chunkNumber: '3', totalChunks: '2' }],
    ['a missing title', { title: '' }],
  ])('rejects %s and deletes the temporary chunk', async (_case, override) => {
    const { controller, videos } = setup();
    const file = await multerFile('data');

    await expect(
      controller.uploadChunk(file, {
        uploadId: randomUUID(),
        title: 'Clip',
        chunkNumber: '1',
        totalChunks: '2',
        ...override,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(existsSync(file.path)).toBe(false);
    expect(videos.rows).toEqual([]);
  });
});
