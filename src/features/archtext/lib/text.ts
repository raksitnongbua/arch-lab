/**
 * Shared token classes for the `.alab` grammar. Both the parser and the
 * serializer read these, so what one side emits bare the other side is
 * guaranteed to accept bare — the single-source-of-truth that keeps the
 * round trip byte-identical.
 *
 * Imported by `scripts/archtext-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

/** Ids (nodes, edges, diagrams, icons) that may be written unquoted. */
export const BARE_ID_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

/** Tags that may be written as `#tag` without quotes. */
export const BARE_TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/;

/** Keys in `!` paths and `after` clauses that may be written unquoted. */
export const BARE_KEY_RE = /^[A-Za-z0-9_-]+$/;

/** Timestamps and similar single-word values that may be written unquoted. */
export const BARE_VALUE_RE = /^[A-Za-z0-9:.+TZ_-]+$/;

/** Matched by the cursor when reading a number token. */
export const NUMBER_RE = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;

/** An id token: bare when possible, JSON-quoted otherwise. */
export function idToken(id: string): string {
  return BARE_ID_RE.test(id) && id !== "null" ? id : JSON.stringify(id);
}

/** A `#tag` token: bare when possible, JSON-quoted otherwise. */
export function tagToken(tag: string): string {
  return BARE_TAG_RE.test(tag) ? `#${tag}` : `#${JSON.stringify(tag)}`;
}

/**
 * A key token for `!` lines. All-digit keys are quoted so they cannot be
 * mistaken for an array index segment.
 */
export function keyToken(key: string): string {
  return BARE_KEY_RE.test(key) && !/^\d+$/.test(key)
    ? key
    : JSON.stringify(key);
}

/** A single-word value token (timestamps): bare when possible. */
export function valueToken(value: string): string {
  return BARE_VALUE_RE.test(value) ? value : JSON.stringify(value);
}

/** A finite number rendered exactly as canonical JSON would render it. */
export function numberToken(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`Cannot serialize a non-finite number (${String(n)}).`);
  }
  return JSON.stringify(n);
}
