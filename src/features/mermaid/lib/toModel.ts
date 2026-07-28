/**
 * AST → arch-lab model. Turns a parsed `MermaidDocument` into a complete
 * `ArchLabFile` that satisfies the editor's load-time validator
 * (`src/features/editor/io/validate.ts`) unchanged.
 *
 * Structural decisions (see the feature README for the full rationale):
 *
 *   - **Levels.** The diagram type picks the `C4Level`. Because a valid file
 *     must be rooted at a `context` diagram whose descendants step one level
 *     at a time, a `C4Container`/`C4Component` source gets synthetic wrapper
 *     diagram(s) above it: a context root whose single system node drills
 *     down into the parsed diagram (and, for component sources, an
 *     intermediate container diagram). `x-mermaid.sourceDiagramId` records
 *     which diagram the Mermaid code actually described.
 *
 *   - **Boundaries.** arch-lab has no first-class boundary container, so a
 *     boundary becomes (a) a `boundary:<id>` tag on each member node naming
 *     its innermost boundary, and (b) an entry in the file-level
 *     `x-mermaid.boundaries[<diagramId>]` list carrying the boundary's id,
 *     label, kind and parent — the nesting tree. The `x-…` field rides on
 *     `ArchLabFile`'s documented forward-tolerance index signature, so the
 *     editor's serializer preserves it verbatim.
 *
 *   - **Determinism.** Everything (ids, layout, tag order) derives only from
 *     the source text plus the fixed `timestamp` option, so the same input
 *     always produces the same model.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { ArchLabFile, C4Diagram, C4Edge, C4Node } from "@/types";

import { failAt } from "./errors";
import { layoutNodes, LONE_NODE_POSITION, sizeForNodeType } from "./layout";
import type { LayoutEdge } from "./layout";
import { LEVEL_BY_DIAGRAM_TYPE, toNodeType } from "./mapping";
import type { BoundaryKind } from "./mapping";
import type {
  ElementStmt,
  MermaidDocument,
  MermaidStatement,
  RelStmt,
  SourcePosition,
} from "./parser";

/* -------------------------------------------------------------------------- */
/* The x-mermaid extension field                                               */
/* -------------------------------------------------------------------------- */

/** Key of the converter's extension field on `ArchLabFile`. */
export const MERMAID_EXTENSION_KEY = "x-mermaid";

export interface MermaidBoundary {
  id: string;
  label: string;
  kind: BoundaryKind;
  /** Enclosing boundary id, or null for a top-level boundary. */
  parentId: string | null;
  /** Free type text of a generic `Boundary(alias, label, type)`. */
  typeLabel?: string;
}

export interface MermaidExtension {
  /** The diagram the Mermaid source actually described. */
  sourceDiagramId: string;
  /** Boundary trees, keyed by diagram id, in declaration order. */
  boundaries?: Record<string, MermaidBoundary[]>;
}

/** Reads the extension field back off a file, tolerating its absence. */
export function readMermaidExtension(
  file: ArchLabFile,
): MermaidExtension | null {
  const raw: unknown = file[MERMAID_EXTENSION_KEY];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (typeof record.sourceDiagramId !== "string") return null;
  return record as unknown as MermaidExtension;
}

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

export interface ParseMermaidOptions {
  /**
   * ISO-8601 timestamp written to `metadata.createdAt`/`updatedAt`. Defaults
   * to a fixed constant so that parsing is fully deterministic — pass
   * `new Date().toISOString()` if wall-clock provenance matters more than
   * byte-stable output.
   */
  timestamp?: string;
}

const DEFAULT_TIMESTAMP = "2026-01-01T00:00:00.000Z";
const DEFAULT_TITLE = "Untitled C4 diagram";

/* -------------------------------------------------------------------------- */
/* Conversion                                                                  */
/* -------------------------------------------------------------------------- */

interface CollectedElement {
  stmt: ElementStmt;
  /** Innermost enclosing boundary id, or null. */
  boundaryId: string | null;
}

