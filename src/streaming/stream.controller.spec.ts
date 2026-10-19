import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { mkdir, writeFile } from 'node:fs/promises';
import { storagePaths } from '../storage-paths';
import { StreamController } from './stream.controller';
import { StreamSigner } from './stream-signer';

const SLUG = 'intro';
const VIEWER_IP = '203.0.113.7';
const signer = new StreamSigner('test-secret');
const inFiveMinutes = () => Math.floor(Date.now() / 1000) + 300;

function request(ip = VIEWER_IP, referer?: string): Request {
  return {
    ip,
    get: (name: string) => (name === 'referer' ? referer : undefined),
  } as unknown as Request;
}

function controller(env: Record<string, string> = {}) {
  return new StreamController(signer, new ConfigService(env));
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(Buffer.from(part));
  return Buffer.concat(parts).toString();
}

beforeAll(async () => {
  await mkdir(storagePaths.hlsDir(SLUG), { recursive: true });
  await writeFile(
    storagePaths.playlist(SLUG),
    '#EXTM3U\n#EXTINF:10.0,\nintro0.ts\n#EXT-X-ENDLIST\n',
  );
  await writeFile(storagePaths.segment(SLUG, 'intro0.ts'), 'segment-bytes');
});

describe('StreamController', () => {
  test('a signed playlist link yields segment URLs that stream the segment', async () => {
    const api = controller();
    const expires = inFiveMinutes();
    const token = signer.signPlaylist(SLUG, expires, VIEWER_IP);

    const playlist = await api.playlist(
      `${SLUG}.m3u8`,
      String(expires),
      token,
      request(),
    );
    const segmentUrl = new URL(
      playlist.split('\n').find((line) => line.startsWith('/secure/')) ?? '',
      'http://localhost',
    );
    const file = await api.segment(
      SLUG,
      'intro0.ts',
      segmentUrl.searchParams.get('expires') ?? '',
      segmentUrl.searchParams.get('token') ?? '',
      request(),
    );

    expect(segmentUrl.pathname).toBe('/secure/intro/intro0.ts');
    expect(await readAll(file.getStream())).toBe('segment-bytes');
  });

  test.each([
    ['another viewer IP', { ip: '198.51.100.1' }],
    ['an expired link', { expires: Math.floor(Date.now() / 1000) - 1 }],
    ['a non-numeric expiry', { expires: 'soon' }],
    ['a name that is not a playlist', { file: '../intro.m3u8' }],
  ])('rejects a playlist request with %s', async (_case, override) => {
    const expires = inFiveMinutes();
    const input = {
      file: `${SLUG}.m3u8`,
      expires: String(expires),
      ip: VIEWER_IP,
      ...override,
    };

    await expect(
      controller().playlist(
        input.file,
        String(input.expires),
        signer.signPlaylist(SLUG, expires, VIEWER_IP),
        request(input.ip),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // The token is valid for the requested name, so only the name check can stop these.
  test.each([['../intro.m3u8'], ['other0.ts'], ['intro0.ts.bak']])(
    'rejects segment name %j even when it carries a matching token',
    async (segment) => {
      const expires = inFiveMinutes();

      await expect(
        controller().segment(
          SLUG,
          segment,
          String(expires),
          signer.signSegment(SLUG, segment, expires),
          request(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  test('a validly signed segment that is not on disk is a 404', async () => {
    const expires = inFiveMinutes();

    await expect(
      controller().segment(
        SLUG,
        'intro9.ts',
        String(expires),
        signer.signSegment(SLUG, 'intro9.ts', expires),
        request(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('with APP_ORIGIN set, only requests from the app’s own pages are served', async () => {
    const api = controller({ APP_ORIGIN: 'https://videos.example.com/' });
    const expires = inFiveMinutes();
    const token = signer.signPlaylist(SLUG, expires, VIEWER_IP);
    const ask = (referer?: string) =>
      api.playlist(
        `${SLUG}.m3u8`,
        String(expires),
        token,
        request(VIEWER_IP, referer),
      );

    await expect(
      ask('https://videos.example.com/watch?video=intro'),
    ).resolves.toContain('#EXTM3U');
    await expect(ask('https://elsewhere.example/watch')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(ask(undefined)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
