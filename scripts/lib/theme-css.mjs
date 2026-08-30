/**
 * Parsing `globals.css` theme blocks into token maps — shared by
 * `theme-check.mjs` and `flowchart-palette-check.mjs`, which must agree on
 * what "the theme's value for a token" means or one check will measure a
 * palette the other never sees.
 */

/**
 * Token map for a selector; `"light"` reads the `:root` block, which is the
 * baseline every theme falls back to. Returns null when the block is absent
 * (the caller decides whether that is a failure).
 */
export function tokensOf(css, selector) {
  const pattern =
    selector === "light"
      ? /^:root \{(.*?)^\}/ms
      : new RegExp(`^\\.${selector} \\{(.*?)^\\}`, "ms");
  const body = pattern.exec(css)?.[1];
  if (body === undefined) return null;
  return new Map(
    [...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );
}

/**
 * A token's value in a theme, with `var()` references substituted — the
 * check-side model of the cascade: the theme block wins, anything it omits
 * falls back to the `:root` baseline, and an alias like
 * `--flow-start: var(--node-queue)` resolves against the ACTIVE theme's
 * tokens (exactly what the browser does, since the alias and the theme both
 * apply to the same <html> element). Depth-capped so a cyclic alias fails
 * the check instead of hanging it.
 */
export function resolveToken(token, themeTokens, baseline, depth = 8) {
  if (depth === 0) return null;
  const raw = themeTokens.get(token) ?? baseline.get(token);
  if (raw === undefined) return null;
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(raw.trim());
  if (ref !== null)
    return resolveToken(ref[1], themeTokens, baseline, depth - 1);
  return raw.trim();
}
