import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeChunks } from './merge-chunks';

describe('mergeChunks', () => {
  test('writes the chunks in the given order and the file is complete when the promise resolves', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'merge-'));
    // Larger than a write stream's buffer, so back-pressure is exercised.
    const chunks = [
      randomBytes(3 * 1024 * 1024),
      randomBytes(1024),
      randomBytes(700_000),
    ];
    const chunkPaths = await Promise.all(
      chunks.map(async (data, index) => {
        const chunkPath = join(dir, `chunk_${index + 1}`);
        await writeFile(chunkPath, data);
        return chunkPath;
      }),
    );
    const target = join(dir, 'nested', 'video.mp4');

    await mergeChunks(chunkPaths, target);

    expect((await readFile(target)).equals(Buffer.concat(chunks))).toBe(true);
  });
});
