import * as path from 'node:path';

// STORAGE_DIR exists so the test suite can use a temporary folder. It is read
// when this module loads, before .env is parsed, so it is not a .env setting.
const STORAGE_ROOT = path.resolve(process.env.STORAGE_DIR || 'storage');
const CHUNKS_ROOT = path.join(STORAGE_ROOT, 'temp_chunks');
const VIDEOS_ROOT = path.join(STORAGE_ROOT, 'videos');

/**
 * Every on-disk location the app reads or writes. Callers pass values that
 * were already validated (UUID upload ids, slug-shaped names), so nothing
 * here can resolve outside STORAGE_ROOT.
 */
export const storagePaths = {
  incomingChunks: path.join(CHUNKS_ROOT, 'incoming'),
  uploadDir: (uploadId: string) => path.join(CHUNKS_ROOT, uploadId),
  chunk: (uploadId: string, chunkNumber: number) =>
    path.join(CHUNKS_ROOT, uploadId, `chunk_${chunkNumber}`),
  original: (slug: string) => path.join(VIDEOS_ROOT, 'original', `${slug}.mp4`),
  hlsDir: (slug: string) => path.join(VIDEOS_ROOT, 'hls', slug),
  playlist: (slug: string) =>
    path.join(VIDEOS_ROOT, 'hls', slug, `${slug}.m3u8`),
  segment: (slug: string, segment: string) =>
    path.join(VIDEOS_ROOT, 'hls', slug, segment),
};

/** Paths stored in the database are relative to the project root. */
export const toStoredPath = (absolutePath: string) =>
  path.relative(process.cwd(), absolutePath).split(path.sep).join('/');
