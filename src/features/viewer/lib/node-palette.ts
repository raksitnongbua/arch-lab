/**
 * Which node types the C4 canvas may offer to CREATE at each diagram level —
 * the palette behind the "Add" strip, derived rather than written.
 *
 * THE LIST IS DERIVED FROM `NODE_TYPE_ROWS`, the syntax reference's own table
 * (`syntax-docs/content/snippets.ts`), for the reason `codebase.md` habit 4
 * gives: the palette and the `/syntax` page are two surfaces answering "which
 * types are legal at this level", and two hand-kept answers is the shape that
 * has already shipped three stale claims on one branch. The deep import into
 * another feature's content module follows the precedent `mcp/content/
 * syntax-sections.ts` set — the snippets module is deliberately a pure-data
 * leaf so that both a protocol server and this palette can read it.
 *
 * AND IT IS PINNED TO THE PARSER'S OWN TABLE. `NODE_TYPE_ROWS.levels` is
 * hand-written documentation data; the parser rejects a type at the wrong
 * level against `VALID_NODE_TYPES_BY_LEVEL` (`@/types`). `check:canvas-edit`
 * asserts the two agree level by level, both directions, so a palette derived
 * from the docs table can never offer a type the parser refuses — offering
 * `container` on a context diagram would hand the reader a button that
 * produces an invalid document.
 *
 * Lives in `viewer/lib` because both readers may import from here and neither
 * may import from the other: the viewer component renders the palette, and
 * `playground/input/canvas-edit.ts` guards the create gesture with the same
 * list — while the viewer must not import from the playground (the layering
 * note in `@/types/c4.ts`) and the playground already reaches into
 * `viewer/lib` for `EDIT_GRID`'s siblings.
 *
 * PURITY IS LOAD-BEARING: `check:canvas-edit` loads this module through
 * Node's type stripping via `canvas-edit.ts`, which cannot read `.tsx`. Keep
 * imports pointed at pure modules.
 */

import type { C4Diagram, C4Level, C4Node, C4NodeType } from "@/types";
import { VALID_NODE_TYPES_BY_LEVEL } from "@/types";

import { NODE_TYPE_BY_KEYWORD } from "@/features/archtext";
// A deep import, but a PURE one — the precedent `canvas-edit.ts` states for
// its own: `connect-verdict.ts` is the ONE table that decides what a
// connection means (self = cancel, either-direction pair = duplicate), and a
// second copy of the pair test here is how the menu and the drag preview
// would come to disagree about the same target.
import { verdictFor } from "@/features/editor/lib/connect-verdict";
import { NODE_TYPE_ROWS } from "@/features/syntax-docs/content/snippets";

/**
 * One palette entry: the `.alab` keyword the reader will see the text gain
 * (also the button's label — the palette teaches the format's own word), and
 * the model type the gesture writes.
 */
export interface CreatableNodeType {
  keyword: string;
  type: C4NodeType;
}

/**
 * The node types legal at `level`, in the syntax reference's teaching order.
 *
 * FILTERED TO THE LEVEL, deliberately — the whole eight-type list would be
 * the dishonest palette: five of the eight are illegal somewhere, and a
 * disabled-or-erroring button is worse than an absent one (`purpose.md`: a
 * half-populated option ships a choice that makes the diagram look broken).
 */
export function creatableNodeTypes(
  level: C4Level,
): readonly CreatableNodeType[] {
  return NODE_TYPE_ROWS.filter((row) => row.levels.includes(level)).map(
    (row) => ({
      keyword: row.keyword,
      type: NODE_TYPE_BY_KEYWORD[row.keyword],
    }),
  );
}

/**
 * One offerable connect target: an element of the SAME diagram the connect
 * grip's menu can name, and whether the pair is already related — the verdict
 * model's `duplicate` caution, carried so the menu can warn BEFORE the choice
 * rather than announce after it.
 */
export interface ConnectTarget {
  node: C4Node;
  /** True when an edge already joins the pair in either direction. */
  related: boolean;
}

