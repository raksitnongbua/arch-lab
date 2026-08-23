/**
 * `validate_usecase` and `format_usecase` — the use-case document's half of the
 * write-then-check loop.
 *
 * WHY A FOURTH PAIR rather than a `kind` argument: the argument `tools/
 * sequence.ts` makes, holding for the third time. The C4 tools return diagrams
 * with C4 levels, the sequence tools return participants and ordered messages,
 * the flowchart tools return a directed graph with guards and reachability — and
 * a use-case document is none of those. It is a statement about WHO may do WHAT
 * and where the system's edge falls, so the facts worth reporting are actors and
 * their reach, the boundary's contents, and the include/extend structure. Four
 * document kinds, four tools, each with an honest summary.
 *
 * The reader is `parseUseCaseInput` — the SAME one the `/live?d=uc` playground
 * uses, itself a thin shell over `parseUseCaseText` and `parseMermaidUseCase`.
 * So "the MCP server accepted it" means the playground renders it too, which is
 * the guarantee `lib/read.ts` makes for C4 and the reason no second grammar is
 * allowed to exist here either.
 */

import type { UseCaseLabFile } from "@/types/usecase";

import { serializeUseCaseText } from "@/features/archtext";
/* THE VIEWER'S OWN LAYOUT, called server-side — pure, no DOM, so the check
   scripts can run it and this tool can answer "how big will it be?" with the
   geometry the browser will draw. Imported from `lib/layout` rather than the
   feature barrel, exactly as `tools/flowchart.ts` imports `layoutFlowchart`:
   the barrel re-exports `.tsx` components and `scripts/mcp-check.mjs` loads
   this module through Node's type stripping, which cannot resolve one. */
import { layoutUseCase } from "@/features/usecase/lib/layout";
import {
  MERMAID_USECASE_CAVEAT,
  parseUseCaseInput,
  USECASE_FORMAT_LABEL,
  type UseCaseInputError,
  type UseCaseSourceFormat,
} from "@/features/usecase/input/parse";

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

function renderReadError(error: UseCaseInputError): string {
  if (error.kind === "parse") {
    return joinSections(
      `INVALID as ${USECASE_FORMAT_LABEL[error.format]}.`,
      `line ${error.line}, column ${error.column}: ${error.message}`,
      // `lineText: null` means the location is past the last line (an
      // unexpected end of input) — there is nothing to quote and the message
      // already says where.
      error.lineText === null
        ? null
        : quoteSourceLine(error.lineText, error.line, error.column),
    );
  }
  return error.message;
}

export type ReadUseCaseResult =
  | { status: "ok"; file: UseCaseLabFile; format: UseCaseSourceFormat }
  | {
      status: "error";
      kind: UseCaseInputError["kind"] | "size";
      message: string;
    };

export function readUseCase(source: string): ReadUseCaseResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", kind: "size", message: size.message };

  const result = parseUseCaseInput(source);
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
 * The facts an agent writing a diagram it cannot see has no other way to learn.
 * Every one describes a document that PARSES — the grammar already rejects an
 * actor inside a boundary, an actor–actor association and a mixed-kind
 * generalization — yet still says something a reviewer would call wrong:
 *
 *   - `idleActors`    — an actor with no association at all. Drawn beside the
 *     system doing nothing, which is either a missing line or a participant who
 *     does not belong in the diagram.
 *   - `unreachedCases`— a use case no actor is associated with, and which no
 *     other use case includes or extends. A capability nobody can invoke.
 *   - `looseCases`    — a use case in no boundary. Legal (the grammar allows
 *     it), but the whole point of the diagram is where the system's edge falls,
 *     so a floating capability is worth naming.
 *   - `emptyBoundaries` — a boundary with no use cases: a system that offers
 *     nothing.
 *   - `cycles`        — an `include`/`extend` or generalization cycle. UML
 *     forbids both; a cycle makes the relationship meaningless and the layout
 *     arbitrary.
 */
