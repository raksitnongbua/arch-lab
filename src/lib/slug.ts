/**
 * One slug function for the whole app.
 *
 * There were five copies of the body below — under the names `slugify`,
 * `slugForTitle`, `deriveFileName`, `fileStem`, and `downloadStem` — differing
 * only in the word they fall back to when the input slugs to nothing. Five names
 * for one operation meant nothing told a reader they were the same thing, and
 * only one of them normalised accents, so "Café" became `caf` on four code
 * paths and `cafe` on the fifth.
 *
 * The fallback is the parameter, because it is the only thing that legitimately
 * varies: it names the KIND of artifact being written, and only the caller knows
 * whether an untitled document is going out as a model or as a diagram.
 */

/**
 * Lowercase, dash-separated slug of `text`, or `fallback` if nothing survives.
 *
 * Accents are folded rather than dropped (NFKD, then strip the combining
 * marks), so a title that is entirely non-ASCII still yields a readable slug
 * instead of collapsing to the fallback.
 */
export function slugify(text: string, fallback: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? fallback : slug;
}
