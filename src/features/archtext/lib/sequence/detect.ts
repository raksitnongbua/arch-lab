/**
 * Document-type sniffing for `.alab` text — which of the two grammars a
 * source belongs to, decided from the FIRST MEANINGFUL LINE only, because
 * that is all `src/features/validate/lib/check.ts` and
 * `src/features/viewer/input/detect.ts` ever look at:
 *
 *   archlab <maj>.<min>            → "c4"
 *   archlab <maj>.<min> sequence   → "sequence"
 *
 * One regex pair here, imported by the check script and (in phase 2) by the
 * viewer's detector, rather than each sniffer re-spelling the header shape.
 *
 * Imported by `scripts/sequence-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { SEQUENCE_HEADER_WORD } from "./keywords";

export type AlabDocumentKind = "c4" | "sequence";

/* Anchored to the whole line: `archlab 1.0 sequenced` or a trailing token
   must NOT detect — a wrong-but-confident answer routes the text to the
   wrong parser, whose error would then mislead. `null` and a real parse
   error are better than that. */
const C4_HEADER_RE = /^archlab\s+\d+\.\d+$/;
const SEQUENCE_HEADER_RE = new RegExp(
  `^archlab\\s+\\d+\\.\\d+\\s+${SEQUENCE_HEADER_WORD}$`,
);

/**
 * Which `.alab` grammar the text belongs to, or `null` when its first
 * meaningful line is not an `archlab` header at all. Skips blank lines and
 * `//` comments, exactly like both parsers do.
 */
export function detectAlabKind(source: string): AlabDocumentKind | null {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) continue;
    if (SEQUENCE_HEADER_RE.test(line)) return "sequence";
    if (C4_HEADER_RE.test(line)) return "c4";
    return null;
  }
  return null;
}
