/**
 * Load-time validation of a parsed `.archflow.json` document (T3-A,
 * AF-E5-S2). Implements the eight HARD errors of
 * `docs/product/data-model.md` §"Validation rules (load-time)" — a file that
 * trips any of them is refused with the offending JSON path named. The
 * warnings list (back-pointer mismatches, orphaned placeholders, …) is
 * explicitly out of scope this sprint (AF-E2-S6, v0.3).
 *
 * This module is imported by `scripts/roundtrip-check.mjs` through Node's
 * type stripping: keep the syntax erasable (no enums, no namespaces, no
 * parameter properties) and keep type-only imports as `import type`.
 */

import { C4_LEVELS, childLevelOf, VALID_NODE_TYPES_BY_LEVEL } from "@/types";
import type { ArchFlowFile, C4Level, C4NodeType } from "@/types";

/** The newest schema MAJOR this build can read and write ("1.x"). */
export const SUPPORTED_MAJOR_VERSION = 1;

export interface ValidationIssue {
  /** JSON path of the offending value, e.g. `diagrams[1].nodes[3].type`. */
  path: string;
  message: string;
}

/**
 * Thrown by `validateArchFlowFile` / `deserializeModel`. The message is
 * user-presentable and always names the first offending JSON path; the full
 * list is on `issues`.
 */
export class FileValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    const first = issues[0] ?? {
      path: "(file)",
      message: "the file failed validation",
    };
    const more =
      issues.length > 1
        ? ` (and ${issues.length - 1} more problem${issues.length > 2 ? "s" : ""})`
        : "";
    super(`${first.path}: ${first.message}${more}`);
    this.name = "FileValidationError";
    this.issues = issues;
  }
}

