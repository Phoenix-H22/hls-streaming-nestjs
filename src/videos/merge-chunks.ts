import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { finished } from 'node:stream/promises';

/**
 * Concatenates the chunk files, in the given order, into `targetPath`.
 * Resolves only after the merged file is fully flushed to disk, so it is
 * safe to hand to FFmpeg as soon as this returns.
 */
export async function mergeChunks(
  chunkPaths: string[],
  targetPath: string,
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const output = createWriteStream(targetPath);

  try {
    for (const chunkPath of chunkPaths) {
      for await (const data of createReadStream(chunkPath)) {
        if (!output.write(data)) await once(output, 'drain');
      }
    }
  } finally {
    output.end();
  }
  await finished(output);
}
