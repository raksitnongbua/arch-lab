/**
 * `describe_model` — read the shape of a model without paying for its text.
 *
 * The question an agent actually has ("what is in here, and where would my
 * change go?") is answered by the drill-down TREE, not by the file. A 60 kB
 * model describes itself in a few hundred tokens here, and the caller can
 * then ask for exactly the one diagram it needs.
 *
 * The tree is built from the same two pointers the format itself uses —
 * `parentDiagramId` upward and `childDiagramId` on nodes downward — so what
 * this prints is the navigation the viewer would actually offer.
 */

import type { ArchLabFile, C4Diagram, C4Edge, C4Node } from "@/types";
import type { CheckChoice } from "@/features/validate/lib/check";

import { readSource } from "../lib/read";
import {
  errorResult,
  formatNote,
  joinSections,
  textResult,
  type McpTextResult,
} from "../lib/render";

/* -------------------------------------------------------------------------- */
/* Node and edge lines                                                         */
/* -------------------------------------------------------------------------- */

/** `orders-service:container "Orders Service" [Go 1.22] #critical-path → cmp-orders` */
function describeNode(node: C4Node): string {
  const parts = [`${node.id}:${node.type} ${JSON.stringify(node.name)}`];
  if (node.technology !== undefined) parts.push(`[${node.technology}]`);
  if (node.tags !== undefined && node.tags.length > 0) {
    parts.push(node.tags.map((tag) => `#${tag}`).join(" "));
  }
  if (typeof node.childDiagramId === "string") {
    parts.push(`→ ${node.childDiagramId}`);
  }
  if (node.childRef !== undefined)
    parts.push(`→ ${node.childRef} (other file)`);
  if (node.externalRef !== undefined) parts.push("(external placeholder)");
  return parts.join(" ");
}

/** The `.alab` arrow for an edge, so the listing reads like the source would. */
function arrowFor(edge: C4Edge): string {
  const dashed = edge.style === "dashed";
  if (edge.direction === "bidirectional") return dashed ? "<..>" : "<->";
  if (edge.direction === "none") return dashed ? ".." : "--";
  return dashed ? "..>" : "->";
}

function describeDiagramBody(diagram: C4Diagram): string {
  const lines: string[] = [];
  if (diagram.description !== undefined) {
    lines.push(`    ${diagram.description}`);
  }
  for (const node of diagram.nodes) lines.push(`    ${describeNode(node)}`);
  for (const edge of diagram.edges) {
    const label =
      edge.label === undefined ? "" : ` : ${JSON.stringify(edge.label)}`;
    const tech = edge.technology === undefined ? "" : ` [${edge.technology}]`;
    lines.push(
      `    ${edge.source} ${arrowFor(edge)} ${edge.target}${label}${tech}`,
    );
  }
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* The drill-down tree                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Renders the diagram hierarchy depth-first from the root, indenting each
 * level. Diagrams that no drill-down reaches are listed separately rather
 * than dropped — an unreachable diagram is exactly the kind of thing the
 * caller needs told about.
 */
function renderTree(file: ArchLabFile, includeContents: boolean): string {
  const byId = new Map(file.diagrams.map((diagram) => [diagram.id, diagram]));
  const visited = new Set<string>();
  const lines: string[] = [];

  const walk = (diagramId: string, depth: number): void => {
    const diagram = byId.get(diagramId);
    if (diagram === undefined || visited.has(diagramId)) return;
    visited.add(diagramId);

    const indent = "  ".repeat(depth);
    lines.push(
      `${indent}@${diagram.level} ${diagram.id} ${JSON.stringify(diagram.title)} ` +
        `— ${diagram.nodes.length} node(s), ${diagram.edges.length} edge(s)`,
    );
    if (includeContents) {
      const body = describeDiagramBody(diagram);
      if (body !== "") {
        lines.push(
          body
            .split("\n")
            .map((line) => `${indent}${line}`)
            .join("\n"),
        );
      }
    }

    for (const node of diagram.nodes) {
      if (typeof node.childDiagramId === "string") {
        walk(node.childDiagramId, depth + 1);
      }
    }
  };

  walk(file.rootDiagramId, 0);

  const orphans = file.diagrams.filter((diagram) => !visited.has(diagram.id));
  if (orphans.length > 0) {
    lines.push("");
    lines.push(
      "Not reachable by drill-down from the root " +
        "(no node points at them with `>`):",
    );
    for (const diagram of orphans) {
      lines.push(
        `  @${diagram.level} ${diagram.id} ${JSON.stringify(diagram.title)} ` +
          `— parent: ${diagram.parentDiagramId ?? "(none)"}, ` +
          `owner: ${diagram.ownerNodeId ?? "(none)"}`,
      );
    }
  }

  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Tool                                                                        */
/* -------------------------------------------------------------------------- */

export function describeModel(
  source: string,
  format: CheckChoice,
  includeContents: boolean,
): McpTextResult {
  const read = readSource(source, format);
  if (read.status === "error") return errorResult(read.message);

  const { file, summary, format: actual, autoDetected } = read.value;
  const { metadata } = file;

  const header = [
    `Title:    ${metadata.title}`,
    metadata.description === undefined
      ? null
      : `Summary:  ${metadata.description}`,
    metadata.owner === undefined ? null : `Owner:    ${metadata.owner}`,
    metadata.tags === undefined || metadata.tags.length === 0
      ? null
      : `Tags:     ${metadata.tags.map((tag) => `#${tag}`).join(" ")}`,
    `Root:     ${file.rootDiagramId}`,
    `Totals:   ${summary.diagrams.length} diagram(s), ` +
      `${summary.nodeCount} node(s), ${summary.edgeCount} edge(s)`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return textResult(
    joinSections(
      `Read as ${formatNote(actual, autoDetected)}.`,
      header,
      "Drill-down hierarchy:",
      renderTree(file, includeContents),
      includeContents
        ? null
        : "Call again with include_contents=true to list the nodes and edges " +
            "of every diagram.",
    ),
  );
}
