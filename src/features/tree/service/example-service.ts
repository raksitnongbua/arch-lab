/**
 * The bundled decomposition trees, kept as `.alab` TEXT and parsed on demand —
 * the rule every kind's example registry here follows. A bundled document that
 * skipped the grammar could drift into something the format no longer accepts
 * and nothing would notice.
 *
 * Every number in a listing is COUNTED FROM THE PARSED FILE rather than typed
 * beside the source. A hand-written count is a second copy of the document,
 * and the two go out of step on the first edit.
 */

import type { TreeLabFile, TreeNode } from "@/types";

import { ArchTextParseError, parseTreeText } from "@/features/archtext";

interface Source {
  id: string;
  /** One line for the demo index — what this example is worth opening for. */
  blurb: string;
  text: string;
}

const ACCOUNT_RECOVERY = `archlab 1.0 tree
title "Account recovery reviews"
description "A supervisor review queue, decomposed into the cases that prove it."

@tree
  levels "Test suite" "Test condition" "Test case"
  columns "Preconditions" "Expected result"
  node suite "Account recovery reviews"
    node list "Reviews list"
      node L-01 "A supervisor can open Reviews"
        cell "A supervisor account"
        cell "The queue table renders with its filter panel"
      node L-02 "An agent is refused at the API"
        cell "An agent account with no Reviews right, and a live token"
        cell "Refused by the server, not by a hidden menu"
      node L-12 "Two supervisors claim at once"
        cell "One unassigned ticket, two sessions holding it open"
        cell "Only the first wins, and the audit log has one entry"
    node detail "Review detail"
      node D-09 "Rejecting needs a reason"
        cell "A ticket you own"
        cell "Update is refused, and the reason reaches the audit log"
      node D-14 "A decided ticket is read-only"
        cell "One decided ticket of each outcome"
        cell "No control offered, and the API refuses a second decision"
    node gaps "Not covered by the acceptance criteria"
      node C-02 "Evidence links must be https"
        cell "Links using http, javascript and data schemes"
        cell "Only https is accepted"
`;

const PLATFORM_TEAM = `archlab 1.0 tree
title "Platform team, by what it owns"
description "An ownership breakdown with no columns — the plain shape of the notation."

@tree
  levels "Team" "Area" "Service" "Component"
  node platform "Platform"
    node runtime "Runtime"
      node compute "Compute"
        node sched "Scheduler"
        node autoscale "Autoscaler"
      node net "Networking"
        node ingress "Ingress"
        node mesh "Service mesh"
    node data "Data"
      node stores "Stores"
        node oltp "Transactional"
        node warehouse "Warehouse"
      node pipes "Pipelines"
    node dx "Developer experience"
      node ci "CI"
      node cli "Command line"
`;

const SOURCES: readonly Source[] = [
  {
    id: "account-recovery-reviews",
    blurb:
      "A QA test plan, four deep, with preconditions and expected results.",
    text: ACCOUNT_RECOVERY,
  },
  {
    id: "platform-ownership",
    blurb:
      "An ownership tree with no columns at all — depth carrying it alone.",
    text: PLATFORM_TEAM,
  },
];

export interface TreeExampleSummary {
  id: string;
  blurb: string;
  title: string;
  description: string | null;
  /** Every node, including the root. */
  nodeCount: number;
  /** Nodes with nothing under them — the things actually being counted. */
  leafCount: number;
  /** Root is 1, so a flat list of children is 2. */
  depth: number;
  columnCount: number;
}

export type TreeExampleListing =
  | { status: "ok"; summary: TreeExampleSummary }
  | { status: "invalid"; id: string; message: string };

export type TreeExampleResult =
  | { status: "ok"; id: string; blurb: string; file: TreeLabFile }
  | { status: "invalid"; message: string }
  | { status: "not-found"; id: string };

function parseSource(source: Source): TreeExampleResult {
  try {
    return {
      status: "ok",
      id: source.id,
      blurb: source.blurb,
      file: parseTreeText(source.text),
    };
  } catch (error) {
    if (error instanceof ArchTextParseError) {
      return { status: "invalid", message: error.message };
    }
    throw error;
  }
}

/** Walks the tree once, returning the three facts a listing quotes. */
function measure(root: TreeNode): {
  nodeCount: number;
  leafCount: number;
  depth: number;
} {
  let nodeCount = 0;
  let leafCount = 0;
  let depth = 0;
  const walk = (node: TreeNode, level: number): void => {
    nodeCount += 1;
    if (level > depth) depth = level;
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length === 0) leafCount += 1;
    for (const child of children) walk(child, level + 1);
  };
  walk(root, 1);
  return { nodeCount, leafCount, depth };
}

export function listTreeExampleIds(): readonly string[] {
  return SOURCES.map((source) => source.id);
}

/** Summaries for the demo index, every number counted from the parsed file. */
export function listTreeExamples(): TreeExampleListing[] {
  return SOURCES.map((source) => {
    const result = parseSource(source);
    if (result.status !== "ok") {
      /* `not-found` cannot happen here — the id came from `SOURCES` two lines
         up — but the result type carries it, so it is narrowed rather than
         cast away. */
      return {
        status: "invalid",
        id: source.id,
        message:
          result.status === "invalid"
            ? result.message
            : `bundled tree "${source.id}" is missing`,
      };
    }
    const counted = measure(result.file.root);
    return {
      status: "ok",
      summary: {
        id: result.id,
        blurb: result.blurb,
        title: result.file.metadata?.title ?? "",
        description: result.file.metadata?.description ?? null,
        nodeCount: counted.nodeCount,
        leafCount: counted.leafCount,
        depth: counted.depth,
        columnCount: result.file.columns?.length ?? 0,
      },
    };
  });
}

/** One example by id, parsed. */
export function loadTreeExample(id: string): TreeExampleResult {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) return { status: "not-found", id };
  return parseSource(source);
}
