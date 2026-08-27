/**
 * `?i=1` — the one QUERY parameter a share link carries: open immersive.
 *
 * WHY A QUERY PARAM AND NOT THE FRAGMENT, where the rest of a share link
 * lives. The fragment never reaches the server, so a `#i=1` would only be
 * legible after hydration: the reader would watch the site chrome paint and
 * then be yanked away from it. A query param is visible to the route, so
 * `/live?i=1` renders immersive in its FIRST BYTE — which is the whole point
 * of the option. Presentation is the product; a flash of chrome on arrival is
 * the thing being sold against.
 *
 * It also means the immersive request survives what the payload survives: the
 * `/live/*` and `/view/*` trampolines merge the query into their destination
 * (see `alias-forward.tsx`), so a link that bounces keeps the mode.
 *
 * SHORT ON PURPOSE — `?i=1`, not `?immersive=true`. Five characters, and every
 * one of them is taken from a payload competing against
 * `MAX_SHARE_URL_LENGTH`; the same reasoning that named the seed param `?d=`.
 *
 * IT IS A REQUEST, NEVER A LOCK. Both hosts that honour it pass it as the
 * canvas's STARTING mode, and their own immersive controls and Escape ladders
 * work unchanged — a recipient who wants the chrome back is one press away.
 * That is why an absent or unrecognised value means "off" rather than an error:
 * the param names how a diagram opens, not a route, and a mangled one should
 * still show the diagram.
 */

/** Query parameter name — see the module comment for why it is one letter. */
export const SHARE_PARAM_IMMERSIVE = "i";

/**
 * The query a minted link carries, or `""`. The ONE place the parameter is
 * written, so the two share kinds (a bundled model's page address and a
 * payload link) cannot spell it differently.
 */
export function immersiveQuery(immersive: boolean): string {
  return immersive ? `?${SHARE_PARAM_IMMERSIVE}=1` : "";
}

/**
 * Reads the param out of a route's `searchParams` record.
 *
 * `1` is what gets minted; `true` is what gets typed from memory, and both
 * spellings are accepted for the reason `seedFromParam` accepts two per kind.
 * Everything else — including a repeated param, whose value arrives as an
 * array — is off.
 */
export function immersiveFromParam(
  value: string | string[] | undefined,
): boolean {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "1" || first === "true";
}

/**
 * The same read from a `location.search` string, for the client that cannot
 * see the request. `/live/[modelId]` is statically prerendered — reading
 * `searchParams` there would opt every bundled model out of that — so its
 * client wrapper reads the live URL instead, exactly as it already does for
 * the `#d=` deep link.
 */
export function immersiveFromSearch(search: string): boolean {
  return immersiveFromParam(
    new URLSearchParams(search).get(SHARE_PARAM_IMMERSIVE) ?? undefined,
  );
}
