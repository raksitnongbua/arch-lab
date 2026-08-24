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

import type { C4Level, C4NodeType } from "@/types";

import { NODE_TYPE_BY_KEYWORD } from "@/features/archtext";
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
