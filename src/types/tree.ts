/**
 * TypeScript model of the arch-lab DECOMPOSITION TREE — the tenth document
 * type, next to the C4 model in `./c4.ts`, the sequence model in
 * `./sequence.ts`, the flowchart in `./flowchart.ts`, the use-case model in
 * `./usecase.ts`, the ER model in `./er.ts`, the data dictionary in
 * `./dict.ts`, the gantt in `./gantt.ts`, the milestone timeline in
 * `./timeline.ts` and the lifecycle in `./lifecycle.ts`. Same conventions as
 * all nine: deterministic key order on write, no per-element timestamps, and
 * forward tolerance for unknown fields from newer minors.
 *
 * ── THE BAR, AND WHY THIS KIND CLEARS IT ──────────────────────────────────
 *
 * `./lifecycle.ts` closes with a standing instruction: "A TENTH notation
 * still has to clear the bar; this one was waived by name, once, on request —
 * the second and last such waiver." This is that tenth notation, and it is
 * not a third waiver. The argument is made here so a future reader can check
 * it rather than assume it.
 *
 * THE QUESTION IT ANSWERS, from `kind-copy.ts`: **what breaks down into what,
 * all the way down.** No existing kind answers it, and the three that come
 * closest are each missing the same half:
 *
 *   - A C4 MODEL (`./c4.ts`) is the dangerous neighbour, because it is
 *     already hierarchical — "drillable level by level". Two things separate
 *     them. Its levels are a FIXED VOCABULARY it did not invent (context,
 *     container, component, code) and an author cannot add a fifth; and its
 *     subject is systems. This grammar has no level vocabulary at all: depth
 *     is whatever the author nested, and the subject is anything. A C4 model
 *     cannot express a six-deep breakdown of a test plan, and it should not
 *     learn how — the levels are the notation.
 *   - A DATA DICTIONARY (`./dict.ts`) is the neighbour whose PICTURE most
 *     nearly duplicates this one, and the overlap is real enough to name: it
 *     is a container holding named things, each carrying columns of prose.
 *     It is exactly TWO deep, by the shape of its own model — a section holds
 *     fields and a field holds nothing — and it is about what a field MEANS.
 *     Depth is the whole difference, and it is not a small one: a dictionary
 *     that grew arbitrary nesting would be this notation, at which point one
 *     of the two should be deleted.
 *   - A FLOWCHART (`./flowchart.ts`) draws named boxes joined by lines, and
 *     can certainly draw a tree. What it draws them with is ORDER. Here a
 *     child is INSIDE its parent, not after it; there is no sequence, no
 *     decision and nothing loops back.
 *
 * WHAT IS ADDED, rather than subtracted — and this is the part the last two
 * additions could not say. The timeline and the lifecycle were both defined
 * by what they REMOVE from a neighbour, which is why both needed a waiver.
 * This one adds two things nothing in the product has:
 *
 *   1. **Unbounded depth.** Every existing container in arch-lab bottoms out
 *      at a fixed level — C4 at four, the dictionary at two, a use-case
 *      boundary at one. A breakdown whose depth is the author's is a shape
 *      the product cannot currently draw at all.
 *   2. **Columns that align across the whole tree.** A leaf carries cells
 *      under headers declared once for the document, so a reader sees the
 *      condition and the expected result beside the item without opening a
 *      second document. Nothing else here aligns per-element prose into
 *      columns across differing depths.
 *
 * ── THE MODEL ─────────────────────────────────────────────────────────────
 *
 * Three structural rules, each of which is what keeps this from becoming a
 * flowchart by accretion. They are the same KIND of rule `./lifecycle.ts`
 * lists, and for the same reason: a tree is the shape every other notation
 * can be bent into, so the grammar has to refuse the bending.
 *
 *   - **CONTAINMENT IS THE ONLY RELATIONSHIP, AND IT IS NESTING.** A node is
 *     a child because it was written underneath its parent. There is no `to`,
 *     no `next`, no `parent` and no `ref`: the moment one exists an author
 *     can write `a -> b` between two branches and a set of arbitrary
 *     node-to-node edges IS the flowchart. Depth comes from indentation and
 *     nothing else.
 *
 *   - **EVERY NODE HAS EXACTLY ONE PARENT, AND APPEARS EXACTLY ONCE.** A node
 *     reachable by two paths is a DAG, and a DAG drawn as a tree either
 *     duplicates a subtree or draws a crossing line — the first is a lie
 *     about the model and the second is the flowchart again. Ids are unique
 *     across the document so the refusal can name the second occurrence.
 *
 *   - **THERE IS EXACTLY ONE ROOT.** A forest is a list of trees, and a list
 *     of trees is a document per tree. One root also makes "what breaks down
 *     into what" answerable: the root is the what.
 *
 * WHAT A COLUMN IS, precisely, because both the layout and the validator
 * depend on it: headers are declared ONCE for the document and cells are
 * positional against that list. A node may fill fewer cells than there are
 * headers (the tail is empty); it may never fill more, because a cell with no
 * header has nothing to be read under. Columns are a property of the
 * DOCUMENT, not of a depth — which is what lets a five-deep leaf and a
 * two-deep one line up in the same right-hand column, and is the second thing
 * this notation adds.
 *
 * COLOUR IS DERIVED, NEVER DECLARED. A node takes its accent from the index
 * of the top-level branch it descends from, cycling a fixed set of theme
 * tokens. The author writes no colour and the palette can never be
 * half-populated, which is the failure `purpose.md` calls worse than no
 * option at all. `check:tree-palette` proves each accent is distinct and
 * contrast-measured in every theme.
 *
 * Nothing here is validated at runtime; the `.alab` tree parser
 * (`src/features/archtext/lib/tree/parse.ts`) is the loading gate.
 */