/* -------------------------------------------------------------------------- */
/* Narrowing helpers                                                          */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isXY(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function describe(value: unknown): string {
  if (value === undefined) return "is missing";
  if (typeof value === "string") return `"${value}"`;
  return JSON.stringify(value) ?? String(value);
}

const LEVELS: readonly string[] = C4_LEVELS;
const EDGE_DIRECTIONS: readonly string[] = ["forward", "bidirectional", "none"];
const EDGE_STYLES: readonly string[] = ["solid", "dashed"];

/* -------------------------------------------------------------------------- */
/* The validator                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Validates a parsed JSON document against schema v1 and the eight load-time
 * hard errors. Returns the same object, typed, on success; throws
 * `FileValidationError` (never mutating the input) on any failure.
 */
export function validateArchFlowFile(input: unknown): ArchFlowFile {
  if (!isRecord(input)) {
    throw new FileValidationError([
      {
        path: "(file)",
        message:
          "the file is not a JSON object — is this an arch-flow diagram?",
      },
    ]);
  }

  /* -- Hard error 1: version major exceeds ours. Checked first and alone, --
     -- so a newer file gets the upgrade message, not shape noise.         -- */
  const version = input.version;
  if (typeof version !== "string" || !/^\d+\.\d+$/.test(version)) {
    throw new FileValidationError([
      {
        path: "version",
        message: `${describe(version)} is not a valid schema version — expected "MAJOR.MINOR", e.g. "1.0"`,
      },
    ]);
  }
  const major = Number.parseInt(version, 10);
  if (major > SUPPORTED_MAJOR_VERSION) {
    throw new FileValidationError([
      {
        path: "version",
        message:
          `"${version}" was written by a newer arch-flow than this one, which supports up to ` +
          `${SUPPORTED_MAJOR_VERSION}.x. Upgrade arch-flow to open this file — opening it here ` +
          "would silently drop data it cannot understand.",
      },
    ]);
  }

  const issues: ValidationIssue[] = [];
  const problem = (path: string, message: string): void => {
    issues.push({ path, message });
  };

  /* ------------------------------- shape -------------------------------- */

  const metadata = input.metadata;
  if (!isRecord(metadata)) {
    problem("metadata", `${describe(metadata)} — expected an object`);
  } else {
    if (!isNonEmptyString(metadata.title)) {
      problem(
        "metadata.title",
        `${describe(metadata.title)} — expected a non-empty string`,
      );
    }
    if (!isNonEmptyString(metadata.createdAt)) {
      problem(
        "metadata.createdAt",
        `${describe(metadata.createdAt)} — expected an ISO-8601 timestamp`,
      );
    }
    if (!isNonEmptyString(metadata.updatedAt)) {
      problem(
        "metadata.updatedAt",
        `${describe(metadata.updatedAt)} — expected an ISO-8601 timestamp`,
      );
    }
  }

  const rootDiagramId = input.rootDiagramId;
  if (!isNonEmptyString(rootDiagramId)) {
    problem(
      "rootDiagramId",
      `${describe(rootDiagramId)} — expected the id of the Context-level diagram`,
    );
  }

  const diagrams = input.diagrams;
  if (!Array.isArray(diagrams)) {
    problem(
      "diagrams",
      `${describe(diagrams)} — expected an array of diagrams`,
    );
    throw new FileValidationError(issues);
  }

  /* --------------------------- per-diagram shape ------------------------ */

  interface SeenDiagram {
    path: string;
    level: C4Level | null;
    parentDiagramId: string | null;
    nodeIds: Set<string>;
  }

  const diagramByIndex: (SeenDiagram | null)[] = [];
  const diagramById = new Map<string, SeenDiagram>();
  const nodePathById = new Map<string, string>();
  const edgePathById = new Map<string, string>();

  diagrams.forEach((diagram: unknown, i: number) => {
    const dPath = `diagrams[${i}]`;
    if (!isRecord(diagram)) {
      problem(dPath, `${describe(diagram)} — expected a diagram object`);
      diagramByIndex.push(null);
      return;
    }

    const seen: SeenDiagram = {
      path: dPath,
      level: null,
      parentDiagramId: null,
      nodeIds: new Set<string>(),
    };
    diagramByIndex.push(seen);

    if (!isNonEmptyString(diagram.id)) {
      problem(
        `${dPath}.id`,
        `${describe(diagram.id)} — expected a non-empty string`,
      );
    } else if (diagramById.has(diagram.id)) {
      /* Hard error 3 (diagrams). */
      problem(
        `${dPath}.id`,
        `duplicate diagram id "${diagram.id}" — already used by ${diagramById.get(diagram.id)?.path}`,
      );
    } else {
      diagramById.set(diagram.id, seen);
    }

    if (typeof diagram.level !== "string" || !LEVELS.includes(diagram.level)) {
      problem(
        `${dPath}.level`,
        `${describe(diagram.level)} is not a C4 level — expected one of ${LEVELS.join(", ")}`,
      );
    } else {
      seen.level = diagram.level as C4Level;
    }

    if (!isNonEmptyString(diagram.title)) {
      problem(
        `${dPath}.title`,
        `${describe(diagram.title)} — expected a non-empty string`,
      );
    }
    if (
      diagram.ownerNodeId !== null &&
      !isNonEmptyString(diagram.ownerNodeId)
    ) {
      problem(
        `${dPath}.ownerNodeId`,
        `${describe(diagram.ownerNodeId)} — expected a node id or null`,
      );
    }
    if (
      diagram.parentDiagramId !== null &&
      !isNonEmptyString(diagram.parentDiagramId)
    ) {
      problem(
        `${dPath}.parentDiagramId`,
        `${describe(diagram.parentDiagramId)} — expected a diagram id or null`,
      );
    } else if (typeof diagram.parentDiagramId === "string") {
      seen.parentDiagramId = diagram.parentDiagramId;
    }
    if (diagram.viewport !== undefined) {
      const v = diagram.viewport;
      if (
        !isRecord(v) ||
        !isFiniteNumber(v.zoom) ||
        !isFiniteNumber(v.x) ||
        !isFiniteNumber(v.y)
      ) {
        problem(
          `${dPath}.viewport`,
          `${describe(v)} — expected { "zoom": number, "x": number, "y": number }`,
        );
      }
    }

    /* ------------------------------ nodes ------------------------------- */

    const nodes = diagram.nodes;
    if (!Array.isArray(nodes)) {
      problem(
        `${dPath}.nodes`,
        `${describe(nodes)} — expected an array of nodes`,
      );
    } else {
      nodes.forEach((node: unknown, j: number) => {
        const nPath = `${dPath}.nodes[${j}]`;
        if (!isRecord(node)) {
          problem(nPath, `${describe(node)} — expected a node object`);
          return;
        }
        if (!isNonEmptyString(node.id)) {
          problem(
            `${nPath}.id`,
            `${describe(node.id)} — expected a non-empty string`,
          );
        } else {
          /* Hard error 3 (nodes, file-wide). */
          const existing = nodePathById.get(node.id);
          if (existing !== undefined) {
            problem(
              `${nPath}.id`,
              `duplicate node id "${node.id}" — already used by ${existing}; node ids must be unique across the whole file`,
            );
          } else {
            nodePathById.set(node.id, nPath);
          }
          seen.nodeIds.add(node.id);
        }
        /* Hard error 5 (also catches typo'd/unknown types). */
        if (seen.level !== null) {
          const valid = VALID_NODE_TYPES_BY_LEVEL[
            seen.level
          ] as readonly C4NodeType[];
          if (
            typeof node.type !== "string" ||
            !(valid as readonly string[]).includes(node.type)
          ) {
            problem(
              `${nPath}.type`,
              `${describe(node.type)} is not valid at level "${seen.level}" — valid types: ${valid.join(", ")}`,
            );
          }
        } else if (typeof node.type !== "string") {
          problem(
            `${nPath}.type`,
            `${describe(node.type)} — expected a node type`,
          );
        }
        if (!isNonEmptyString(node.name)) {
          problem(
            `${nPath}.name`,
            `${describe(node.name)} — expected a non-empty string`,
          );
        }
        if (!isXY(node.position)) {
          problem(
            `${nPath}.position`,
            `${describe(node.position)} — expected { "x": number, "y": number }`,
          );
        }
        if (
          !isRecord(node.size) ||
          !isFiniteNumber(node.size.width) ||
          !isFiniteNumber(node.size.height)
        ) {
          problem(
            `${nPath}.size`,
            `${describe(node.size)} — expected { "width": number, "height": number }`,
          );
        }
        if (node.tags !== undefined && !isStringArray(node.tags)) {
          problem(
            `${nPath}.tags`,
            `${describe(node.tags)} — expected an array of strings`,
          );
        }
        if (
          node.childDiagramId !== undefined &&
          node.childDiagramId !== null &&
          !isNonEmptyString(node.childDiagramId)
        ) {
          problem(
            `${nPath}.childDiagramId`,
            `${describe(node.childDiagramId)} — expected a diagram id or null`,
          );
        }
        /* Hard error 8. */
        if (
          isNonEmptyString(node.childDiagramId) &&
          node.childRef !== undefined
        ) {
          problem(
            `${nPath}.childRef`,
            `"childDiagramId" and "childRef" are both present — they are mutually exclusive`,
          );
        }
        if (node.externalRef !== undefined) {
          const ref = node.externalRef;
          if (
            !isRecord(ref) ||
            !isNonEmptyString(ref.diagramId) ||
            !isNonEmptyString(ref.nodeId)
          ) {
            problem(
              `${nPath}.externalRef`,
              `${describe(ref)} — expected { "diagramId": string, "nodeId": string }`,
            );
          }
        }
      });
    }

    /* ------------------------------ edges ------------------------------- */

    const edges = diagram.edges;
    if (!Array.isArray(edges)) {
      problem(
        `${dPath}.edges`,
        `${describe(edges)} — expected an array of edges`,
      );
    } else {
      edges.forEach((edge: unknown, j: number) => {
        const ePath = `${dPath}.edges[${j}]`;
        if (!isRecord(edge)) {
          problem(ePath, `${describe(edge)} — expected an edge object`);
          return;
        }
        if (!isNonEmptyString(edge.id)) {
          problem(
            `${ePath}.id`,
            `${describe(edge.id)} — expected a non-empty string`,
          );
        } else {
          /* Hard error 3 (edges, file-wide). */
          const existing = edgePathById.get(edge.id);
          if (existing !== undefined) {
            problem(
              `${ePath}.id`,
              `duplicate edge id "${edge.id}" — already used by ${existing}; edge ids must be unique across the whole file`,
            );
          } else {
            edgePathById.set(edge.id, ePath);
          }
        }
        /* Hard error 4 — endpoints must resolve in the SAME diagram. */
        for (const endpoint of ["source", "target"] as const) {
          const value = edge[endpoint];
          if (!isNonEmptyString(value)) {
            problem(
              `${ePath}.${endpoint}`,
              `${describe(value)} — expected a node id`,
            );
          } else if (!seen.nodeIds.has(value)) {
            problem(
              `${ePath}.${endpoint}`,
              `"${value}" does not resolve to a node in this diagram — relationships must connect two nodes at the same level`,
            );
          }
        }
        if (
          typeof edge.direction !== "string" ||
          !EDGE_DIRECTIONS.includes(edge.direction)
        ) {
          problem(
            `${ePath}.direction`,
            `${describe(edge.direction)} — expected one of ${EDGE_DIRECTIONS.join(", ")}`,
          );
        }
        if (
          edge.style !== undefined &&
          (typeof edge.style !== "string" || !EDGE_STYLES.includes(edge.style))
        ) {
          problem(
            `${ePath}.style`,
            `${describe(edge.style)} — expected one of ${EDGE_STYLES.join(", ")}`,
          );
        }
        if (edge.tags !== undefined && !isStringArray(edge.tags)) {
          problem(
            `${ePath}.tags`,
            `${describe(edge.tags)} — expected an array of strings`,
          );
        }
      });
    }
  });

  /* -- Hard error 2: the root diagram. ----------------------------------- */
  if (isNonEmptyString(rootDiagramId)) {
    const root = diagramById.get(rootDiagramId);
    if (root === undefined) {
      problem(
        "rootDiagramId",
        `"${rootDiagramId}" does not resolve to any diagram in this file`,
      );
    } else {
      if (root.level !== null && root.level !== "context") {
        problem(
          `${root.path}.level`,
          `the root diagram must be at level "context", not "${root.level}"`,
        );
      }
      const rootRaw = diagrams[diagramByIndex.indexOf(root)];
      if (isRecord(rootRaw)) {
        if (rootRaw.ownerNodeId !== null) {
          problem(
            `${root.path}.ownerNodeId`,
            `the root diagram's ownerNodeId must be null, got ${describe(rootRaw.ownerNodeId)}`,
          );
        }
        if (rootRaw.parentDiagramId !== null) {
          problem(
            `${root.path}.parentDiagramId`,
            `the root diagram's parentDiagramId must be null, got ${describe(rootRaw.parentDiagramId)}`,
          );
        }
      }
    }
  }

  /* -- Hard error 6: child level exactly one step deeper. ----------------- */
  for (const seen of diagramByIndex) {
    if (seen === null || seen.parentDiagramId === null) continue;
    const parent = diagramById.get(seen.parentDiagramId);
    if (parent === undefined) {
      problem(
        `${seen.path}.parentDiagramId`,
        `"${seen.parentDiagramId}" does not resolve to any diagram in this file`,
      );
      continue;
    }
    if (parent.level !== null && seen.level !== null) {
      const expected = childLevelOf(parent.level);
      if (expected === null || seen.level !== expected) {
        problem(
          `${seen.path}.level`,
          `"${seen.level}" is not exactly one step below its parent's level "${parent.level}"` +
            (expected === null
              ? ` — "${parent.level}" is the deepest level and can have no children`
              : ` — expected "${expected}"`),
        );
      }
    }
  }

  /* -- Hard error 7: parent cycles / depth beyond 4. ----------------------- */
  for (const seen of diagramByIndex) {
    if (seen === null) continue;
    const visited = new Set<SeenDiagram>();
    let current: SeenDiagram | undefined = seen;
    let hops = 0;
    while (current !== undefined && current.parentDiagramId !== null) {
      if (visited.has(current)) {
        problem(
          `${seen.path}.parentDiagramId`,
          "the parentDiagramId chain contains a cycle — a diagram cannot be its own ancestor",
        );
        break;
      }
      visited.add(current);
      current = diagramById.get(current.parentDiagramId);
      hops += 1;
      if (hops >= C4_LEVELS.length) {
        problem(
          `${seen.path}.parentDiagramId`,
          `the drill-down chain is deeper than ${C4_LEVELS.length} levels — C4 stops at "code"`,
        );
        break;
      }
    }
  }

  if (issues.length > 0) {
    throw new FileValidationError(issues);
  }
  return input as ArchFlowFile;
}
