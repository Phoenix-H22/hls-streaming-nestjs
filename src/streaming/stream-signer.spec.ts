import { StreamSigner } from './stream-signer';

const signer = new StreamSigner('test-secret');
const EXPIRES = 1_900_000_000;

describe('StreamSigner', () => {
  test('a playlist token verifies only for the slug, expiry and IP it was issued for', () => {
    const token = signer.signPlaylist('intro', EXPIRES, '203.0.113.7');

    expect(signer.verifyPlaylist('intro', EXPIRES, '203.0.113.7', token)).toBe(
      true,
    );
    expect(signer.verifyPlaylist('intro', EXPIRES, '198.51.100.1', token)).toBe(
      false,
    );
    expect(
      signer.verifyPlaylist('intro', EXPIRES + 60, '203.0.113.7', token),
    ).toBe(false);
    expect(signer.verifyPlaylist('other', EXPIRES, '203.0.113.7', token)).toBe(
      false,
    );
  });

  test.each([
    ['empty token', ''],
    ['shorter token', 'abc'],
    [
      'token from another secret',
      new StreamSigner('other').signPlaylist('intro', EXPIRES, '::1'),
    ],
  ])('rejects a %s without throwing', (_case, token) => {
    expect(signer.verifyPlaylist('intro', EXPIRES, '::1', token)).toBe(false);
  });

  test('rewritten playlists keep HLS tags and point every segment at a verifiable /secure URL', () => {
    const playlist = [
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:10',
      '#EXTINF:10.0,',
      'intro0.ts',
      '#EXTINF:4.2,',
      'intro1.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const lines = signer
      .rewritePlaylist(playlist, 'intro', EXPIRES)
      .split('\n');

    expect(lines.filter((line) => line.startsWith('#'))).toEqual([
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:10',
      '#EXTINF:10.0,',
      '#EXTINF:4.2,',
      '#EXT-X-ENDLIST',
    ]);
    const segmentUrls = lines.filter((line) => !line.startsWith('#'));
    expect(segmentUrls).toHaveLength(2);
    segmentUrls.forEach((url, index) => {
      const parsed = new URL(url, 'http://localhost');
      expect(parsed.pathname).toBe(`/secure/intro/intro${index}.ts`);
      expect(parsed.searchParams.get('expires')).toBe(String(EXPIRES));
      expect(
        signer.verifySegment(
          'intro',
          `intro${index}.ts`,
          EXPIRES,
          parsed.searchParams.get('token') ?? '',
        ),
      ).toBe(true);
    });
  });
});