/** UTF-16 code-unit comparison — locale-independent, so deterministic. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareById(a: { id: string }, b: { id: string }): number {
  return compareIds(a.id, b.id);
}

export function mermaidDocumentToArchLab(
  doc: MermaidDocument,
  options?: ParseMermaidOptions,
): ArchLabFile {
  const level = LEVEL_BY_DIAGRAM_TYPE[doc.diagramType];
  const timestamp = options?.timestamp ?? DEFAULT_TIMESTAMP;

  /* ------------------------- collect the statements ---------------------- */

  let title: string | null = null;
  const elements: CollectedElement[] = [];
  const boundaries: MermaidBoundary[] = [];
  const rels: RelStmt[] = [];
  const declaredAt = new Map<string, SourcePosition>();
  const boundaryIds = new Set<string>();

  const declare = (alias: string, at: SourcePosition): void => {
    const previous = declaredAt.get(alias);
    if (previous !== undefined) {
      failAt(
        at.line,
        at.column,
        `duplicate alias "${alias}" — it was already declared at line ${previous.line}, column ${previous.column}; every element and boundary needs a unique alias`,
        alias,
      );
    }
    declaredAt.set(alias, at);
  };

  const walk = (
    statements: readonly MermaidStatement[],
    boundaryId: string | null,
  ): void => {
    for (const stmt of statements) {
      switch (stmt.kind) {
        case "title":
          title = stmt.text;
          break;
        case "element":
          declare(stmt.alias, stmt);
          elements.push({ stmt, boundaryId });
          break;
        case "boundary": {
          declare(stmt.alias, stmt);
          boundaryIds.add(stmt.alias);
          const boundary: MermaidBoundary = {
            id: stmt.alias,
            label: stmt.label,
            kind: stmt.spec.kind,
            parentId: boundaryId,
          };
          if (stmt.typeLabel !== undefined) boundary.typeLabel = stmt.typeLabel;
          boundaries.push(boundary);
          walk(stmt.children, stmt.alias);
          break;
        }
        case "rel":
          rels.push(stmt);
          break;
      }
    }
  };
  walk(doc.statements, null);

  /* ------------------------------- edges --------------------------------- */

  const nodeIdSet = new Set(elements.map((element) => element.stmt.alias));
  const resolveEndpoint = (alias: string, rel: RelStmt): void => {
    if (nodeIdSet.has(alias)) return;
    if (boundaryIds.has(alias)) {
      failAt(
        rel.line,
        rel.column,
        `"${alias}" is a boundary, not an element — arch-lab relationships must connect two elements (Person, System, Container, …)`,
        alias,
      );
    }
    failAt(
      rel.line,
      rel.column,
      `"${alias}" does not resolve to any declared element — check the alias spelling in this ${rel.form}(…)`,
      alias,
    );
  };

  const edgeIdCounts = new Map<string, number>();
  const edges: C4Edge[] = rels.map((rel) => {
    resolveEndpoint(rel.from, rel);
    resolveEndpoint(rel.to, rel);
    const base = `e-${rel.from}-${rel.to}`;
    const seen = edgeIdCounts.get(base) ?? 0;
    edgeIdCounts.set(base, seen + 1);
    const edge: C4Edge = {
      id: seen === 0 ? base : `${base}-${seen + 1}`,
      source: rel.from,
      target: rel.to,
      direction: rel.spec.bidirectional ? "bidirectional" : "forward",
    };
    if (rel.label !== undefined) edge.label = rel.label;
    if (rel.technology !== undefined) edge.technology = rel.technology;
    return edge;
  });
  edges.sort(compareById);

  /* ------------------------------- nodes --------------------------------- */

  // Canonical order — sorted by id, the data-model's own write rule — so the
  // model (and the layout derived from it) is independent of how statements
  // interleave with boundary blocks in the source. This is what makes
  // parse → serialize → parse stable even though the emitter regroups nodes
  // by boundary.
  const sortedElements = [...elements].sort((a, b) =>
    compareIds(a.stmt.alias, b.stmt.alias),
  );
  const nodeIds = sortedElements.map((element) => element.stmt.alias);
  const layoutEdges: LayoutEdge[] = edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
  }));
  const positions = layoutNodes(nodeIds, layoutEdges);

  const nodes: C4Node[] = sortedElements.map(({ stmt, boundaryId }) => {
    const { type, tags } = toNodeType(stmt.spec, level);
    if (boundaryId !== null) tags.push(`boundary:${boundaryId}`);
    tags.sort();
    const node: C4Node = {
      id: stmt.alias,
      type,
      name: stmt.label,
      position: positions.get(stmt.alias) ?? { ...LONE_NODE_POSITION },
      size: sizeForNodeType(type),
    };
    if (stmt.description !== undefined) node.description = stmt.description;
    if (stmt.technology !== undefined) node.technology = stmt.technology;
    if (tags.length > 0) node.tags = tags;
    return node;
  });

  /* ------------------------------ diagrams ------------------------------- */

  const fileTitle = title ?? DEFAULT_TITLE;
  const mainId = `d-${level}-main`;
  const main: C4Diagram = {
    id: mainId,
    level,
    title: fileTitle,
    ownerNodeId: null,
    parentDiagramId: null,
    nodes,
    edges,
  };

  const diagrams: C4Diagram[] = [main];
  let rootDiagramId = mainId;

  const uniqueNodeId = (wanted: string): string => {
    let id = wanted;
    let n = 1;
    while (nodeIdSet.has(id)) {
      n += 1;
      id = `${wanted}-${n}`;
    }
    nodeIdSet.add(id);
    return id;
  };

  if (level === "container" || level === "component") {
    // Synthetic context root whose single system drills into the next level.
    const rootId = "d-context-root";
    const scopeSystemId = uniqueNodeId("scope-system");
    rootDiagramId = rootId;

    let childOfRoot = mainId;
    if (level === "component") {
      // Intermediate container diagram to keep levels one step apart.
      const scopeContainerId = uniqueNodeId("scope-container");
      const containerId = "d-container-scope";
      diagrams.push({
        id: containerId,
        level: "container",
        title: `${fileTitle} — container scope`,
        ownerNodeId: scopeSystemId,
        parentDiagramId: rootId,
        nodes: [
          {
            id: scopeContainerId,
            type: "container",
            name: fileTitle,
            position: { ...LONE_NODE_POSITION },
            size: sizeForNodeType("container"),
            childDiagramId: mainId,
          },
        ],
        edges: [],
      });
      main.ownerNodeId = scopeContainerId;
      main.parentDiagramId = containerId;
      childOfRoot = containerId;
    } else {
      main.parentDiagramId = rootId;
      main.ownerNodeId = scopeSystemId;
    }

    diagrams.push({
      id: rootId,
      level: "context",
      title: `${fileTitle} — context scope`,
      ownerNodeId: null,
      parentDiagramId: null,
      nodes: [
        {
          id: scopeSystemId,
          type: "softwareSystem",
          name: fileTitle,
          position: { ...LONE_NODE_POSITION },
          size: sizeForNodeType("softwareSystem"),
          childDiagramId: childOfRoot,
        },
      ],
      edges: [],
    });
  }

  diagrams.sort(compareById);

  /* -------------------------------- file --------------------------------- */

  const file: ArchLabFile = {
    version: "1.0",
    metadata: {
      title: fileTitle,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    rootDiagramId,
    diagrams,
  };

  if (boundaries.length > 0 || rootDiagramId !== mainId) {
    const extension: MermaidExtension = { sourceDiagramId: mainId };
    if (boundaries.length > 0) {
      extension.boundaries = { [mainId]: boundaries };
    }
    file[MERMAID_EXTENSION_KEY] = extension;
  }

  return file;
}
