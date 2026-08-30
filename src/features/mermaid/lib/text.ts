/**
 * Text codecs shared by the parser and the emitter. Mermaid C4 labels carry
 * line breaks as `<br/>` (or `<br>` / `<br />`); the arch-lab model stores
 * real newlines. Quotes travel as `\"` inside Mermaid strings.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable.
 */

const BR_PATTERN = /<br\s*\/?>/gi;

/** Decodes `<br/>`, `<br>` and `<br />` (any case) into real newlines. */
export function decodeInlineBreaks(text: string): string {
  return text.replace(BR_PATTERN, "\n");
}

/** Re-encodes real line breaks as `<br/>` for Mermaid output. */
export function encodeInlineBreaks(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "<br/>");
}

/**
 * A label rewritten so a separator-delimited Mermaid dialect cannot re-split
 * it, then encoded for output.
 *
 * SHARED BY THE `timeline` AND `gantt` EMITTERS, and shared rather than copied
 * because the second copy is where the two would drift: both dialects put
 * structure on a bare character with no escape — `:` separates a timeline's
 * period from its events and a gantt's task text from its metadata — so both
 * need the identical rewrite, and a fix applied to one copy only would leave
 * the other silently emitting a row that re-parses as two.
 *
 * Runs of separators COLLAPSE and the result is TRIMMED, which is the part
 * that is about correctness rather than tidiness: `":: x"` must not export as
 * a row that opens with the separator, because in both dialects a leading
 * separator means something structural (a timeline continuation row, a gantt
 * task with no text) and the row would change which thing it belongs to. That
 * is the one way this substitution could alter the diagram rather than only
 * its wording, so it is closed here.
 *
 * A label made ENTIRELY of separators collapses to nothing and falls back to
 * `emptied` for the same reason. A visible placeholder is worse than the
 * original label and better than a row that reparents itself — the trade every
 * substitution in this pair makes, and each caller's export caveat names it.
 *
 * `separator` is a plain string, not a pattern: both dialects' separators are
 * single literal characters, and a regex here would invite a caller to pass
 * one whose metacharacters silently changed what collapses.
 */
export function mermaidSeparatorFreeLabel(
  text: string,
  separator: string,
  emptied: string,
): string {
  const withoutSeparators = text
    .split(separator)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" - ");
  return withoutSeparators === ""
    ? emptied
    : encodeInlineBreaks(withoutSeparators);
}

/** Escapes text for a double-quoted Mermaid string argument. */
export function escapeMermaidString(text: string): string {
  return encodeInlineBreaks(text.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
}

/** The reverse of `escapeMermaidString`, minus the break decoding — callers
 * decode `<br/>` themselves because bare (unquoted) text needs that half too. */
export function unescapeMermaidString(text: string): string {
  return text.replace(/\\(["\\])/g, "$1");
}

/**
 * Deterministic rename of an imported Mermaid id into the `.alab` slug
 * alphabet, shared by the flowchart and use-case importers. The alphabet is
 * spelled here rather than imported: the mermaid feature never deep-imports
 * the archtext feature (features meet through barrels), and nothing needs
 * the coupling — a renamed id is only slug hygiene, since the `.alab`
 * serializers quote any id this regex would not pass. Deterministic: the
 * same source always yields the same ids, and a collision takes numbered
 * suffixes in first-come order (recorded in `used`, which this MUTATES) —
 * an importer that renames nondeterministically would break diffs between
 * two imports.
 */
export function alabSafeId(rawId: string, used: Set<string>): string {
  let safe = rawId.replace(/[^A-Za-z0-9_.-]/g, "_");
  if (!/^[A-Za-z0-9_]/.test(safe)) safe = `n${safe}`;
  let candidate = safe;
  for (let suffix = 2; used.has(candidate); suffix += 1) {
    candidate = `${safe}_${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

/** The `|label|` tail a flowchart-grammar emitter writes, or nothing.
 * Quote-wrapped only when a bare pipe pair could not hold it (a `|`, or a
 * leading quote the importer would strip) — everything else goes out
 * verbatim bar the `<br/>` codec, per the no-needless-substitution rule the
 * sequence emitter's `text()` states. */
export function mermaidPipeLabel(label: string | undefined): string {
  if (label === undefined || label === "") return "";
  const needsQuotes = label.includes("|") || label.startsWith('"');
  return needsQuotes
    ? `|"${escapeMermaidString(label)}"|`
    : `|${encodeInlineBreaks(label)}|`;
}

/**
 * Mermaid ids may not contain whitespace or the characters its parser uses
 * for structure, and an id that breaks the output is worse than one that is
 * renamed. Substitution rather than quoting because Mermaid has no quoting
 * for ids — this is the one place a document's own spelling can change on
 * the way out, so it is deliberate and narrow. `numericPrefix` guards a
 * leading digit, which reads as a number to Mermaid's tokenizer; each
 * emitter passes its own (`p_` participants, `n_` flowchart nodes) so a
 * renamed id still says what it is.
 */
export function mermaidSafeId(id: string, numericPrefix: string): string {
  const safe = id.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[0-9]/.test(safe) ? `${numericPrefix}${safe}` : safe;
}

/** The frontmatter `title:` value, as both flowchart-grammar importers read
 * it — the emitters write it JSON-quoted (valid YAML), and hand-written
 * frontmatter is usually a plain scalar; accept both. */
export function readMermaidFrontmatterTitle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      /* Not JSON after all — a plain scalar that merely starts with a quote
         is still a title someone typed; keep it verbatim. */
    }
  }
  return trimmed;
}

/**
 * Drops a leading, CLOSED YAML frontmatter block (`---` … `---`) so a
 * detector can sniff the first real Mermaid word behind it.
 *
 * THIS EXISTS BECAUSE THE FORMAT TOGGLE SHIPPED BROKEN WITHOUT IT: the
 * flowchart emitter writes the title as frontmatter (Mermaid's own spelling
 * for a title), the flowchart PARSER reads it back — but every first-line
 * detector saw `---`, matched nothing, and the playground refused the very
 * text its own toggle had just written. Detection and parsing must agree on
 * where a document starts, and this helper is that agreement.
 *
 * An UNCLOSED fence is returned untouched, on purpose: stripping it would
 * detect the fragment behind it and route the text to a parser whose error
 * would point past the real mistake — the parser's own "fence is never
 * closed" failure names the actual line.
 */
export function stripMermaidFrontmatter(source: string): string {
  const lines = source.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (line === "" || line.startsWith("%%") || line.startsWith("//")) {
      index += 1;
      continue;
    }
    if (line !== "---") return source;
    for (let close = index + 1; close < lines.length; close += 1) {
      if (lines[close].trim() === "---") {
        return lines.slice(close + 1).join("\n");
      }
    }
    return source;
  }
  return source;
}
