/**
 * `FlowchartLabFile` → Mermaid `flowchart` code: the reverse of
 * `./flowchart.ts`, sitting beside `./sequence-emit.ts` as the emitting
 * half of the third dialect. Both directions read the SAME bracket table
 * (`./flowchart-mapping.ts`), so what this writes is by construction what
 * the importer reads back.
 *
 * WHAT MERMAID CANNOT HOLD, and therefore what this drops — the same
 * honesty contract as the other export caveat, stated by
 * `MERMAID_FLOWCHART_EXPORT_CAVEAT`:
 *
 *   - `desc`, `[technology]` and `#tag`s on a node. Mermaid's node text is
 *     one string; folding structured fields into it would turn data into a
 *     naming convention (the sequence emitter's argument, unchanged).
 *   - A group's `tint`. A subgraph takes no colour without a `style` line,
 *     and emitting styling would contradict the import side dropping it.
 *   - Everything the `.alab` HEADER carries beyond the title: description,
 *     owner, tags, timestamps, and any `!` forward-compatible field. The
 *     title itself rides YAML frontmatter, which Mermaid does render.
 *   - The START/END distinction, structurally: both write the stadium
 *     terminator, and the importer tells them apart by the arrows (the
 *     essay in `./flowchart-mapping.ts`) — so a `start` someone points an
 *     arrow INTO changes shape on the way back.
 *   - An EMPTY edge label (`: ""`). It writes as no label at all; empty and
 *     absent are one spelling in Mermaid's pipe form.
 *
 * Nothing else is lost: every node keeps its shape and label, every group
 * becomes a subgraph around the same contiguous run, every edge keeps its
 * label and order, and the title survives.
 *
 * Deterministic — identical models always produce identical text, iteration
 * follows the model's own order, and
 * `parseMermaidFlowchart(serialize(file))` reproduces everything above the
 * loss line (`scripts/mermaid-check.mjs` pins that round trip).
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { FlowchartGroup, FlowchartLabFile, FlowchartNode } from "@/types";

import { escapeMermaidString, mermaidPipeLabel, mermaidSafeId } from "./text";
import {
  BRACKETS_BY_SHAPE,
  MERMAID_FLOWCHART_ARROW,
} from "./flowchart-mapping";
import type { MermaidFlowchartDirection } from "./flowchart-mapping";

/** What an EXPORT to Mermaid drops. The mirror of
 * `MERMAID_FLOWCHART_CAVEAT`, which describes the trip the other way. */
export const MERMAID_FLOWCHART_EXPORT_CAVEAT =
  "Mermaid flowchart cannot hold everything a .alab flowchart can: a " +
  "node's desc detail, [technology] and #tags, a group's tint, and every " +
  "header field except the title (description, owner, tags, timestamps) " +
  "have no Mermaid equivalent and are left behind, start and end both draw " +
  "as Mermaid's one stadium terminator and are told apart on re-import by " +
  "their arrows (so a start with an incoming arrow comes back as an end), " +
  "ids outside Mermaid's safe alphabet are renamed, and an empty edge label " +
  "comes back as no label. Everything else survives: every node with its " +
  "shape and label, every group as a subgraph, every edge with its label " +
  "and order, and the title (as frontmatter).";

export interface SerializeMermaidFlowchartOptions {
  /** The layout word written after `flowchart`. An option, not model data:
   * the model carries no layout on purpose (see the direction essay in
   * `./flowchart.ts`), so the choice belongs to whoever is exporting.
   * Default `"TD"`, the direction Mermaid's own docs lead with. */
  direction?: MermaidFlowchartDirection;
}

const INDENT = "    ";

/** The shared substitution rule (see `mermaidSafeId`); `n_` = node. */
function mermaidId(id: string): string {
  return mermaidSafeId(id, "n_");
}

/** A node's shape and label as one token: the bracket pair from the shared
 * table around an always-quoted label — quoting every label costs nothing
 * and closes the bracket-in-label ambiguity for good. */
function nodeToken(node: FlowchartNode): string {
  const [open, close] = BRACKETS_BY_SHAPE[node.shape];
  return `${mermaidId(node.id)}${open}"${escapeMermaidString(node.label)}"${close}`;
}

/**
 * Serializes a `FlowchartLabFile` to Mermaid `flowchart` code. Pure and
 * deterministic. Throws a plain `Error` only for a model no flowchart
 * validator would pass anyway (a group whose members are not a contiguous
 * run of `nodes`) — the same contract as the `.alab` serializer, which
 * refuses the same model for the same reason.
 */
export function serializeMermaidFlowchart(
  file: FlowchartLabFile,
  options?: SerializeMermaidFlowchartOptions,
): string {
  const lines: string[] = [];

  /* Mermaid's flowchart grammar has no title keyword; YAML frontmatter is
     where a title lives. JSON-quoted, which is valid YAML and exactly what
     the importer reads back. */
  const title = file.metadata.title;
  if (typeof title === "string" && title !== "") {
    lines.push("---", `title: ${JSON.stringify(title)}`, "---");
  }
  lines.push(`flowchart ${options?.direction ?? "TD"}`);

  /* ------------------------------- nodes -------------------------------- */
  /* Walked in model order with subgraphs opened as their first member is
     reached — the same drive-from-the-array rule every emitter in this
     repo follows, because `nodes` IS the declaration order. */
  const groups = file.groups ?? [];
  const groupByMember = new Map<string, FlowchartGroup>();
  for (const group of groups) {
    for (const id of group.nodes) groupByMember.set(id, group);
  }
  const opened = new Set<FlowchartGroup>();
  let open: FlowchartGroup | null = null;
  for (const node of file.nodes) {
    const group = groupByMember.get(node.id) ?? null;
    if (group !== open) {
      if (open !== null) lines.push(`${INDENT}end`);
      open = group;
      if (group !== null) {
        if (opened.has(group)) {
          throw new Error(
            `serializeMermaidFlowchart: the group ${JSON.stringify(group.label)} is not a contiguous run of nodes ("${node.id}" is outside it) — a Mermaid subgraph cannot spell that, and neither can .alab`,
          );
        }
        opened.add(group);
        lines.push(
          `${INDENT}subgraph sg${groups.indexOf(group) + 1} ["${escapeMermaidString(group.label)}"]`,
        );
      }
    }
    lines.push(`${INDENT}${group === null ? "" : INDENT}${nodeToken(node)}`);
  }
  if (open !== null) lines.push(`${INDENT}end`);

  /* ------------------------------- edges -------------------------------- */
  for (const edge of file.edges) {
    lines.push(
      `${INDENT}${mermaidId(edge.from)} ${MERMAID_FLOWCHART_ARROW}${mermaidPipeLabel(edge.label)} ${mermaidId(edge.to)}`,
    );
  }

  return `${lines.join("\n")}\n`;
}