import type { ArchLabMetadata } from "./c4";

/* -------------------------------------------------------------------------- */
/* Nodes                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One item in the breakdown — a branch if it has children, a leaf if it does
 * not.
 *
 * THERE IS NO `kind` FIELD SEPARATING BRANCH FROM LEAF. Whether a node is a
 * leaf is a fact about `children`, and a second field saying so could only
 * ever agree with it — the argument `LifecycleExit` makes for having no id.
 * A leaf is `children.length === 0`, everywhere, including the layout.
 *
 * AND THERE IS NO `parent`. Containment is nesting (see the file header); a
 * parent pointer would be a second spelling of the same fact and the first
 * thing an author could use to write a cycle.
 */
export interface TreeNode {
  /**
   * Unique across the whole document, not merely among siblings.
   *
   * DOCUMENT-WIDE rather than sibling-scoped because the refusal has to be
   * able to name what it is refusing: "id `L-01` is already used at line 12"
   * is actionable, where "duplicate child" leaves an author counting
   * indentation. It also means an id is a stable anchor for a deep link into
   * one branch, which sibling scoping would make ambiguous.
   */
  id: string;
  /** What this item is called, in the author's words. */
  label: string;
  /**
   * The cells this node fills, positional against the document's `columns`.
   *
   * POSITIONAL RATHER THAN KEYED BY HEADER NAME, because a header is prose an
   * author will rewrite ("Preconditions" becomes "สภาพที่ต้องมีก่อนเริ่ม") and
   * a keyed cell would silently detach from its column the moment they did.
   * An index survives a rename; the serializer writes empty cells as `-` so
   * the position of a later one cannot drift.
   *
   * SHORTER THAN `columns` IS LEGAL, LONGER IS NOT — a trailing empty cell is
   * one the author simply did not write, where a cell past the last header
   * has nothing to be read under. The parser refuses the second by name.
   */
  cells?: string[];
  /** Same `#tag` vocabulary as every other document kind. */
  tags?: string[];
  /** The note behind the item, drawn under it in the quieter token. */
  description?: string;
  /**
   * What this node breaks down into. Absent and empty mean the same thing —
   * a leaf — and the serializer writes neither.
   */
  children?: TreeNode[];
  /** Forward tolerance: unknown fields from newer minor versions. */
  [unknown: string]: unknown;
}

/* -------------------------------------------------------------------------- */
/* Document                                                                    */
/* -------------------------------------------------------------------------- */

/** A whole `.alab` tree document. */
export interface TreeLabFile {
  /** `archlab <major>.<minor> tree` — the header line, parsed. */
  version: string;
  /** Document metadata, shared with every other kind. */
  metadata?: ArchLabMetadata;
  /**
   * The column headers, declared once, in the order they are drawn.
   *
   * OPTIONAL, AND ABSENT IS THE COMMON CASE. A plain breakdown — an org
   * chart, a taxonomy, a file tree — has no columns at all, and demanding a
   * header list would make the first draft of every document an error. When
   * absent, no node may carry `cells`.
   */
  columns?: string[];
  /**
   * The single root. See the file header: a forest is a document per tree.
   */
  root: TreeNode;
  /** Forward tolerance: unknown top-level fields from newer minors. */
  [unknown: string]: unknown;
}
