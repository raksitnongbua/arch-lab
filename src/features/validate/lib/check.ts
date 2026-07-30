/**
 * The checker behind `/validate` — "is this model text valid, and if not,
 * exactly where does it break?"
 *
 * Nothing here parses anything itself. Every format is pushed through the
 * SAME reader the rest of the app uses, so a document that passes here is a
 * document `/view`, the share codec and a saved file all accept:
 *
 *   - `.alab`       → `parsePane("aft", …)` → the real `parseArchText`
 *   - arch-lab JSON → `parsePane("json", …)` → the editor's `deserializeModel`
 *   - Mermaid C4    → `importMermaid` → the real `parseMermaidC4`
 *
 * Failures are flattened into one presentation shape (`CheckIssue`) while
 * keeping their native precision: line/column plus the quoted offending line
 * for the two text grammars, JSON-path for the JSON validator.
 *
 * Pure and synchronous — no DOM, no I/O, nothing leaves the browser.
 */

import type { ArchLabFile, C4Level } from "@/types";

import { detectFormat } from "@/features/viewer/input/detect";
import {
  importMermaid,
  parsePane,
  type SyncedModel,
} from "@/features/viewer/input/sync";

/* -------------------------------------------------------------------------- */
/* Formats                                                                     */
/* -------------------------------------------------------------------------- */

/** The three languages the checker accepts. */
export type CheckFormat = "alab" | "json" | "mermaid";

/** What the user picked in the format control. */
export type CheckChoice = "auto" | CheckFormat;

export const CHECK_FORMAT_LABEL: Record<CheckFormat, string> = {
  alab: ".alab text",
  json: "arch-lab JSON",
  mermaid: "Mermaid C4",
};

export const CHECK_CHOICES: readonly { value: CheckChoice; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "alab", label: CHECK_FORMAT_LABEL.alab },
  { value: "json", label: CHECK_FORMAT_LABEL.json },
  { value: "mermaid", label: CHECK_FORMAT_LABEL.mermaid },
];

/**
 * Mermaid is a one-way, lossy import rather than a storage format, so a
 * Mermaid document that parses is "valid Mermaid C4" — not a lossless model.
 * The UI says so rather than letting the green tick imply more than it can.
 */
export const MERMAID_CAVEAT =
  "Mermaid C4 is an import format: it parses, but converting it to a model " +
  "is one-way and lossy — boundaries become tags, and SystemDb / SystemQueue " +
  "lose their styling. Save as .alab or arch-lab JSON to keep everything.";

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

/** One problem, located however its own parser locates things. */
export interface CheckIssue {
  message: string;
  /** 1-based line, for the two text grammars. */
  line?: number;
  /** 1-based column, for the two text grammars. */
  column?: number;
  /** The offending source line, verbatim, when there is one. */
  lineText?: string;
  /** JSON path (`diagrams[0].nodes[2].type`), for JSON failures. */
  path?: string;
}

export interface DiagramSummary {
  id: string;
  title: string;
  level: C4Level;
  nodeCount: number;
  edgeCount: number;
}

/** What a valid document turned out to contain. */
export interface CheckSummary {
  title: string;
  description: string | null;
  version: string;
  diagrams: readonly DiagramSummary[];
  nodeCount: number;
  edgeCount: number;
}

export interface CheckOk {
  status: "ok";
  /** The language the text was actually read as. */
  format: CheckFormat;
  /** True when `format` came from auto-detection rather than the user. */
  autoDetected: boolean;
  summary: CheckSummary;
  file: ArchLabFile;
  /** Canonical `.alab` text — what a "format this" action would produce. */
  aftText: string;
  /** Canonical `.archlab.json` text. */
  jsonText: string;
}

export interface CheckFailed {
  status: "error";
  format: CheckFormat;
  autoDetected: boolean;
  /** `line 3, column 5: …` — the parser's own headline message. */
  message: string;
  issues: readonly CheckIssue[];
}

/** Nothing to check, or nothing recognisable to check it as. */
export interface CheckIdle {
  status: "empty" | "unknown-format";
  message: string;
}

export type CheckResult = CheckOk | CheckFailed | CheckIdle;

/* -------------------------------------------------------------------------- */
/* Checking                                                                    */
/* -------------------------------------------------------------------------- */

