import slugify from 'slugify';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const toSlug = (title: string) =>
  slugify(title, { lower: true, strict: true }) || 'video';

/** Returns the title's slug, suffixed with -2, -3, … until `isTaken` says it is free. */
export async function uniqueSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = toSlug(title);
  let slug = base;
  for (let n = 2; await isTaken(slug); n++) slug = `${base}-${n}`;
  return slug;
}
