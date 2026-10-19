import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Each test file gets its own storage folder, read by src/storage-paths.ts.
process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), 'hls-test-'));
