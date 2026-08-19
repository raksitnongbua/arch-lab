/**
 * Document-type sniffing for `.alab` text — which of the six grammars a
 * source belongs to, decided from the FIRST MEANINGFUL LINE only, because
 * that is all `src/features/validate/lib/check.ts` and
 * `src/features/viewer/input/detect.ts` ever look at:
 *
 *   archlab <maj>.<min>            → "c4"
 *   archlab <maj>.<min> sequence   → "sequence"
 *   archlab <maj>.<min> flowchart  → "flowchart"
 *   archlab <maj>.<min> usecase    → "usecase"
 *   archlab <maj>.<min> er         → "er"
 *   archlab <maj>.<min> dict       → "dict"
 *
 * One regex family here, imported by the check scripts and the input
 * detectors, rather than each sniffer re-spelling the header shape.
 *
 * Imported by `scripts/sequence-check.mjs` and `scripts/flowchart-check.mjs`
 * through Node's type stripping: keep the syntax erasable and type-only
 * imports as `import type`.
 */

import { DICT_HEADER_WORD } from "../dict/keywords";
import { ER_HEADER_WORD } from "../er/keywords";
import { FLOWCHART_HEADER_WORD } from "../flowchart/keywords";
import { USECASE_HEADER_WORD } from "../usecase/keywords";
import { SEQUENCE_HEADER_WORD } from "./keywords";

export type AlabDocumentKind =
  "c4" | "sequence" | "flowchart" | "usecase" | "er" | "dict";

/* Anchored to the whole line: `archlab 1.0 sequenced` or a trailing token
   must NOT detect — a wrong-but-confident answer routes the text to the
   wrong parser, whose error would then mislead. `null` and a real parse
   error are better than that. */
const C4_HEADER_RE = /^archlab\s+\d+\.\d+$/;
const SEQUENCE_HEADER_RE = new RegExp(
  `^archlab\\s+\\d+\\.\\d+\\s+${SEQUENCE_HEADER_WORD}$`,
);
const FLOWCHART_HEADER_RE = new RegExp(
  `^archlab\\s+\\d+\\.\\d+\\s+${FLOWCHART_HEADER_WORD}$`,
);

const USECASE_HEADER_RE = new RegExp(
  `^archlab\\s+\\d+\\.\\d+\\s+${USECASE_HEADER_WORD}$`,
);

const ER_HEADER_RE = new RegExp(
  `^archlab\\s+\\d+\\.\\d+\\s+${ER_HEADER_WORD}$`,
);

const DICT_HEADER_RE = new RegExp(
  `^archlab\\s+\\d+\\.\\d+\\s+${DICT_HEADER_WORD}$`,
);

/**
 * Which `.alab` grammar the text belongs to, or `null` when its first
 * meaningful line is not an `archlab` header at all. Skips blank lines and
 * `//` comments, exactly like all three parsers do.
 */
export function detectAlabKind(source: string): AlabDocumentKind | null {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) continue;
    if (SEQUENCE_HEADER_RE.test(line)) return "sequence";
    if (FLOWCHART_HEADER_RE.test(line)) return "flowchart";
    if (USECASE_HEADER_RE.test(line)) return "usecase";
    if (ER_HEADER_RE.test(line)) return "er";
    if (DICT_HEADER_RE.test(line)) return "dict";
    if (C4_HEADER_RE.test(line)) return "c4";
    return null;
  }
  return null;
}
