/**
 * `validate_flowchart` and `format_flowchart` — the flowchart document's half
 * of the write-then-check loop.
 *
 * WHY A THIRD PAIR rather than a `kind` argument, or flowchart support folded
 * into `validate_model`: the same argument `tools/sequence.ts` makes, and it
 * holds a second time. Everything the C4 tools return is shaped by `CheckOk`
 * (an `ArchLabFile`, diagrams with C4 levels, node and edge counts, C4 review
 * advisories); everything the sequence tools return is participants and
 * ordered messages. A flowchart is neither — it is a directed GRAPH of shaped
 * steps, and the facts worth reporting about it (reachability, dead ends,
 * unguarded branches) have no counterpart in either of the other two. Three
 * document kinds, three tools, each with an honest summary.
 *
 * The reader is `parseFlowchartInput` — the SAME one the `/live?d=flow`
 * playground uses, itself a thin shell over `parseFlowchartText` and
 * `parseMermaidFlowchart`. So "the MCP server accepted it" means the
 * playground renders it too, which is the guarantee `lib/read.ts` makes for C4
 * and the reason no second grammar is allowed to exist here either.
 */

import type { FlowchartLabFile } from "@/types/flowchart";

import { serializeFlowchartText } from "@/features/archtext";
import {
  FLOWCHART_FORMAT_LABEL,
  MERMAID_FLOWCHART_CAVEAT,
  parseFlowchartInput,
  type FlowchartInputError,
  type FlowchartSourceFormat,
} from "@/features/flowchart/input/parse";
/* THE VIEWER'S OWN LAYOUT, called server-side — pure, no DOM, no measurement,
   which is what lets the check scripts run it under Node and what lets this
   tool answer "how big will it be?" with the geometry the browser will draw
   rather than a node-count guess. An agent cannot see its own diagram; this is
   the substitute for looking.

   Imported from `lib/layout` rather than the feature barrel, exactly as
   `tools/sequence.ts` imports `layoutSequence`: the barrel re-exports the
   `.tsx` viewer, and `scripts/mcp-check.mjs` loads this module through Node's
   type stripping, which cannot resolve a component. Reaching past the barrel
   is the lesser evil against a check that cannot run. */
import { layoutFlowchart } from "@/features/flowchart/lib/layout";

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
 * Renders a typed reader failure as the caller-facing message. A parse error
 * needs the location and the offending line; `unknown-format` already carries
 * a self-contained sentence naming both dialects it tried.
 */
function renderReadError(error: FlowchartInputError): string {
  if (error.kind === "parse") {
    return joinSections(
      `INVALID as ${FLOWCHART_FORMAT_LABEL[error.format]}.`,
      `line ${error.line}, column ${error.column}: ${error.message}`,
      // `lineText: null` means the location points past the last line (an
      // unexpected end of input); there is nothing to quote and the message
      // already says where.
      error.lineText === null
        ? null
        : quoteSourceLine(error.lineText, error.line, error.column),
    );
  }
  return error.message;
}

export type ReadFlowchartResult =
  | { status: "ok"; file: FlowchartLabFile; format: FlowchartSourceFormat }
  /*
   * Keeps the error KIND, not just the rendered message, for the reason
   * `readSequence` does: a caller that needs to know whether the text IS a
   * flowchart (a "parse" error means yes, and the message is the answer)
   * versus a document some other reader owns must not have to sniff prose.
   */
  | {
      status: "error";
      kind: FlowchartInputError["kind"] | "size";
      message: string;
    };

export function readFlowchart(source: string): ReadFlowchartResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", kind: "size", message: size.message };

  const result = parseFlowchartInput(source);
  if (result.status === "error") {
    return {
      status: "error",
      kind: result.error.kind,
      message: renderReadError(result.error),
    };
  }
  return { status: "ok", file: result.value.file, format: result.value.format };
}

/* -------------------------------------------------------------------------- */
/* Summarising                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The graph facts an agent writing a flowchart it cannot see has no other way
 * to learn. Every one of these describes a document that PARSES — nothing here
 * is a syntax error — and each is a shape that reads as broken on screen:
 *
 *   - `unreachable`  — a node no arrow arrives at and which is not a `start`.
 *     It floats in its own column, which looks like a rendering fault.
 *   - `deadEnds`     — a node no arrow leaves and which is not an `end`. The
 *     reader follows the flow and falls off it.
 *   - `unguarded`    — a `decision` whose outgoing edges are not all labelled.
 *     A diamond with two unlabelled exits states a question and then refuses
 *     to say which way is which; it is the single most common flowchart defect
 *     and a parser has no opinion about it.
 */
interface FlowchartAudit {
  unreachable: string[];
  deadEnds: string[];
  unguarded: string[];
  loops: number;
}