interface UseCaseAudit {
  idleActors: string[];
  unreachedCases: string[];
  looseCases: string[];
  emptyBoundaries: string[];
  cycles: string[];
}

function auditUseCase(file: UseCaseLabFile): UseCaseAudit {
  const actors = file.elements.filter((e) => e.kind === "actor");
  const cases = file.elements.filter((e) => e.kind === "usecase");

  const associated = new Set<string>();
  for (const edge of file.edges) {
    if (edge.kind !== "association") continue;
    associated.add(edge.from);
    associated.add(edge.to);
  }
  const dependedOn = new Set<string>();
  for (const edge of file.edges) {
    if (edge.kind === "association") continue;
    dependedOn.add(edge.to);
    dependedOn.add(edge.from);
  }

  const inBoundary = new Set<string>();
  for (const boundary of file.boundaries ?? []) {
    for (const id of boundary.usecases) inBoundary.add(id);
  }

  /* Cycle detection over the DIRECTED non-association edges only. Associations
     are undirected and cannot form a meaningful cycle; dependencies and
     generalizations are both directed and both must be acyclic, so one walk
     covers them. Iterative colouring rather than recursion — a deep chain in a
     caller's document must not overflow a serverless stack. */
  const outgoing = new Map<string, string[]>();
  for (const edge of file.edges) {
    if (edge.kind === "association") continue;
    const list = outgoing.get(edge.from);
    if (list === undefined) outgoing.set(edge.from, [edge.to]);
    else list.push(edge.to);
  }
  const cycles: string[] = [];
  const state = new Map<string, 0 | 1 | 2>();
  for (const element of file.elements) {
    if (state.get(element.id) !== undefined) continue;
    const stack: Array<{ id: string; next: number }> = [
      { id: element.id, next: 0 },
    ];
    state.set(element.id, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const targets = outgoing.get(frame.id) ?? [];
      if (frame.next >= targets.length) {
        state.set(frame.id, 2);
        stack.pop();
        continue;
      }
      const target = targets[frame.next];
      frame.next += 1;
      const seen = state.get(target);
      if (seen === 1) {
        const at = stack.findIndex((f) => f.id === target);
        const loop = stack.slice(at === -1 ? 0 : at).map((f) => f.id);
        cycles.push([...loop, target].join(" → "));
        continue;
      }
      if (seen === undefined) {
        state.set(target, 1);
        stack.push({ id: target, next: 0 });
      }
    }
  }

  return {
    idleActors: actors.filter((a) => !associated.has(a.id)).map((a) => a.id),
    unreachedCases: cases
      .filter((c) => !associated.has(c.id) && !dependedOn.has(c.id))
      .map((c) => c.id),
    looseCases: cases.filter((c) => !inBoundary.has(c.id)).map((c) => c.id),
    emptyBoundaries: (file.boundaries ?? [])
      .filter((b) => b.usecases.length === 0)
      .map((b) => b.label),
    cycles,
  };
}

function renderElements(file: UseCaseLabFile): string {
  const rows = file.elements.map((element) => {
    const tech =
      element.technology === undefined ? "" : ` [${element.technology}]`;
    return `| \`${element.id}\` | ${element.label}${tech} | ${element.kind} |`;
  });
  return ["| Id | Label | Kind |", "| --- | --- | --- |", ...rows].join("\n");
}

/** The edges as `.alab` lines, so a caller sees the exact syntax to edit. */
function renderEdges(file: UseCaseLabFile): string {
  if (file.edges.length === 0) return "";
  const rows = file.edges.map((edge) => {
    if (edge.kind === "association") {
      const label = edge.label === undefined ? "" : ` : "${edge.label}"`;
      return `${edge.from} -- ${edge.to}${label}`;
    }
    if (edge.kind === "dependency") {
      return `${edge.from} ..> ${edge.to} : ${edge.stereotype}`;
    }
    return `${edge.from} --|> ${edge.to}`;
  });
  return fence("", rows.join("\n"));
}