/**
 * The elements `sourceNodeId` may be connected to on the canvas — every other
 * node of the SAME diagram, `^ref` placeholders included (an edge is a local
 * fact the serializer writes beside the `^` token; drawing the mirrored
 * system talking to local elements is what placeholders exist for).
 *
 * Derived HERE, beside `creatableNodeTypes`, for the same one-derivation
 * contract: the connect menu and the gesture guard (`connectedNodesEdit`)
 * both read this diagram's nodes, so the menu can only offer a target the
 * guard will honour — the source itself is the one exclusion, because
 * self-connection is the verdict model's `cancel` and the guard's refusal.
 * Already-related pairs stay OFFERED, flagged: the verdict model calls a
 * duplicate "a caution, never a refusal" (parallel relationships are a real
 * feature), and dropping them from the menu would remove it silently.
 */
export function connectTargets(
  diagram: C4Diagram,
  sourceNodeId: string,
): readonly ConnectTarget[] {
  return diagram.nodes
    .filter((node) => node.id !== sourceNodeId)
    .map((node) => ({
      node,
      related:
        verdictFor({ sourceNodeId, targetNodeId: node.id, diagram }) ===
        "duplicate",
    }));
}

/**
 * One offerable `^ref` source: a node from an ancestor diagram, and where it
 * lives — the level so the picker can say "from the Context view", the
 * diagram id because that plus the node id IS the reference the text writes.
 */
export interface ReferenceableNode {
  sourceDiagramId: string;
  sourceLevel: C4Level;
  node: C4Node;
}

/**
 * The nodes that may be REFERENCED into `diagramId` as `^ref` boundary
 * placeholders — the ref half of the palette, derived for `creatableNodeTypes`'
 * reason: the picker and the gesture guard (`createdRefEdit`) both read this
 * one list, so the UI can never offer a reference the guard refuses.
 *
 * THE THREE FILTERS ARE THE EDITOR'S (`selectReferenceableNodes` in
 * `editor/state/selectors.ts` states each one's rationale; they are re-spelled
 * here rather than imported because that selector reads `EditorState`, whose
 * diagrams live in a keyed `Record`, while everything on this side holds the
 * saved file's flat array — the same two-shapes reason the two `render-svg`
 * modules stay separate, argued in `dry.md`):
 *
 *   - ANCESTORS ONLY, walked up `parentDiagramId`. A `^ref` draws the things
 *     at this diagram's boundary, which are by definition established further
 *     out; sideways or inwards would let two diagrams claim one element
 *     without a containment relationship.
 *   - LEVEL RULES STILL APPLY — the same `VALID_NODE_TYPES_BY_LEVEL` gate a
 *     fresh node passes, because a reference is not an escape hatch from them.
 *   - NO REF OF A REF, and nothing already referenced here: a chain of
 *     placeholders has no meaning, and one original gets one mirror per
 *     diagram.
 *
 * The parent walk is bounded by `visited` rather than trusted: a hand-written
 * file can spell a parent cycle, and this list must degrade to "fewer options"
 * there, never hang the canvas.
 */
export function referenceableNodes(
  diagrams: readonly C4Diagram[],
  diagramId: string,
): readonly ReferenceableNode[] {
  const byId = new Map(diagrams.map((diagram) => [diagram.id, diagram]));
  const active = byId.get(diagramId);
  if (active === undefined) return [];
  const validTypes: readonly C4NodeType[] =
    VALID_NODE_TYPES_BY_LEVEL[active.level];
  const taken = new Set(
    active.nodes
      .filter((node) => node.externalRef !== undefined)
      .map(
        (node) => `${node.externalRef?.diagramId}/${node.externalRef?.nodeId}`,
      ),
  );

  const result: ReferenceableNode[] = [];
  const visited = new Set<string>([diagramId]);
  let parentId = active.parentDiagramId;
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const ancestor = byId.get(parentId);
    if (ancestor === undefined) break;
    for (const node of ancestor.nodes) {
      if (node.externalRef !== undefined) continue;
      if (!validTypes.includes(node.type)) continue;
      if (taken.has(`${ancestor.id}/${node.id}`)) continue;
      result.push({
        sourceDiagramId: ancestor.id,
        sourceLevel: ancestor.level,
        node,
      });
    }
    parentId = ancestor.parentDiagramId;
  }
  return result;
}
