/**
 * `validate_tree` and `format_tree` — the decomposition tree's MCP pair.
 *
 * THE VALIDATOR REPORTS WHAT A PARSE CANNOT SEE, which is the bar
 * `new-diagram-type.md` sets: a tool that only forwards syntax errors adds
 * nothing over the parser an agent could have called anyway. The four findings
 * here are the mistakes this notation actually invites, and each is a thing
 * the grammar is right to accept and a reader is right to question:
 *
 *   - A BRANCH WITH ONE CHILD. Splitting something into one part is not a
 *     breakdown; it is a rename with an extra box. The grammar cannot refuse
 *     it — a tree mid-edit passes through that state constantly — but a
 *     finished document carrying one is nearly always a level nobody needed.
 *   - A LEAF WITH NO CELLS in a document that declares columns. The columns
 *     are the author's own promise that every item carries this information;
 *     a leaf that fills none of them is the row a reader will stop on.
 *   - A DEPTH WITH NO NAME when the document names any. Naming three of four
 *     depths leaves the fourth column heading blank, which reads as a
 *     rendering fault rather than as a decision.
 *   - LOPSIDED DEPTH — one branch far deeper than its siblings. Legal, and
 *     sometimes exactly right, but usually it means two different things are
 *     being broken down in one tree.
 */

import type { TreeLabFile, TreeNode } from "@/types/tree";

import { serializeTreeText } from "@/features/archtext";
import {
  parseTreeInput,
  TREE_FORMAT_LABEL,
  type TreeInputError,
  type TreeSourceFormat,
} from "@/features/tree/input/parse";
import { layoutTree } from "@/features/tree/lib/layout";

import { guardSourceSize } from "../lib/limits";
import {
  errorResult,
  fence,
  joinSections,
  renderKindParseFailure,
  textResult,
  type McpTextResult,
} from "../lib/render";

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export type ReadTreeResult =
  | { status: "ok"; file: TreeLabFile; format: TreeSourceFormat }
  | { status: "error"; kind: TreeInputError["kind"] | "size"; message: string };

export function readTree(source: string): ReadTreeResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", kind: "size", message: size.message };

  const result = parseTreeInput(source);
  if (result.status === "error") {
    const { error } = result;
    return {
      status: "error",
      kind: error.kind,
      message:
        error.kind === "parse"
          ? renderKindParseFailure(
              TREE_FORMAT_LABEL[error.format],
              error,
              source,
            )
          : error.message,
    };
  }
  return { status: "ok", file: result.value.file, format: result.value.format };
}

/* -------------------------------------------------------------------------- */
/* Walking                                                                     */
/* -------------------------------------------------------------------------- */

interface Walked {
  node: TreeNode;
  depth: number;
}

/** Every node with the depth it sits at, root first. */
function walk(root: TreeNode): Walked[] {
  const out: Walked[] = [];
  const visit = (node: TreeNode, depth: number): void => {
    out.push({ node, depth });
    for (const child of childrenOf(node)) visit(child, depth + 1);
  };
  visit(root, 0);
  return out;
}

function childrenOf(node: TreeNode): TreeNode[] {
  return Array.isArray(node.children) ? node.children : [];
}

/* -------------------------------------------------------------------------- */
/* The audit                                                                   */
/* -------------------------------------------------------------------------- */

function renderAudit(file: TreeLabFile): string | null {
  const all = walk(file.root);
  const columnCount = file.columns?.length ?? 0;
  const notes: string[] = [];

  const onlyChild = all.filter((entry) => childrenOf(entry.node).length === 1);
  if (onlyChild.length > 0) {
    notes.push(
      `A BRANCH WITH ONE CHILD: ${onlyChild
        .map((entry) => `\`${entry.node.id}\``)
        .join(", ")}. Splitting something into one part is a rename with an ` +
        "extra box rather than a breakdown — either the level is doing no " +
        "work and can be removed, or a sibling is missing.",
    );
  }

  if (columnCount > 0) {
    const bare = all.filter(
      (entry) =>
        childrenOf(entry.node).length === 0 &&
        (entry.node.cells ?? []).every((cell) => cell === ""),
    );
    if (bare.length > 0) {
      notes.push(
        `A LEAF THAT FILLS NO COLUMN: ${bare
          .map((entry) => `\`${entry.node.id}\``)
          .join(", ")}. This document declares ${columnCount} column${
          columnCount === 1 ? "" : "s"
        }, which is a promise that every item carries that information — a ` +
          "row that fills none of them is where a reader stops.",
      );
    }
  }

  const levels = file.levels ?? [];
  const maxDepth = Math.max(...all.map((entry) => entry.depth));
  if (levels.length > 0 && levels.length < maxDepth + 1) {
    notes.push(
      `DEPTHS ${levels.length + 1} TO ${maxDepth + 1} HAVE NO NAME. The ` +
        `document names ${levels.length} of ${maxDepth + 1}, so the remaining ` +
        "column headings render blank, which reads as a fault rather than as " +
        "a decision. Name them all or none.",
    );
  }

  const branchDepths = childrenOf(file.root).map((child) =>
    Math.max(...walk(child).map((entry) => entry.depth)),
  );
  if (branchDepths.length > 1) {
    const deepest = Math.max(...branchDepths);
    const shallowest = Math.min(...branchDepths);
    if (deepest - shallowest >= 2) {
      notes.push(
        `LOPSIDED DEPTH: one top-level branch runs ${deepest + 1} deep while ` +
          `another stops at ${shallowest + 1}. That is legal and sometimes ` +
          "right, but a gap this size usually means two different things are " +
          "being broken down in one tree.",
      );
    }
  }

  return notes.length === 0 ? null : notes.join("\n\n");
}

function renderSummary(file: TreeLabFile): string {
  const all = walk(file.root);
  const layout = layoutTree(file);
  const leaves = all.filter((entry) => childrenOf(entry.node).length === 0);
  const depth = Math.max(...all.map((entry) => entry.depth)) + 1;
  const parts = [
    `${all.length} node${all.length === 1 ? "" : "s"}`,
    `${leaves.length} leaf${leaves.length === 1 ? "" : "s"}`,
    `${depth} level${depth === 1 ? "" : "s"} deep`,
  ];
  if ((file.columns?.length ?? 0) > 0) {
    parts.push(
      `${file.columns?.length} column${file.columns?.length === 1 ? "" : "s"}`,
    );
  }
  /* THE HOUSE SIZE FORMAT, `N x N px`, not a typographic multiplication sign:
     `check:mcp` reads it back out of every notation's verdict so an agent can
     tell whether it just wrote something presentable, and a different glyph
     here would be a size the check cannot see. */
  return `${parts.join(" · ")}. Draws ${Math.round(layout.width)} x ${Math.round(layout.height)} px at its natural size.`;
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

export function validateTree(source: string): McpTextResult {
  const read = readTree(source);
  if (read.status === "error") return errorResult(read.message);

  return textResult(
    joinSections(
      `VALID as ${TREE_FORMAT_LABEL[read.format]}.`,
      renderSummary(read.file),
      renderAudit(read.file),
    ),
  );
}

export function formatTree(source: string): McpTextResult {
  const read = readTree(source);
  if (read.status === "error") return errorResult(read.message);

  return textResult(
    joinSections(
      `Canonical .alab tree text, read as ${TREE_FORMAT_LABEL[read.format]}.`,
      fence("", serializeTreeText(read.file)),
    ),
  );
}
