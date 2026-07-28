/**
 * Which origin the share links this server hands out should point at.
 *
 * A share link is only useful if it resolves for whoever receives it, so a
 * preview deployment must not mint links into its own throwaway hostname.
 * Resolution order, most explicit first:
 *
 *   1. `ARCHLAB_PUBLIC_ORIGIN` — set this to override everything (self-hosting,
 *      a custom domain, or local development against a tunnel).
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel's own answer to "what is the
 *      stable production hostname of this project", present on every
 *      deployment INCLUDING previews. Deliberately preferred over `VERCEL_URL`,
 *      which is the per-deployment hostname and would bake a preview URL into
 *      a link meant to be shared.
 *   3. The known production origin, as a last resort.
 */

/** The deployed home of arch-lab — the fallback when no env var says otherwise. */
export const DEFAULT_PUBLIC_ORIGIN = "https://arch-lab-virid.vercel.app";

export function publicOrigin(): string {
  const explicit = process.env.ARCHLAB_PUBLIC_ORIGIN;
  if (explicit !== undefined && explicit.trim() !== "") {
    return explicit.trim().replace(/\/+$/, "");
  }

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel !== undefined && vercel.trim() !== "") {
    return `https://${vercel.trim().replace(/\/+$/, "")}`;
  }

  return DEFAULT_PUBLIC_ORIGIN;
}