const UNKNOWN_FORMAT_MESSAGE =
  "Could not tell what this is. Auto-detect reads the first meaningful " +
  "line: `{` means arch-lab JSON, a C4Context / C4Container / … header " +
  "means Mermaid C4, and `archlab <version>` means .alab. Pick a format " +
  "above to check it anyway and see the parser's own error.";

/**
 * Detects the format the way the rest of the app does, extended with the one
 * case `detectFormat` does not cover: an `archlab` header line means `.alab`.
 * Returns `null` when no language plausibly matches.
 */
function detectCheckFormat(source: string): CheckFormat | null {
  const detected = detectFormat(source);
  if (detected !== null) return detected;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("//")) continue;
    return line.split(/\s+/, 1)[0] === "archlab" ? "alab" : null;
  }
  return null;
}

function summarize(file: ArchLabFile): CheckSummary {
  const diagrams = file.diagrams.map((diagram) => ({
    id: diagram.id,
    title: diagram.title,
    level: diagram.level,
    nodeCount: diagram.nodes.length,
    edgeCount: diagram.edges.length,
  }));
  return {
    title: file.metadata.title,
    description: file.metadata.description ?? null,
    version: file.version,
    diagrams,
    nodeCount: diagrams.reduce((total, d) => total + d.nodeCount, 0),
    edgeCount: diagrams.reduce((total, d) => total + d.edgeCount, 0),
  };
}

function ok(
  format: CheckFormat,
  autoDetected: boolean,
  synced: SyncedModel,
): CheckOk {
  return {
    status: "ok",
    format,
    autoDetected,
    summary: summarize(synced.file),
    file: synced.file,
    aftText: synced.aftText,
    jsonText: synced.jsonText,
  };
}

/** `"expected a name"` + `found` → `"expected a name (found `x`)"`. */
function withFound(message: string, found: string | undefined): string {
  return found === undefined ? message : `${message} (found \`${found}\`)`;
}

/**
 * Checks `source` under the user's format choice. Never throws: every
 * failure mode — empty input, undetectable format, or a parse error — comes
 * back as a typed result.
 */
export function checkSource(source: string, choice: CheckChoice): CheckResult {
  if (source.trim() === "") {
    return {
      status: "empty",
      message:
        "Paste a model to check it — .alab text, arch-lab JSON, or Mermaid C4.",
    };
  }

  const autoDetected = choice === "auto";
  const format = autoDetected ? detectCheckFormat(source) : choice;
  if (format === null) {
    return { status: "unknown-format", message: UNKNOWN_FORMAT_MESSAGE };
  }

  if (format === "mermaid") {
    const result = importMermaid(source);
    if (result.status === "ok") return ok(format, autoDetected, result.value);
    const error = result.error;
    return {
      status: "error",
      format,
      autoDetected,
      message: error.message,
      issues: error.issues.map((issue) => ({
        message: withFound(issue.message, issue.found),
        line: issue.line,
        column: issue.column,
        ...(error.lineText !== null && issue.line === error.line
          ? { lineText: error.lineText }
          : {}),
      })),
    };
  }

  const result = parsePane(format === "alab" ? "aft" : "json", source);
  if (result.status === "ok") return ok(format, autoDetected, result.value);

  const error = result.error;

  if (error.kind === "mermaid-detected") {
    // Only reachable when the user forced .alab or JSON on Mermaid source.
    return {
      status: "error",
      format,
      autoDetected,
      message: `This looks like Mermaid C4, not ${CHECK_FORMAT_LABEL[format]}.`,
      issues: [
        {
          message:
            "Switch the format to Mermaid C4 (or Auto-detect) to check it.",
        },
      ],
    };
  }

  if (error.kind === "aft") {
    return {
      status: "error",
      format,
      autoDetected,
      message: error.message,
      issues: error.issues.map((issue) => ({
        message: withFound(issue.message, issue.found),
        line: issue.line,
        column: issue.column,
        ...(error.lineText !== null && issue.line === error.line
          ? { lineText: error.lineText }
          : {}),
      })),
    };
  }

  return {
    status: "error",
    format,
    autoDetected,
    message: error.message,
    issues: error.issues.map((issue) => ({
      message: issue.message,
      path: issue.path,
    })),
  };
}
