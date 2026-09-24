/**
 * Keyword tables of the `.alab` TREE grammar — the tenth document type of the
 * arch-lab text format, next to the C4 grammar in `../keywords.ts` and the
 * eight others beside it. One table per mapping, used by both directions, so
 * parser and serializer can never disagree.
 *
 * It lives inside `src/features/archtext/` for the reason every other grammar
 * here does: all ten document types are the SAME text format — same `archlab`
 * header, same header keywords, same `!` escape, same `LineCursor`, same
 * `ArchTextParseError`, same `#tag` micro-grammar — and owning the family in
 * one feature keeps every shared rule imported, never copied.
 *
 * DOCUMENT-TYPE DETECTION (first meaningful line — see `../sequence/detect.ts`):
 *
 *   archlab 1.0            → a C4 document
 *   archlab 1.0 sequence   → a sequence document
 *   archlab 1.0 flowchart  → a flowchart document
 *   archlab 1.0 usecase    → a use-case document
 *   archlab 1.0 er         → an ER document
 *   archlab 1.0 dict       → a data dictionary
 *   archlab 1.0 gantt      → a gantt
 *   archlab 1.0 timeline   → a milestone timeline
 *   archlab 1.0 lifecycle  → a lifecycle
 *   archlab 1.0 tree       → a decomposition tree
 *
 * This parser demands the `tree` word, so the ten grammars stay mutually
 * exclusive from line 1.
 *
 * THE WHOLE GRAMMAR, which is three words and one marker:
 *
 *   @tree
 *     columns "Preconditions" "Expected result"
 *     node suite "Account Recovery Reviews"
 *       node access "Reaching the page"
 *         node L-01 "A supervisor can open Reviews"
 *           cell "ROLE-SUP-A"
 *           cell "The queue table renders with its filter panel"
 *
 * ── THE ONE RULE THAT IS NOT LIKE ITS SIBLINGS ────────────────────────────
 *
 * EVERY OTHER GRAMMAR IN THIS FAMILY HAS A FIXED INDENT LADDER. C4 accepts 0,
 * 2 and 4 and nothing else; a lifecycle accepts 0, 2, 4 and 6. Depth is a
 * closed vocabulary in each of them because their models have a fixed number
 * of levels.
 *
 * THIS ONE CANNOT, and that is the whole notation rather than an exception to
 * be tidied away later. `src/types/tree.ts` records that unbounded depth is
 * one of the two things this kind adds over the nine — a data dictionary is
 * exactly two deep, and if a tree were capped at four it would be a data
 * dictionary with extra steps. So `node` nests as far as the author nests it,
 * and the indent rule is a MULTIPLE rather than a member of a set: every level
 * is exactly `INDENT_STEP` spaces deeper than its parent.
 *
 * What is NOT relaxed is the strictness. An indent that is not a multiple of
 * the step is still an error, and so is a jump of more than one level — a line
 * four spaces deeper than the line above it names no parent, and guessing one
 * is how a typo becomes a silently reparented subtree.
 *
 * ── WHAT IS DELIBERATELY ABSENT, AND WHY EACH ABSENCE IS LOAD-BEARING ─────
 *
 * This notation sits ONE KEYWORD away from being a worse flowchart, exactly as
 * the lifecycle does, so the refusals are the design:
 *
 *   - NO `to` / `next` / `parent` / `ref` BETWEEN NODES. Containment is
 *     nesting and nothing else. Give an author one edge keyword and they can
 *     write `a -> b` across two branches, and a set of arbitrary node-to-node
 *     edges IS the flowchart — the single change that would make this
 *     notation redundant.
 *   - NO SECOND ROOT. A forest is a list of trees, which is a document per
 *     tree. One root is also what makes the kind's one-line job answerable:
 *     "what breaks down into what" needs a what.
 *   - NO REPEATED ID. A node reachable twice is a DAG, and a DAG drawn as a
 *     tree either duplicates a subtree or draws a crossing line. Ids are
 *     unique document-wide so the refusal can name the second occurrence.
 *   - NO PER-NODE COLOUR. The accent is derived from the top-level branch a
 *     node descends from. An author who can write a colour can write a
 *     half-populated palette, which `purpose.md` calls worse than no option.
 *   - NO COLUMN WITHOUT A HEADER. `cell` is refused outright in a document
 *     with no `columns` line, and a node may not carry more cells than there
 *     are headers: a cell with nothing to be read under is not data.
 */

/** The word that follows the version on line 1. */
export const TREE_HEADER_WORD = "tree";

/** The block marker every tree document opens its body with. */
export const TREE_BLOCK_MARKER = "@tree";

/**
 * One level of nesting, in spaces.
 *
 * A MULTIPLE, NOT A MEMBER OF A SET — see the file header. This is the number
 * `check:tree` multiplies to build its legal-indent cases, so a change here
 * changes the grammar rather than one error message.
 */
export const INDENT_STEP = 2;

/** Declares the leaf columns, once, for the whole document. */
export const COLUMNS_KEYWORD = "columns";

/** Opens a node. The only keyword that nests. */
export const NODE_KEYWORD = "node";

/**
 * Fills the next cell position under this node.
 *
 * REPEATED RATHER THAN A LIST ON ONE LINE (`cells "a" "b"`), because a cell
 * holds a sentence and a document with four columns would put four sentences
 * on one line nothing can read or diff. One line per cell also means a `git`
 * diff of a changed precondition touches one line.
 */
export const CELL_KEYWORD = "cell";

/**
 * The token that fills a cell position with nothing.
 *
 * NEEDED BECAUSE CELLS ARE POSITIONAL. An author who wants the second column
 * but not the first has no other way to say so, and leaving the first `cell`
 * line out would silently shift their prose one column left. The serializer
 * writes this for any empty cell that has a filled cell after it, and omits
 * trailing empties entirely.
 */
export const EMPTY_CELL_TOKEN = "-";

/** The prose continuation, spelled the same way in all ten grammars. */
export const DESC_KEYWORD = "desc";
