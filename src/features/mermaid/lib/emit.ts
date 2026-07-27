/**
 * arch-flow model → Mermaid C4 code: the reverse of `toModel.ts`.
 *
 * Emits one diagram of the file as a valid Mermaid C4 document — by default
 * the diagram the file's `x-mermaid.sourceDiagramId` points at (falling back
 * to `rootDiagramId`), so `serializeMermaidC4(parseMermaidC4(src))` targets
 * the same diagram the source described.
 *
 * Boundary blocks are reconstructed from the `x-mermaid.boundaries` tree and
 * the `boundary:<id>` membership tags; nodes and relationships map back
 * through the inverse of `mapping.ts`'s tables. Real line breaks re-encode
 * as `<br/>`, quotes as `\"`. Output is deterministic: iteration follows
 * the stored order of `nodes`, `edges` and the boundary list.
 *
 * Known lossy spots (documented): node `technology` has no slot on
 * Person/System forms; edge direction `none` emits as `Rel`; `code`-level
 * diagrams emit as `C4Component`.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { ArchFlowFile, C4Diagram, C4Node } from "@/types";

import {
  BOUNDARY_FORM_BY_KIND,
  DIAGRAM_TYPE_BY_LEVEL,
  toElementForm,
} from "./mapping";
import { escapeMermaidString } from "./text";
import { readMermaidExtension } from "./toModel";
import type { MermaidBoundary } from "./toModel";

export interface SerializeMermaidOptions {
  /**
   * Which diagram of the file to emit. Defaults to
   * `x-mermaid.sourceDiagramId` when present, else `rootDiagramId`.
   */
  diagramId?: string;
}

const INDENT = "    ";

/**
 * Serializes one diagram of an arch-flow file to Mermaid C4 code.
 * Pure: identical models always produce identical text.
 */
export function serializeMermaidC4(
  file: ArchFlowFile,
  options?: SerializeMermaidOptions,
): string {
  const extension = readMermaidExtension(file);
  const diagramId =
    options?.diagramId ?? extension?.sourceDiagramId ?? file.rootDiagramId;
  const diagram = file.diagrams.find((d) => d.id === diagramId);
  if (diagram === undefined) {
    throw new Error(
      `Cannot serialize to Mermaid: diagram "${diagramId}" does not exist in this file — ` +
        `known diagrams: ${file.diagrams.map((d) => d.id).join(", ") || "(none)"}.`,
    );
  }

  const boundaries: readonly MermaidBoundary[] =
    extension?.boundaries?.[diagram.id] ?? [];

  const lines: string[] = [DIAGRAM_TYPE_BY_LEVEL[diagram.level]];
  lines.push(`${INDENT}title ${diagram.title}`);

  /* --------------------------- boundary tree ----------------------------- */

  const childBoundaries = new Map<string | null, MermaidBoundary[]>();
  for (const boundary of boundaries) {
    const siblings = childBoundaries.get(boundary.parentId);
    if (siblings === undefined) {
      childBoundaries.set(boundary.parentId, [boundary]);
    } else {
      siblings.push(boundary);
    }
  }

  const membersByBoundary = new Map<string | null, C4Node[]>();
  const knownBoundaryIds = new Set(boundaries.map((boundary) => boundary.id));
  for (const node of diagram.nodes) {
    const membership = (node.tags ?? []).find((tag) =>
      tag.startsWith("boundary:"),
    );
    const boundaryId =
      membership !== undefined ? membership.slice("boundary:".length) : null;
    // A membership tag whose boundary is not in the tree degrades to loose.
    const key =
      boundaryId !== null && knownBoundaryIds.has(boundaryId)
        ? boundaryId
        : null;
    const members = membersByBoundary.get(key);
    if (members === undefined) membersByBoundary.set(key, [node]);
    else members.push(node);
  }

  /* ------------------------------ elements ------------------------------- */

  const emitNode = (node: C4Node, depth: number): void => {
    const tags = new Set(node.tags ?? []);
    const { form, spec } = toElementForm(node.type, tags, diagram.level);
    const args: string[] = [node.id, quote(node.name)];
    const technology = spec.argStyle === "tech" ? node.technology : undefined;
    const description = node.description;
    if (
      spec.argStyle === "tech" &&
      (technology !== undefined || description !== undefined)
    ) {
      args.push(quote(technology ?? ""));
    }
    if (description !== undefined) args.push(quote(description));
    lines.push(`${INDENT.repeat(depth)}${form}(${args.join(", ")})`);
  };

  const emitBoundary = (boundary: MermaidBoundary, depth: number): void => {
    const form = BOUNDARY_FORM_BY_KIND[boundary.kind];
    const args: string[] = [boundary.id, quote(boundary.label)];
    if (boundary.typeLabel !== undefined) args.push(quote(boundary.typeLabel));
    const pad = INDENT.repeat(depth);
    lines.push(`${pad}${form}(${args.join(", ")}) {`);
    for (const node of membersByBoundary.get(boundary.id) ?? []) {
      emitNode(node, depth + 1);
    }
    for (const child of childBoundaries.get(boundary.id) ?? []) {
      emitBoundary(child, depth + 1);
    }
    lines.push(`${pad}}`);
  };

  for (const node of membersByBoundary.get(null) ?? []) {
    emitNode(node, 1);
  }
  for (const boundary of childBoundaries.get(null) ?? []) {
    emitBoundary(boundary, 1);
  }

  /* --------------------------- relationships ----------------------------- */

  if (diagram.edges.length > 0) lines.push("");
  for (const edge of diagram.edges) {
    const form = edge.direction === "bidirectional" ? "BiRel" : "Rel";
    const args: string[] = [edge.source, edge.target];
    if (edge.label !== undefined || edge.technology !== undefined) {
      args.push(quote(edge.label ?? ""));
    }
    if (edge.technology !== undefined) args.push(quote(edge.technology));
    lines.push(`${INDENT}${form}(${args.join(", ")})`);
  }

  return `${lines.join("\n")}\n`;
}

/** Convenience overload target: emit a specific diagram object directly. */
export function serializeDiagramToMermaid(
  file: ArchFlowFile,
  diagram: C4Diagram,
): string {
  return serializeMermaidC4(file, { diagramId: diagram.id });
}

function quote(text: string): string {
  return `"${escapeMermaidString(text)}"`;
}