function auditFlowchart(file: FlowchartLabFile): FlowchartAudit {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const node of file.nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, 0);
  }
  for (const edge of file.edges) {
    outgoing.set(edge.from, (outgoing.get(edge.from) ?? 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const unreachable = file.nodes
    .filter((n) => n.shape !== "start" && (incoming.get(n.id) ?? 0) === 0)
    .map((n) => n.id);
  const deadEnds = file.nodes
    .filter((n) => n.shape !== "end" && (outgoing.get(n.id) ?? 0) === 0)
    .map((n) => n.id);

  const unguarded = file.nodes
    .filter((n) => n.shape === "decision")
    .filter((n) => {
      const exits = file.edges.filter((e) => e.from === n.id);
      return exits.length > 1 && exits.some((e) => e.label === undefined);
    })
    .map((n) => n.id);

  // Counted from the LAYOUT, not from the model: which arrows are loops is a
  // ranking result, and re-deriving it here would be a second, driftable
  // implementation of the cycle-breaking rule.
  const loops = layoutFlowchart(file).edges.filter((e) => e.back).length;

  return { unreachable, deadEnds, unguarded, loops };
}

function renderNodes(file: FlowchartLabFile): string {
  const rows = file.nodes.map((n) => {
    const tech = n.technology === undefined ? "" : ` [${n.technology}]`;
    return `| \`${n.id}\` | ${n.label}${tech} | ${n.shape} |`;
  });
  return ["| Id | Label | Shape |", "| --- | --- | --- |", ...rows].join("\n");
}

/** `id -> id` lines, with the guard when the edge carries one. */
function renderEdges(file: FlowchartLabFile): string {
  if (file.edges.length === 0) return "";
  const rows = file.edges.map((e) => {
    const label = e.label === undefined ? "" : ` : "${e.label}"`;
    return `${e.from} -> ${e.to}${label}`;
  });
  return fence("", rows.join("\n"));
}

function renderSummary(file: FlowchartLabFile, audit: FlowchartAudit): string {
  const byShape = new Map<string, number>();
  for (const node of file.nodes) {
    byShape.set(node.shape, (byShape.get(node.shape) ?? 0) + 1);
  }
  const shapes = [...byShape.entries()]
    .map(([shape, count]) => `${count} ${shape}`)
    .join(", ");

  const layout = layoutFlowchart(file);
  const labelled = file.edges.filter((e) => e.label !== undefined).length;

  const lines = [
    `Title: ${file.metadata.title}`,
    `Nodes: ${file.nodes.length}${shapes === "" ? "" : ` (${shapes})`}`,
    `Edges: ${file.edges.length}, ${labelled} labelled` +
      (audit.loops > 0
        ? `, ${audit.loops} looping back`
        : ", none looping back"),
  ];
  if (file.groups !== undefined && file.groups.length > 0) {
    lines.push(
      `Groups: ${file.groups.map((g) => `${g.label} (${g.nodes.length})`).join(", ")}`,
    );
  }
  lines.push(
    `Size: ${Math.round(layout.width)} x ${Math.round(layout.height)} px.`,
  );
  return lines.join("\n");
}

/**
 * The audit, rendered only when it has something to say. Worded as the remedy
 * rather than the complaint, because the caller is a model about to edit the
 * document and "add a guard" is actionable where "unguarded decision" is a
 * label it has to translate first.
 */
function renderAudit(audit: FlowchartAudit): string | null {
  const notes: string[] = [];
  if (audit.unguarded.length > 0) {
    notes.push(
      `Unguarded decisions: ${audit.unguarded.map((id) => `\`${id}\``).join(", ")} ` +
        "— a diamond with more than one exit needs a guard on each, or the " +
        'reader cannot tell the branches apart. Add `: "yes"` / `: "no"`.',
    );
  }
  if (audit.unreachable.length > 0) {
    notes.push(
      `Unreachable: ${audit.unreachable.map((id) => `\`${id}\``).join(", ")} ` +
        "— no arrow arrives, and the node is not a `start`, so it draws " +
        "detached from the flow and reads as a rendering fault.",
    );
  }
  if (audit.deadEnds.length > 0) {
    notes.push(
      `Dead ends: ${audit.deadEnds.map((id) => `\`${id}\``).join(", ")} ` +
        "— no arrow leaves, and the node is not an `end`, so the flow stops " +
        "without saying it finished.",
    );
  }
  return notes.length === 0 ? null : notes.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

export function validateFlowchart(source: string): McpTextResult {
  const read = readFlowchart(source);
  if (read.status === "error") return errorResult(read.message);

  const audit = auditFlowchart(read.file);
  return textResult(
    joinSections(
      `VALID as ${FLOWCHART_FORMAT_LABEL[read.format]}.`,
      renderSummary(read.file, audit),
      renderNodes(read.file),
      renderEdges(read.file),
      renderAudit(audit),
      // Stated on success, not only on the import path: a caller that
      // validated Mermaid and then saved the `.alab` has silently accepted the
      // loss, and this is the last place it can still act on it.
      read.format === "mermaid" ? MERMAID_FLOWCHART_CAVEAT : null,
      read.file.edges.length === 0
        ? "No edges: the document parses, but a flowchart with no arrows " +
            "records no flow. Add `from -> to` lines."
        : null,
    ),
  );
}

export function formatFlowchart(source: string): McpTextResult {
  const read = readFlowchart(source);
  if (read.status === "error") return errorResult(read.message);

  const canonical = serializeFlowchartText(read.file);
  return textResult(
    joinSections(
      "Canonical .alab flowchart text, read as " +
        `${FLOWCHART_FORMAT_LABEL[read.format]}.`,
      fence("", canonical),
      read.format === "mermaid" ? MERMAID_FLOWCHART_CAVEAT : null,
    ),
  );
}
