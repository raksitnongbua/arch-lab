/**
 * `validate_sequence` and `format_sequence` — the sequence document's half of
 * the write-then-check loop.
 *
 * WHY THESE ARE SEPARATE TOOLS rather than sequence support bolted onto
 * `validate_model` / `format_model`. Everything the C4 tools return is shaped
 * by `CheckOk`: an `ArchLabFile`, a list of diagrams with C4 levels, node and
 * edge counts, C4 review advisories. A sequence document has none of those —
 * it has participants, ordered messages, fragments and notes, and no levels at
 * all. Widening `CheckOk` into a union would push a discriminant through the
 * `/validate` page and all eight existing tools to serve a document kind that
 * genuinely is a different shape. Two document kinds, two tools, each with an
 * honest summary.
 *
 * The reader is `parseSequenceInput` — the SAME one the `/view/sequence`
 * playground uses, which is itself a thin shell over `parseSequenceText` and
 * `parseMermaidSequence`. So "the MCP server accepted it" means the playground
 * renders it too, which is the guarantee `lib/read.ts` makes for C4 and the
 * reason no second grammar is allowed to exist here either.
 */

import {
  isSelfMessage,
  type SequenceItem,
  type SequenceLabFile,
} from "@/types/sequence";

import { serializeSequenceText } from "@/features/archtext";
import {
  MERMAID_SEQUENCE_CAVEAT,
  parseSequenceInput,
  SEQUENCE_FORMAT_LABEL,
  type SequenceInputError,
} from "@/features/sequence/input/parse";

import { guardSourceSize } from "../lib/limits";
import {
  errorResult,
  fence,
  joinSections,
  quoteSourceLine,
  textResult,
  type McpTextResult,
} from "../lib/render";

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Renders a typed reader failure as the caller-facing message. Each of the
 * three kinds gets its own shape because they need different next actions: a
 * parse error needs the location and the offending line, a C4 document needs
 * to be told which tool to use instead, and an undetectable one needs to know
 * what a first line must look like.
 */
function renderReadError(error: SequenceInputError): string {
  if (error.kind === "parse") {
    return joinSections(
      `INVALID as ${SEQUENCE_FORMAT_LABEL[error.format]}.`,
      `line ${error.line}, column ${error.column}: ${error.message}`,
      // The reader reports `lineText: null` when the location points past the
      // last line (an unexpected end of input), and there is then nothing to
      // quote — the message already says where.
      error.lineText === null
        ? null
        : quoteSourceLine(error.lineText, error.line, error.column),
    );
  }
  if (error.kind === "c4-detected") {
    return joinSections(
      error.message,
      "Use `validate_model` for C4 documents — it reads .alab, arch-lab JSON " +
        "and Mermaid C4, and reports C4 review notes this tool has no " +
        "equivalent for.",
    );
  }
  return error.message;
}

type ReadSequenceResult =
  | { status: "ok"; file: SequenceLabFile; format: "alab" | "mermaid" }
  | { status: "error"; message: string };

function readSequence(source: string): ReadSequenceResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", message: size.message };

  const result = parseSequenceInput(source);
  if (result.status === "error") {
    return { status: "error", message: renderReadError(result.error) };
  }
  return {
    status: "ok",
    file: result.value.file,
    format: result.value.format,
  };
}

/* -------------------------------------------------------------------------- */
/* Summarising                                                                 */
/* -------------------------------------------------------------------------- */

interface SequenceCounts {
  messages: number;
  sync: number;
  async: number;
  reply: number;
  self: number;
  fragments: number;
  notes: number;
  /** Fragment kinds in document order, deduplicated. */
  fragmentKinds: string[];
  /** Deepest fragment nesting, 0 when the flow is flat. */
  maxDepth: number;
}

/**
 * Walks the item tree once. A sequence document's items are a TREE (fragments
 * carry branches, each branch carries items), so every count here has to
 * recurse — a flat `file.items.length` would report an `alt` holding nine
 * messages as one item, which is precisely the summary an agent would use to
 * conclude its document was empty.
 */
function countItems(items: readonly SequenceItem[]): SequenceCounts {
  const counts: SequenceCounts = {
    messages: 0,
    sync: 0,
    async: 0,
    reply: 0,
    self: 0,
    fragments: 0,
    notes: 0,
    fragmentKinds: [],
    maxDepth: 0,
  };

  const walk = (list: readonly SequenceItem[], depth: number): void => {
    if (depth > counts.maxDepth) counts.maxDepth = depth;
    for (const item of list) {
      if (item.step === "message") {
        counts.messages += 1;
        counts[item.kind] += 1;
        if (isSelfMessage(item)) counts.self += 1;
      } else if (item.step === "note") {
        counts.notes += 1;
      } else {
        counts.fragments += 1;
        if (!counts.fragmentKinds.includes(item.kind)) {
          counts.fragmentKinds.push(item.kind);
        }
        for (const branch of item.branches) walk(branch.items, depth + 1);
      }
    }
  };

  walk(items, 0);
  return counts;
}

function renderParticipants(file: SequenceLabFile): string {
  const rows = file.participants.map((p) => {
    const kind = p.kind === "actor" ? "actor" : "participant";
    const tech = p.technology === undefined ? "" : ` [${p.technology}]`;
    return `| \`${p.id}\` | ${p.name}${tech} | ${kind} |`;
  });
  return ["| Id | Name | Kind |", "| --- | --- | --- |", ...rows].join("\n");
}

function renderSummary(file: SequenceLabFile, counts: SequenceCounts): string {
  const parts = [
    `${counts.messages} message${counts.messages === 1 ? "" : "s"}`,
    `${counts.sync} sync`,
    `${counts.async} async`,
    `${counts.reply} reply`,
  ];
  if (counts.self > 0) parts.push(`${counts.self} self-message`);

  const lines = [
    `Title: ${file.metadata.title}`,
    `Participants: ${file.participants.length}`,
    `Messages: ${parts.join(", ")}`,
  ];
  if (counts.fragments > 0) {
    lines.push(
      `Fragments: ${counts.fragments} (${counts.fragmentKinds.join(", ")}), ` +
        `nested ${counts.maxDepth} deep`,
    );
  }
  if (counts.notes > 0) lines.push(`Notes: ${counts.notes}`);
  if (file.autonumber === true) lines.push("Autonumber: on");
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

export function validateSequence(source: string): McpTextResult {
  const read = readSequence(source);
  if (read.status === "error") return errorResult(read.message);

  const counts = countItems(read.file.items);
  return textResult(
    joinSections(
      `VALID as ${SEQUENCE_FORMAT_LABEL[read.format]}.`,
      renderSummary(read.file, counts),
      renderParticipants(read.file),
      // Stated on success, not just on the import path, because a caller that
      // validated Mermaid and then saved the .alab has silently accepted the
      // loss; naming it here is the only place it can still act on it.
      read.format === "mermaid" ? MERMAID_SEQUENCE_CAVEAT : null,
      counts.messages === 0
        ? "No messages: the document parses, but a sequence diagram with no " +
            'messages records nothing. Add `from -> to "label"` lines.'
        : null,
    ),
  );
}

export function formatSequence(source: string): McpTextResult {
  const read = readSequence(source);
  if (read.status === "error") return errorResult(read.message);

  const canonical = serializeSequenceText(read.file);
  return textResult(
    joinSections(
      `Canonical .alab sequence text, read as ` +
        `${SEQUENCE_FORMAT_LABEL[read.format]}.`,
      fence("", canonical),
      read.format === "mermaid" ? MERMAID_SEQUENCE_CAVEAT : null,
    ),
  );
}
