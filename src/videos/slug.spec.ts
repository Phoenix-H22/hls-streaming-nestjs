import { toSlug, uniqueSlug } from './slug';

describe('slugs', () => {
  test.each([
    ['My First Video', 'my-first-video'],
    ['  Launch: v2.0!  ', 'launch-v20'],
    ['فيديو تجريبي', 'fydyw-tjryby'],
    // A title made only of symbols still needs a usable folder name.
    ['!!! ???', 'video'],
  ])('toSlug(%j) is %j', (title, expected) => {
    expect(toSlug(title)).toBe(expected);
  });

  test('a reused title gets the next free numeric suffix instead of overwriting', async () => {
    const taken = new Set(['demo', 'demo-2']);

    await expect(
      uniqueSlug('Demo', (slug) => Promise.resolve(taken.has(slug))),
    ).resolves.toBe('demo-3');
  });
});
