/**
 * Mermaid → `.alab`, for both document kinds, as one call.
 *
 * The conversion already existed twice — the C4 playground imports Mermaid C4
 * into its two panes, and the sequence playground imports `sequenceDiagram`
 * into its one — but only as a side effect of opening a PLAYGROUND. Someone
 * whose actual errand is "I have Mermaid, I want the text arch-lab stores"
 * had to know that pasting into a diagram tool would hand it back, and which
 * of the two tools to pick. This module is that errand, named.
 *
 * Nothing here parses or serializes anything itself, deliberately: C4 goes
 * through `/validate`'s `checkSource` (which is itself built on the real
 * readers and already produces canonical `.alab`), and sequence through the
 * sequence playground's `parseSequenceInput` plus `serializeSequenceText`. So
 * this page cannot disagree with what the rest of the app would have done with
 * the same paste — including the caveats, which are the exported constants and
 * not a retelling of them.
 *
 * Pure and synchronous. Nothing is uploaded; the conversion is a function of
 * the text.
 */

import { detectAlabKind, serializeSequenceText } from "@/features/archtext";
import { MERMAID_DIAGRAM_TYPES } from "@/features/mermaid";
/* Reached past the two barrels on purpose, and the same way
   `validate/lib/check.ts` reaches past the viewer's: both of those barrels
   export React components, so importing them would pull a playground and a
   page into a module that must stay pure — this one is loaded by
   `scripts/validate-samples-check.mjs` through Node's type stripping, which
   cannot read `.tsx` at all. The INPUT layers imported here are pure by
   construction. */
import {
  MERMAID_SEQUENCE_CAVEAT,
  parseSequenceInput,
} from "@/features/sequence/input/parse";
import { MERMAID_CAVEAT, checkSource } from "@/features/validate/lib/check";

/** Which arch-lab document the pasted Mermaid becomes. */
export type ConvertKind = "c4" | "sequence";

export const CONVERT_KIND_LABEL: Record<ConvertKind, string> = {
  c4: "C4 model",
  sequence: "sequence diagram",
};

/** Where the converted document is rendered. */
export const CONVERT_PLAYGROUND_PATH: Record<ConvertKind, string> = {
  c4: "/view/c4",
  sequence: "/view/sequence",
};

export interface ConvertOk {
  status: "ok";
  kind: ConvertKind;
  /** The document's own title — the download's file stem. */
  title: string;
  /** Canonical `.alab` text: what arch-lab would write for this model. */
  alabText: string;
  /** What this import DROPPED, in the importer's own words. */
  caveat: string;
}

/** A located failure, in the shape `/validate` and both playgrounds render. */
export interface ConvertFailed {
  status: "error";
  kind: ConvertKind;
  message: string;
  line: number | null;
  column: number | null;
  lineText: string | null;
}

/**
 * Nothing to convert, or nothing this page is for. `already-alab` and
 * `not-mermaid` are separate from "we could not tell" on purpose: both have a
 * specific next step, and "unrecognised" would send someone looking for a typo
 * in a document that is simply already converted.
 */
export interface ConvertIdle {
  status: "empty" | "already-alab" | "not-mermaid" | "unknown-format";
  message: string;
}

export type ConvertResult = ConvertOk | ConvertFailed | ConvertIdle;

const UNKNOWN_MESSAGE =
  "Could not tell what this is. This page reads Mermaid: a C4 diagram " +
  `(${MERMAID_DIAGRAM_TYPES.join(", ")}) or a sequenceDiagram. The first ` +
  "meaningful line has to be one of those headers.";

/** Detects the Mermaid dialect from the first meaningful line, as both
 * playgrounds do — `%%` directives and comments are skipped. */
function detectMermaid(source: string): ConvertKind | null {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("%%")) continue;
    const firstWord = line.split(/[\s({]/, 1)[0];
    if (firstWord === "sequenceDiagram") return "sequence";
    if ((MERMAID_DIAGRAM_TYPES as readonly string[]).includes(firstWord)) {
      return "c4";
    }
    return null;
  }
  return null;
}

/** Converts pasted Mermaid source into canonical `.alab` text. */
export function convertMermaid(source: string): ConvertResult {
  if (source.trim() === "") {
    return {
      status: "empty",
      message:
        "Paste Mermaid C4 or a Mermaid sequenceDiagram — the .alab it becomes appears here.",
    };
  }

  /* Two paste-shaped mistakes, each answered with where to go instead of a
     parse error about a line the reader did not write. */
  const alab = detectAlabKind(source);
  if (alab !== null) {
    return {
      status: "already-alab",
      message:
        "This is already .alab text — there is nothing to convert. /validate " +
        "checks it, and the playgrounds render it.",
    };
  }
  if (source.trimStart().startsWith("{")) {
    return {
      status: "not-mermaid",
      message:
        "This is arch-lab JSON, not Mermaid. The C4 playground shows .alab " +
        "and JSON side by side and converts between them losslessly.",
    };
  }

  const kind = detectMermaid(source);
  if (kind === null)
    return { status: "unknown-format", message: UNKNOWN_MESSAGE };

  return kind === "sequence" ? convertSequence(source) : convertC4(source);
}

function convertSequence(source: string): ConvertOk | ConvertFailed {
  const parsed = parseSequenceInput(source);
  if (parsed.status === "error") {
    const detail = parsed.error;
    return {
      status: "error",
      kind: "sequence",
      message: detail.message,
      line: detail.kind === "parse" ? detail.line : null,
      column: detail.kind === "parse" ? detail.column : null,
      lineText: detail.kind === "parse" ? detail.lineText : null,
    };
  }
  return {
    status: "ok",
    kind: "sequence",
    title: parsed.value.file.metadata.title,
    alabText: serializeSequenceText(parsed.value.file),
    caveat: MERMAID_SEQUENCE_CAVEAT,
  };
}

function convertC4(source: string): ConvertOk | ConvertFailed | ConvertIdle {
  /* Forced to "mermaid" rather than "auto": detection already ran above, and
     letting the checker re-decide would put two heuristics in one path. */
  const checked = checkSource(source, "mermaid");
  if (checked.status === "ok") {
    return {
      status: "ok",
      kind: "c4",
      title: checked.summary.title,
      alabText: checked.aftText,
      caveat: MERMAID_CAVEAT,
    };
  }
  if (checked.status === "error") {
    const [first] = checked.issues;
    return {
      status: "error",
      kind: "c4",
      message: checked.message,
      line: first?.line ?? null,
      column: first?.column ?? null,
      lineText: first?.lineText ?? null,
    };
  }
  /* `empty` / `unknown-format` are both ruled out above — an empty source
     returned early and the header matched a C4 diagram type. Reported rather
     than assumed away, so a change in `checkSource` shows up as a message
     instead of a crash. */
  return { status: checked.status, message: checked.message };
}
