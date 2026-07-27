/**
 * Format auto-detection for pasted model text. A convenience, never a trap:
 * the UI always shows what was detected and lets the user force a format.
 *
 * The heuristic reads the first meaningful line only:
 *   - a document whose first non-blank, non-comment character is `{` is
 *     arch-lab JSON;
 *   - a document whose first word is one of Mermaid's C4 diagram headers
 *     (`C4Context`, `C4Container`, …) is Mermaid C4 code;
 *   - anything else is unrecognised — the caller asks the user to choose.
 */

import { MERMAID_DIAGRAM_TYPES } from "@/features/mermaid";

/** The two input languages the paste box accepts. */
export type PastedFormat = "json" | "mermaid";

/** What the user picked in the format control. */
export type FormatChoice = "auto" | PastedFormat;

export const FORMAT_LABEL: Record<PastedFormat, string> = {
  json: "arch-lab JSON",
  mermaid: "Mermaid C4",
};

/**
 * Detects the format of pasted text from its first meaningful line, or
 * `null` when neither language plausibly matches. Mermaid `%%` comment
 * lines are skipped, so a commented header still detects correctly.
 */
export function detectFormat(text: string): PastedFormat | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("%%")) continue;
    if (line.startsWith("{")) return "json";
    const firstWord = line.split(/[\s({]/, 1)[0];
    if ((MERMAID_DIAGRAM_TYPES as readonly string[]).includes(firstWord)) {
      return "mermaid";
    }
    return null;
  }
  return null;
}