function renderSummary(file: UseCaseLabFile): string {
  const actors = file.elements.filter((e) => e.kind === "actor").length;
  const cases = file.elements.length - actors;
  const byKind = { association: 0, dependency: 0, generalization: 0 };
  for (const edge of file.edges) byKind[edge.kind] += 1;

  const layout = layoutUseCase(file);
  const lines = [
    `Title: ${file.metadata.title}`,
    `Actors: ${actors}`,
    `Use cases: ${cases}`,
    `Edges: ${byKind.association} association, ${byKind.dependency} ` +
      `dependency, ${byKind.generalization} generalization`,
  ];
  const boundaries = file.boundaries ?? [];
  if (boundaries.length > 0) {
    lines.push(
      `Boundaries: ${boundaries
        .map((b) => `${b.label} (${b.usecases.length})`)
        .join(", ")}`,
    );
  }
  lines.push(
    `Size: ${Math.round(layout.width)} x ${Math.round(layout.height)} px.`,
  );
  return lines.join("\n");
}

/**
 * The audit, rendered only when it has something to say, and worded as the
 * REMEDY rather than the complaint — the caller is a model about to edit the
 * document, and "give this actor an association" is actionable where "idle
 * actor" is a label it must translate first.
 */
function renderAudit(audit: UseCaseAudit): string | null {
  const ids = (list: string[]): string =>
    list.map((id) => `\`${id}\``).join(", ");
  const notes: string[] = [];
  if (audit.cycles.length > 0) {
    notes.push(
      `Cycles: ${audit.cycles.join("; ")} — an include/extend or ` +
        "generalization cycle is forbidden in UML and makes the relationship " +
        "meaningless. Break it.",
    );
  }
  if (audit.idleActors.length > 0) {
    notes.push(
      `Actors with nothing to do: ${ids(audit.idleActors)} — no association, ` +
        "so they are drawn beside the system doing nothing. Either give them " +
        "a `--` line to a use case, or remove them.",
    );
  }
  if (audit.unreachedCases.length > 0) {
    notes.push(
      `Use cases nobody can invoke: ${ids(audit.unreachedCases)} — no actor ` +
        "is associated with them and no other use case includes or extends " +
        "them, so nothing in the diagram can reach them.",
    );
  }
  if (audit.looseCases.length > 0) {
    notes.push(
      `Outside every boundary: ${ids(audit.looseCases)} — legal, but a ` +
        "use-case diagram exists to show where the system's edge falls, and " +
        "these sit nowhere. Put them in a `boundary` if they are yours.",
    );
  }
  if (audit.emptyBoundaries.length > 0) {
    notes.push(
      `Empty boundaries: ${audit.emptyBoundaries
        .map((label) => JSON.stringify(label))
        .join(", ")} — a system that offers nothing.`,
    );
  }
  return notes.length === 0 ? null : notes.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

export function validateUseCase(source: string): McpTextResult {
  const read = readUseCase(source);
  if (read.status === "error") return errorResult(read.message);

  return textResult(
    joinSections(
      `VALID as ${USECASE_FORMAT_LABEL[read.format]}.`,
      renderSummary(read.file),
      renderElements(read.file),
      renderEdges(read.file),
      renderAudit(auditUseCase(read.file)),
      // Stated on success, not only on the import path: a caller that
      // validated Mermaid and then saved the `.alab` has silently accepted the
      // loss, and this is the last place it can still act on it.
      read.format === "mermaid" ? MERMAID_USECASE_CAVEAT : null,
      read.file.edges.length === 0
        ? "No edges: the document parses, but a use-case diagram with no " +
            "lines says nobody can do anything. Add `actor -- usecase` lines."
        : null,
    ),
  );
}

export function formatUseCase(source: string): McpTextResult {
  const read = readUseCase(source);
  if (read.status === "error") return errorResult(read.message);

  return textResult(
    joinSections(
      "Canonical .alab use-case text, read as " +
        `${USECASE_FORMAT_LABEL[read.format]}.`,
      fence("", serializeUseCaseText(read.file)),
      read.format === "mermaid" ? MERMAID_USECASE_CAVEAT : null,
    ),
  );
}
