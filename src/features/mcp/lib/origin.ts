/**
 * Which origin arch-lab advertises for itself.
 *
 * Two callers with different needs:
 *
 *   - **The `/mcp` page** tells a human which URL to paste into their client.
 *     It has a request, so it should answer with the host the reader actually
 *     reached — `documentedOrigin`.
 *   - **`create_share_link`** mints a URL for someone else to open later. It
 *     has no request context, so it answers from configuration —
 *     `publicOrigin`.
 *
 * Why the request wins for the page: this went wrong in production once. The
 * project's subdomain changed, `DEFAULT_PUBLIC_ORIGIN` went stale within a
 * day, and `/mcp` cheerfully advertised an endpoint that 404'd — the one thing
 * that page exists to get right. A page served from a host can always name
 * that host correctly, so it should, and no constant needs maintaining for it
 * to keep working through the next rename.
 *
 * Resolution order, most explicit first:
 *
 *   1. `ARCHLAB_PUBLIC_ORIGIN` — overrides everything (self-hosting, a custom
 *      domain, or local development where you want the page to advertise
 *      localhost).
 *   2. The incoming request's forwarded host — page only, and the reason a
 *      rename cannot break it again.
 *   3. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel's answer to "the stable
 *      production hostname of this project", present on previews too.
 *      Deliberately preferred over `VERCEL_URL`, the per-deployment hostname,
 *      which would bake a throwaway preview host into a shared link.
 *   4. `DEFAULT_PUBLIC_ORIGIN`, as a last resort.
 */

/**
 * The deployed home of arch-lab — the fallback when nothing else answers.
 *
 * Kept correct as a courtesy, not relied upon: `documentedOrigin` reaches this
 * only outside a request, and everything else prefers configuration or the
 * request itself.
 *
 * It is now the same origin the FORMAT already claims — `.alab` and
 * `.archlab.json` documents carry `$schema
 * "https://arch-lab.dev/schema/v1/…"`, written long before the site answered
 * there. Those two agreeing is worth something: a reader who follows the
 * schema URL out of a file they were sent now arrives somewhere real.
 */
export const DEFAULT_PUBLIC_ORIGIN = "https://arch-lab.dev";

/** Strips trailing slashes so callers can concatenate a path safely. */
function normalize(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

/** `ARCHLAB_PUBLIC_ORIGIN`, or `null` when unset or blank. */
function explicitOrigin(): string | null {
  const value = process.env.ARCHLAB_PUBLIC_ORIGIN;
  if (value === undefined || value.trim() === "") return null;
  return normalize(value);
}

/** `VERCEL_PROJECT_PRODUCTION_URL` as an origin, or `null`. */
function vercelOrigin(): string | null {
  const value = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (value === undefined || value.trim() === "") return null;
  return `https://${normalize(value)}`;
}

/**
 * The origin to use when there is no request — share links, and anything else
 * minted for a reader who is not here yet.
 */
export function publicOrigin(): string {
  return explicitOrigin() ?? vercelOrigin() ?? DEFAULT_PUBLIC_ORIGIN;
}

/**
 * The origin of the request being served, from proxy headers.
 *
 * `get` is a plain header lookup rather than a framework type, so this is a
 * pure function that `pnpm check:mcp` can exercise without a server. Returns
 * `null` when no host header is present, which is the caller's cue to fall
 * back to configuration.
 *
 * Handles the two things real proxies do: comma-joined header values when a
 * request crosses more than one hop (the FIRST entry is the client-facing
 * one), and a missing protocol header, where `localhost` means `http` and
 * anything else means `https` — a public host serving plaintext is not a case
 * worth optimising for.
 */
export function requestOrigin(
  get: (name: string) => string | null | undefined,
): string | null {
  const first = (value: string | null | undefined): string | null => {
    if (value === undefined || value === null) return null;
    const head = value.split(",")[0]?.trim() ?? "";
    return head === "" ? null : head;
  };

  const host = first(get("x-forwarded-host")) ?? first(get("host"));
  if (host === null) return null;

  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = first(get("x-forwarded-proto")) ?? (isLocal ? "http" : "https");

  return `${proto}://${host}`;
}

/**
 * The origin to advertise on a page being served right now. An explicit
 * override still wins — that is what makes
 * `ARCHLAB_PUBLIC_ORIGIN=http://localhost:3001 pnpm dev` behave — but
 * otherwise the request's own host beats any configured guess, so a domain
 * rename fixes itself.
 */
export function documentedOrigin(
  get: (name: string) => string | null | undefined,
): string {
  return explicitOrigin() ?? requestOrigin(get) ?? publicOrigin();
}
