#!/usr/bin/env node
/**
 * The editable C4 canvas: a drag has to become TEXT, and the text has to mean
 * the same thing when it is read back.
 *
 * This exists because nothing else can catch a regression in it. `pnpm build`
 * type-checks the plumbing but cannot say that a moved node is still where it
 * was put after a serialise and a re-parse, and the failure it guards is
 * silent in the worst way: the node visibly moves, the pane visibly changes,
 * and the position is quietly lost or doubled on the next render. A reader
 * would see a node that springs back and have no way to know why.
 *
 * It loads the REAL modules through Node's type stripping — the archtext
 * serializer, the viewer's pane parser and the playground's own
 * `input/canvas-edit.ts` — so this proves what the page does rather than a
 * copy of it. That also PINS THE PURITY of `canvas-edit.ts`, the same duty
 * `check:view-input` performs for its sibling `input/parse.ts`: type stripping
 * cannot read `.tsx` at all, so an import reaching a feature barrel that
 * exports a component fails here loudly instead of silently removing the
 * module from the only harness it has.
 *
 * What it asserts:
 *
 *   1. THE GRID IS THE FORMAT'S GRID. `EDIT_GRID` is measured against what
 *      `defaultPositions` actually emits, not against the number 8 written
 *      twice. A node dragged onto a grid the default layout does not share
 *      would sit a few pixels out of step with every node whose geometry the
 *      text still omits.
 *   2. A MOVE SURVIVES THE ROUND TRIP: move a node, serialise, re-parse, and
 *      the position that comes back is the position that went in.
 *   3. A MOVE IS A ONE-LINE EDIT. Exactly one line changes and it gains
 *      exactly one geometry token. This is what makes the edit reviewable in a
 *      diff, which is the product's whole collaboration story.
 *   4. RETURNING TO THE DEFAULT REMOVES THE TOKEN, and the text is byte-
 *      identical to the canonical original. The serializer omits geometry that
 *      matches the default layout, so dragging a node back has to leave no
 *      trace — otherwise every accidental nudge permanently fattens the file.
 *      Measured against the CANONICAL text rather than the input text on
 *      purpose: hand-written `.alab` may differ from canonical form in blank
 *      lines, and asserting against the input would be asserting the wrong
 *      thing (it fails for a reason that has nothing to do with geometry).
 *   5. A NO-OP MOVE IS REFUSED. A press that lands where it began must not
 *      rewrite the pane, or it costs the reader an undo entry for nothing.
 *   6. THE CAPABILITY MODEL IS COMPLETE AND IS THE ONE AUTHORITY.
 *      `CANVAS_EDIT_OFFERS` is a notation-against-ability grid, and three
 *      separate things are proved about it: its keys are exactly the notations
 *      the seed table can produce (a notation added to either side fails here);
 *      the function agrees with the table cell for every pair, so the table is
 *      the answer rather than a comment beside it; and each refusal points
 *      somewhere the reader can go instead of ending. The refusal PROSE is
 *      proved DERIVED rather than typed, by flipping a cell to offer and reading
 *      the sentence back — the failure that buys this is a hand-written "only
 *      C4 diagrams can be dragged" outliving the day a second notation could
 *      be, which is the same shape as the three stale claims section 15 exists
 *      for and would have been just as green.
 *      THE REFUSALS ARE COMPLETE, derived from the seed table rather than a
 *      hand-listed set of kinds: every non-C4 document the playground can hold
 *      reports itself uneditable with a reason. A hardcoded list cannot notice
 *      a seventh notation the day it is added; the table can. The table is
 *      looped TWICE, once per `CanvasEditAbility`, because there are two things
 *      a canvas can write back and the notations answer them differently — a
 *      sequence document refuses `move` while offering `revise`, C4 answers
 *      both, and the four text-laid-out notations refuse both. The
 *      one-argument default must keep meaning `move`, or a sequence document
 *      silently reports itself draggable. (The loop count follows the ability
 *      union — `move`, `revise` and now `create` — and the grid-shape
 *      assertion pins that count, so a fourth ability fails here until its
 *      row is complete.)
 *   7. A NUDGE STAYS ON THE GRID, and four of them round a square return the
 *      text to byte-identical — a nudge that rounds or double-applies its
 *      delta would leave a residue the reader cannot see and cannot undo by
 *      nudging back.
 *   8. DELETE TAKES ITS OWN RELATIONSHIPS AND NO OTHERS. An edge naming a
 *      removed node fails the model's validation, so a delete that left one
 *      would hand back a document that will not re-parse. A node owning a
 *      child diagram is refused rather than cascaded.
 *   9. UNDO IS BOUNDED AND SEPARATE from the textarea's native history. These
 *      are source assertions, because the ring lives in a `.tsx` component
 *      that type stripping cannot load — the tactic `check:shortcuts` and
 *      `check:viewer-motion` already use for facts that exist only in a
 *      component.
 *  10. THE LOCK DEFAULTS TO EDITABLE and is decided server-side, so no reader
 *      gets a frame of the wrong state — a frame in which a drag can land.
 *  11. A CANVAS EDIT RE-PROJECTS ONLY THE NODE IT CHANGED. React Flow keeps a
 *      node's measured size and handle bounds only for an object it is handed
 *      by identity; every other node it re-adopts loses its handle bounds, and
 *      every edge touching one of them has no position until the next
 *      measurement — error 008 and a blink of the connector layer. Since every
 *      edit re-parses the text, a projection without a cache pays that for the
 *      whole diagram on every drag release, which is exactly the hitch a
 *      reader reported. Asserted from the projection's OUTPUT (which objects
 *      are the same objects), not from its source.
 *  12. A DRAG FOLLOWS THE CURSOR, AND THE RELEASE COSTS NOTHING. The canvas is
 *      a CONTROLLED React Flow, and in @xyflow/system 0.0.79 a controlled flow
 *      that declares no `onNodesChange` discards every frame of its own drag:
 *      `triggerNodeChanges` applies changes itself only for `defaultNodes`
 *      flows, so the node stayed still under the pointer until release
 *      re-parsed the text. Three things are pinned. That NO controlled flow in
 *      the repo is missing the handler, found by reading the source tree rather
 *      than by naming a file. That the in-flight overlay and the commit produce
 *      the SAME number — driven through the library's real `snapPosition`, not
 *      through a second copy of the arithmetic — so the last frame of the press
 *      and the first frame after it are the same position, and therefore, via
 *      the cache above, the same OBJECT: zero re-adopts at the handover, which
 *      is what "the node does not settle twice" means where there is no
 *      browser to look at. And that the press cannot outlive itself: React
 *      Flow's own `dragging: false` is the one thing that clears the overlay,
 *      because an ABORTED drag emits that change and never calls
 *      `onNodeDragStop`.
 *  13. AN EDIT IS A LINE PATCH, so the author's own bytes survive it. This is
 *      the section that exists because the whole-document re-emit it replaced
 *      passed every assertion 1–12 for a release while silently deleting every
 *      `//` comment in the file on the first drag. Canonical text cannot catch
 *      that — a re-emit of canonical text IS canonical text — so this section
 *      drives the same gestures from deliberately NON-canonical text and
 *      asserts that every line the gesture is not about is byte-identical:
 *      comments, blank lines, spacing, and a geometry token the author wrote
 *      out that the serializer omits at its default. The patched line itself is
 *      compared against what a FULL serialise emits for that node, because a
 *      patch that writes almost-canonical text trades a silent loss for a
 *      worse one. And the fallback is pinned BY NAME: every edit reports
 *      `path`, and the two conditions that force `"reemit"` — a pane holding
 *      JSON, and a pane whose text means a different document than the canvas
 *      is showing — each have an assertion, so the safe path cannot silently
 *      stop being taken.
 *  14. A REVISE IS A BLOCK PATCH, and the whole ability is held to section
 *      13's standard from the same kind of non-canonical text: only the
 *      node's own block changes, the patched block equals what a full
 *      serialise would emit for that node, a no-op or an unknown id refuses
 *      (`null`, no undo entry) rather than throws, clearing an optional field
 *      REMOVES it (never writes `[""]` or `desc ""`), an empty name and a
 *      boundary placeholder refuse, and revise-then-revise-back restores the
 *      AUTHORED bytes. What a rename deliberately carries is measured too: a
 *      `^ref` name and a child-diagram title the author OMITTED derive from
 *      this node's name and follow it, while ones written out stay put —
 *      omission is the format's "same as the source", and rewriting those
 *      lines would fork what the author's text says from what it said. The
 *      gesture is also proved REACHABLE the way section 14 proves the
 *      sequence dock's are: every handler `CanvasEditHandlers` declares is
 *      invoked by the viewer and supplied by the playground, the panel's form
 *      fields are exempt from the canvas's own keys (Backspace in the name
 *      field must not delete the node), the pencil is withheld from a
 *      read-only canvas and from a boundary placeholder, and the page's
 *      heading names the gesture.
 *  15. A CREATE IS AN INSERT PATCH, and the palette cannot offer what the
 *      parser refuses. The Add strip's type list is DERIVED from the syntax
 *      reference's `NODE_TYPE_ROWS` and pinned here — level by level, both
 *      directions — to `VALID_NODE_TYPES_BY_LEVEL`, the very table the parser
 *      validates against, because a palette that drifted would ship a button
 *      that produces an invalid document. The gesture itself is held to
 *      section 13's standard from non-canonical text: exactly one line gains,
 *      every other byte survives, the line is what a full serialise would
 *      emit, the id de-duplicates deterministically against the whole file
 *      (ids are file-unique), an illegal-at-this-level type refuses (`null`,
 *      no throw), and the new node's box is MEASURED to overlap nothing —
 *      after the round trip, since inserting an id reflows the default
 *      layout, so the pre-insert picture is the wrong one to measure.
 *      A CREATE ALSO NAMES WHAT IT CREATED (`CanvasEdit.createdNodeId`, on
 *      the patch path and both re-emit fallbacks, and on the ref create),
 *      and the id is FOLLOWED: the playground's create handlers hand it back
 *      and the canvas centres on the new element and selects it — because
 *      the element is placed below everything drawn, which on a tall diagram
 *      is off screen, while the announcement tells the reader to rename it in
 *      the details panel. Without the camera move and the selection that
 *      sentence is a promise nothing keeps. The reference half of the Add
 *      strip is a click-to-open MENU (its list grows with the model, unlike
 *      the fixed type buttons), sharing the zoom menu's dismissal hook so
 *      Escape closes the menu WITHOUT also clearing the canvas selection.
 *  16. A GROUPING IS ONE GESTURE, ONE TEXT, ONE UNDO. The marquee's write
 *      (`groupedNodesEdit`) puts N elements into one boundary as a single
 *      patch list — N declaration lines plus at most one minted `frame` line
 *      — so one Cmd/Ctrl+Z reverses the whole boundary; the host's handler is
 *      pinned to exactly one `applyCanvasEdit` call so the module's one edit
 *      cannot become two undo entries on the way through. Held to section
 *      13's standard from non-canonical text (only the members' declaration
 *      lines change, comments and `desc` continuations survive, the patched
 *      lines equal a full serialise's). A selection naming an unknown id
 *      refuses WHOLLY — nothing partial — while a `^ref` placeholder is a
 *      legal member, because membership is a local fact the emitter writes
 *      beside the `^` token, unlike the derived own-fields `revisedNodeEdit`
 *      refuses. AND THE MARQUEE ITSELF IS HELD AWAY FROM 4fa7c36's RENDER
 *      LOOP: the gesture must never engage React Flow's own rubber band
 *      (`elementsSelectable` false, no `onSelectionChange`), its per-frame
 *      state may feed nothing but the overlay div, and the `nodes` / `edges`
 *      projection memos must not read any of it — the prop identity holding
 *      still for the whole gesture is what makes the StoreUpdater loop
 *      impossible rather than merely unlikely.
 *
 * Exits non-zero on any failure. Run with: pnpm check:canvas-edit
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The playground's editing surface, which is TWO files since the canvas
 * gestures moved out of the page into `lib/use-canvas-editing.ts`: the page
 * owns the document, the panes and the shell; the hook owns every gesture and
 * the `applyCanvasEdit` funnel they share.
 *
 * Assertions about a HANDLER'S BODY read both, because which of the two files
 * hosts it was never what they were proving. The rules bought here — applies
 * once, announces its refusal, names the undo key — are about what the handler
 * DOES, and they were written when it was inline. Assertions about the PAGE
 * itself (its panes, its share wiring, its headings) still read the page alone,
 * which is why this is a second reader and not a replacement for `read`.
 */
const readPlaygroundEditSurface = () =>
  [
    "src/features/playground/components/view-playground.tsx",
    "src/features/playground/lib/use-canvas-editing.ts",
  ]
    .map(read)
    .join("\n");

/**
 * The same source with its comments removed, for assertions that pin CODE.
 *
 * Written after the trap fired three times in this file. A regex over a
 * source file matches prose as readily as syntax, and the prose most likely
 * to contain a fragment of code is the comment explaining that exact code —
 * or, worse, the comment explaining the BUG, which quotes the wrong version
 * verbatim. Each time, breaking the code left the assertion passing against
 * its own explanation, which is the one failure a check must never have: it
 * reports success for the state it exists to forbid.
 *
 * So: structural assertions read `code(...)`, prose assertions read `read(...)`,
 * and the choice is visible at the call site.
 */
const code = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ----------------------------------------------------------------------- */
/* Module resolution: `@/*` alias + extensionless relative imports -> .ts   */
/* ----------------------------------------------------------------------- */

registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(path.join(ROOT, "src", resolved.slice(2))).href;
    }
    if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      typeof context.parentURL === "string"
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      const isFile = existsSync(asPath) && statSync(asPath).isFile();
      if (!isFile) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        } else if (existsSync(path.join(asPath, "index.ts"))) {
          resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const load = (relative) =>
  import(pathToFileURL(path.join(ROOT, relative)).href);

const { defaultPositions, defaultSizeFor } = await load(
  "src/features/archtext/index.ts",
);
const { EDIT_GRID } = await load("src/features/viewer/lib/canvas-constants.ts");
const {
  CANVAS_EDIT_OFFERS,
  CANVAS_EDITABLE_SUMMARY,
  canvasEditability,
  connectedNewNodeEdit,
  connectedNodesEdit,
  createdNodeEdit,
  createdNodeName,
  createdRefEdit,
  deletedEdgeEdit,
  deletedFrameEdit,
  deletedNodeEdit,
  groupedNodesEdit,
  movedNodeEdit,
  nestedNodeEdit,
  ownsChildDiagram,
  revisedEdgeEdit,
  revisedDirectionEdit,
  revisedFileDirectionEdit,
  revisedNodeEdit,
} = await load("src/features/playground/input/canvas-edit.ts");
const { connectTargets, creatableNodeTypes } = await load(
  "src/features/viewer/lib/node-palette.ts",
);
const {
  revisedMessageEdit,
  revisedParticipantEdit,
  insertedMessageEdit,
  repointedMessageEdit,
  deletedMessageEdit,
  deletedParticipantEdit,
  insertedParticipantEdit,
} = await load("src/features/playground/input/sequence-edit.ts");
const { parseViewSource, VIEW_SEED_TEXT, sourceTextFor } = await load(
  "src/features/playground/input/parse.ts",
);
const { createNodeProjectionCache, projectViewerNodes } = await load(
  "src/features/viewer/lib/project-nodes.ts",
);
const { diagramWithDragOverlay, dragOverlayAfter, NO_DRAG_OVERLAY } =
  await load("src/features/viewer/lib/drag-overlay.ts");
const { placeFrames } = await load("src/features/editor/lib/frame-layout.ts");

/* ----------------------------------------------------------------------- */
/* Harness — same shape as the sibling check scripts                        */
/* ----------------------------------------------------------------------- */

let failures = 0;
let assertions = 0;

function check(label, condition, detail) {
  assertions += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
}

/** The first line that differs, for a readable failure. */
function firstDiff(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
    if (la[i] !== lb[i]) {
      return `line ${i + 1}:\n      expected: ${JSON.stringify(lb[i])}\n      actual:   ${JSON.stringify(la[i])}`;
    }
  }
  return "no line differs (trailing content only)";
}

/** The lines present in `after` but not in `before`, and vice versa. */
function changedLines(before, after) {
  const b = before.split("\n");
  const a = after.split("\n");
  const changed = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) changed.push({ index: i, before: b[i], after: a[i] });
  }
  return changed;
}

function c4Document(text) {
  const parsed = parseViewSource(text);
  if (parsed.status !== "ok" || parsed.value.kind !== "c4") {
    throw new Error(
      `fixture did not parse as C4: ${parsed.status === "ok" ? parsed.value.kind : parsed.error.message}`,
    );
  }
  return parsed.value;
}

/* ----------------------------------------------------------------------- */
/* The layout-direction gesture                                             */
/*                                                                          */
/* It rides under `revise` — it writes one element's own field in place, the */
/* element being the DIAGRAM — and the rule that matters most for it is the  */
/* one 0a9cbf1 bought: EVERY GESTURE IS A LINE PATCH, NEVER A RE-EMIT. A    */
/* re-emit of a diagram block would rewrite every node, edge and frame under */
/* it and delete the author's comments, which is what a full re-serialize    */
/* did on the first drag of the release that shipped it. So the assertions   */
/* below are about the TEXT, not the model: how many lines moved, and what   */
/* survived. Proven from deliberately non-canonical source, comments and all.*/
/* ----------------------------------------------------------------------- */

console.log("\nThe layout-direction gesture");

{
  /* Loaded here rather than reusing the one further down: that binding is
     declared inside a later block, and a check that depends on the order of
     unrelated blocks breaks the next time somebody moves one. */
  const { convertedSourceText } = await load(
    "src/features/playground/input/parse.ts",
  );
  const SEED = `archlab 1.0
title "Direction"

// a comment the author wrote and must keep
@context ctx-root "Direction"
  a:system "A" >cnt
  b:external "B"

  a -> b : "Calls the other one"

@container cnt "C" owner=a
  desc "A description that must survive the gesture."

  // another comment, mid-block
  x:container "X" [Go 1.22]
  y:container "Y" [Go 1.22]

  x -> y : "Hands the batch on"
`;
  const doc = c4Document(SEED);
  const linesOf = (text) => text.split("\n");
  const changedLines = (before, after) => {
    const a = linesOf(before);
    const b = linesOf(after);
    const out = [];
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      if (a[i] !== b[i]) out.push(b[i] ?? "(removed)");
    }
    return out;
  };

  const toLr = revisedDirectionEdit(doc, SEED, "cnt", "lr");
  check(
    "setting a direction takes the PATCH path, not the re-emit path",
    toLr !== null && toLr.path === "patch",
    `path: ${toLr === null ? "null" : toLr.path}`,
  );
  const moved = toLr === null ? [] : changedLines(SEED, toLr.text);
  check(
    "it rewrites exactly ONE line — the diagram's head",
    moved.length === 1 &&
      moved[0] === '@container cnt "C" owner=a direction=lr',
    `changed: ${JSON.stringify(moved)}`,
  );
  check(
    "the author's comments and the diagram's desc survive",
    toLr !== null &&
      toLr.text.includes("// a comment the author wrote") &&
      toLr.text.includes("// another comment, mid-block") &&
      toLr.text.includes("A description that must survive the gesture."),
    "a re-emit would have taken all three",
  );

  /* Clearing is not the same edit as setting, and an insert is not the
     inverse of a removal (`canvas-editing.md`): the attribute has to LEAVE the
     line, not be written as some empty form of itself. */
  const WITH_LR = SEED.replace(
    '@container cnt "C" owner=a',
    '@container cnt "C" owner=a direction=lr',
  );
  const withLr = c4Document(WITH_LR);
  const cleared = revisedDirectionEdit(withLr, WITH_LR, "cnt", "inherit");
  check(
    "choosing File removes the attribute rather than writing an empty one",
    cleared !== null &&
      !/direction=/.test(cleared.text) &&
      changedLines(WITH_LR, cleared.text).length === 1,
    cleared === null
      ? "returned null — there was an attribute to clear"
      : `changed: ${JSON.stringify(changedLines(WITH_LR, cleared.text))}`,
  );
  check(
    "clearing keeps the comments too",
    cleared !== null && cleared.text.includes("// another comment, mid-block"),
  );

  check(
    "asking for the direction a diagram already has costs nothing",
    revisedDirectionEdit(withLr, WITH_LR, "cnt", "lr") === null,
    "a no-op must not produce a text change or an undo entry",
  );
  check(
    "an unknown diagram id is refused",
    revisedDirectionEdit(doc, SEED, "no-such-diagram", "lr") === null,
  );
  /* ---- The FILE's direction line, which is a different line -------------- */

  /* The control that reads "Whole file" writes here. It exists because the
     first version of this control offered `File` as a third DIRECTION meaning
     "inherit", which for a diagram carrying no attribute was the state already
     in force — so pressing it did nothing, and there was no way to set the
     file's direction at all. Reported as "pressed it, nothing happened". Scope
     is its own choice now, and these are the assertions for the other half. */
  const countOf = (text, re) =>
    text.split("\n").filter((line) => re.test(line)).length;

  const inserted = revisedFileDirectionEdit(doc, SEED, "lr");
  check(
    "setting the file's direction inserts ONE header line, on the patch path",
    inserted !== null &&
      inserted.path === "patch" &&
      countOf(inserted.text, /^direction lr$/) === 1 &&
      inserted.text.split("\n").length === SEED.split("\n").length + 1,
    inserted === null
      ? "returned null"
      : `path=${inserted.path} lines ${SEED.split("\n").length} -> ${inserted.text.split("\n").length}`,
  );
  check(
    "the inserted line leaves a document that parses, with the file's direction set",
    (() => {
      if (inserted === null) return false;
      const reparsed = parseViewSource(inserted.text);
      return (
        reparsed.status === "ok" &&
        reparsed.value.kind === "c4" &&
        reparsed.value.synced.file.direction === "lr"
      );
    })(),
    "the gesture wrote a header the parser does not accept",
  );
  check(
    "inserting keeps the author's comments",
    inserted !== null &&
      inserted.text.includes("// a comment the author wrote"),
  );

  const FILE_TB = SEED.replace(
    'title "Direction"',
    'title "Direction"\ndirection tb',
  );
  const withFile = c4Document(FILE_TB);
  const swapped = revisedFileDirectionEdit(withFile, FILE_TB, "lr");
  check(
    "changing the file's direction replaces that one line and adds none",
    swapped !== null &&
      countOf(swapped.text, /^direction /) === 1 &&
      swapped.text.split("\n").length === FILE_TB.split("\n").length,
    swapped === null
      ? "returned null"
      : `${countOf(swapped.text, /^direction /)} direction line(s), ${swapped.text.split("\n").length} lines`,
  );
  const removed = revisedFileDirectionEdit(withFile, FILE_TB, "none");
  check(
    "clearing removes the line rather than blanking it",
    removed !== null &&
      countOf(removed.text, /^direction/) === 0 &&
      removed.text.split("\n").length === FILE_TB.split("\n").length - 1 &&
      removed.text.includes("// another comment, mid-block"),
    removed === null
      ? "returned null"
      : `${countOf(removed.text, /^direction/)} line(s) left, ${removed.text.split("\n").length} lines`,
  );
  check(
    "the file gesture is a no-op for what is already in force",
    revisedFileDirectionEdit(withFile, FILE_TB, "tb") === null &&
      revisedFileDirectionEdit(doc, SEED, "none") === null,
    "a press that changes nothing must not cost a text change or an undo entry",
  );
  check(
    "setting the file's direction does NOT touch a diagram's own attribute",
    (() => {
      /* Asserted on the RE-EMIT path, deliberately. `adopt` re-parses the
         patched text, so on the patch path the model this gesture builds is
         discarded and a wrong one is unobservable — a break there proves
         nothing, which is what a first version of this assertion found out.
         The fallback path is the one that serializes the model, and an empty
         `sourceText` is what reaches it: it cannot match `aftText`, so
         `patchablePane` declines and `adopt` writes the model instead.
         Stripping a diagram's own `direction=` to make the file's setting
         "take" would then rewrite a line the reader never pointed at. */
      const both = SEED.replace(
        '@container cnt "C" owner=a',
        '@container cnt "C" owner=a direction=tb',
      );
      const edit = revisedFileDirectionEdit(c4Document(both), "", "lr");
      if (edit === null) return "returned null";
      if (edit.path !== "reemit")
        return `expected the re-emit path, got ${edit.path}`;
      const kept = edit.doc.synced.file.diagrams.find(
        (candidate) => candidate.id === "cnt",
      );
      return kept?.direction === "tb"
        ? true
        : `the diagram's own direction became ${JSON.stringify(kept?.direction)}`;
    })() === true,
    "the file gesture rewrote a diagram's own setting",
  );

  check(
    "it asks canvasEditability itself rather than trusting its caller",
    (() => {
      /* A C4 DOCUMENT IN A MERMAID PANE, not a document of another notation.
         The first version of this looped over the other notations and passed
         with the editability guard DELETED, because the `doc.kind !== "c4"`
         half of the same condition caught them — "passed because a second
         guard caught the break", which `canvas-editing.md` lists as one of the
         five ways this has already gone wrong here. Mermaid C4 carries no
         geometry and refuses `revise`, so this is the one input where only the
         editability call can decline. */
      const converted = parseViewSource(
        convertedSourceText(c4Document(SEED), "mermaid"),
      );
      if (converted.status !== "ok" || converted.value.kind !== "c4") {
        return "the Mermaid conversion of the fixture did not parse as C4";
      }
      if (canvasEditability(converted.value, "revise").editable) {
        return "Mermaid C4 now offers revise — this assertion needs a different input";
      }
      /* The converted document's OWN diagram id, and a direction it does not
         already have. Hardcoding "cnt" let the unknown-diagram guard decline
         it instead — a THIRD guard catching the break, after the second one
         already did. An assertion about one guard has to reach that guard. */
      const target = converted.value.synced.file.diagrams.find(
        (candidate) => candidate.direction !== "lr",
      );
      if (target === undefined) return "no diagram to aim at";
      return revisedDirectionEdit(converted.value, "", target.id, "lr") === null
        ? true
        : "accepted an edit a Mermaid-pane C4 document cannot take";
    })() === true,
    "an unguarded gesture is unguarded the day somebody points it at a pane that cannot hold the edit",
  );
}

/* ----------------------------------------------------------------------- */
/* 1. The grid is the format's grid, measured from the default layout       */
/* ----------------------------------------------------------------------- */

console.log("\nThe edit grid agrees with the default layout");

{
  /* DERIVED FROM THE LAYOUT'S OUTPUT, not compared against a literal 8. The
     failure this guards: someone tunes `COLUMN_STEP`/`ROW_STEP`/`ORIGIN` in
     `archtext/lib/defaults.ts` to something no longer divisible by the drag
     grid, and dragged nodes stop lining up with omitted-geometry nodes. A
     spread of ids and edges so the barycentre indent (which halves a step and
     re-snaps) is exercised too, since that is the one place the layout
     divides. */
  const ids = ["a", "b", "c", "d", "e", "f", "g"];
  const edges = [
    { source: "a", target: "b" },
    { source: "a", target: "c" },
    { source: "b", target: "d" },
    { source: "c", target: "d" },
    { source: "d", target: "e" },
    { source: "e", target: "f" },
    { source: "e", target: "g" },
  ];
  const positions = [...defaultPositions(ids, edges).values()];
  const offGrid = positions.filter(
    (point) => point.x % EDIT_GRID !== 0 || point.y % EDIT_GRID !== 0,
  );
  check(
    `every default position is a multiple of EDIT_GRID (${EDIT_GRID})`,
    positions.length === ids.length && offGrid.length === 0,
    offGrid.length > 0
      ? `off-grid: ${offGrid.map((p) => `(${p.x},${p.y})`).join(", ")}`
      : `expected ${ids.length} positions, got ${positions.length}`,
  );

  /* A grid COARSER than the layout's own step would also be wrong, and the
     assertion above cannot see it: 8 divides every position, but so would 4.
     The relationship that matters is that the grid divides the pitch, so a
     drag can land a node exactly where the layout would have. */
  const step = positions.length > 1 ? 264 : 0; // COLUMN_STEP, the widest pitch
  check(
    "the edit grid divides the layout's column pitch",
    step % EDIT_GRID === 0,
    `${step} % ${EDIT_GRID} = ${step % EDIT_GRID}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 2–5. The drag round trip                                                */
/* ----------------------------------------------------------------------- */

console.log("\nA dragged node survives the round trip into text");

{
  const seed = VIEW_SEED_TEXT.c4;
  const original = c4Document(seed);
  /* The CANONICAL text, which is what every comparison below is against —
     see assertion 4 in the header for why the raw seed would be the wrong
     baseline. */
  const canonical = sourceTextFor(original);
  const diagramId = original.synced.model.rootDiagramId;
  const diagram = original.synced.file.diagrams.find((d) => d.id === diagramId);
  const target = diagram.nodes[0];
  const from = { x: target.position.x, y: target.position.y };
  const to = { x: from.x + EDIT_GRID * 3, y: from.y + EDIT_GRID * 2 };

  /* DRIVEN FROM THE CANONICAL TEXT, so the patch and the baseline are the same
     document — see assertion 4 in the header. Section 13 below drives the same
     gestures from deliberately NON-canonical text, which is where the patch
     earns its keep. */
  const moved = movedNodeEdit(original, canonical, diagramId, target.id, to);
  check(
    "a move produces a document",
    moved !== null && moved.doc.kind === "c4",
    `got ${moved === null ? "null" : moved.doc.kind}`,
  );

  if (moved !== null && moved.doc.kind === "c4") {
    const landed = moved.doc.synced.file.diagrams
      .find((d) => d.id === diagramId)
      .nodes.find((n) => n.id === target.id).position;
    check(
      "the position survives serialise → re-parse",
      landed.x === to.x && landed.y === to.y,
      `expected (${to.x},${to.y}), got (${landed.x},${landed.y})`,
    );

    const movedText = moved.text;

    /* THE GEOMETRY TOKEN'S SPELLING, taken from the serializer's own output
       rather than asserted as a pattern this script invented. The failure it
       guards is a serializer change (a `×` for the `x`, a dropped space)
       silently making every canvas edit unreadable to the parser. */
    check(
      "the moved node's line carries the geometry the serializer writes",
      movedText.includes(
        ` (${to.x},${to.y} ${target.size.width}x${target.size.height})`,
      ),
      `no such token in:\n${movedText}`,
    );

    const changed = changedLines(canonical, movedText);
    check(
      "a move rewrites exactly one line",
      changed.length === 1,
      `${changed.length} lines changed: ${changed
        .map((c) => `#${c.index + 1}`)
        .join(", ")}`,
    );
    check(
      "the one changed line is the moved node's, and only gains geometry",
      changed.length === 1 &&
        changed[0].after ===
          `${changed[0].before} (${to.x},${to.y} ${target.size.width}x${target.size.height})`,
      changed.length === 1
        ? `before: ${JSON.stringify(changed[0].before)}\n      after:  ${JSON.stringify(changed[0].after)}`
        : "wrong number of changed lines",
    );

    /* 4. Back to the default — the token must vanish entirely. */
    const restored = movedNodeEdit(
      moved.doc,
      moved.text,
      diagramId,
      target.id,
      from,
    );
    check(
      "moving back to the default position produces a document",
      restored !== null,
      "got null",
    );
    if (restored !== null) {
      const restoredText = restored.text;
      check(
        "a node returned to its default position leaves NO trace in the text",
        restoredText === canonical,
        firstDiff(restoredText, canonical),
      );
    }

    /* 5. A press that lands where it began. */
    check(
      "a move to the position the node already has is refused",
      movedNodeEdit(moved.doc, moved.text, diagramId, target.id, to) === null,
      "expected null, got a document — the pane would be rewritten for nothing",
    );
  }

  check(
    "an unknown node id is refused rather than throwing",
    movedNodeEdit(original, canonical, diagramId, "no-such-node", to) === null,
    "expected null",
  );
  check(
    "an unknown diagram id is refused rather than throwing",
    movedNodeEdit(original, canonical, "no-such-diagram", target.id, to) ===
      null,
    "expected null",
  );
}

/* ----------------------------------------------------------------------- */
/* 7. The keyboard nudge                                                    */
/* ----------------------------------------------------------------------- */

console.log("\nA nudge is one grid step and stays on the grid");

{
  /* The canvas computes `position + delta` and calls the same mover a drag
     does, so what is asserted here is the ARITHMETIC the canvas performs —
     that four nudges in a square return the node to where it started, and
     therefore to text identical to the canonical original. The failure this
     catches: a nudge that rounds, clamps or double-applies its delta leaves a
     residue, and a reader who nudges left then right has permanently changed
     their file by a pixel or two with nothing to show for it. */
  const original = c4Document(VIEW_SEED_TEXT.c4);
  const canonical = sourceTextFor(original);
  const diagramId = original.synced.model.rootDiagramId;
  const nodeId = original.synced.file.diagrams.find((d) => d.id === diagramId)
    .nodes[0].id;

  const deltas = [
    { x: 0, y: -EDIT_GRID },
    { x: EDIT_GRID, y: 0 },
    { x: 0, y: EDIT_GRID },
    { x: -EDIT_GRID, y: 0 },
  ];

  /* The DOCUMENT AND ITS PANE TEXT are walked together, exactly as the page
     holds them: each nudge patches the text the previous one produced, so this
     also proves a patch composes with itself rather than only with canonical
     input. */
  let walked = { doc: original, text: canonical };
  let offGrid = null;
  for (const delta of deltas) {
    const node = walked.doc.synced.file.diagrams
      .find((d) => d.id === diagramId)
      .nodes.find((n) => n.id === nodeId);
    const next = movedNodeEdit(walked.doc, walked.text, diagramId, nodeId, {
      x: node.position.x + delta.x,
      y: node.position.y + delta.y,
    });
    if (next === null) {
      offGrid = `a nudge by (${delta.x},${delta.y}) was refused`;
      break;
    }
    const landed = next.doc.synced.file.diagrams
      .find((d) => d.id === diagramId)
      .nodes.find((n) => n.id === nodeId).position;
    if (landed.x % EDIT_GRID !== 0 || landed.y % EDIT_GRID !== 0) {
      offGrid = `landed off-grid at (${landed.x},${landed.y})`;
      break;
    }
    walked = next;
  }

  check(
    "every nudge lands on the grid",
    offGrid === null,
    offGrid ?? undefined,
  );
  check(
    "four nudges round a square leave the text byte-identical",
    offGrid === null && walked.text === canonical,
    offGrid === null ? firstDiff(walked.text, canonical) : offGrid,
  );
}

/* ----------------------------------------------------------------------- */
/* 8. Delete takes the relationships with it                                */
/* ----------------------------------------------------------------------- */

console.log("\nDeleting a node leaves a document that still parses");

{
  const original = c4Document(VIEW_SEED_TEXT.c4);
  const diagramId = original.synced.model.rootDiagramId;
  const diagram = original.synced.file.diagrams.find((d) => d.id === diagramId);

  /* A node WITH relationships, chosen from the data rather than named: the
     whole point of the assertion is the edges, so picking a leaf by hand
     would have made it vacuous. */
  const connected = diagram.nodes.find((node) =>
    diagram.edges.some(
      (edge) => edge.source === node.id || edge.target === node.id,
    ),
  );
  check(
    "the fixture has a node with relationships to delete",
    connected !== undefined && diagram.edges.length > 0,
    `${diagram.nodes.length} nodes, ${diagram.edges.length} edges`,
  );

  if (connected !== undefined) {
    const edgesTouching = diagram.edges.filter(
      (edge) => edge.source === connected.id || edge.target === connected.id,
    ).length;

    const after = deletedNodeEdit(
      original,
      sourceTextFor(original),
      diagramId,
      connected.id,
    );
    check(
      "a delete produces a document",
      after !== null,
      "got null — a connected node could not be deleted",
    );

    if (after !== null) {
      const left = after.doc.synced.file.diagrams.find(
        (d) => d.id === diagramId,
      );
      check(
        "the node is gone",
        left.nodes.every((node) => node.id !== connected.id),
        "it is still there",
      );
      /* THE ASSERTION THAT MATTERS. An edge naming a deleted node fails the
         model's own validation, so a delete that left one behind would hand
         the reader a document that will not re-parse. That it re-parsed at
         all is proof (`adopt` returns null otherwise) — this names the
         count so the failure message says what was left. */
      check(
        `all ${edgesTouching} relationships touching it went with it`,
        left.edges.every(
          (edge) =>
            edge.source !== connected.id && edge.target !== connected.id,
        ),
        `left: ${left.edges
          .filter((e) => e.source === connected.id || e.target === connected.id)
          .map((e) => `${e.source}->${e.target}`)
          .join(", ")}`,
      );
      check(
        "no other relationship was removed",
        left.edges.length === diagram.edges.length - edgesTouching,
        `expected ${diagram.edges.length - edgesTouching}, got ${left.edges.length}`,
      );
    }
  }

  check(
    "deleting an unknown node is refused rather than throwing",
    deletedNodeEdit(
      original,
      sourceTextFor(original),
      diagramId,
      "no-such-node",
    ) === null,
    "expected null",
  );

  /* A node that OWNS a child diagram must be refused, and `ownsChildDiagram`
     must agree with the refusal — the UI reads the predicate to explain
     itself, so a predicate that disagreed with the mover would either explain
     a refusal that did not happen or stay silent about one that did. Drawn
     from the seed model's own drill-down structure. */
  const parent = original.synced.file.diagrams
    .flatMap((d) => d.nodes.map((node) => ({ diagramId: d.id, node })))
    .find(
      ({ node }) =>
        typeof node.childDiagramId === "string" && node.childDiagramId !== "",
    );
  check(
    "the seed model has a drill-down node to test the refusal with",
    parent !== undefined,
    "no node in the C4 seed owns a child diagram — this assertion is vacuous",
  );
  if (parent !== undefined) {
    check(
      "a node owning a child diagram reports itself as such",
      ownsChildDiagram(original, parent.diagramId, parent.node.id) === true,
      "it does not",
    );
    check(
      "deleting a node that owns a child diagram is refused, never cascaded",
      deletedNodeEdit(
        original,
        sourceTextFor(original),
        parent.diagramId,
        parent.node.id,
      ) === null,
      "it was deleted — a whole level of the model would go with one keystroke",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 9. Undo: bounded, and separate from the textarea's own                   */
/* ----------------------------------------------------------------------- */

console.log("\nThe canvas undo ring is bounded and stays out of the pane");

{
  /* The ring lives inside a React hook, which cannot be called outside a
     render, so these are source assertions — the same tactic `check:shortcuts`
     and `check:viewer-motion` use for facts that only exist in a component.
     Each names the failure it prevents; a source scan that merely restated the
     implementation would pass forever. */
  const page = readPlaygroundEditSurface();
  const canvas = read("src/features/viewer/components/viewer-canvas.tsx");

  check(
    "the undo history is bounded by a named constant",
    /const CANVAS_UNDO_DEPTH = \d+;/.test(page),
    "CANVAS_UNDO_DEPTH is gone — every version of the source text would be " +
      "held for the life of the page",
  );
  check(
    "the ring drops its oldest entry when it is full",
    /ring\.length > CANVAS_UNDO_DEPTH\) ring\.shift\(\)/.test(page),
    "the bound is declared but not enforced, which is the same as unbounded",
  );

  /* THE TWO UNDO HISTORIES MUST STAY SEPARATE. If the canvas ever bound its
     undo without the focus guard, ⌘Z while typing in the source pane would
     revert a drag instead of the reader's last keystroke — losing typing that
     the browser's own history was holding safely. The guard is the whole
     mechanism, so its absence is the regression. */
  check(
    "the canvas claims its keys only while the canvas has focus",
    /container\.contains\(focused\)/.test(canvas) &&
      /if \(!inCanvas\) return;/.test(canvas),
    "the focus guard is gone — canvas keys would fire while the source " +
      "textarea had focus, and undo would revert the wrong history",
  );
  /* COUNTED FROM COMMENT-STRIPPED SOURCE: a comment naming the listener call
     while explaining it would be counted as a third listener otherwise — the
     prose-versus-code trap that has now fired three times in this file. */
  const canvasCode = code("src/features/viewer/components/viewer-canvas.tsx");
  check(
    "the nudge keys and the undo chord share one listener",
    (canvasCode.match(/window\.addEventListener\("keydown"/g) ?? []).length ===
      2,
    "expected exactly two keydown listeners in the canvas (the Escape ladder " +
      "and the edit keys); a third means a second guard to keep in step",
  );
  /* ZERO, not "fewer": the only keyup (and window blur) listener this canvas
     ever had released the held-Space pan flag, and that machinery — key
     state mirrored into React state — is what kept breaking and was replaced
     by the Select/Pan mode toggle. A keyup listener reappearing means some
     gesture is being keyed off held-key state again, which needs the same
     release-everywhere plumbing that failed three times. */
  check(
    "no keyup or window-blur listener remains — nothing tracks a held key",
    (canvasCode.match(/window\.addEventListener\("keyup"/g) ?? []).length ===
      0 &&
      (canvasCode.match(/window\.addEventListener\("blur"/g) ?? []).length ===
        0,
    "a held-key flag is back in the viewer canvas — the Select/Pan toggle " +
      "exists precisely so no gesture depends on keyboard state",
  );

  /* React Flow must not delete nodes itself. Its delete would remove the node
     from ITS store, which the next render from the model would put straight
     back — a key that appears to work and does nothing. The model is
     downstream of the text, so only a text edit can remove a node. */
  check(
    "React Flow's own delete key stays disabled",
    /deleteKeyCode=\{null\}/.test(canvas),
    "deleteKeyCode is no longer null — Delete would edit React Flow's store " +
      "instead of the document, and the node would reappear on the next render",
  );

  /* The nudge has no fine variant on purpose (positions are multiples of 8).
     A Shift-modified nudge would put a node permanently out of step with
     every node whose geometry the text still omits. */
  check(
    "there is no fine (Shift) nudge on the viewer canvas",
    /!event\.shiftKey/.test(canvas) &&
      !/shift\+\$\{key\}/.test(canvas) &&
      !/shiftKey \? 1 :/.test(canvas),
    "a sub-grid nudge appeared — see EDIT_GRID for why positions stay on the " +
      "format's 8px grid",
  );
}

/* ----------------------------------------------------------------------- */
/* 10. The lock: locked by default, decided by the server                   */
/* ----------------------------------------------------------------------- */

console.log("\nThe canvas lock defaults to locked and is read server-side");

{
  const { isLockedCookie, CANVAS_LOCK_COOKIE, CANVAS_LOCKED_BY_DEFAULT } =
    await load("src/features/playground/lib/canvas-lock.ts");
  const lock = read("src/features/playground/lib/canvas-lock.ts");

  /* LOCKED IS THE DEFAULT, and this assertion reversed when that default did.
     It used to read "no cookie means editable", on the argument that a stray
     drag costs nothing and a read-only default would hide the feature. The
     first half stopped being true when the canvas learned to create, remove,
     repoint, rename and reorder — the common visit is READING a diagram
     somebody sent, and a mis-aimed press on it is now an edit you have to
     notice before you can undo it. The second half is answered by the control
     rather than by the default: the padlock's accessible name and tooltip
     offer the unlock action, its faces are distinct, and the strip prints the
     state word — asserted below and in section 8 — and if those regress this
     default is wrong again. `canvas-lock.ts` carries the full argument. */
  check(
    "no cookie means locked",
    isLockedCookie(undefined) === true,
    "an absent cookie left the canvas editable — a diagram a reader opened " +
      "from someone else's link takes edits from a mis-aimed press",
  );
  /* NOT A SECOND LITERAL. A `true` written here would keep passing while the
     module's own default moved under it, which is the exact shape of the
     server-and-prop disagreement `CANVAS_LOCKED_BY_DEFAULT` exists to stop. */
  check(
    "the default the server reads is the module's own",
    isLockedCookie(undefined) === CANVAS_LOCKED_BY_DEFAULT,
    "the cookie read and the exported default disagree — a host that omits " +
      "the prop would render the state the server did not",
  );
  check(
    "an unrecognised cookie value falls to the default, not to editable",
    isLockedCookie("") === CANVAS_LOCKED_BY_DEFAULT &&
      isLockedCookie("true") === CANVAS_LOCKED_BY_DEFAULT,
    "a stale or foreign value decided the lock on its own — only the two " +
      "spellings the reader's own press writes are choices",
  );
  /* THE STORED SPELLINGS ARE PINNED IN SOURCE, deliberately as a literal
     twin, because they are not internal names: they are already written into
     cookie jars on readers' machines, and renaming one forgets every reader
     who set it. This replaced a behavioural `isLockedCookie("locked") === true`
     that the flip above made unfalsifiable — with locked as the default, an
     unrecognised value answers `true` as well, so the assertion passed
     whatever the on-value became. The `unlocked` half is still asserted
     behaviourally below, where the default no longer masks it. */
  check(
    "the stored spellings are the ones already in readers' cookie jars",
    /onValue: "locked"/.test(lock) && /offValue: "unlocked"/.test(lock),
    "a stored spelling was renamed — every reader carrying the old one is " +
      "read as never having chosen, and silently gets the default",
  );
  /* THE ONE THAT PROTECTS AN EXISTING READER. The default moved by changing
     what an ABSENT cookie means; a reader who deliberately chose Editable
     under the old default has `unlocked` on disk and must still get an
     editable canvas. Inverting the cookie's MEANING instead — or dropping the
     off-value branch so the opt-out falls to the now-locked default — would
     pass every other assertion in this block and silently reverse everyone who
     had already decided. */
  check(
    "a reader who chose Editable keeps it across the default change",
    isLockedCookie("unlocked") === false,
    "the stored opt-out no longer unlocks — every reader who had chosen " +
      "Editable was silently reversed",
  );

  /* WHAT PAYS FOR THE DEFAULT. A locked canvas withdraws the pencil, the
     insert buttons, the drag-to-reorder and the numbering toggle, so the lock
     is the only thing left on screen that can say the diagram is editable.

     THESE THREE ASSERTIONS WERE DELIBERATELY REWRITTEN when the product owner
     chose an icon-only padlock pair on the canvas over the labelled
     pencil-"Edit"/padlock-"Lock" control they used to pin. That is a reversal
     of two documented rules, each bought by a shipped bug, and the bugs stay
     real: a padlock labelled "Locked" once named the state the reader could
     already see and left them guessing that pressing was allowed, and
     `hidden sm:inline` once left the whole affordance as ONE 16px glyph on a
     phone with no state distinction and no name. Each rewritten assertion
     below pins the part of the new control that answers one of those bugs;
     if any fails, the icon-only shape has lost the thing that made it
     defensible. */
  const control = read(
    "src/features/playground/components/canvas-lock-button.tsx",
  );
  /* The stripped copy, and the fifth time this file has needed one: the
     comment BELOW warns against `stroke="url(#…)"` by quoting it, so a raw
     test for its absence fails against the warning itself. Prose assertions
     read `control`; structural ones read `controlCode`. */
  const controlCode = code(
    "src/features/playground/components/canvas-lock-button.tsx",
  );
  /* THE FACES ARE THE STATE, so they must be two states. The old locked face
     was a pencil offering "Edit" because a state-reporting face plus a label
     was the shipped bug above; with the owner's icon-only padlocks the label
     is gone, and what is left to pin is that the pair never collapses back
     into the phone bug's single glyph: an OPEN padlock while editable, a
     CLOSED one while locked, distinguishable at a glance. Matched on the
     shared `LockKeyhole` stem with the OPEN suffix as the discriminator, so
     the pair can be restyled without the assertion going stale, but cannot
     collapse to one glyph. (`LockKeyhole(?!Open)` is what refuses the
     collapse — a bare stem on both faces fails.) */
  check(
    "the two faces are distinct padlocks — closed when locked, open when editable",
    /locked \? \(?\s*<LockKeyhole(?!Open)\b/.test(control) &&
      /:\s*\(?\s*<LockKeyholeOpen\b/.test(control),
    "the two faces are no longer a closed padlock (locked) and an open one " +
      "(editable) — one glyph for both states is the phone bug again, with " +
      "no viewport to blame",
  );
  /* A POINTER PRESS HANDS FOCUS BACK TO THE CANVAS. This shipped as the fix
     for hold-Space-to-pan toggling the lock on every key repeat; that pan is
     gone from the viewer (the Select/Pan toggle replaced it), and the guard
     STAYS because the hazard was never the pan's — it is the browser's. A
     focused button activates on Space and Enter, and after a click the
     reader's focus sits on the lock without them having chosen it, so one
     reflex keypress silently flips the lock they only meant to press once.
     A keyboard activation must NOT blur, or a keyboard user loses their
     place in the tab order to fix a bug they never had. Pinning
     `event.detail` specifically, because that is the only part that
     distinguishes the two — an unconditional blur would pass a laxer test
     and silently break keyboard use. MATCHED AS A STATEMENT, not as the bare
     phrase: the first draft of this assertion tested for `event.detail > 0`
     anywhere in the file and passed against the PROSE above the code, so
     replacing the guarded blur with an unconditional one did not fail it.
     The same trap has now caught two authors in this file — a regex over a
     source file must match syntax the compiler sees, never words. */
  /* THE GRADIENT MUST NOT BE ABLE TO SWALLOW THE GLYPH. The owner asked for a
     lock that reads as locking, and the obvious way to do it — painting the
     lucide path with `stroke="url(#…)"` — renders an INVISIBLE icon whenever
     the reference fails to resolve. This control floats over the drawing and
     is the only thing left on a locked canvas saying editing exists, so it is
     the worst possible place for an icon that can disappear. The gradient
     therefore lives on the button surface and the glyph keeps a solid token
     colour. Pinned in both directions: a gradient present, and no url() paint
     on the icon. */
  check(
    "the lock's gradient is on the button, never painted onto the glyph",
    /bg-gradient-to-/.test(controlCode) && !/stroke="url\(#/.test(controlCode),
    "the padlock is painted with a gradient reference — if it ever fails to " +
      "resolve the icon renders nothing, on the one control a locked canvas " +
      "still needs",
  );
  /* Every stop a theme token, for `check:themes`' reason: a hardcoded colour
     is a colour exactly one theme was designed for. */
  check(
    "and every stop of it is a theme token",
    !/(from|via|to)-\[#/.test(controlCode) &&
      !/#[0-9a-fA-F]{3,8}\b/.test(controlCode),
    "the lock's gradient hardcodes a colour, so it is tuned for one theme " +
      "and merely tolerated by the rest",
  );
  /* THE LOCK ANIMATES ITS STATE CHANGE, AND ONLY THAT. The owner asked for
     the padlock to be animated; what shipped is a one-shot settle per toggle
     and a still resting state (the trade is argued beside the keyframes in
     globals.css — a loop on the one control floating over a presented
     diagram spends the reader's eye on chrome). Three properties keep the
     motion inside that decision, each pinned below: it can never run
     forever, it can never fire for a reader who asked for reduced motion or
     one who merely arrived at the page, and it can never repaint the glyph —
     the token-colour and gradient assertions above stay the whole story of
     what the faces look like. */
  const lockAnimCss = read("src/app/globals.css");
  const lockAnimTokens = [
    ...lockAnimCss.matchAll(/--animate-lock-(snap|open):([^;]+);/g),
  ];
  const lockKeyframes = [
    ...lockAnimCss.matchAll(
      /@keyframes af-lock-(?:snap|open) \{([\s\S]*?)\n\}/g,
    ),
  ];
  const lockKeyframeProps = lockKeyframes.flatMap((m) =>
    [...m[1].matchAll(/([a-z-]+):/g)].map((p) => p[1]),
  );
  check(
    "the two STATE-CHANGE gestures are one-shot — declared without `infinite`",
    lockAnimTokens.length === 2 &&
      lockAnimTokens.every(
        ([declaration]) => !declaration.includes("infinite"),
      ),
    "a state-change settle became a loop — a press that never stops " +
      "answering is a different thing from a lit locked face",
  );
  /* THE LOOP IS ONE ANIMATION, GOVERNED, NOT MERELY TOLERATED. The owner
     reversed the still-face rule and asked for the locked state to be carried
     by a running gradient; what the old rule was protecting is argued beside
     the keyframes and is now handled by three properties, each pinned here.
     Without these the reversal would read as "loops are fine now", which it
     is not: exactly one animation may loop, only while locked, and only
     slowly. */
  const sheenToken = /--animate-lock-sheen:([^;]+);/.exec(lockAnimCss);
  check(
    "exactly one lock animation loops, and it is the locked face's gleam",
    sheenToken !== null &&
      sheenToken[1].includes("infinite") &&
      (lockAnimCss.match(/--animate-lock-[a-z]+:[^;]*infinite[^;]*;/g) ?? [])
        .length === 1,
    "either the running gradient stopped looping, or a SECOND lock animation " +
      "started to — the reversal covers one face, not the control",
  );
  /* WCAG 2.3.1 is the floor here, not a preference. This control is on screen
     for as long as the canvas is locked, so a "blink" fast enough to read as
     flashing is a hazard rather than a style. Three per second is the
     threshold; the period is held an order of magnitude under it, and this
     asserts the number rather than trusting the comment beside it. */
  const sheenSeconds = sheenToken
    ? Number.parseFloat(/([\d.]+)s/.exec(sheenToken[1])?.[1] ?? "0")
    : 0;
  check(
    "and it is slow enough that it can never read as a flash (WCAG 2.3.1)",
    sheenSeconds >= 1.5,
    `the locked face's loop runs every ${sheenSeconds}s — under 1.5s it starts ` +
      "approaching a strobe on a control that stays on screen the whole time " +
      "the canvas is locked",
  );
  const sheenFrames = /@keyframes af-lock-sheen \{([\s\S]*?)\n\}/.exec(
    lockAnimCss,
  );
  const sheenProps = sheenFrames
    ? [...new Set([...sheenFrames[1].matchAll(/([a-z-]+):/g)].map((m) => m[1]))]
    : [];
  check(
    "the loop travels a background and nothing else — no opacity strobe, no glyph moved",
    sheenFrames !== null &&
      sheenProps.length > 0 &&
      sheenProps.every((prop) => prop === "background-position"),
    `the loop animates: ${sheenProps.join(", ") || "nothing found"} — an ` +
      "opacity switch is the literal blink WCAG 2.3.1 is about, and a " +
      "transform would move the padlock forever",
  );
  check(
    "reduced motion parks the gleam OFF the face, never frozen mid-sweep",
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.af-lock-sheen \{\s*animation: none;\s*background-position: -\d+% 0;/.test(
      lockAnimCss,
    ),
    "the gleam has no reduced-motion rule, or parks somewhere on the face — a " +
      "highlight halted halfway across is a bright streak sitting on the " +
      "button forever, which is worse than no gleam at all",
  );
  /* ONLY THE LOCKED FACE MOVES. The whole trade rests on a canvas being
     EDITED having no moving chrome; if the loop ever reached the editable
     face it would sit over the diagram the reader is working in. */
  check(
    "the loop is on the locked face only — an editable canvas has no moving chrome",
    /locked \? \([\s\S]{0,200}af-lock-sheen[^"]*motion-safe:animate-lock-sheen/.test(
      controlCode,
    ) && !/: "w-8 bg-gradient-to-br[^"]*animate-lock-sheen/.test(controlCode),
    "the running gradient reached the editable face — a canvas someone is " +
      "working in would have chrome moving over it",
  );
  /* THE FACE UNDER IT STAYS LIT WITHOUT MOTION. The whole reversal is safe
     only because the gleam ADDS to a face that already reads as locked; if the
     pooled tint were ever traded for the highlight, reduced motion — where the
     gleam parks off-screen — would leave the locked state told by the glyph
     alone, on a control whose own header calls the face one of the two things
     that says it. */
  check(
    "the locked face keeps its still pooled tint under the gleam",
    /\? "relative w-8 border-primary\/40 bg-gradient-to-br from-primary\/25 via-primary\/10 to-card\/80/.test(
      controlCode,
    ),
    "the locked face stopped carrying its own tint — with the gleam parked " +
      "under reduced motion, nothing but the glyph would say locked",
  );
  /* Decoration, measured on the gleam's own element: `aria-hidden` appears on
     both faces too, so a file-wide search would pass while the layer itself
     was announced. */
  const sheenSpan =
    /<span\b[^>]*af-lock-sheen[^>]*\/>|<span\b[^>]*\n?[^>]*af-lock-sheen[\s\S]{0,200}?\/>/.exec(
      controlCode,
    );
  check(
    "the gleam is decoration: hidden from assistive tech and untouchable",
    sheenSpan !== null &&
      /aria-hidden="true"/.test(sheenSpan[0]) &&
      /pointer-events-none/.test(sheenSpan[0]),
    "the gleam is reachable or announced — it repeats what the face, the " +
      "glyph and the announcement already say",
  );
  /* It follows the button's own corner by inheriting it, so no theme's radius
     is hardcoded here the way the earlier attempt had to. */
  check(
    "and it takes the button's own corner rather than naming one",
    /af-lock-sheen[^"]*rounded-\[inherit\]/.test(controlCode),
    "the gleam's corner is spelled out, so it squares off against paper's " +
      "tighter radius or rounds past everything else's",
  );
  check(
    "and they move nothing but transform — the faces' paint stays the tokens'",
    lockKeyframes.length === 2 &&
      lockKeyframeProps.length > 0 &&
      lockKeyframeProps.every((prop) => prop === "transform"),
    `keyframes animate: ${[...new Set(lockKeyframeProps)].join(", ") || "none found"} — ` +
      "a colour or stroke in the gesture would repaint the glyph the token " +
      "assertions above vouch for",
  );
  /* `motion-safe:` on BOTH faces, and no unguarded spelling anywhere. This is
     the reduced-motion STOP the canvas promises elsewhere — the variant is a
     media query, so it already holds on the first toggle frame, before any
     JS-written preference could. Structural (stripped source): the comment
     beside the icons explains the class it applies. */
  check(
    "the lock's motion is behind motion-safe on both faces — reduced motion stops it",
    /motion-safe:animate-lock-snap/.test(controlCode) &&
      /motion-safe:animate-lock-open/.test(controlCode) &&
      !/(?<!motion-safe:)animate-lock-/.test(controlCode),
    "a lock gesture escaped the motion-safe gate — reduced motion would " +
      "still see the padlock travel",
  );
  /* NEVER ON FIRST PAINT. The ref is seeded from the CURRENT prop — the one
     shape that makes the first render unable to differ from itself — and the
     class is gated on `travelled`, which only a real change sets. A reader
     opening a locked share link must meet a still padlock, not one slamming
     shut on a press nobody made. */
  check(
    "the gesture fires only on a state CHANGE, never on arrival",
    /useRef\(locked\)/.test(controlCode) &&
      /previousLocked\.current !== locked/.test(controlCode) &&
      /travelled && "motion-safe:animate-lock-snap"/.test(controlCode) &&
      /travelled && "motion-safe:animate-lock-open"/.test(controlCode),
    "the first paint can animate — opening a locked diagram would play a " +
      "lock gesture the reader never pressed for",
  );
  check(
    "a pointer press hands focus back, so a stray keypress cannot re-toggle the lock",
    /if \(event\.detail > 0\)\s*event\.currentTarget\.blur\(\);/.test(control),
    "clicking the lock leaves it focused, and a focused button activates on " +
      "Space and Enter — the next reflex keypress would silently flip the " +
      "lock, so a pointer activation has to stop being focused",
  );
  /* THE NAME IS THE ACTION. The old assertion pinned a visible label; the
     owner removed the words, so the accessible name is now the ONLY channel
     a screen-reader or voice-control user gets — it must say what PRESSING
     DOES (the unlock action completed by each canvas's own hint, and the
     lock action), never the state, or the control regresses to the
     "Locked"-label bug with the label hidden from everyone. */
  check(
    "the accessible name is a full action sentence, not a state word",
    /Unlock the canvas to \$\{copy\.unlockHint\}/.test(control) &&
      /"Lock the canvas — make the diagram read-only to present it"/.test(
        control,
      ),
    "the name no longer says what pressing does — an icon-only control whose " +
      "name reports state leaves the reader guessing that pressing is allowed",
  );
  /* ONE STRING FOR BOTH CHANNELS. This replaced the WCAG 2.5.3 label-in-name
     comparison: with no visible words 2.5.3 no longer applies, and the drift
     to catch moved — `aria-label` (screen reader, voice control) and `title`
     (the only thing a hover shows) must be the SAME sentence, one `name`
     feeding both, so a rewrite of either alone cannot make the tooltip
     contradict the announcement. */
  check(
    "one name feeds both aria-label and title",
    /aria-label=\{name\}/.test(control) && /title=\{name\}/.test(control),
    "aria-label and title stopped sharing one string — the hover tooltip and " +
      "the spoken name can now disagree about what pressing does",
  );

  /* READ ON THE SERVER, for the reason the source fold already established:
     a preference applied after hydration shows one frame of the wrong state,
     and for a lock that frame is one in which a drag can land. */
  const route = read("src/app/live/page.tsx");
  check(
    "the route passes the stored lock into the playground",
    /initialCanvasLocked=\{isLockedCookie\(/.test(route) &&
      /store\.get\(CANVAS_LOCK_COOKIE\)/.test(route),
    "the lock is not read from the request cookie — it would flash editable",
  );
  /* The NAME, not the string. A route hard-typing "af-canvas-locked" would
     read a cookie nothing writes the day the name changes, and the mismatch
     would be silent — the lock would simply never be remembered. */
  check(
    "the route names the cookie through the constant, not a literal",
    !route.includes(`"${CANVAS_LOCK_COOKIE}"`),
    `the cookie name "${CANVAS_LOCK_COOKIE}" is typed out in the route`,
  );

  /* ONE MECHANISM FOR BOTH PREFERENCES. The failure this prevents is the one
     `dry.md` calls a copy-paste fingerprint: two cookie modules with the same
     bodies, one of which later learns a fix the other does not. */
  const fold = read("src/features/playground/lib/source-fold.ts");
  check(
    "both preferences are built from the one cookie mechanism",
    /booleanPreference\(/.test(lock) && /booleanPreference\(/.test(fold),
    "a preference re-implements the cookie read/write instead of sharing it",
  );

  /* THE LOCK EXISTS ONLY WHERE IT CAN ACT. `showCanvasLock` is gated on the
     document being editable, not on the flag alone — the text-laid-out
     notations must get no control, not a disabled one.

     EITHER ABILITY COUNTS, and that clause arrived with the editable sequence
     canvas. There are now two things a canvas can write back (see
     `CanvasEditAbility`), and the notations answer them differently: C4 allows
     `move` and refuses `revise`, a sequence document does the opposite. A lock
     gated on `move` alone would have left the sequence canvas editable with no
     way to lock it — a diagram someone is presenting, still taking edits. */
  const page = read("src/features/playground/components/view-playground.tsx");
  check(
    "the lock renders only for a document one of the canvases can edit",
    /const showCanvasLock =\s*CANVAS_EDIT_ENABLED &&\s*\(editability\.editable \|\| wordingEditability\.editable\);/.test(
      page,
    ),
    "the lock's condition no longer requires an editable document — a " +
      "notation with nothing to lock would get a control that cannot act",
  );
  /* And the lock must reach BOTH canvases. The sequence viewer renders editing
     chrome iff it was handed handlers, so the lock only works there if the
     handlers are withheld while locked — the `canEdit` / `edit` distinction PR
     #69 landed, one canvas over. */
  check(
    "the sequence canvas's handlers are withheld while the lock is on",
    /const sequenceEditable =\s*CANVAS_EDIT_ENABLED && wordingEditability\.editable && !canvasLocked;/.test(
      page,
    ),
    "locking the canvas would leave the sequence dock editable",
  );
  check(
    "the lock is never rendered as a disabled button",
    !/showCanvasLock[\s\S]{0,400}?disabled=/.test(page),
    "a disabled lock appeared — an absent control is the agreed answer for a " +
      "notation that has no geometry to lock",
  );
}

/* ----------------------------------------------------------------------- */
/* 6. Refusals, derived from the seed table                                */
/* ----------------------------------------------------------------------- */

console.log("\nThe capability grid answers every notation for every ability");

{
  /* THE TABLE IS THE MODEL, so these assertions are about the table itself
     before any document is parsed. What they are worth over the loops below:
     those ask whether the FUNCTION refuses a document, which stays true even
     if the table has rotted into a decoration nothing reads. These ask whether
     the grid a returning implementer will read is the grid the app obeys. */
  const abilities = Object.keys(CANVAS_EDIT_OFFERS);
  const seededKinds = Object.keys(VIEW_SEED_TEXT).sort();
  check(
    "the grid names the four abilities and nothing else",
    abilities.length === 4 &&
      abilities.includes("move") &&
      abilities.includes("revise") &&
      abilities.includes("create") &&
      abilities.includes("connect"),
    `abilities: ${abilities.join(", ")}`,
  );

  for (const ability of abilities) {
    /* KEY-SET EQUALITY, BOTH DIRECTIONS. The type system already fails a
       notation added to `ViewDocument` with no cell here, but it cannot see the
       SEED table — so a notation reachable in the playground and absent from
       the grid, or a cell left behind by a notation that was removed, is this
       assertion's to catch. Sorted and compared whole rather than by
       `every(includes)`, which passes on a stale extra key. */
    const cells = Object.keys(CANVAS_EDIT_OFFERS[ability]).sort();
    check(
      `every notation the playground can hold has a "${ability}" answer, and no others`,
      cells.join(",") === seededKinds.join(","),
      `grid: ${cells.join(", ")} / seeds: ${seededKinds.join(", ")}`,
    );

    /* NON-VACUITY. An ability no notation offers would make every assertion
       below pass while the derived "Only … can be …" sentence named nobody. */
    const offering = cells.filter(
      (kind) => CANVAS_EDIT_OFFERS[ability][kind].offers,
    );
    check(
      `at least one notation offers "${ability}"`,
      offering.length >= 1,
      "no notation offers it — the derived refusal would name nobody",
    );

    for (const kind of cells) {
      const cell = CANVAS_EDIT_OFFERS[ability][kind];
      const parsed = parseViewSource(VIEW_SEED_TEXT[kind]);
      if (parsed.status !== "ok") continue; // reported by the loops below

      /* THE FUNCTION ANSWERS FROM THE TABLE. Without this the grid could drift
         into documentation — right in the file and wrong in the app, which is
         the failure `codebase.md` habit 4 names and the one this refactor
         exists to make impossible. Compared cell by cell rather than by
         spot-checking C4 and sequence, because the pair that drifts is always
         the one nobody thought to name. */
      check(
        `canvasEditability agrees with the grid for ${kind} / ${ability}`,
        canvasEditability(parsed.value, ability).editable === cell.offers,
        `grid says ${cell.offers}, function says ${canvasEditability(parsed.value, ability).editable}`,
      );

      if (cell.offers) {
        check(
          `the ${kind} cell for "${ability}" carries the noun its refusals need`,
          typeof cell.noun === "string" && cell.noun.length > 2,
          "an offering cell with no noun leaves other notations' refusals " +
            "naming nothing",
        );
        continue;
      }

      /* `?? ""` so that a function DISAGREEING with the grid fails the two
         assertions below instead of throwing. The assertion above already
         reports the disagreement; a crash here would take the remaining two
         hundred assertions in this file with it, which is the difference
         between one red line and a run that proves nothing. */
      const reason = canvasEditability(parsed.value, ability).reason ?? "";

      /* A REFUSAL IS A PROPERTY OR A DECISION, NEVER A PROMISE. Gap language is
         what turns a refusal into a to-do the reader waits for: every one of
         these six is a shipped answer, and `ground` already records which of
         the two reasons it is. */
      check(
        `the ${kind} / ${ability} refusal does not read as an unfinished feature`,
        !/\b(?:not supported|coming soon|not yet|yet|for now|todo)\b/i.test(
          reason,
        ),
        `reason: ${reason}`,
      );

      /* AND IT POINTS SOMEWHERE. A refusal that only says no sends the reader
         looking for a control that does not exist; the sequence move refusal is
         the case that proves the rule is worth having, because the thing it
         points at is a whole feature one click away. Either the cell names a
         gesture this notation does have, or the sentence names a notation that
         does offer the ability. */
      const namesAnAlternative =
        typeof cell.instead === "string" && reason.includes(cell.instead);
      const namesAnOfferingNotation = offering.some((other) =>
        reason.includes(CANVAS_EDIT_OFFERS[ability][other].noun),
      );
      check(
        `the ${kind} / ${ability} refusal is not a dead end`,
        namesAnAlternative || namesAnOfferingNotation,
        `reason: ${reason}`,
      );

      check(
        `the ${kind} / ${ability} refusal says which of the two grounds it is`,
        cell.ground === "grammar" || cell.ground === "surface",
        `ground: ${JSON.stringify(cell.ground)}`,
      );
    }
  }

  /* THE PROSE FOLLOWS THE TABLE, proved by moving the table.

     This is the one assertion here that cannot be satisfied by restating the
     implementation, and it is the reason the sentence is derived at all. "Only
     C4 diagrams can be dragged on the canvas" was hand-written into four
     refusals; on the day a second notation learned to be dragged, all four
     would have gone on saying otherwise with every check green — the same shape
     as the three stale claims section 15 exists for.

     So: make the flowchart offer `move`, and the ER document's refusal must
     name it. Restored immediately, and the restoration is itself asserted, or
     every section after this one would run against a mutated grid. */
  const erSeed = parseViewSource(VIEW_SEED_TEXT.er);
  const moveRefusal = () =>
    erSeed.status === "ok"
      ? canvasEditability(erSeed.value, "move").reason
      : "";
  const before = moveRefusal();
  check(
    "the move refusal names C4 and does not name a notation that cannot be dragged",
    before.includes("C4 diagrams") && !before.includes("flowchart diagrams"),
    `reason: ${before}`,
  );
  const original = CANVAS_EDIT_OFFERS.move.flowchart;
  CANVAS_EDIT_OFFERS.move.flowchart = {
    offers: true,
    noun: "flowchart diagrams",
  };
  const after = moveRefusal();
  CANVAS_EDIT_OFFERS.move.flowchart = original;
  check(
    "a notation that starts offering `move` appears in every other notation's refusal",
    after.includes("flowchart diagrams") && after.includes("C4 diagrams"),
    `reason after flipping the flowchart cell: ${after}`,
  );
  check(
    "the grid was restored, so the sections after this one see the real answers",
    moveRefusal() === before,
    "the flipped cell leaked into the rest of the run",
  );

  /* THE PANE-LANGUAGE EXCEPTIONS ARE REAL, derived from the cells that declare
     one rather than from the two Mermaid cases somebody remembered to write
     below. A cell claiming a format it cannot reach would be a refusal nothing
     can trigger — coverage that is not there. */
  const { convertedSourceText } = await load(
    "src/features/playground/input/parse.ts",
  );
  for (const ability of abilities) {
    for (const kind of Object.keys(CANVAS_EDIT_OFFERS[ability])) {
      const cell = CANVAS_EDIT_OFFERS[ability][kind];
      if (!cell.offers || cell.unlessPane === undefined) continue;
      const seed = parseViewSource(VIEW_SEED_TEXT[kind]);
      const converted =
        seed.status === "ok"
          ? parseViewSource(
              convertedSourceText(seed.value, cell.unlessPane.format),
            )
          : seed;
      check(
        `${kind} in a ${cell.unlessPane.format} pane refuses "${ability}", with the cell's own sentence`,
        converted.status === "ok" &&
          converted.value.kind === kind &&
          converted.value.format === cell.unlessPane.format &&
          canvasEditability(converted.value, ability).reason ===
            cell.unlessPane.because,
        `verdict: ${JSON.stringify(
          converted.status === "ok"
            ? canvasEditability(converted.value, ability)
            : converted.error,
        )}`,
      );
    }
  }
}

console.log("\nEvery notation that cannot carry geometry says so");

{
  /* DERIVED FROM `VIEW_SEED_TEXT`, not from a list of five kind names. The
     failure a hardcoded list cannot catch: a seventh notation is added, its
     canvas inherits the editable path, and a reader drags a node that the
     next render puts straight back — with no reason given. Reading the seed
     table means the new kind is covered the day it exists. */
  const kinds = Object.keys(VIEW_SEED_TEXT);
  check(
    "the seed table is the source of kinds and is non-trivial",
    kinds.length >= 6 && kinds.includes("c4"),
    `kinds: ${kinds.join(", ")}`,
  );

  for (const kind of kinds) {
    const parsed = parseViewSource(VIEW_SEED_TEXT[kind]);
    if (parsed.status !== "ok") {
      check(`the ${kind} seed parses`, false, "it does not");
      continue;
    }
    const verdict = canvasEditability(parsed.value);
    if (kind === "c4") {
      check(
        "a C4 document is editable",
        verdict.editable === true,
        "it is not",
      );
      continue;
    }
    if (kind === "flowchart") {
      /* THE SECOND NOTATION THAT ANSWERS `move`, and the only cell in this
         table whose `"grammar"` refusal has ever been reversed — the format
         grew the coordinate it lacked (ADR 0002, superseding ADR 0001). It
         still falls through to the `movedNodeEdit` guard below: offering the
         ABILITY is not offering the C4 grammar's gesture. */
      check(
        "a flowchart document is draggable now that the grammar holds a position",
        verdict.editable === true,
        `verdict: ${JSON.stringify(verdict)}`,
      );
      check(
        "movedNodeEdit declines a flowchart document",
        movedNodeEdit(parsed.value, "", "any", "any", { x: 1, y: 1 }) === null,
        "expected null",
      );
      continue;
    }
    check(
      `a ${kind} document is refused, with a reason a reader can act on`,
      verdict.editable === false &&
        typeof verdict.reason === "string" &&
        verdict.reason.length > 20,
      `verdict: ${JSON.stringify(verdict)}`,
    );
    /* And the refusal must be real, not only advisory: the mover itself has
       to decline, or a caller that forgot to ask would corrupt a document. */
    check(
      `movedNodeEdit declines a ${kind} document`,
      movedNodeEdit(parsed.value, "", "any", "any", { x: 0, y: 0 }) === null,
      "expected null",
    );
  }

  /* THE SAME TABLE, THE OTHER ABILITY. There are two things a canvas can write
     back (`CanvasEditAbility`) and the notations answer them differently: a
     sequence document refuses `move` while offering `revise`, C4 answers both,
     and the four text-laid-out notations refuse both.
     Looping the seed table a second time is what makes that a COVERAGE claim
     rather than two hand-checked cases — the failure a hardcoded pair cannot
     notice is a seventh notation whose dock grows an editor that writes into a
     grammar with nowhere to put it. */
  for (const kind of kinds) {
    const parsed = parseViewSource(VIEW_SEED_TEXT[kind]);
    if (parsed.status !== "ok") continue; // already reported above
    const verdict = canvasEditability(parsed.value, "revise");
    if (kind === "sequence") {
      check(
        "a sequence document can have its wording revised",
        verdict.editable === true,
        `verdict: ${JSON.stringify(verdict)}`,
      );
      continue;
    }
    if (kind === "c4") {
      check(
        "a C4 document can have a node's wording revised",
        verdict.editable === true,
        `verdict: ${JSON.stringify(verdict)}`,
      );
    } else if (kind === "flowchart") {
      /* THE THIRD OFFERING NOTATION, and it sits here rather than in the
         refusing `else` because its `"surface"` refusal moved: the details
         dock the canvas already opened on selection grew fields. It still
         falls through to the sequence-gesture loop below — offering the
         ABILITY is not offering another grammar's gestures. */
      check(
        "a flowchart document can have a step's wording revised",
        verdict.editable === true,
        `verdict: ${JSON.stringify(verdict)}`,
      );
      check(
        "revisedNodeEdit declines a flowchart document",
        revisedNodeEdit(parsed.value, "", "any", "any", { name: "x" }) === null,
        "expected null",
      );
    } else {
      check(
        `a ${kind} document refuses "revise", with a reason a reader can act on`,
        verdict.editable === false &&
          typeof verdict.reason === "string" &&
          verdict.reason.length > 20,
        `verdict: ${JSON.stringify(verdict)}`,
      );
      /* THE C4 REVISER DECLINES EVERY GRAMMAR THAT IS NOT ITS OWN, the same
         duty `movedNodeEdit` answers in the loop above: the refusal must be
         real at the gesture, not advisory at the table, or a caller that
         forgot to ask would splice by line numbers that mean something else.
         (`sequence` is covered separately below the loop — its cell OFFERS
         the ability, so this gesture's refusal there is the kind guard, not
         the table.) */
      check(
        `revisedNodeEdit declines a ${kind} document`,
        revisedNodeEdit(parsed.value, "", "any", "any", { name: "x" }) === null,
        "expected null",
      );
    }
    /* And the refusal is REAL, not advisory: the gesture itself declines, or a
       caller that forgot to ask would splice into a grammar whose line numbers
       mean something else. A C4 document runs through this list too — its cell
       offers `revise`, but only to ITS OWN gesture, and a sequence gesture
       pointed at a C4 pane would splice sequence lines into a C4 file.

       EVERY GESTURE IS LISTED, not just the first one written. Each of these is
       an independent entry point into the same splice, and the one that forgets
       its `canvasEditability` guard is the one nothing here would notice — the
       table is what makes "all six refuse" a measured fact rather than six
       separate hopes. A gesture added to `sequence-edit.ts` and not added here
       is unguarded until someone points it at an ER document. */
    for (const [name, run] of [
      [
        "revisedMessageEdit",
        () =>
          revisedMessageEdit(parsed.value, "", [0], {
            label: "x",
            kind: "sync",
          }),
      ],
      [
        "revisedParticipantEdit",
        () => revisedParticipantEdit(parsed.value, "", "x", { name: "y" }),
      ],
      [
        "insertedMessageEdit",
        () => insertedMessageEdit(parsed.value, "", null, "a", "b"),
      ],
      [
        "repointedMessageEdit",
        () => repointedMessageEdit(parsed.value, "", [0], "a", "b"),
      ],
      ["deletedMessageEdit", () => deletedMessageEdit(parsed.value, "", [0])],
      [
        "deletedParticipantEdit",
        () => deletedParticipantEdit(parsed.value, "", "a"),
      ],
      [
        "insertedParticipantEdit",
        () => insertedParticipantEdit(parsed.value, ""),
      ],
    ]) {
      check(
        `${name} declines a ${kind} document`,
        run() === null,
        "expected null",
      );
    }
  }

  /* THE ONE PAIR THE LOOP ABOVE CANNOT REACH: a sequence document offers
     `revise` — to its OWN nine gestures — so the C4 reviser pointed at it is
     refused by the kind guard rather than by the table, and skipping this
     would leave exactly one grammar the gesture never proved it declines. */
  {
    const parsed = parseViewSource(VIEW_SEED_TEXT.sequence);
    check(
      "revisedNodeEdit declines a sequence document",
      parsed.status === "ok" &&
        revisedNodeEdit(parsed.value, "", "any", "any", { name: "x" }) === null,
      "expected null",
    );
  }

  /* DEFAULTING TO `"move"` IS LOAD-BEARING. Every existing caller — and the
     first loop in this section — asks the one-argument question, and it has to
     keep meaning geometry. A default that flipped to the union would silently
     report a sequence document as draggable. */
  const sequenceSeed = parseViewSource(VIEW_SEED_TEXT.sequence);
  check(
    "the default ability is still `move`, so a sequence document is not draggable",
    sequenceSeed.status === "ok" &&
      canvasEditability(sequenceSeed.value).editable === false &&
      canvasEditability(sequenceSeed.value, "move").editable === false,
    `verdict: ${JSON.stringify(
      sequenceSeed.status === "ok"
        ? canvasEditability(sequenceSeed.value)
        : sequenceSeed.error,
    )}`,
  );
  /* THE REFUSAL NAMES THE OTHER GESTURE. A dead end ("this cannot be edited")
     on the one notation that CAN be edited a different way sends the reader
     away from a feature that is right there. */
  check(
    "a sequence document's move refusal points at the gesture it does have",
    sequenceSeed.status === "ok" &&
      /edit its wording/.test(canvasEditability(sequenceSeed.value).reason),
    "the refusal is a dead end",
  );

  /* MERMAID SEQUENCE REFUSES `revise`, and this one is measured against the
     emitter rather than asserted from taste. `MERMAID_SEQUENCE_EXPORT_CAVEAT`
     records that the emitter drops `desc`, `[technology]` and `@icon` — three
     of the four fields the dock's message form edits — so an edit written back
     through a Mermaid pane would show once and vanish on the round trip.
     Converted with the app's own converter so this cannot drift from what the
     pane toggle actually produces. */
  const asMermaidSeq = parseViewSource(
    (await load("src/features/playground/input/parse.ts")).convertedSourceText(
      sequenceSeed.value,
      "mermaid",
    ),
  );
  check(
    "a sequence document sitting in the pane as Mermaid refuses `revise`",
    asMermaidSeq.status === "ok" &&
      asMermaidSeq.value.kind === "sequence" &&
      asMermaidSeq.value.format === "mermaid" &&
      canvasEditability(asMermaidSeq.value, "revise").editable === false,
    `verdict: ${JSON.stringify(
      asMermaidSeq.status === "ok"
        ? canvasEditability(asMermaidSeq.value, "revise")
        : asMermaidSeq.error,
    )}`,
  );
  check(
    "the Mermaid refusal names the fields that would be lost, not just the format",
    asMermaidSeq.status === "ok" &&
      /desc/.test(canvasEditability(asMermaidSeq.value, "revise").reason) &&
      /technology/.test(canvasEditability(asMermaidSeq.value, "revise").reason),
    "a reader cannot tell what switching the pane would buy them",
  );
  /* The caveat is the EVIDENCE for the refusal above, so it has to keep saying
     what the refusal claims it says. If the emitter learns to carry `desc`,
     this fails and the refusal should be revisited rather than left standing. */
  const { MERMAID_SEQUENCE_EXPORT_CAVEAT } = await load(
    "src/features/mermaid/lib/sequence-emit.ts",
  );
  check(
    "the emitter still documents dropping the fields the refusal cites",
    /desc/.test(MERMAID_SEQUENCE_EXPORT_CAVEAT) &&
      /technology/.test(MERMAID_SEQUENCE_EXPORT_CAVEAT),
    "the caveat no longer supports the refusal that cites it",
  );

  /* Mermaid C4 is the case that is C4 and still cannot be edited — the pane's
     language carries no geometry, so a move would round-trip back. Converted
     with the app's own converter so this cannot drift from what the toggle
     produces. */
  const c4 = c4Document(VIEW_SEED_TEXT.c4);
  const asMermaid = parseViewSource(
    (await load("src/features/playground/input/parse.ts")).convertedSourceText(
      c4,
      "mermaid",
    ),
  );
  check(
    "a C4 document sitting in the pane as Mermaid is refused",
    asMermaid.status === "ok" &&
      asMermaid.value.kind === "c4" &&
      asMermaid.value.format === "mermaid" &&
      canvasEditability(asMermaid.value).editable === false,
    `verdict: ${JSON.stringify(
      asMermaid.status === "ok"
        ? canvasEditability(asMermaid.value)
        : asMermaid.error,
    )}`,
  );

  /* MERMAID C4 ALSO REFUSES `revise`, and this one is MEASURED against the
     emitter rather than asserted from taste, the same standard the sequence
     Mermaid refusal above meets: `serializeMermaidC4` gives `technology` an
     argument slot only on the Container/Component forms, so on a person or a
     system — which is what a context diagram is made of — the field the panel
     edits has nowhere to land, and an edit written back through that pane
     would show once and vanish on the round trip. Driven through the app's
     own converter both ways so it cannot drift from what the toggle does. */
  {
    const verdict = canvasEditability(asMermaid.value, "revise");
    check(
      "a C4 document sitting in the pane as Mermaid refuses `revise`",
      asMermaid.status === "ok" && verdict.editable === false,
      `verdict: ${JSON.stringify(verdict)}`,
    );
    check(
      "the Mermaid refusal names the field that would be lost, not just the format",
      /technology/.test(verdict.reason ?? ""),
      "a reader cannot tell what switching the pane would buy them",
    );
    /* The EVIDENCE, measured: a system node's technology genuinely does not
       survive alab → Mermaid → parse. If the emitter ever learns a slot for
       it, this fails and the refusal should be revisited rather than left
       standing — the same contract the sequence caveat assertion states. */
    const techDoc = c4Document(
      [
        `archlab 1.0`,
        `title "Tech probe"`,
        ``,
        `@context ctx "Context"`,
        `  web:system "Web App" [Next.js]`,
        ``,
      ].join("\n"),
    );
    const probe = techDoc.synced.file.diagrams[0].nodes[0];
    check(
      "the probe genuinely carries a technology before the round trip",
      probe.technology === "Next.js",
      `technology: ${JSON.stringify(probe.technology)}`,
    );
    const roundTripped = parseViewSource(
      (
        await load("src/features/playground/input/parse.ts")
      ).convertedSourceText(techDoc, "mermaid"),
    );
    const returned =
      roundTripped.status === "ok" && roundTripped.value.kind === "c4"
        ? roundTripped.value.synced.file.diagrams[0].nodes.find(
            (node) => node.id === "web",
          )
        : undefined;
    check(
      "a system's technology is measured to be lost through the Mermaid pane",
      returned !== undefined && returned.technology === undefined,
      `technology after the round trip: ${JSON.stringify(returned?.technology)}`,
    );
    /* And the user-facing caveat still documents the loss the refusal cites. */
    const { MERMAID_C4_EXPORT_CAVEAT } = await load(
      "src/features/playground/input/parse.ts",
    );
    check(
      "the C4 export caveat still documents dropping technology on people/systems",
      /technology on people\/systems/.test(MERMAID_C4_EXPORT_CAVEAT),
      "the caveat no longer supports the refusal that cites it",
    );

    /* THE SAME STANDARD FOR THE PANEL'S TWO NEWER FIELDS. The refusal now
       also claims an icon or colour edit would be lost through a Mermaid
       pane, so that loss is MEASURED the way the technology loss is: a node
       carrying both goes through the app's own converter and comes back
       carrying neither. If `serializeMermaidC4` ever learns a sprite or an
       UpdateElementStyle, this fails and the refusal should be revisited. */
    const paintedDoc = c4Document(
      [
        `archlab 1.0`,
        `title "Paint probe"`,
        `tagcolor hot "#bc6761"`,
        ``,
        `@context ctx "Context"`,
        `  web:system "Web App" @nextjs! #hot`,
        ``,
      ].join("\n"),
    );
    const paintedBack = parseViewSource(
      (
        await load("src/features/playground/input/parse.ts")
      ).convertedSourceText(paintedDoc, "mermaid"),
    );
    const paintedNode =
      paintedBack.status === "ok" && paintedBack.value.kind === "c4"
        ? paintedBack.value.synced.file.diagrams[0].nodes.find(
            (node) => node.id === "web",
          )
        : undefined;
    check(
      "an icon and a tag colour are measured to be lost through the Mermaid pane",
      paintedNode !== undefined &&
        paintedNode.icon === undefined &&
        (paintedNode.tags ?? []).includes("hot") === false &&
        paintedBack.value.synced.file.metadata.tagColors === undefined,
      `after the round trip: ${JSON.stringify({
        icon: paintedNode?.icon,
        tags: paintedNode?.tags,
        tagColors:
          paintedBack.status === "ok"
            ? paintedBack.value.synced.file.metadata.tagColors
            : "unparsed",
      })}`,
    );
    check(
      "the Mermaid refusal names the icon and the colour beside the technology",
      /icon/.test(verdict.reason ?? "") && /colour/.test(verdict.reason ?? ""),
      "the panel edits two fields the refusal never mentions",
    );
    check(
      "the C4 export caveat documents dropping icons and tag colours too",
      /icons/.test(MERMAID_C4_EXPORT_CAVEAT) &&
        /tag colours/.test(MERMAID_C4_EXPORT_CAVEAT),
      "the caveat no longer supports the refusal that cites it",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 11. The projection: a drag costs ONE re-adopt, not N                     */
/* ----------------------------------------------------------------------- */

console.log("\nA canvas edit re-projects only the node it changed");

{
  /* WHY THIS SECTION EXISTS. React Flow measures how much work a render costs
     by OBJECT IDENTITY: `adoptUserNodes` keeps its internal node — measured
     size, handle bounds, absolute position — only for an incoming object that
     is `===` the one it adopted last time. Otherwise it rebuilds it and resets
     `handleBounds`, and until the next DOM measurement lands every edge
     touching that node has no position: error 008, an EdgeWrapper that renders
     nothing, and a blink of the connector layer. Every canvas edit re-parses
     the text, so every node arrives as a NEW object — which is why a drag
     release used to blink the whole diagram, and why `project-nodes.ts` caches
     by identity. These assertions are the only thing standing between that
     cache and the next person who "simplifies" it back into a plain map. */
  const original = c4Document(VIEW_SEED_TEXT.c4);
  const diagramId = original.synced.model.rootDiagramId;
  const nodesOf = (doc) => doc.synced.model.diagrams[diagramId].nodes;
  const cache = createNodeProjectionCache();
  const projectInto = (doc, editable = true) =>
    projectViewerNodes({
      model: doc.synced.model,
      diagram: doc.synced.model.diagrams[diagramId],
      editable,
      cache,
    });

  const first = projectInto(original);
  check(
    "the seed projects more than a couple of nodes",
    first.length >= 3,
    `projected ${first.length}`,
  );

  /* THE FIXTURE HAS TO BE THE REAL PROBLEM, or everything below passes for the
     wrong reason: an unchanged re-parse must genuinely hand over all-new model
     objects, the way a canvas edit does. */
  const reparsed = c4Document(sourceTextFor(original));
  check(
    "an unchanged re-parse really does replace every model node object",
    reparsed.synced.model !== original.synced.model &&
      nodesOf(reparsed).every((node, i) => node !== nodesOf(original)[i]),
    "the parser is returning shared objects — this section would prove nothing",
  );

  const again = projectInto(reparsed);
  check(
    "an equal model costs no new node objects",
    again.length === first.length &&
      again.every((node, i) => node === first[i]),
    `${again.filter((node, i) => node !== first[i]).length} of ${again.length} ` +
      "nodes were replaced — React Flow would re-adopt them and every edge's " +
      "position lookup would come back null for a frame",
  );

  /* THE DRAG ITSELF. One press must cost exactly one new object, and it must be
     the node that moved — not "about one", and not the whole diagram.
     DRAGGED PAST EVERY OTHER NODE on purpose: the entrance delay is a rank in
     reading order, so this is the move that reshuffles every other node's
     rank. A projection that recomputed those delays would replace all of the
     objects here and this assertion would say so; a gentle nudge would not
     move a single rank and would prove nothing. */
  const target = nodesOf(original)[0];
  const to = {
    x: target.position.x,
    y:
      Math.max(...nodesOf(original).map((node) => node.position.y)) +
      EDIT_GRID * 8,
  };
  const moved = movedNodeEdit(
    original,
    sourceTextFor(original),
    diagramId,
    target.id,
    to,
  ).doc;
  const afterMove = projectInto(moved);
  const replaced = afterMove.filter((node, i) => node !== first[i]);
  check(
    "a finished drag replaces exactly one node object",
    replaced.length === 1 && replaced[0].id === target.id,
    `replaced: ${replaced.map((node) => node.id).join(", ") || "none"}`,
  );
  check(
    "and that object carries the position the drag landed on",
    replaced.length === 1 &&
      replaced[0].position.x === to.x &&
      replaced[0].position.y === to.y,
    `position: ${JSON.stringify(replaced[0]?.position)}`,
  );

  /* The entrance delay is a RANK over every node's position, so moving one
     node reshuffles other nodes' ranks. Recomputing it would hand untouched
     nodes a new inline style — a new object, a re-adopt — for an animation
     that finished seconds ago. The moved node keeps its own delay for the same
     reason: it is on screen, and its entrance is over. */
  const delayOf = (node) => node.style["--viewer-enter-delay"];
  check(
    "a move never re-choreographs an entrance that already played",
    afterMove.every((node, i) => delayOf(node) === delayOf(first[i])),
    "an on-screen node was given a new --viewer-enter-delay",
  );

  /* THE HANDLE-BOUNDS CARRY-OVER, which is what keeps the ONE re-adopted node
     from blinking its own connectors: React Flow reuses the previous handle
     bounds only when the incoming object already claims a measured size
     (`parseHandles`), and resets them when `measured` is absent. Truthful
     because the flow writes width/height onto the wrapper, so the measured box
     IS the model's size — asserted as that relationship, not as two numbers. */
  check(
    "every projected node claims the measured size the model gives it",
    afterMove.every(
      (node) =>
        node.measured?.width === node.width &&
        node.measured?.height === node.height,
    ),
    "a node arrived without `measured` — React Flow would drop its handle " +
      "bounds on the next re-adopt and its edges would vanish for a frame",
  );

  /* PURE DATA, which is what makes the cache's signature total: it compares
     `JSON.stringify` of the whole node, so anything unserialisable is
     invisible to it. A callback put back into `data` would be ignored by the
     comparison AND frozen into the cached object — a handler closing over a
     model the reader has moved past. */
  const functionPaths = (value, path = "node") => {
    if (typeof value === "function") return [path];
    if (value === null || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, inner]) =>
      functionPaths(inner, `${path}.${key}`),
    );
  };
  const callbacks = afterMove.flatMap((node) => functionPaths(node));
  check(
    "a projected node is pure data, with no callback in it",
    callbacks.length === 0,
    `functions found at: ${callbacks.join(", ")} — these belong in ` +
      "ViewerNodeActionsProvider, not in the node object",
  );

  /* NOT BLINDLY STALE. The signature must notice a field that is not the model
     node: flipping the edit switch changes `draggable` on every node, so every
     object must be replaced. Without this, a cache that returned its entry
     unconditionally would pass every assertion above. */
  const locked = projectInto(moved, false);
  check(
    "flipping the edit switch re-projects every node",
    locked.every(
      (node, i) => node !== afterMove[i] && node.draggable === false,
    ),
    "a cached object survived a change to a field outside `data.node` — the " +
      "canvas would stay draggable after the lock was applied",
  );

  /* A DELETE MUST NOT LEAK. The entry for a node that is gone would grow the
     cache for the life of the page, and an id reused by a later edit would
     inherit the dead node's entrance delay. */
  const beforeDelete = projectInto(moved);
  const deleted = deletedNodeEdit(
    moved,
    sourceTextFor(moved),
    diagramId,
    nodesOf(moved).at(-1).id,
  ).doc;
  const afterDelete = projectInto(deleted);
  check(
    "a delete keeps every surviving node's object",
    afterDelete.length === beforeDelete.length - 1 &&
      afterDelete.every((node, i) => node === beforeDelete[i]),
    "the survivors were replaced — the whole diagram would re-adopt for one " +
      "removed element",
  );
  check(
    "and drops the dead node's cache entry",
    cache.entries.size === afterDelete.length,
    `${cache.entries.size} entries for ${afterDelete.length} nodes`,
  );

  /* A LEVEL CHANGE STARTS OVER: node ids are unique per diagram, not per
     model, so an id can mean one element here and a different one a level
     down. Reusing an entry across diagrams would render the wrong element. */
  const childId = Object.keys(deleted.synced.model.diagrams).find(
    (id) => id !== diagramId,
  );
  if (typeof childId === "string") {
    const childDiagram = deleted.synced.model.diagrams[childId];
    const child = projectViewerNodes({
      model: deleted.synced.model,
      diagram: childDiagram,
      editable: true,
      cache,
    });
    check(
      "drilling into another diagram starts the cache over",
      child.length === childDiagram.nodes.length &&
        cache.entries.size === child.length,
      `${cache.entries.size} entries for ${child.length} nodes — an entry ` +
        "from the level above survived, and an id shared between levels would " +
        "render the wrong element",
    );
  } else {
    check(
      "the seed has a second diagram to drill into",
      false,
      "no child diagram in the seed — the level-change rule is untested",
    );
  }

  /* ONE CACHE PER MOUNTED CANVAS. A source assertion because it is a fact
     about the component: a cache rebuilt on every render remembers nothing,
     every assertion above still passes in isolation, and the hitch comes
     straight back. */
  const canvasSource = read("src/features/viewer/components/viewer-canvas.tsx");
  check(
    "the canvas holds one projection cache for its lifetime",
    /useState\(createNodeProjectionCache\)/.test(canvasSource),
    "the cache is no longer created once per canvas — a cache built during " +
      "render remembers nothing and the projection is a plain map again",
  );
}

/* ----------------------------------------------------------------------- */
/* 11a. A just-nested EMPTY child shows its zoom chip — on the editable      */
/*      canvas only                                                          */
/* ----------------------------------------------------------------------- */

console.log("\nA fresh empty child offers its way in, without lying about it");

{
  /* THE BUG THIS PINS (reported): nest a node from the details panel and the
     canvas showed no zoom chip, because the chip was gated on the child's
     COUNT — a rule written for a READ-ONLY canvas, where an empty child is
     nothing a reader can do anything with. The author who just minted the
     child had nowhere on the canvas to enter the diagram they made. Both
     rules are asserted here, per canvas state, so neither can quietly take
     the other's place. */
  const doc = c4Document(VIEW_SEED_TEXT.c4);
  const rootId = doc.synced.model.rootDiagramId;
  const root = doc.synced.model.diagrams[rootId];
  const leaf = root.nodes.find(
    (node) =>
      !node.childDiagramId &&
      node.childRef === undefined &&
      node.externalRef === undefined,
  );
  check(
    "the seed has a childless node to nest",
    leaf !== undefined,
    "no nestable node in the seed — the empty-child rule is untested",
  );
  const nested = nestedNodeEdit(doc, sourceTextFor(doc), rootId, leaf.id);
  check(
    "nesting the node yields the empty child this section is about",
    nested !== null &&
      nested.doc.synced.model.diagrams[
        nested.doc.synced.model.diagrams[rootId].nodes.find(
          (node) => node.id === leaf.id,
        ).childDiagramId
      ]?.nodes.length === 0,
    "the nest gesture did not produce an empty child diagram",
  );
  const projectAs = (editable) =>
    projectViewerNodes({
      model: nested.doc.synced.model,
      diagram: nested.doc.synced.model.diagrams[rootId],
      editable,
      cache: createNodeProjectionCache(),
    }).find((node) => node.id === leaf.id);
  const editableNode = projectAs(true);
  check(
    "the EDITABLE canvas offers the empty child's chip the moment it exists",
    editableNode?.data.drill !== null &&
      editableNode?.data.drill.childCount === 0,
    `drill: ${JSON.stringify(editableNode?.data.drill)} — the author who ` +
      "just nested this child has no way into it from the canvas",
  );
  check(
    "the READ-ONLY canvas still refuses it — an empty child is not a reader's drill-down",
    projectAs(false)?.data.drill === null,
    "a read-only canvas grew a chip into an empty diagram — the rule the " +
      "count gate existed for",
  );
  /* A DANGLING pointer offers nothing in either state: `drillInto` would
     no-op, and a chip that does nothing is worse than none. Built by
     deleting the child block from the nested text by hand. */
  const childId = nested.doc.synced.model.diagrams[rootId].nodes.find(
    (node) => node.id === leaf.id,
  ).childDiagramId;
  const dangling = c4Document(
    nested.text
      .split("\n")
      .filter((line) => !line.startsWith(`@`) || !line.includes(` ${childId} `))
      .join("\n"),
  );
  check(
    "the dangling fixture really lost the child diagram",
    dangling.synced.model.diagrams[childId] === undefined,
    "the child block survived the filter — the assertion below is vacuous",
  );
  const danglingNode = projectViewerNodes({
    model: dangling.synced.model,
    diagram: dangling.synced.model.diagrams[rootId],
    editable: true,
    cache: createNodeProjectionCache(),
  }).find((node) => node.id === leaf.id);
  check(
    "a dangling child pointer offers no chip even while editable",
    danglingNode?.data.drill === null,
    `drill: ${JSON.stringify(danglingNode?.data.drill)} — the chip would ` +
      "navigate to a diagram the model does not hold",
  );
  /* THE WORDING IS THE OTHER HALF: a chip that appears for an empty child
     must not COUNT to zero — "0 elements" reads as a broken count, and the
     affordance is the way in, not the contents. Source assertions (the
     section-9 tactic — the chip renders in a `.tsx`). */
  const nodeSource = code("src/features/viewer/components/viewer-node.tsx");
  check(
    "the chip's face shows the count only when there is one",
    /\{drill\.childCount > 0 \? drill\.childCount : null\}/.test(nodeSource),
    "the chip face counts to zero — an affordance that lies about contents",
  );
  check(
    "the chip's accessible name says 'empty' instead of counting to zero",
    /empty — add elements there/.test(
      read("src/features/viewer/components/viewer-node.tsx"),
    ),
    "the empty child's chip promises contents it does not have",
  );
}

/* ----------------------------------------------------------------------- */
/* 12. The press itself: the node follows the cursor, the release is free    */
/* ----------------------------------------------------------------------- */

console.log("\nA drag follows the cursor, and its release costs nothing");

{
  /* WHY THIS SECTION EXISTS. The canvas passes `nodes`, which makes the flow
     CONTROLLED, and a controlled React Flow moves nothing by itself: `XYDrag`
     mutates a throwaway copy of the node per frame and offers the result to
     `triggerNodeChanges`, whose only two outlets are applying the change
     itself (`hasDefaultNodes`, i.e. flows given `defaultNodes`) and calling
     `onNodesChange`. With neither, every frame of every drag was discarded
     while `NodeWrapper` went on reading the old position — a node that stayed
     put under the pointer and appeared at its destination only after release
     re-parsed the text. Reported as "click drag to change position not
     smooth". */

  /* --- the library half, resolved from the installed tree ----------------- */

  /* DERIVED, NOT PATH-LITERAL: @xyflow/system is not a dependency of this
     repo, it is @xyflow/react's, so it is resolved through react's own
     `require` and then walked up to its package root — a hardcoded
     `.pnpm/@xyflow+system@x.y.z` path would rot on the next install. */
  const systemRoot = (() => {
    const fromReact = createRequire(
      createRequire(path.join(ROOT, "index.js")).resolve("@xyflow/react"),
    );
    let dir = path.dirname(fromReact.resolve("@xyflow/system"));
    while (!existsSync(path.join(dir, "package.json"))) dir = path.dirname(dir);
    return dir;
  })();
  const systemPkg = JSON.parse(
    readFileSync(path.join(systemRoot, "package.json"), "utf8"),
  );

  /* THE VERSION THE COMMENTS CLAIM TO HAVE BEEN MEASURED AGAINST has to be the
     version installed, or the comments are asserting a coupling nothing
     enforces. Two source files say "@xyflow/system <version>" and both of them
     describe behaviour — which outlets `triggerNodeChanges` has, when
     `parseHandles` keeps handle bounds — that a minor bump could quietly
     change. Failing here is the prompt to re-measure, not a nuisance. */
  const versionClaims = [
    "src/features/viewer/lib/drag-overlay.ts",
    "src/features/viewer/lib/project-nodes.ts",
  ].flatMap((file) =>
    [...read(file).matchAll(/@xyflow\/system (\d+\.\d+\.\d+)/g)].map(
      (match) => ({ file, version: match[1] }),
    ),
  );
  check(
    "the drag behaviour was measured against the installed @xyflow/system",
    versionClaims.length >= 2 &&
      versionClaims.every((claim) => claim.version === systemPkg.version),
    `installed ${systemPkg.version}; claimed ${
      versionClaims.map((c) => `${c.version} (${c.file})`).join(", ") ||
      "nowhere"
    } — re-measure the drag path before moving the number`,
  );

  const { snapPosition } = await import(
    pathToFileURL(path.join(systemRoot, systemPkg.module)).href
  );
  check(
    "the library's own snapper is what this section drives",
    typeof snapPosition === "function",
    "@xyflow/system stopped exporting snapPosition — the handover arithmetic " +
      "below would be asserting a copy of it instead of the real thing",
  );

  /* --- no controlled flow in the repo may drop its own drag ---------------- */

  /* READ FROM THE SOURCE TREE, not from a list of two file names: the failure
     a hardcoded list cannot notice is a THIRD canvas, added later, that passes
     `nodes` and forgets the handler — and whose drag would then be silently
     inert exactly the way this one was. */
  const tsxFiles = (function walk(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith(".tsx") ? [full] : [];
    });
  })(path.join(ROOT, "src"));
  const flows = tsxFiles
    .map((file) => ({ file, source: readFileSync(file, "utf8") }))
    .filter(({ source }) => /<ReactFlow[<\s]/.test(source));
  check(
    "the source walk actually found the flows",
    flows.length >= 2,
    `found ${flows.length} <ReactFlow> element(s) under src/ — the walk is ` +
      "broken and every assertion below it proves nothing",
  );
  for (const { file, source } of flows) {
    const relative = path.relative(ROOT, file);
    if (!/\bnodes=\{/.test(source)) continue;
    check(
      `${relative} is controlled and handles its own node changes`,
      /\bonNodesChange=\{/.test(source),
      "a flow given `nodes` but no `onNodesChange` throws every drag frame " +
        "away: the node does not follow the cursor and nothing errors",
    );
  }

  /* THE EDIT SWITCH. A locked canvas must be handed neither handler, so that
     nothing about the in-flight overlay exists for a reader who cannot drag —
     the same ternary the commit already uses, checked as the pair so the two
     cannot drift apart. */
  const canvas = read("src/features/viewer/components/viewer-canvas.tsx");
  check(
    "the viewer gates its drag handlers on the edit switch, both of them",
    /onNodesChange=\{editable \? \w+ : undefined\}/.test(canvas) &&
      /onNodeDragStop=\{editable \? \w+ : undefined\}/.test(canvas),
    "one of the two drag handlers is no longer gated on `editable` — a " +
      "locked canvas would run part of the edit path",
  );

  /* --- drive a real press --------------------------------------------------- */

  const document_ = c4Document(VIEW_SEED_TEXT.c4);
  const rootId = document_.synced.model.rootDiagramId;
  const rootDiagram = document_.synced.model.diagrams[rootId];
  const dragCache = createNodeProjectionCache();
  const projectDragged = (diagram, model = document_.synced.model) =>
    projectViewerNodes({ model, diagram, editable: true, cache: dragCache });

  check(
    "an idle canvas projects the model diagram itself, by identity",
    diagramWithDragOverlay(rootDiagram, NO_DRAG_OVERLAY) === rootDiagram,
    "the overlay allocates a diagram when no press is in progress — every " +
      "read-only host would re-project on every render",
  );
  check(
    "a change batch about anything else costs no render",
    dragOverlayAfter(NO_DRAG_OVERLAY, [
      { id: "any", type: "dimensions", dimensions: { width: 1, height: 1 } },
    ]) === NO_DRAG_OVERLAY,
    "the overlay allocated for a change it does not read — a ResizeObserver " +
      "dimensions change would re-project the whole diagram",
  );

  const atRest = projectDragged(rootDiagram);
  const dragged = rootDiagram.nodes[0];
  /* DRAGGED PAST EVERY OTHER NODE, in twelve frames, at a fractional pointer
     step. The distance matters for the same reason it does in section 11 — the
     entrance delay is a rank in reading order, so this is the move that
     reshuffles every other node's rank, and a gentle nudge would not move a
     single rank and could not fail. The fractional step matters because it is
     what a zoomed canvas hands over: the snapper has to be the thing that
     quantises it, not this script. */
  const landingY =
    Math.max(...rootDiagram.nodes.map((node) => node.position.y)) +
    EDIT_GRID * 8;
  const framePositions = [];
  for (let frame = 1; frame <= 12; frame += 1) {
    framePositions.push(
      snapPosition(
        {
          x: dragged.position.x + frame * 3.37,
          y:
            dragged.position.y + ((landingY - dragged.position.y) * frame) / 12,
        },
        [EDIT_GRID, EDIT_GRID],
      ),
    );
  }
  check(
    "the drag path really does leave the node's starting cell",
    framePositions.at(-1).y !== dragged.position.y &&
      framePositions.at(-1).y >=
        Math.max(...rootDiagram.nodes.map((node) => node.position.y)),
    `path ended at ${JSON.stringify(framePositions.at(-1))} from ` +
      `${JSON.stringify(dragged.position)} — too short to reshuffle a rank`,
  );

  let overlay = NO_DRAG_OVERLAY;
  let inFlight = atRest;
  const perFrameReplacements = [];
  for (const position of framePositions) {
    overlay = dragOverlayAfter(overlay, [
      { id: dragged.id, type: "position", position, dragging: true },
    ]);
    const previous = inFlight;
    inFlight = projectDragged(diagramWithDragOverlay(rootDiagram, overlay));
    perFrameReplacements.push(
      inFlight.filter((node, i) => node !== previous[i]).map((n) => n.id),
    );
  }
  check(
    "every frame of the press moves the node the pointer is on",
    perFrameReplacements.every(
      (ids) => ids.length === 1 && ids[0] === dragged.id,
    ),
    `per-frame replacements: ${JSON.stringify(perFrameReplacements)} — a ` +
      "frame that replaced nothing is a node that did not follow the cursor; " +
      "a frame that replaced several is a re-adopt of nodes that never moved",
  );
  const shown = inFlight.find((node) => node.id === dragged.id).position;
  check(
    "and shows it at the position the library snapped to",
    shown.x === framePositions.at(-1).x && shown.y === framePositions.at(-1).y,
    `showing ${JSON.stringify(shown)}, snapped ${JSON.stringify(framePositions.at(-1))}`,
  );

  /* --- the handover, which is where a flicker would live ------------------- */

  /* THE PRESS BOUNDARY IS THE LIBRARY'S FLAG, not this handler's existence.
     React Flow emits `dragging: false` both at the end of a gesture and on an
     ABORTED one — a second finger, or the node deleted under the pointer —
     and the aborted path never calls `onNodeDragStop`. Clearing on the flag is
     what stops an aborted press leaving a position the document never saw. */
  const landed = framePositions.at(-1);
  const released = dragOverlayAfter(overlay, [
    { id: dragged.id, type: "position", position: landed, dragging: false },
  ]);
  check(
    "the press boundary clears the overlay, whether or not a commit follows",
    released.size === 0,
    `${released.size} entr(y/ies) survived the release — an aborted drag ` +
      "would leave the node showing a position the text never received, with " +
      "nothing left to correct it",
  );

  const committedEdit = movedNodeEdit(
    document_,
    sourceTextFor(document_),
    rootId,
    dragged.id,
    { x: Math.round(landed.x), y: Math.round(landed.y) },
  );
  check(
    "a press over that distance is a real edit, not a refused no-op",
    committedEdit !== null,
    "movedNodeEdit refused the fixture — the handover below would be " +
      "comparing a diagram against itself",
  );
  const committedDiagram = committedEdit.doc.synced.model.diagrams[rootId];
  const committedPosition = committedDiagram.nodes.find(
    (node) => node.id === dragged.id,
  ).position;
  /* THE ARITHMETIC HAS TO AGREE, and this is the assertion that says so
     without a browser: the overlay rounds what the library snapped, the commit
     rounds the same value, and `C4Node.position` is integral — so if either
     side ever rounded differently the node would land on one pixel and then
     move to another. */
  check(
    "the committed position is the position the last frame was showing",
    committedPosition.x === shown.x && committedPosition.y === shown.y,
    `committed ${JSON.stringify(committedPosition)}, shown ${JSON.stringify(shown)}`,
  );
  const afterRelease = projectDragged(
    diagramWithDragOverlay(committedDiagram, released),
    committedEdit.doc.synced.model,
  );
  check(
    "and the release re-adopts nothing at all — the node cannot settle twice",
    afterRelease.length === inFlight.length &&
      afterRelease.every((node, i) => node === inFlight[i]),
    `${afterRelease
      .filter((node, i) => node !== inFlight[i])
      .map((n) => n.id)
      .join(", ")} ` +
      "was replaced when the text caught up: the reader would see that node " +
      "re-adopted after the gesture had visibly finished",
  );

  /* --- the frame and the node it contains must not disagree ---------------- */

  /* A frame's box is the bounding box of its members' positions, so a frame
     fed the MODEL while the nodes follow the pointer would visibly fail to
     contain the node it owns and then jump on release. Asserted as the
     relationship (contains / does not contain), and in both directions, so it
     is provably the overlay doing the work. The seed carries no frames, so one
     is added here: `frames` plus `frameId` is the whole of the model's
     membership contract (see C4Diagram's comment). */
  const framedDiagram = {
    ...rootDiagram,
    frames: [{ id: "f-boundary", label: "Internal" }],
    nodes: rootDiagram.nodes.map((node) => ({
      ...node,
      frameId: "f-boundary",
    })),
  };
  const contains = (frame, node) =>
    frame !== undefined &&
    node.position.x >= frame.x &&
    node.position.y >= frame.y &&
    node.position.x + node.size.width <= frame.x + frame.width &&
    node.position.y + node.size.height <= frame.y + frame.height;
  const midPress = new Map([[dragged.id, landed]]);
  const staleFrame = placeFrames(framedDiagram)[0];
  const liveFrame = placeFrames(
    diagramWithDragOverlay(framedDiagram, midPress),
  )[0];
  const movedNode = { ...dragged, position: landed };
  check(
    "the fixture frame would genuinely be left behind by the model alone",
    !contains(staleFrame, movedNode),
    `frame ${JSON.stringify(staleFrame)} already contains the dragged node at ` +
      `${JSON.stringify(landed)} — this pair proves nothing`,
  );
  check(
    "a frame follows the node it contains for the whole press",
    contains(liveFrame, movedNode),
    `frame ${JSON.stringify(liveFrame)} does not contain the node at ` +
      `${JSON.stringify(landed)} — the boundary would visibly lag its own ` +
      "member and jump on release",
  );
  check(
    "and the canvas feeds the frames and the nodes the same diagram",
    /diagram: draggedDiagram/.test(canvas) &&
      /<FrameLayer\b[^>]*\sdiagram=\{draggedDiagram\}/.test(canvas),
    "the projection and the frame layer are reading different diagrams — two " +
      "halves of one picture, each self-consistent, that disagree mid-press",
  );
}

/* ----------------------------------------------------------------------- */
/* 13. An edit is a LINE PATCH, so the author's own bytes survive it        */
/* ----------------------------------------------------------------------- */

console.log("\nAn edit keeps every byte it is not about");

{
  /* NON-CANONICAL ON PURPOSE, in every way the serializer normalises, because
     canonical input cannot fail these assertions — a re-emit of canonical text
     IS canonical text, which is exactly why the whole-document re-emit passed
     every check in this file for a release while silently eating comments.
     Each deviation below is one form of the damage:
       - `//` lines, which the parser drops with no capture and the serializer
         has nothing to write back;
       - a blank line inside the diagram body, which a re-emit reflows away;
       - an explicit `(x,y wxh)` on `web` that is exactly the DEFAULT for that
         node, so the serializer omits the token entirely — an author's
         explicit write of an omitted-at-default field. Computed from
         `defaultPositions`/`defaultSizeFor` rather than typed, or a tune to
         the layout would turn this into an ordinary non-default geometry and
         the assertion below would pass while proving nothing;
       - `:"uses"` with no space, which canonical form writes as `: "uses"`. */
  const webPoint = defaultPositions(
    ["cust", "web"],
    [{ source: "cust", target: "web" }],
  ).get("web");
  const webSize = defaultSizeFor("system");
  const webDefaultToken = `(${webPoint.x},${webPoint.y} ${webSize.width}x${webSize.height})`;

  const authored = [
    `archlab 1.0`,
    `title "Commented"`,
    ``,
    `// A note about the whole file.`,
    `@context ctx "System context"`,
    ``,
    `  // Who uses this thing.`,
    `  cust:person "Customer" (400,240 160x96)`,
    `    desc "The paying kind."`,
    `  web:system "Web App" ${webDefaultToken}`,
    ``,
    `  // How they reach it.`,
    `  cust -> web :"uses"`,
    ``,
  ].join("\n");

  const doc = c4Document(authored);
  const canonical = sourceTextFor(doc);
  check(
    "the fixture is genuinely not canonical — otherwise this section is vacuous",
    authored !== canonical,
    "the authored text already equals what the serializer emits",
  );

  const comments = (text) => text.split("\n").filter((l) => l.includes("//"));
  check(
    "and a whole-document re-emit would genuinely destroy it",
    comments(canonical).length === 0 && comments(authored).length === 3,
    `${comments(canonical).length} comments survive canonicalisation, ` +
      `${comments(authored).length} were written — if these match, the ` +
      "assertions below cannot fail",
  );

  /* --- a move --------------------------------------------------------------- */

  const to = { x: 400 + EDIT_GRID * 2, y: 240 + EDIT_GRID };
  const moved = movedNodeEdit(doc, authored, "ctx", "cust", to);
  check(
    "a drag on authored text takes the PATCH path, by name",
    moved !== null && moved.path === "patch",
    `path: ${moved === null ? "refused" : moved.path}`,
  );

  const changed = changedLines(authored, moved?.text ?? "");
  check(
    "a drag on authored text still rewrites exactly one line",
    changed.length === 1,
    `${changed.length} lines changed: ${changed
      .map((c) => `#${c.index + 1}`)
      .join(", ")}`,
  );

  /* 1. THE COMMENTS. Byte for byte, in position — not merely "still present":
     a patch that shifted them by a line would have moved a comment off the
     declaration it was written above, which is the same loss more quietly. */
  const untouched = (before, after, skip) => {
    const b = before.split("\n");
    const a = after.split("\n");
    if (a.length !== b.length)
      return `line count changed ${b.length} → ${a.length}`;
    for (let i = 0; i < b.length; i += 1) {
      if (i === skip) continue;
      if (a[i] !== b[i]) {
        return `line ${i + 1}: ${JSON.stringify(b[i])} → ${JSON.stringify(a[i])}`;
      }
    }
    return null;
  };
  const drift =
    changed.length === 1
      ? untouched(authored, moved.text, changed[0].index)
      : "wrong number of changed lines";
  check(
    "every OTHER line is byte-identical after a drag — comments, blanks, spacing",
    drift === null,
    drift ?? undefined,
  );

  /* 2. BLANK LINES, called out separately from the sweep above because this is
     the one the eye forgives and a diff does not: the serializer places blanks
     by rule (one before each diagram, one between nodes and edges), so a
     re-emit silently re-spaces a file an author had laid out. */
  const blanks = (text) =>
    text.split("\n").flatMap((line, i) => (line === "" ? [i] : []));
  check(
    "a drag moves no blank line",
    JSON.stringify(blanks(moved?.text ?? "")) ===
      JSON.stringify(blanks(authored)),
    `${JSON.stringify(blanks(moved?.text ?? ""))} vs ${JSON.stringify(blanks(authored))}`,
  );

  /* 3. AN OMITTED-AT-DEFAULT FIELD THE AUTHOR WROTE OUT. `web`'s `(0,0 200x120)`
     is exactly what the default layout would give it, so the serializer drops
     the token — and dropping it changes nothing about the render, which is why
     this loss is invisible until the author opens their file in git. Proven to
     be the real case by asserting the canonical form does NOT carry it. */
  check(
    "the fixture's explicit geometry really is one the serializer omits",
    !canonical.includes(webDefaultToken) && authored.includes(webDefaultToken),
    `${webDefaultToken} survives canonicalisation — it is not the default ` +
      "after all, and this pair proves nothing",
  );
  check(
    "an explicitly-written default geometry survives a drag on another node",
    (moved?.text ?? "").includes(`  web:system "Web App" ${webDefaultToken}`),
    "the `web` line lost the geometry its author typed",
  );

  /* 4. THE PATCHED LINE IS CANONICAL. Derived from the serializer, never
     hand-written: a patch that wrote almost-canonical text would trade a
     silent comment loss for a silent divergence between the edited line and
     every other line in the file, which is worse. The comparison is against
     the line a FULL serialise of the moved document produces for that node. */
  const canonicalAfter = sourceTextFor(moved?.doc ?? doc);
  const movedNodeLine = canonicalAfter
    .split("\n")
    .find((line) => line.trimStart().startsWith("cust:person"));
  check(
    "the patched line is byte-identical to what the serializer would emit",
    changed.length === 1 && changed[0].after === movedNodeLine,
    `patched:   ${JSON.stringify(changed[0]?.after)}\n      ` +
      `serialiser: ${JSON.stringify(movedNodeLine)}`,
  );

  /* --- a delete ------------------------------------------------------------- */

  const deleted = deletedNodeEdit(doc, authored, "ctx", "web");
  check(
    "a delete on authored text takes the PATCH path too, by name",
    deleted !== null && deleted.path === "patch",
    `path: ${deleted === null ? "refused" : deleted.path}`,
  );
  check(
    "a delete keeps every comment the author wrote",
    JSON.stringify(comments(deleted?.text ?? "")) ===
      JSON.stringify(comments(authored)),
    `${JSON.stringify(comments(deleted?.text ?? ""))}`,
  );
  /* The node's whole BLOCK goes, continuation lines included. A `desc` left
     indented under nothing is not merely untidy — it fails the parser's
     "this continuation line has no node or edge line above it". */
  const survivingDesc = deletedNodeEdit(doc, authored, "ctx", "cust");
  check(
    "deleting a node removes its continuation lines with it",
    survivingDesc !== null &&
      !survivingDesc.text.includes(`desc "The paying kind."`),
    "the `desc` line outlived the node it belonged to",
  );

  /* --- round trip, in its new and stronger form ---------------------------- */

  /* THE INVARIANT THIS FIX MUST NOT BUY ITS WAY OUT OF. `check:roundtrip`
     already proves that opening a canonical file and saving it changes no
     bytes. A patch raises the bar: drag a node and drag it back, and the
     AUTHORED bytes must return — not canonical ones. Assertion 4 above proves
     the same thing for canonical input, where it cannot distinguish a working
     patch from a re-emit; this is the version that can. It is also the
     assertion that would catch an off-by-one in `applyPatches`, which would
     show up as a duplicated or swallowed line rather than as a wrong value. */
  const there = movedNodeEdit(doc, authored, "ctx", "cust", to);
  const back =
    there === null
      ? null
      : movedNodeEdit(there.doc, there.text, "ctx", "cust", {
          x: 400,
          y: 240,
        });
  check(
    "a drag and a drag back restore the AUTHORED bytes, not canonical ones",
    back !== null && back.text === authored,
    back === null
      ? "the return drag was refused"
      : firstDiff(back.text, authored),
  );

  /* --- the named fallback ------------------------------------------------- */

  /* THE RE-EMIT PATH IS PINNED, not left to be discovered. The next person has
     to be able to tell which gestures are safe, and `path` is the only thing
     that says so — an assertion that never names `"reemit"` would let the
     patch path silently stop being taken. Both forcing conditions from
     `patchablePane` are exercised. */
  const jsonPane = { ...doc, format: "json" };
  const inJson = movedNodeEdit(
    jsonPane,
    doc.synced.jsonText,
    "ctx",
    "cust",
    to,
  );
  check(
    "a C4 document sitting in the pane as JSON re-emits, and says so",
    inJson !== null && inJson.path === "reemit",
    `path: ${inJson === null ? "refused" : inJson.path}`,
  );
  check(
    "and the re-emit is written in the pane's OWN language, not .alab",
    inJson !== null && inJson.text === inJson.doc.synced.jsonText,
    "the JSON pane was handed .alab text",
  );
  /* AGREEMENT IS SEMANTIC, NOT TEXTUAL, and that distinction is worth pinning
     in both directions. A comment typed since the last parse means the SAME
     document, so its spans are still valid and the patch must go ahead —
     keeping the comment the reader just wrote. A renamed node means a
     different document, and splicing by its line numbers would corrupt the
     pane. */
  const commentedSince = movedNodeEdit(
    doc,
    `${authored}// typed since the last parse, and semantically nothing\n`,
    "ctx",
    "cust",
    to,
  );
  check(
    "a pane that only gained a comment since the last parse is still patched",
    commentedSince !== null &&
      commentedSince.path === "patch" &&
      commentedSince.text.includes("typed since the last parse"),
    `path: ${commentedSince === null ? "refused" : commentedSince.path}`,
  );
  const renamed = movedNodeEdit(
    doc,
    authored.replace(`"Customer"`, `"Renamed Customer"`),
    "ctx",
    "cust",
    to,
  );
  check(
    "a pane that MEANS something else re-emits rather than splicing into it",
    renamed !== null && renamed.path === "reemit",
    `path: ${renamed === null ? "refused" : renamed.path} — line numbers from ` +
      "a document the canvas is not showing would corrupt the reader's file",
  );
  const broken = movedNodeEdit(
    doc,
    `${authored}  not a node line at all\n`,
    "ctx",
    "cust",
    to,
  );
  check(
    "a pane that does not parse re-emits rather than splicing into it",
    broken !== null && broken.path === "reemit",
    `path: ${broken === null ? "refused" : broken.path}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 14. A revise is a BLOCK patch, held to section 13's standard             */
/* ----------------------------------------------------------------------- */

console.log("\nA revise rewrites one node's block and nothing else");

{
  /* NON-CANONICAL FOR THE SAME REASON section 13's fixture is, plus the two
     shapes only a REVISE can get wrong: a `^ref` in another diagram whose
     name the author OMITTED (it derives from the edited node's), and a child
     diagram head whose title the author omitted for the same reason. Both are
     the format's "same as the source" — a rename must let them FOLLOW, and a
     delete must not have taught this gesture to rewrite them. */
  const authored = [
    `archlab 1.0`,
    `title "Revise probe"`,
    ``,
    `// The file's own note.`,
    `@context ctx "System context"`,
    ``,
    `  // Who uses this thing.`,
    `  cust:person "Customer" [human]`,
    `    desc "The paying kind."`,
    `  web:system "Web App" >backend`,
    ``,
    `  cust -> web :"uses"`,
    ``,
    `@container backend owner=web`,
    `  api:container "API" [Go]`,
    `  mirror:external ^ctx/web`,
    ``,
  ].join("\n");

  const doc = c4Document(authored);
  check(
    "the fixture is genuinely not canonical — otherwise this section is vacuous",
    authored !== sourceTextFor(doc),
    "the authored text already equals what the serializer emits",
  );

  /* A gesture that THROWS on a bad address takes the page down with it, so
     every refusal below is measured as "returns null without throwing". */
  const refuses = (run) => {
    try {
      return run() === null;
    } catch {
      return false;
    }
  };

  /* --- the patch, and its blast radius ------------------------------------ */

  const revision = {
    name: "Shopper",
    technology: "human",
    description: "The paying kind, renamed.",
  };
  const revised = revisedNodeEdit(doc, authored, "ctx", "cust", revision);
  check(
    "a revise on authored text takes the PATCH path, by name",
    revised !== null && revised.path === "patch",
    `path: ${revised === null ? "refused" : revised.path}`,
  );
  /* ONLY THE NODE'S OWN BLOCK. The fixture's `cust` block is two lines
     (declaration + desc), and this revision keeps it two — so exactly those
     two lines may differ, and every comment, blank line and other node is
     byte-identical. This is the canonical-diff minimality claim for a block
     gesture: section 13 asserts "one line" for a move, this asserts "the
     block and nothing else". */
  const changed = changedLines(authored, revised?.text ?? "");
  check(
    "a revise changes exactly the node's own two lines",
    changed.length === 2 &&
      changed.every(
        (line, i, all) => i === 0 || line.index === all[0].index + 1,
      ),
    `${changed.length} lines changed: ${changed.map((c) => `#${c.index + 1}`).join(", ")}`,
  );
  check(
    "the comments and blank lines all survive a revise",
    (revised?.text ?? "").split("\n").filter((l) => l.includes("//")).length ===
      authored.split("\n").filter((l) => l.includes("//")).length &&
      authored.split("\n").filter((l) => l.includes("//")).length === 2,
    "an author comment was eaten — the whole reason edits are patches",
  );
  /* THE PATCHED BLOCK IS CANONICAL, proved against a FULL serialise of the
     revised document rather than against lines assembled here — the same
     derivation section 13 uses for the moved line, for the same reason: a
     patch that wrote almost-canonical text would trade a silent comment loss
     for a silent divergence. */
  const canonicalAfter = sourceTextFor(revised?.doc ?? doc);
  const blockAfter = canonicalAfter
    .split("\n")
    .filter(
      (line) =>
        line.trimStart().startsWith("cust:person") ||
        line.includes(`desc "The paying kind, renamed."`),
    );
  check(
    "the patched block is byte-identical to what the serializer would emit",
    changed.length === 2 &&
      JSON.stringify(changed.map((c) => c.after)) ===
        JSON.stringify(blockAfter),
    `patched:    ${JSON.stringify(changed.map((c) => c.after))}\n      ` +
      `serialiser: ${JSON.stringify(blockAfter)}`,
  );

  /* --- what a revise refuses, and how -------------------------------------- */

  check(
    "a no-op revision is refused, so an untouched Apply costs no undo entry",
    refuses(() =>
      revisedNodeEdit(doc, authored, "ctx", "cust", {
        name: "Customer",
        technology: "human",
        description: "The paying kind.",
      }),
    ),
    "identical fields still rewrote the pane",
  );
  check(
    "an unknown node id refuses rather than throws",
    refuses(() => revisedNodeEdit(doc, authored, "ctx", "ghost", revision)),
    "a stale selection would take the page down instead of doing nothing",
  );
  check(
    "an unknown diagram id refuses rather than throws",
    refuses(() => revisedNodeEdit(doc, authored, "ghost", "cust", revision)),
    "a stale selection would take the page down instead of doing nothing",
  );
  check(
    "an empty name is refused — the model requires one",
    refuses(() => revisedNodeEdit(doc, authored, "ctx", "cust", { name: "" })),
    "an empty name would reach the serializer, which throws on it",
  );
  /* A boundary placeholder's name is DERIVED from its target, and the panel
     shows it read-only; the module must reach the same verdict or the two
     halves disagree about one node. */
  check(
    "a boundary placeholder (^ref) is refused",
    refuses(() =>
      revisedNodeEdit(doc, authored, "backend", "mirror", { name: "Forked" }),
    ),
    "revising a mirror would fork it from the node it mirrors",
  );

  /* --- clearing a field removes it ----------------------------------------- */

  /* `.alab` can spell `[""]` and `desc ""`, and both render as a blank the
     reader cannot tell from a missing field — so a cleared field must vanish
     from the text, not blank in place. The same contract the sequence dock's
     forms state, measured here on the C4 side. */
  const cleared = revisedNodeEdit(doc, authored, "ctx", "cust", {
    name: "Customer",
  });
  check(
    "clearing technology and description removes the fields, never blanks them",
    cleared !== null &&
      cleared.path === "patch" &&
      !cleared.text.includes(`[""]`) &&
      !cleared.text.includes(`desc ""`) &&
      !cleared.text.includes("[human]") &&
      !cleared.text.includes("The paying kind."),
    `text still carries a cleared field: ${JSON.stringify(
      (cleared?.text ?? "")
        .split("\n")
        .find((l) => l.includes("cust:person") || l.includes("desc")),
    )}`,
  );
  /* And ADDING a description grows the block by one continuation line —
     the case a one-line splice cannot serve and the reason a revise deals in
     blocks. `web` has no desc in the fixture. */
  const grown = revisedNodeEdit(doc, authored, "ctx", "web", {
    name: "Web App",
    description: "Serves the storefront.",
  });
  check(
    "adding a description grows the node's block by its desc line",
    grown !== null &&
      grown.path === "patch" &&
      grown.text.includes(`    desc "Serves the storefront."`),
    "the new continuation line is missing or mis-indented",
  );

  /* --- what a rename carries, measured both ways --------------------------- */

  const renamed = revisedNodeEdit(doc, authored, "ctx", "web", {
    name: "Storefront",
  });
  const renamedFile =
    renamed !== null && renamed.doc.kind === "c4"
      ? renamed.doc.synced.file
      : null;
  check(
    "an OMITTED ^ref name follows the rename — omission means 'same as the source'",
    renamedFile !== null &&
      renamedFile.diagrams
        .find((d) => d.id === "backend")
        .nodes.find((n) => n.id === "mirror").name === "Storefront",
    "the mirror kept the old name — the patch rewrote a derivation the author never wrote",
  );
  check(
    "an OMITTED child-diagram title follows the rename, for the same reason",
    renamedFile !== null &&
      renamedFile.diagrams.find((d) => d.id === "backend").title ===
        "Storefront",
    "the child diagram kept a title its own text never spells",
  );
  /* The other direction: the SAME name and title written OUT stay put. The
     author spelled them, so they are the author's — following the rename here
     would rewrite bytes the gesture was not about. */
  const explicit = authored
    .replace(`web:system "Web App" >backend`, `web:system "Web App" >backend`)
    .replace(
      `@container backend owner=web`,
      `@container backend "Web App" owner=web`,
    )
    .replace(
      `  mirror:external ^ctx/web`,
      `  mirror:external "Web App" ^ctx/web`,
    );
  const explicitDoc = c4Document(explicit);
  const renamedExplicit = revisedNodeEdit(explicitDoc, explicit, "ctx", "web", {
    name: "Storefront",
  });
  const explicitFile =
    renamedExplicit !== null && renamedExplicit.doc.kind === "c4"
      ? renamedExplicit.doc.synced.file
      : null;
  check(
    "a ^ref name the author wrote out stays exactly as written",
    renamedExplicit !== null &&
      renamedExplicit.path === "patch" &&
      renamedExplicit.text.includes(`mirror:external "Web App" ^ctx/web`) &&
      explicitFile !== null &&
      explicitFile.diagrams
        .find((d) => d.id === "backend")
        .nodes.find((n) => n.id === "mirror").name === "Web App",
    "an explicit local name was renamed along with its target",
  );
  check(
    "a child-diagram title the author wrote out stays exactly as written",
    renamedExplicit !== null &&
      renamedExplicit.text.includes(`@container backend "Web App" owner=web`) &&
      explicitFile !== null &&
      explicitFile.diagrams.find((d) => d.id === "backend").title === "Web App",
    "an explicit title was renamed along with the owner node",
  );
  /* THE SLOT REACHES EACH CANVAS. Section 8's founding bug was a control
     correct in the module and unreachable on the screen; a slot prop is a new
     way to reproduce it (built, passed, never mounted), so each hop is
     pinned: the shell forwards, and each canvas renders — the C4 one inside
     its top-right panel, where the details card already lives, the sequence
     one over its diagram pane. */
  const shellSrc = read("src/features/viewer/components/viewer-shell.tsx");
  const canvasSrc = read("src/features/viewer/components/viewer-canvas.tsx");
  const sequenceSrc = read(
    "src/features/sequence/components/sequence-viewer.tsx",
  );
  check(
    "the shell forwards the lock slot to the C4 canvas",
    /lockSlot=\{lockSlot\}/.test(shellSrc),
    "the playground hands the shell a lock the canvas never receives",
  );
  check(
    "the C4 canvas mounts the lock slot in its top-right panel",
    /position="top-right"[\s\S]{0,700}\{lockSlot\}/.test(canvasSrc),
    "the C4 lock is built but never reaches the canvas corner — section 8's " +
      "bug in slot form",
  );
  check(
    "the sequence canvas mounts the lock slot over its diagram pane",
    /\{lockSlot !== undefined \?/.test(sequenceSrc) &&
      /\{lockSlot\}/.test(sequenceSrc),
    "the sequence lock is built but never reaches the canvas — the branch " +
      "this section exists for, again",
  );

  /* --- round trip, and the named fallback ---------------------------------- */

  const there = revisedNodeEdit(doc, authored, "ctx", "cust", revision);
  const back =
    there === null
      ? null
      : revisedNodeEdit(there.doc, there.text, "ctx", "cust", {
          name: "Customer",
          technology: "human",
          description: "The paying kind.",
        });
  check(
    "a revise and a revise back restore the AUTHORED bytes, not canonical ones",
    back !== null && back.text === authored,
    back === null
      ? "the return revise was refused"
      : firstDiff(back.text, authored),
  );
  const inJson = revisedNodeEdit(
    { ...doc, format: "json" },
    doc.synced.jsonText,
    "ctx",
    "cust",
    revision,
  );
  check(
    "a C4 document sitting in the pane as JSON re-emits, and says so",
    inJson !== null &&
      inJson.path === "reemit" &&
      inJson.text === inJson.doc.synced.jsonText,
    `path: ${inJson === null ? "refused" : inJson.path}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 14a. The same revise carries the ICON and the COLOUR, and colour is two  */
/*      writes with a precedence trap between them                          */
/* ----------------------------------------------------------------------- */

console.log("\nA revise carries the icon and the colour, both as patches");

{
  const { colorTagsOf, resolveTagColor, NODE_TAG_PALETTE, EXTERNAL_TAG } =
    await load("src/features/editor/lib/node-colors.ts");

  /* Non-canonical for section 13's reason, and shaped for colour's own traps:
     `legacy` is a DOCUMENTED colour (a `tagcolor` line), `vip` is a plain tag
     with no colour — a colour change must take the first off the node and
     leave the second alone, and nothing but measuring both tells them apart. */
  const authored = [
    `archlab 1.0`,
    `title "Colour probe"`,
    `tagcolor legacy "#8b0000"`,
    ``,
    `// The header ends above this comment.`,
    `@context ctx "System context"`,
    `  api:system "API"`,
    `  cust:person "Customer" #legacy #vip`,
    `  web:system "Web App" [Next.js]`,
    ``,
  ].join("\n");
  const doc = c4Document(authored);
  check(
    "the colour fixture is genuinely not canonical — otherwise this section is vacuous",
    authored !== sourceTextFor(doc),
    "the authored text already equals what the serializer emits",
  );
  const docColors = doc.synced.file.metadata.tagColors;

  /* --- the icon: one more token on the same block patch --------------------- */

  const picked = revisedNodeEdit(doc, authored, "ctx", "web", {
    name: "Web App",
    technology: "Next.js",
    icon: "nextjs",
    iconSource: "explicit",
  });
  const pickedChanges = changedLines(authored, picked?.text ?? "");
  check(
    "picking an icon writes @slug! onto the declaration line and nothing else moves",
    picked !== null &&
      picked.path === "patch" &&
      pickedChanges.length === 1 &&
      pickedChanges[0].after.includes("@nextjs!"),
    `changed: ${JSON.stringify(pickedChanges.map((c) => c.after))}`,
  );
  const pickedNode =
    picked === null
      ? undefined
      : picked.doc.synced.file.diagrams[0].nodes.find((n) => n.id === "web");
  check(
    "the picked icon survives the round trip as explicit — never auto-overridden later",
    pickedNode !== undefined &&
      pickedNode.icon === "nextjs" &&
      pickedNode.iconSource === "explicit",
    `icon after re-parse: ${JSON.stringify([pickedNode?.icon, pickedNode?.iconSource])}`,
  );
  const clearedIcon =
    picked === null
      ? null
      : revisedNodeEdit(picked.doc, picked.text, "ctx", "web", {
          name: "Web App",
          technology: "Next.js",
        });
  check(
    "clearing the icon removes the @ token — absence IS the type default, and the bytes come back",
    clearedIcon !== null && clearedIcon.text === authored,
    clearedIcon === null
      ? "the clearing revise was refused"
      : firstDiff(clearedIcon.text, authored),
  );

  /* --- the trap, measured before it is handled ------------------------------ */

  /* The premise first: with tags stored sorted, a naively APPENDED `rose`
     would lose the precedence race to `legacy` — the FIRST coloured tag in
     stored order wins, and "rose" sorts after "legacy". If this stops being
     true the removal below is solving a problem that no longer exists, and
     should be revisited rather than left standing. */
  const rose = { kind: "tag", tag: "rose", color: "#ca549d" };
  check(
    "the trap is real: on a naive append the OLD colour still wins the race",
    resolveTagColor(
      { tags: ["legacy", "rose", "vip"] },
      { ...docColors, rose: rose.color },
    ) === "#8b0000",
    "appending now wins outright — the removal below may be over-handling",
  );

  /* --- a colour on an untagged node: the mint is exactly two writes --------- */

  const amber = { kind: "tag", tag: "amber", color: "#a47c13" };
  const minted = revisedNodeEdit(doc, authored, "ctx", "api", {
    name: "API",
    color: amber,
  });
  const mintedLines = (minted?.text ?? "").split("\n");
  const mintedAt = mintedLines.indexOf(`tagcolor amber "#a47c13"`);
  check(
    "minting a colour is a patch: the node gains #amber and the header gains ONE canonical tagcolor line",
    minted !== null &&
      minted.path === "patch" &&
      mintedAt !== -1 &&
      mintedLines.some(
        (line) => line.includes("api:system") && line.includes("#amber"),
      ),
    `path: ${minted === null ? "refused" : minted.path}; header line at ${mintedAt}`,
  );
  check(
    "the minted line lands inside the header, directly after the existing tagcolor block",
    mintedAt === 3 &&
      mintedAt < mintedLines.findIndex((l) => l.startsWith("@")),
    `minted at line ${mintedAt + 1}; the header ends before the first "@"`,
  );
  check(
    "every byte outside the two colour writes survives the mint",
    minted !== null &&
      changedLines(
        authored,
        mintedLines.filter((_, i) => i !== mintedAt).join("\n"),
      ).length === 1,
    "a colour change rewrote lines it was not about",
  );
  const mintedApi =
    minted === null
      ? undefined
      : minted.doc.synced.file.diagrams[0].nodes.find((n) => n.id === "api");
  check(
    "the minted colour actually paints: the re-parsed node resolves to the picked hex",
    mintedApi !== undefined &&
      resolveTagColor(mintedApi, minted.doc.synced.file.metadata.tagColors) ===
        "#a47c13",
    `resolved: ${JSON.stringify(
      mintedApi === undefined
        ? "no node"
        : resolveTagColor(mintedApi, minted.doc.synced.file.metadata.tagColors),
    )}`,
  );

  /* --- a documented colour is joined, never repainted ------------------------ */

  const joined = revisedNodeEdit(doc, authored, "ctx", "api", {
    name: "API",
    color: { kind: "tag", tag: "legacy", color: "#ffffff" },
  });
  check(
    "joining a documented colour adds no header line and never rewrites its hex",
    joined !== null &&
      joined.path === "patch" &&
      joined.text.includes(`tagcolor legacy "#8b0000"`) &&
      !joined.text.includes("#ffffff") &&
      changedLines(authored, joined.text).length === 1,
    "a single-element control repainted a tag every other element wears",
  );

  /* --- the trap, handled: a new colour takes the losing race off the node --- */

  const swapped = revisedNodeEdit(doc, authored, "ctx", "cust", {
    name: "Customer",
    color: rose,
  });
  const swappedCust =
    swapped === null
      ? undefined
      : swapped.doc.synced.file.diagrams[0].nodes.find((n) => n.id === "cust");
  check(
    "a new colour REMOVES the coloured tag it would otherwise lose to — never a silent no-op",
    swappedCust !== undefined &&
      !(swappedCust.tags ?? []).includes("legacy") &&
      resolveTagColor(
        swappedCust,
        swapped.doc.synced.file.metadata.tagColors,
      ) === rose.color,
    `tags after: ${JSON.stringify(swappedCust?.tags)}`,
  );
  check(
    "the swap keeps the plain tag and keeps the header line other elements may wear",
    swapped !== null &&
      swappedCust !== undefined &&
      (swappedCust.tags ?? []).includes("vip") &&
      swapped.text.includes(`tagcolor legacy "#8b0000"`),
    "a colour change ate a tag that was not a colour, or a header line others use",
  );

  /* --- Automatic: back to the role colour, tags stay honest ------------------ */

  const auto = revisedNodeEdit(doc, authored, "ctx", "cust", {
    name: "Customer",
    color: { kind: "role" },
  });
  const autoCust =
    auto === null
      ? undefined
      : auto.doc.synced.file.diagrams[0].nodes.find((n) => n.id === "cust");
  check(
    "Automatic takes the coloured tag off, keeps the plain one, and leaves the header alone",
    autoCust !== undefined &&
      colorTagsOf(autoCust, auto.doc.synced.file.metadata.tagColors).length ===
        0 &&
      (autoCust.tags ?? []).includes("vip") &&
      auto.text.includes(`tagcolor legacy "#8b0000"`),
    `tags after: ${JSON.stringify(autoCust?.tags)}`,
  );

  /* --- what colour refuses, and what it leaves alone ------------------------- */

  check(
    "re-choosing the colour already in force is a no-op — an untouched Apply costs nothing",
    revisedNodeEdit(doc, authored, "ctx", "cust", {
      name: "Customer",
      color: { kind: "tag", tag: "legacy", color: "#8b0000" },
    }) === null &&
      revisedNodeEdit(doc, authored, "ctx", "api", {
        name: "API",
        color: { kind: "role" },
      }) === null,
    "a form submitted unchanged still rewrote the pane",
  );
  const renamedOnly = revisedNodeEdit(doc, authored, "ctx", "cust", {
    name: "Shopper",
  });
  check(
    "a revision that makes no colour claim leaves the tags exactly as written",
    renamedOnly !== null &&
      renamedOnly.text
        .split("\n")
        .some((l) => l.includes("#legacy") && l.includes("#vip")),
    "an edit that never looked at colour rewrote the tag list",
  );
  /* A `! meta` escape can hold the whole tagColors map, and a minted
     `tagcolor` line beside it is the one thing the parser rejects outright
     (the field spelled both ways) — so the mint must refuse rather than
     hand back an Apply that silently applies nothing. */
  /* The AUTHORED bang text is what sits in the pane — canonical form would
     have normalised the escape into a `tagcolor` line and dissolved the very
     case this guards. */
  const bangText = [
    `archlab 1.0`,
    `title "Bang probe"`,
    `! meta.tagColors : {"legacy":"#8b0000"}`,
    ``,
    `@context ctx "Context"`,
    `  api:system "API"`,
    ``,
  ].join("\n");
  const bangHeld = c4Document(bangText);
  check(
    "a mint against a bang-held tagColors map refuses instead of unparsing the file",
    revisedNodeEdit(bangHeld, bangText, "ctx", "api", {
      name: "API",
      color: amber,
    }) === null,
    "the minted line would spell the field twice and fail the re-parse",
  );
  /* The guard's BREADTH, pinned from the other side: joining a colour the
     bang already defines writes no header line, so nothing about the escape
     is disturbed and the guard must not refuse it — a guard that keys on
     "the map is bang-held" instead of "a line must be minted" would turn
     every colour choice on such a file into a silent nothing. (The refusal
     above is also enforced a second time by the adopt() re-parse; this
     direction is the one only the guard's own condition decides.) */
  const bangJoin = revisedNodeEdit(bangHeld, bangText, "ctx", "api", {
    name: "API",
    color: { kind: "tag", tag: "legacy", color: "#8b0000" },
  });
  check(
    "joining a bang-held colour still patches — the mint guard refuses only the mint",
    bangJoin !== null &&
      bangJoin.path === "patch" &&
      bangJoin.text.includes(`! meta.tagColors : {"legacy":"#8b0000"}`) &&
      bangJoin.text.split("\n").some((l) => l.includes("#legacy")),
    `verdict: ${bangJoin === null ? "refused" : bangJoin.path}`,
  );

  /* --- the palette: every swatch measured on every theme --------------------- */

  /* The same standard the role palette meets in `check:themes`, applied to
     the five colours this feature OFFERS: the raw hex paints the node's
     border, and the on-screen fill is rebuilt as
     oklch(from <hex> tag-fill-l min(c, tag-fill-c) h) — so both are computed
     here exactly as the browser computes them, per theme, and a swatch that
     would vanish on any theme cannot ship. An arbitrary hex is the one thing
     this loop cannot vouch for — which is why the free picker beside these
     swatches never writes one: everything it can emit goes through
     `presentableTagColor`, and the section after this loop audits that
     function's whole OUTPUT SPACE against the same two bars. */
  const { parseHex, oklchToLinear, contrast, parseOklch } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/oklch.mjs")).href
  );
  const { tokensOf, resolveToken } = await import(
    pathToFileURL(path.join(ROOT, "scripts/lib/theme-css.mjs")).href
  );
  const css = read("src/app/globals.css");
  const themes = [
    ...(
      /export const THEMES = \[([^\]]*)\]/.exec(
        read("src/lib/constants.ts"),
      )?.[1] ?? ""
    ).matchAll(/"([a-z-]+)"/g),
  ].map((m) => m[1]);
  check(
    "the theme list was read from constants.ts, not hand-listed here",
    themes.length >= 7 && themes.includes("light") && themes.includes("dark"),
    `parsed ${themes.length} themes: ${themes.join(", ")}`,
  );
  const baseline = tokensOf(css, "light");
  check(
    "every palette entry is a bare-safe lowercase tag, distinct from the external residue tag",
    NODE_TAG_PALETTE.every(
      ({ tag }) => /^[a-z]+$/.test(tag) && tag !== EXTERNAL_TAG,
    ),
    "a tag needing quotes, or one that already MEANS something, in the offer list",
  );
  for (const theme of themes) {
    const tokens = tokensOf(css, theme) ?? baseline;
    const fillL = Number.parseFloat(
      resolveToken("--tag-fill-l", tokens, baseline),
    );
    const fillC = Number.parseFloat(
      resolveToken("--tag-fill-c", tokens, baseline),
    );
    const nameInk = parseOklch(
      resolveToken("--node-foreground", tokens, baseline),
    );
    const worst = NODE_TAG_PALETTE.map(({ tag, color }) => {
      const hex = parseHex(color);
      if (hex === null) return { tag, stroke: 0, name: 0 };
      const [, C, h] = hex.oklch;
      const fill = oklchToLinear(fillL, Math.min(C, fillC), h);
      return {
        tag,
        stroke: contrast(hex.rgb, fill),
        name: contrast(nameInk.rgb, fill),
      };
    });
    check(
      `${theme}: every palette stroke holds >=3:1 against its own constructed fill`,
      worst.every((w) => w.stroke >= 3),
      worst.map((w) => `${w.tag} ${w.stroke.toFixed(2)}:1`).join(", "),
    );
    check(
      `${theme}: a node's title holds >=7:1 on every palette fill`,
      worst.every((w) => w.name >= 7),
      worst.map((w) => `${w.tag} ${w.name.toFixed(2)}:1`).join(", "),
    );
  }

  /* --- the free picker: its whole output space measured on every theme ------ */

  /* The palette loop above vouches for five hexes; the free picker can emit
     ANY hex, so what gets audited is the emitting FUNCTION. Everything the
     form can write goes through `presentableTagColor`, so driving a grid over
     its input space — every hue, lightness from near-black to near-white,
     chroma past its own cap — and holding every OUTPUT to the palette's two
     bars proves the picker cannot ship an invisible border, which is the
     documented reason a free picker used to be refused. */
  const {
    presentableTagColor,
    freeColorTag,
    hexToOklch,
    oklchToLinearRgb,
    TAG_FILL_BY_THEME,
  } = await load("src/features/editor/lib/free-color.ts");

  /* The module's theme table is a deliberate twin of globals.css (CSS cannot
     be imported); this is the pin its header promises. A drifted pair would
     make the clamp solve against fills no theme paints — legible by its own
     arithmetic, invisible on the screen. */
  check(
    "the clamp's theme fill table matches globals.css, theme by theme",
    themes.every((theme) => {
      const tokens = tokensOf(css, theme) ?? baseline;
      const entry = TAG_FILL_BY_THEME[theme];
      return (
        entry !== undefined &&
        entry.l ===
          Number.parseFloat(resolveToken("--tag-fill-l", tokens, baseline)) &&
        entry.c ===
          Number.parseFloat(resolveToken("--tag-fill-c", tokens, baseline))
      );
    }),
    themes
      .map((theme) => `${theme}: ${JSON.stringify(TAG_FILL_BY_THEME[theme])}`)
      .join("; "),
  );
  /* And its colour maths is a twin of scripts/lib/oklch.mjs (app code cannot
     import the check suite) — pinned on a colour grid, both directions, so
     the sweep below cannot pass because the module measures with different
     arithmetic than this file audits with. */
  const mathsAgree = [];
  for (let h = 0; h < 360; h += 45) {
    for (const [L, C] of [
      [0.3, 0.05],
      [0.61, 0.14],
      [0.85, 0.03],
    ]) {
      const a = oklchToLinearRgb(L, C, h);
      const b = oklchToLinear(L, C, h);
      mathsAgree.push(a.every((v, i) => Math.abs(v - b[i]) < 1e-9));
      const hex = `#${b
        .map((c) =>
          Math.round(
            (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255,
          )
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`;
      const ours = hexToOklch(hex);
      const theirs = parseHex(hex);
      mathsAgree.push(
        ours !== null &&
          theirs !== null &&
          ours.oklch.every((v, i) => Math.abs(v - theirs.oklch[i]) < 1e-9),
      );
    }
  }
  check(
    "the module's oklch maths agrees with the check suite's, both directions",
    mathsAgree.every(Boolean),
    "the clamp and this audit measure colour differently — one of them is wrong",
  );

  /* The measuring half of the sweep, per theme, with THIS FILE's machinery. */
  const worstOn = (hex) => {
    const parsed = parseHex(hex);
    if (parsed === null) return null;
    let stroke = Number.POSITIVE_INFINITY;
    let name = Number.POSITIVE_INFINITY;
    for (const theme of themes) {
      const tokens = tokensOf(css, theme) ?? baseline;
      const fillL = Number.parseFloat(
        resolveToken("--tag-fill-l", tokens, baseline),
      );
      const fillC = Number.parseFloat(
        resolveToken("--tag-fill-c", tokens, baseline),
      );
      const nameInk = parseOklch(
        resolveToken("--node-foreground", tokens, baseline),
      );
      const [, C, h] = parsed.oklch;
      const fill = oklchToLinear(fillL, Math.min(C, fillC), h);
      stroke = Math.min(stroke, contrast(parsed.rgb, fill));
      name = Math.min(name, contrast(nameInk.rgb, fill));
    }
    return { stroke, name };
  };

  const gammaEncode = (c) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  const sweep = {
    inputs: 0,
    refused: 0,
    worstStroke: Number.POSITIVE_INFINITY,
    worstName: Number.POSITIVE_INFINITY,
    notIdempotent: 0,
    dishonestVerbatim: 0,
  };
  for (let h = 0; h < 360; h += 5) {
    for (const L of [0.03, 0.2, 0.45, 0.61, 0.75, 0.97]) {
      for (const C of [0, 0.05, 0.11, 0.17, 0.3]) {
        const input = `#${oklchToLinear(L, C, h)
          .map((c) =>
            Math.round(gammaEncode(c) * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")}`;
        sweep.inputs += 1;
        const out = presentableTagColor(input);
        if (out === null) {
          sweep.refused += 1;
          continue;
        }
        const measured = worstOn(out.hex);
        sweep.worstStroke = Math.min(sweep.worstStroke, measured.stroke);
        sweep.worstName = Math.min(sweep.worstName, measured.name);
        /* `adjusted: false` is the form's promise that the author got their
           exact colour — a construction that changed the hex while claiming
           it did not would hide the one disclosure that keeps it honest. */
        if (out.adjusted === false && out.hex !== input) {
          sweep.dishonestVerbatim += 1;
        }
        /* Idempotence is what keeps a reopened colour still: a clamp that
           moves its own output would walk a node's colour a step per edit. */
        const again = presentableTagColor(out.hex);
        if (again === null || again.hex !== out.hex || again.adjusted) {
          sweep.notIdempotent += 1;
        }
      }
    }
  }
  check(
    "every free-pick construction holds >=3:1 stroke and >=7:1 title on every theme",
    sweep.refused === 0 && sweep.worstStroke >= 3 && sweep.worstName >= 7,
    `over ${sweep.inputs} inputs: ${sweep.refused} refused, worst stroke ${sweep.worstStroke.toFixed(3)}:1, worst title ${sweep.worstName.toFixed(2)}:1`,
  );
  check(
    "the construction is idempotent and verbatim only when it truly changed nothing",
    sweep.notIdempotent === 0 && sweep.dishonestVerbatim === 0,
    `${sweep.notIdempotent} outputs moved when fed back in; ${sweep.dishonestVerbatim} claimed verbatim while changed`,
  );
  /* An already-safe hex comes back BYTE-IDENTICAL — the five palette colours
     are the measured proof such hexes exist. A clamp that touched them would
     mean the free picker and the swatches disagree about the same colour. */
  check(
    "a hex that already passes ships verbatim — the palette colours untouched",
    NODE_TAG_PALETTE.every(({ color }) => {
      const out = presentableTagColor(color);
      return out !== null && out.hex === color && out.adjusted === false;
    }),
    "the clamp rewrote a colour the palette audit already vouches for",
  );
  check(
    "non-colours are refused and shorthand is expanded to the long form",
    presentableTagColor("red") === null &&
      presentableTagColor("#12") === null &&
      presentableTagColor("#gggggg") === null &&
      /^#[0-9a-f]{6}$/.test(presentableTagColor("#ABC")?.hex ?? ""),
    "an input the serializer cannot carry got past the picker",
  );

  /* --- the free tag: derived from the hex, so a repeat is a reuse ------------ */

  check(
    "the free tag is deterministic, grammar-bare, and never the external residue",
    freeColorTag("#a47c13", undefined) === "c-a47c13" &&
      /^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/.test(
        freeColorTag("#a47c13", undefined),
      ) &&
      freeColorTag("#a47c13", undefined) !== EXTERNAL_TAG,
    `derived: ${freeColorTag("#a47c13", undefined)}`,
  );
  check(
    "a colliding author tag is stepped around; a matching one is reused",
    freeColorTag("#a47c13", { "c-a47c13": "#000000" }) !== "c-a47c13" &&
      freeColorTag("#a47c13", { "c-a47c13": "#a47c13" }) === "c-a47c13",
    "the free pick would repaint (or needlessly twin) an author's own tag",
  );
  /* End to end, on the same non-canonical fixture: the FIRST free pick mints
     one header line; the SAME pick on a second element joins it. This is the
     answer to "a free picker fattens the header with junk tags": ten elements
     in one custom colour cost one line, exactly as a palette colour does. */
  const freePick = presentableTagColor("#00ff88");
  const freeTag = freeColorTag(freePick.hex, docColors);
  const firstPick = revisedNodeEdit(doc, authored, "ctx", "api", {
    name: "API",
    color: { kind: "tag", tag: freeTag, color: freePick.hex },
  });
  check(
    "the first free pick is a patch that mints exactly one header line",
    firstPick !== null &&
      firstPick.path === "patch" &&
      firstPick.text.split("\n").filter((l) => l.startsWith("tagcolor "))
        .length ===
        authored.split("\n").filter((l) => l.startsWith("tagcolor ")).length +
          1 &&
      firstPick.text.includes(`tagcolor ${freeTag} "${freePick.hex}"`),
    `path: ${firstPick === null ? "refused" : firstPick.path}`,
  );
  const secondPick =
    firstPick === null
      ? null
      : revisedNodeEdit(firstPick.doc, firstPick.text, "ctx", "web", {
          name: "Web App",
          technology: "Next.js",
          color: {
            kind: "tag",
            tag: freeColorTag(
              freePick.hex,
              firstPick.doc.synced.file.metadata.tagColors,
            ),
            color: freePick.hex,
          },
        });
  check(
    "the same colour on a second element reuses the line — no twin is minted",
    secondPick !== null &&
      secondPick.path === "patch" &&
      secondPick.text.split("\n").filter((l) => l.startsWith("tagcolor "))
        .length ===
        firstPick.text.split("\n").filter((l) => l.startsWith("tagcolor "))
          .length &&
      secondPick.text
        .split("\n")
        .some((l) => l.includes("web:system") && l.includes(`#${freeTag}`)),
    `path: ${secondPick === null ? "refused" : secondPick.path}`,
  );
}

/* ----------------------------------------------------------------------- */
/* 14b. The revise gesture is REACHABLE, and the panel's keys stay its own  */
/* ----------------------------------------------------------------------- */

/* The same duty section 14 (sequence) discharges for the dock, derived the
   same way: the gesture list comes from the viewer's own handler interface,
   so a handler added to `CanvasEditHandlers` grows two assertions that fail
   until something calls it and something supplies it. */
console.log(
  "\nEvery C4 canvas gesture is reachable, and the form keeps its keys",
);
{
  const canvas = read("src/features/viewer/components/viewer-canvas.tsx");
  const panel = read("src/features/viewer/components/viewer-node-detail.tsx");
  const playground = readPlaygroundEditSurface();

  const contract = /export interface CanvasEditHandlers \{([\s\S]*?)\n\}/.exec(
    canvas,
  );
  check(
    "the viewer declares a handler contract this section can derive from",
    contract !== null,
    "CanvasEditHandlers not found — every assertion below would be vacuous",
  );
  const handlers = [
    ...new Set(
      [...(contract?.[1] ?? "").matchAll(/^\s{2}(on[A-Z]\w*)\s*[?:]/gm)].map(
        (m) => m[1],
      ),
    ),
  ];
  check(
    "the contract names at least the four gestures the canvas ships",
    handlers.length >= 4,
    `found ${handlers.length}: ${handlers.join(", ")}`,
  );
  for (const handler of handlers) {
    check(
      `the viewer reaches ${handler} from a control`,
      new RegExp(`edit\\??\\.${handler}\\b`).test(canvas),
      "the handler is declared but nothing in the viewer reaches it",
    );
    check(
      `the playground wires ${handler} into the canvas bundle`,
      new RegExp(`${handler}:\\s*handle`).test(playground),
      "the viewer would render a control the host never answers",
    );
  }

  /* THE HOST'S HANDLER LANDS ON THE UNDO RING and refuses the null quietly —
     the same two facts section 14 pins for every destructive sequence
     handler. */
  const body = /const handleNodeRevise = useCallback\(([\s\S]*?)\n  \);/.exec(
    playground,
  );
  check(
    "handleNodeRevise routes through applyCanvasEdit, so it lands on the undo ring",
    body !== null &&
      body[1].includes("applyCanvasEdit(") &&
      !body[1].includes("setText(") &&
      body[1].includes("if (next === null) return;"),
    "a canvas edit that cannot be undone, or a refusal that rewrites the pane",
  );
  check(
    "handleNodeRevise tells the reader how to undo it",
    body !== null && /Cmd or Ctrl \+ Z/.test(body[1]),
    "a wording rewrite with no stated way back",
  );

  /* THE FORM'S KEYS ARE ITS OWN. The details panel renders INSIDE the canvas
     container, so without the field exemption the edit-keys listener reads a
     Backspace in the name field as "delete the selected node" — the reader
     types one character over and the element vanishes. Positional, not just
     present: the exemption has to sit between the focus guard and the delete
     branch of the SAME listener, or it guards nothing. */
  const guardAt = canvas.indexOf("if (!inCanvas) return;");
  const exemptAt = canvas.indexOf('focused.tagName === "TEXTAREA"');
  const deleteAt = canvas.indexOf("edit.onNodeDelete(");
  check(
    "form fields are exempt from the edit keys, before the delete branch",
    guardAt !== -1 && guardAt < exemptAt && exemptAt < deleteAt,
    "Backspace in the panel's name field would delete the node it describes",
  );
  /* And from the Escape ladder, the sequence rung's own rule: Escape typed
     into a field must not deselect the element — deselection unmounts the
     form with the reader's half-typed text in it. */
  check(
    "form fields are exempt from the Escape ladder",
    /target\.tagName === "TEXTAREA"/.test(canvas),
    "Escape in the edit form would unmount it, half-typed text and all",
  );

  /* THE PENCIL IS PRESENCE-GATED, both ways the sequence dock's is: a locked
     or read-only canvas passes no `onRevise`, so no pencil renders (never a
     disabled one), and a boundary placeholder is withheld for the reason the
     module refuses it. */
  check(
    "the panel gates its editor on the handler being present and the node being real",
    /const revisable = onRevise !== undefined && node\.externalRef === undefined;/.test(
      panel,
    ) && /revisable && !editing \? \(/.test(panel),
    "a pencil on a read-only canvas, or on a mirror the module refuses to edit",
  );
  /* The form REMOUNTS per element and starts from the element's own values —
     the sequence forms' rule; an effect syncing state would re-aim an open
     form at whatever got selected next. */
  check(
    "the form is keyed by the node, so selecting another element cannot re-aim it",
    /<NodeEditForm\s+key=\{node\.id\}/.test(panel),
    "an open form would silently point at a node the reader was not editing",
  );
  /* Blank optional fields submit as ABSENT — the module-side assertion in
     section 14 measures the text; this pins the form half of the same
     contract. */
  check(
    "the form submits blank optional fields as absent",
    /technology: orAbsent\(technology\)/.test(panel) &&
      /description: orAbsent\(description\)/.test(panel),
    'a cleared field would submit "" and write a blank the reader cannot see',
  );
  /* THE ICON HALF OF THE SAME CONTRACT: a cleared icon submits as ABSENT
     (spread-guarded, so the type default is spelled as omission, exactly as
     the format writes it), and a picked one is the reader's own choice —
     "explicit", the verdict the editor inspector's picker already hands
     down, so a later technology edit can never auto-override it. */
  check(
    "the form submits a cleared icon as absent and a picked one as explicit",
    /\.\.\.\(icon !== undefined \? \{ icon \} : \{\}\)/.test(panel) &&
      /setIconSource\("explicit"\)/.test(panel),
    "a cleared icon would submit a key, or a picked one could be auto-overridden",
  );
  /* The picker itself is the SHARED one — a third icon searcher beside the
     registry's two consumers is the `dry.md` failure by name. */
  check(
    "the panel opens the shared IconPicker rather than a searcher of its own",
    /import \{ IconPicker \} from "@\/features\/editor\/components\/icon-picker"/.test(
      panel,
    ) && /<IconPicker/.test(panel),
    "a second icon search UI one import away from the existing one",
  );
  /* THE COLOUR CONTROL IS DERIVED, NOT HAND-LISTED (`codebase.md` habit 4):
     the swatches come from NODE_TAG_PALETTE plus the document's own tags,
     and each previews through the same `tagFillCss` construction the canvas
     paints with — a hand-picked hex here could pass every palette audit and
     still show the reader a colour the node will never be. */
  check(
    "the swatches derive from NODE_TAG_PALETTE and preview through tagFillCss",
    /NODE_TAG_PALETTE\.filter/.test(panel) && /tagFillCss\(color\)/.test(panel),
    "a hand-listed swatch row that can drift from the measured palette",
  );
  /* THE TRAP IS DISCLOSED BEFORE APPLY: when the choice takes a coloured tag
     off the element, the form says which — the removal is deliberate module
     behaviour (section 14a measures it) and silent tag removal is how an
     author loses vocabulary without noticing. */
  check(
    "the form warns which coloured tag a new choice replaces, before Apply",
    /replaced\.length > 0/.test(panel) && /Applying removes/.test(panel),
    "a colour swap that silently takes tags off the element",
  );
  /* THE FREE PICK NEVER BYPASSES THE CONSTRUCTION. The comments in the form
     name the construction functions while arguing for them, so these are
     structural reads of the stripped source: the wheel is the native colour
     input, every path into `freeHex` runs through `presentableTagColor`, the
     submitted tag is `freeColorTag`'s, and the preview swatch paints through
     the same `tagFillCss` the canvas uses. A form that held a raw hex
     anywhere would pass the module sweep above and still ship one — the
     construction only protects hexes that actually go through it. */
  const panelCode = code(
    "src/features/viewer/components/viewer-node-detail.tsx",
  );
  check(
    "the free pick is a native colour input plus a validated hex field",
    /type="color"/.test(panelCode) && /#\[0-9a-fA-F\]\{6\}/.test(panelCode),
    "the wheel or the hex validation is gone — a free pick with no way in, " +
      "or one that commits half-typed text",
  );
  check(
    "every committed free colour is presentableTagColor's, and its tag is derived",
    /setFreeHex\(constructed\.hex\)/.test(panelCode) &&
      !/setFreeHex\((?!constructed\.hex)/.test(panelCode) &&
      /freeColorTag\(freeHex, tagColors\)/.test(panelCode),
    "a raw hex can reach the submit — the clamp only protects colours that " +
      "pass through it",
  );
  check(
    "the free preview is the constructed hex through tagFillCss",
    /tagFillCss\(freeHex\)/.test(panelCode),
    "the preview swatch shows a colour the node will never be",
  );
  /* The disclosure is PROSE, so it is read from the raw source: when the
     construction moved the colour, the form says so — a silent clamp is an
     author wondering why their brand hex shifted. */
  check(
    "the form discloses an adjusted colour the moment it happens",
    /freeAdjusted \?/.test(panelCode) &&
      /Adjusted to stay readable on every theme/.test(panel),
    "the clamp moved a colour and nothing said so",
  );
}

/* ----------------------------------------------------------------------- */
/* 14c. The same revise carries the TYPE and the PLAIN TAGS                 */
/* ----------------------------------------------------------------------- */

console.log("\nA revise can change the type, and edits only the plain tags");
{
  /* Non-canonical for section 13's reason, with the shapes only THESE two
     claims can get wrong: a coloured tag beside a plain one (the division the
     tags claim must not cross), an explicit (`!`) and an inferred (`~`) icon
     (the two states a type change must not move), an authored size beside a
     default one (the two size verdicts), and a `^ref` mirror whose keyword
     differs from its source's (the proof a mirror's type is its OWN and must
     not be chased). */
  const authored = [
    `archlab 1.0`,
    `title "Type and tags probe"`,
    `tagcolor amber "#a47c13"`,
    ``,
    `// The file's own note.`,
    `@context ctx "System context"`,
    ``,
    `  // Who uses this thing.`,
    `  cust:person "Customer" #amber #pci`,
    `    desc "The paying kind."`,
    `  web:system "Web App" @nextjs! (400,240 200x120) >backend`,
    `  pay:system "Payments" @stripe~`,
    ``,
    `  cust -> web :"uses"`,
    ``,
    `@container backend owner=web`,
    `  api:container "API" [Go]`,
    `  mirror:external ^ctx/pay`,
    ``,
  ].join("\n");
  const doc = c4Document(authored);
  check(
    "the fixture is genuinely not canonical — otherwise this section is vacuous",
    authored !== sourceTextFor(doc),
    "the authored text already equals what the serializer emits",
  );
  const refuses = (run) => {
    try {
      return run() === null;
    } catch {
      return false;
    }
  };

  /* --- the type: level-legal by the parser's own table --------------------- */

  /* Swept over EVERY type the format has, with the verdict DERIVED from
     `VALID_NODE_TYPES_BY_LEVEL` rather than a hand-picked "container refuses"
     — a hand-picked case cannot notice the type it never heard of
     (`codebase.md` habit 4). The description changes alongside, so a LEGAL
     type always yields an edit and `null` can only mean the refusal under
     test, never the no-op. The failure this prevents: a type keyword written
     into a level whose parser refuses it comes back from the re-parse as an
     error the reader cannot act on. */
  const { VALID_NODE_TYPES_BY_LEVEL: LEVEL_TABLE } =
    await load("src/types/c4.ts");
  const everyType = [...new Set(Object.values(LEVEL_TABLE).flat())];
  check(
    "a type change stays level-legal — accepted and refused exactly as the parser's table says",
    everyType.length === 8 &&
      everyType.every((type) => {
        const legal = LEVEL_TABLE.context.includes(type);
        const edit = (() => {
          try {
            return revisedNodeEdit(doc, authored, "ctx", "cust", {
              name: "Customer",
              description: "Renamed to force a change.",
              type,
            });
          } catch {
            return "threw";
          }
        })();
        return legal ? edit !== null && edit !== "threw" : edit === null;
      }),
    "a type the parser refuses at @context got through, or a legal one was refused",
  );
  /* STRUCTURAL COMPANION, because the sweep above cannot catch the gate's
     removal: `adopt` re-parses every edit, so an illegal keyword is refused
     by the parser even with the module's own guard gone — the "passed on a
     different guard's refusal" trap by name. Observed: deleting the guard
     left the sweep green. What the guard buys is a refusal the CALLER can
     distinguish and announce cheaply, and one derivation shared with the two
     create gestures — so the shared spelling is pinned, all three readers. */
  const canvasEditCode = code("src/features/playground/input/canvas-edit.ts");
  check(
    "the type gate is the module's own palette derivation, shared with both create gestures",
    (
      canvasEditCode.match(
        /creatableNodeTypes\(diagram\.level\)\.some\(\(row\) => row\.type === type\)/g,
      ) ?? []
    ).length === 3,
    "revisedNodeEdit no longer asks creatableNodeTypes itself — an illegal " +
      "keyword would be refused only by the re-parse, at full parse cost",
  );

  /* --- what a type change writes, and what travels with it ----------------- */

  const retyped = revisedNodeEdit(doc, authored, "ctx", "cust", {
    name: "Customer",
    description: "The paying kind.",
    type: "externalSystem",
  });
  const retypedLine = (retyped?.text ?? "")
    .split("\n")
    .find((line) => line.trimStart().startsWith("cust:"));
  check(
    "a type change rewrites the declaration keyword, on the patch path",
    retyped !== null &&
      retyped.path === "patch" &&
      retypedLine === `  cust:external "Customer" #amber #pci`,
    `cust line: ${JSON.stringify(retypedLine)}`,
  );
  /* THE DEFAULT SIZE FOLLOWS THE TYPE. `cust` sat at person's default
     (160×96), so its line carries no geometry token — and must STILL carry
     none after the change, with the re-parse handing it the NEW type's
     default. Freezing the old numbers in would write `(… 160x96)` — an
     explicit size the author never chose, visible above. The re-parse half is
     measured against `defaultSizeFor` itself, not a retyped pair. */
  const retypedSize = retyped?.doc.synced.file.diagrams
    .find((d) => d.id === "ctx")
    .nodes.find((n) => n.id === "cust").size;
  const externalDefault = defaultSizeFor("externalSystem");
  check(
    "a node at the old type's default size adopts the new type's default",
    retypedSize !== undefined &&
      retypedSize.width === externalDefault.width &&
      retypedSize.height === externalDefault.height,
    `size after: ${JSON.stringify(retypedSize)} vs default ${JSON.stringify(externalDefault)}`,
  );
  /* An AUTHORED size is the author's and keeps its bytes — and so does an
     explicit (`!`) icon, `C4Node`'s own never-auto-overridden rule applied to
     the one edit that could tempt a swap. Both measured on `web`'s line. The
     revision CARRIES the icon because icon is whole-value in the form's
     contract (the form always resubmits the current pick); what is measured
     is that the type change does not move it. */
  const webRetyped = revisedNodeEdit(doc, authored, "ctx", "web", {
    name: "Web App",
    type: "externalSystem",
    icon: "nextjs",
    iconSource: "explicit",
  });
  const webLine = (webRetyped?.text ?? "")
    .split("\n")
    .find((line) => line.trimStart().startsWith("web:"));
  check(
    "an authored size and an explicit icon both survive a type change",
    webRetyped !== null &&
      webLine !== undefined &&
      webLine.includes("@nextjs!") &&
      webLine.includes("(400,240 200x120)") &&
      webLine.startsWith("  web:external"),
    `web line: ${JSON.stringify(webLine)}`,
  );
  /* An INFERRED (`~`) icon survives too: it derives from `technology`, which
     a type change does not touch, so its basis is intact — clearing it would
     eat a derivation for no reason. */
  const payRetyped = revisedNodeEdit(doc, authored, "ctx", "pay", {
    name: "Payments",
    type: "externalSystem",
    icon: "stripe",
    iconSource: "inferred",
  });
  const payLine = (payRetyped?.text ?? "")
    .split("\n")
    .find((line) => line.trimStart().startsWith("pay:"));
  check(
    "an inferred icon survives a type change — technology, its basis, did not move",
    payRetyped !== null &&
      payLine !== undefined &&
      payLine.includes("@stripe~"),
    `pay line: ${JSON.stringify(payLine)}`,
  );
  /* A `^ref` MIRROR IS NOT CHASED. The fixture mirrors `pay` (a system) as
     `mirror:external` — the format's proof that a mirror's keyword is its own
     statement at its own level, not a derivation. Rewriting it would give a
     type change the blast radius of a delete; leaving it is what the format
     itself does. Byte-identical, not merely still-parsing. */
  const mirrorLine = (payRetyped?.text ?? "")
    .split("\n")
    .find((line) => line.trimStart().startsWith("mirror:"));
  check(
    "a ^ref mirror elsewhere keeps its own keyword, byte-identical",
    mirrorLine === `  mirror:external ^ctx/pay`,
    `mirror line: ${JSON.stringify(mirrorLine)}`,
  );

  /* --- the tags claim: the plain half only ---------------------------------- */

  /* THE REQUIRED PROPERTY: the panel's tag field never SHOWS the
     colour-carrying tags (they are the Colour control's), so a submitted
     empty list means "no plain tags" — and must be unable to take `#amber`
     off the node. A whole-value list that could would let the one control
     destroy the other's state through a field the reader saw as blank. */
  const bareTags = revisedNodeEdit(doc, authored, "ctx", "cust", {
    name: "Customer",
    description: "The paying kind.",
    tags: [],
  });
  const bareLine = (bareTags?.text ?? "")
    .split("\n")
    .find((line) => line.trimStart().startsWith("cust:"));
  check(
    "the tag editor cannot destroy a colour tag it does not show",
    bareTags !== null &&
      bareTags.path === "patch" &&
      bareLine === `  cust:person "Customer" #amber` &&
      JSON.stringify(
        bareTags.doc.synced.file.diagrams
          .find((d) => d.id === "ctx")
          .nodes.find((n) => n.id === "cust").tags,
      ) === JSON.stringify(["amber"]),
    `cust line: ${JSON.stringify(bareLine)}`,
  );
  check(
    "a tags claim naming a documented colour refuses — that tag is the colour control's",
    refuses(() =>
      revisedNodeEdit(doc, authored, "ctx", "cust", {
        name: "Customer",
        tags: ["amber"],
      }),
    ),
    "a colour-carrying tag reached the node through the tag field",
  );
  check(
    'an empty-string tag refuses — it would spell #"" into the text',
    refuses(() =>
      revisedNodeEdit(doc, authored, "ctx", "cust", {
        name: "Customer",
        tags: [""],
      }),
    ),
    "an empty tag reached the serializer",
  );
  /* Adding plain tags lands them sorted beside the colour tag — the
     serializer's own order — and the block patch touches only the block. */
  const addedTags = revisedNodeEdit(doc, authored, "ctx", "cust", {
    name: "Customer",
    description: "The paying kind.",
    tags: ["zone-a", "pci"],
  });
  const addedLine = (addedTags?.text ?? "")
    .split("\n")
    .find((line) => line.trimStart().startsWith("cust:"));
  check(
    "added plain tags land in canonical order beside the untouched colour tag",
    addedTags !== null &&
      addedTags.path === "patch" &&
      addedLine === `  cust:person "Customer" #amber #pci #zone-a`,
    `cust line: ${JSON.stringify(addedLine)}`,
  );
  check(
    "a tags claim that changes nothing refuses, so an idle Apply costs no undo entry",
    refuses(() =>
      revisedNodeEdit(doc, authored, "ctx", "cust", {
        name: "Customer",
        description: "The paying kind.",
        tags: ["pci"],
      }),
    ),
    "identical plain tags still rewrote the pane",
  );
  /* NO CLAIM MEANS HANDS OFF — the same `undefined` contract colour states:
     a wording-only revision must not touch a tag vocabulary it never saw. */
  const wordingOnly = revisedNodeEdit(doc, authored, "ctx", "cust", {
    name: "Shopper",
    description: "The paying kind.",
  });
  check(
    "a revision with no tags claim leaves the whole tag list alone",
    wordingOnly !== null &&
      (
        wordingOnly.text.split("\n").find((line) => line.includes("cust:")) ??
        ""
      ).includes("#amber #pci"),
    "an absent claim still rewrote the tags",
  );

  /* --- the form half: one derivation, and the division said ----------------- */

  const panel = read("src/features/viewer/components/viewer-node-detail.tsx");
  const panelCode = code(
    "src/features/viewer/components/viewer-node-detail.tsx",
  );
  /* The select reads the SAME `creatableNodeTypes` the Add palette and the
     module's guard read — a hand-written option list is the stale-claim shape
     (`codebase.md` habit 4) with a parse error at the end of it. */
  check(
    "the form's type options derive from creatableNodeTypes, the palette's own table",
    /creatableNodeTypes\(level\)/.test(panelCode) &&
      /option\.keyword/.test(panelCode),
    "the type select hand-lists its options, or stopped teaching the keywords",
  );
  /* The tag field seeds from the NON-colour half by the same `colorTagsOf`
     the module splits on — two readings of "which tags are the colour" is
     how the field would come to show a tag the module refuses to accept. */
  check(
    "the tag field seeds from the non-colour half, split by colorTagsOf",
    /filter\(\(tag\) => !worn\.includes\(tag\)\)/.test(panelCode),
    "the field's idea of 'plain' diverged from the module's",
  );
  /* And the submit filters what the module refuses, with the division SAID
     on both sides — a hidden tag with no sentence reads as a bug, and a
     silently-dropped typed tag eats the reader's text. */
  check(
    "the form filters colour tags from the submit rather than submitting a refusal",
    /typedTags\.filter\(\(tag\) => \(tagColors\?\.\[tag\] \?\? ""\) === ""\)/.test(
      panelCode,
    ),
    "a typed colour tag reaches revisedNodeEdit, which refuses the whole form",
  );
  check(
    "the division is said beside the field, in both directions",
    /managed by the Colour control below/.test(panel) &&
      /Apply leaves/.test(panel),
    "the field hides colour tags, or drops typed ones, without a sentence",
  );
}

/* ----------------------------------------------------------------------- */
/* 15. A create is an INSERT patch, and the palette matches the parser      */
/* ----------------------------------------------------------------------- */

console.log(
  "\nA create inserts one line, at a spot that collides with nothing",
);

{
  const { VALID_NODE_TYPES_BY_LEVEL } = await load("src/types/c4.ts");
  const { NODE_TYPE_ROWS } = await load(
    "src/features/syntax-docs/content/snippets.ts",
  );
  const { NODE_TYPE_BY_KEYWORD } = await load("src/features/archtext/index.ts");

  /* --- the palette cannot offer what the parser refuses -------------------- */

  /* `creatableNodeTypes` derives from the syntax reference's `NODE_TYPE_ROWS`
     (which carries the keywords a palette needs); the PARSER validates a
     node's type against `VALID_NODE_TYPES_BY_LEVEL`. Those are two tables in
     two features that cannot import each other's reason for existing, so this
     is the `dry.md` case where a check pins the pair — level by level, SET
     EQUALITY in both directions, because `every(includes)` passes on a palette
     that quietly lost a type as well as on one that never gained it. The
     failure this prevents is the dishonest button: `container` offered on a
     context diagram creates a document the re-parse refuses, and the reader
     sees a press that does nothing. */
  const levels = Object.keys(VALID_NODE_TYPES_BY_LEVEL);
  check(
    "the level table is the one the parser uses and is non-trivial",
    levels.length === 4 && levels.includes("context"),
    `levels: ${levels.join(", ")}`,
  );
  for (const level of levels) {
    const offered = creatableNodeTypes(level)
      .map((entry) => entry.type)
      .sort()
      .join(",");
    const legal = [...VALID_NODE_TYPES_BY_LEVEL[level]].sort().join(",");
    check(
      `the palette at @${level} offers exactly the types the parser accepts there`,
      offered === legal && offered.length > 0,
      `palette: ${offered} / parser: ${legal}`,
    );
  }
  /* And the docs table's own keyword→type column agrees with the grammar's
     bijection, so the KEYWORD on a palette button names the TYPE the gesture
     writes. A row that drifted would render a button labelled with one word
     that inserts another. */
  for (const row of NODE_TYPE_ROWS) {
    check(
      `NODE_TYPE_ROWS maps "${row.keyword}" to the type the grammar does`,
      NODE_TYPE_BY_KEYWORD[row.keyword] === row.modelType,
      `docs say ${row.modelType}, grammar says ${NODE_TYPE_BY_KEYWORD[row.keyword]}`,
    );
  }

  /* --- the patch, from non-canonical text ---------------------------------- */

  /* Non-canonical for section 13's reason: a re-emit of canonical text IS
     canonical text, so only comments and author blank lines can catch one. */
  const authored = [
    `archlab 1.0`,
    `title "Create probe"`,
    ``,
    `// The file's own note.`,
    `@context ctx "System context"`,
    ``,
    `  // Who uses this thing.`,
    `  cust:person "Customer" [human]`,
    `    desc "The paying kind."`,
    `  web:system "Web App" >backend`,
    ``,
    `  cust -> web :"uses"`,
    ``,
    `@container backend owner=web`,
    `  api:container "API" [Go]`,
    ``,
  ].join("\n");
  const doc = c4Document(authored);
  check(
    "the create fixture is genuinely not canonical — otherwise this section is vacuous",
    authored !== sourceTextFor(doc),
    "the authored text already equals what the serializer emits",
  );

  const refuses = (run) => {
    try {
      return run() === null;
    } catch {
      return false;
    }
  };

  const created = createdNodeEdit(doc, authored, "ctx", "person");
  check(
    "a create on authored text takes the PATCH path, by name",
    created !== null && created.path === "patch",
    `path: ${created === null ? "refused" : created.path}`,
  );

  /* AN INSERT IS ONE GAINED LINE AND NO CHANGED ONES. `changedLines` cannot
     say this (an insert shifts every later index), so it is measured as a
     splice: remove the one new line and the authored bytes must come back
     exactly — which covers the comments and blank lines in the same breath. */
  const beforeLines = authored.split("\n");
  const afterLines = (created?.text ?? "").split("\n");
  let insertedAt = -1;
  for (let i = 0; i < afterLines.length; i += 1) {
    if (afterLines[i] !== beforeLines[i]) {
      insertedAt = i;
      break;
    }
  }
  const spliced = [...afterLines];
  if (insertedAt !== -1) spliced.splice(insertedAt, 1);
  check(
    "a create adds exactly one line and every authored byte survives",
    afterLines.length === beforeLines.length + 1 &&
      insertedAt !== -1 &&
      spliced.join("\n") === authored,
    created === null
      ? "the create was refused"
      : firstDiff(spliced.join("\n"), authored),
  );
  /* DIRECTLY AFTER THE DIAGRAM'S LAST NODE DECLARATION — nodes stay with
     nodes, ahead of the relationship lines, so the reviewer's diff reads as
     "one element added" rather than a line floating among the edges. */
  check(
    "the new line lands directly under the diagram's last node declaration",
    insertedAt !== -1 &&
      beforeLines[insertedAt - 1] === `  web:system "Web App" >backend`,
    `inserted after: ${JSON.stringify(beforeLines[insertedAt - 1])}`,
  );
  /* THE INSERTED LINE IS CANONICAL, proved against a FULL serialise of the
     edited document — section 13's derivation, for section 13's reason: a
     patch that wrote almost-canonical text would trade a silent loss for a
     silent divergence. */
  const canonicalAfter = created === null ? "" : sourceTextFor(created.doc);
  check(
    "the inserted line is exactly what a full serialise would write for the node",
    insertedAt !== -1 &&
      canonicalAfter.split("\n").includes(afterLines[insertedAt]) &&
      afterLines[insertedAt].includes("new-person:person"),
    `inserted: ${JSON.stringify(afterLines[insertedAt])}`,
  );

  /* --- what the reader gets: a named, legal, visibly-placed node ----------- */

  const createdNode =
    created === null
      ? undefined
      : created.doc.synced.file.diagrams
          .find((diagram) => diagram.id === "ctx")
          ?.nodes.find((node) => node.id === "new-person");
  check(
    "the created node survives the round trip with the placeholder name",
    createdNode !== undefined &&
      createdNode.name === createdNodeName("person") &&
      createdNode.name.length > 0,
    `node after re-parse: ${JSON.stringify(createdNode)}`,
  );
  /* NOT ON TOP OF ANYTHING, measured as rectangle disjointness AGAINST THE
     RE-PARSED DOCUMENT rather than the pre-insert one: adding an id reflows
     the default layout, so nodes whose geometry the text omits may have
     moved, and the pre-insert picture is the wrong one to measure. This is
     the assertion the gesture exists to satisfy — a node born under another
     is a create that looks like a delete. */
  const others =
    created === null
      ? []
      : (created.doc.synced.file.diagrams
          .find((diagram) => diagram.id === "ctx")
          ?.nodes.filter((node) => node.id !== "new-person") ?? []);
  const overlaps = others.filter(
    (node) =>
      createdNode !== undefined &&
      createdNode.position.x < node.position.x + node.size.width &&
      node.position.x < createdNode.position.x + createdNode.size.width &&
      createdNode.position.y < node.position.y + node.size.height &&
      node.position.y < createdNode.position.y + createdNode.size.height,
  );
  check(
    "the created node's box overlaps no existing node's box after the re-parse",
    others.length > 0 && overlaps.length === 0,
    `overlapping: ${overlaps.map((node) => node.id).join(", ")}`,
  );
  check(
    "the created node lands on the format's grid",
    createdNode !== undefined &&
      createdNode.position.x % EDIT_GRID === 0 &&
      createdNode.position.y % EDIT_GRID === 0,
    `position: ${JSON.stringify(createdNode?.position)}`,
  );

  /* --- the edit NAMES what it created ---------------------------------------
     `createdNodeId` is how the canvas finds the newcomer to centre on and
     select (the element lands below everything drawn — off screen on a tall
     diagram, where the announcement's "rename it in the details panel" would
     otherwise be a promise nothing keeps). Asserted against the RE-PARSED
     document rather than against the id-minting convention, so the field can
     never name a node the adopted document does not hold. */
  check(
    "a create reports the created node's id, and the id is real in the re-parsed document",
    created !== null &&
      created.createdNodeId === "new-person" &&
      createdNode !== undefined,
    `createdNodeId: ${JSON.stringify(created?.createdNodeId)}`,
  );

  /* The REF create reports its minted placeholder the same way — its id is
     derived from the mirrored node's NAME rather than a type keyword, so the
     expectation is read back from the document instead of retyped here. */
  const refCreated = createdRefEdit(doc, authored, "backend", {
    diagramId: "ctx",
    nodeId: "cust",
  });
  const mintedRef =
    refCreated === null
      ? undefined
      : refCreated.doc.synced.file.diagrams
          .find((diagram) => diagram.id === "backend")
          ?.nodes.find((node) => node.externalRef?.nodeId === "cust");
  check(
    "a ref create reports the id of the placeholder it minted",
    refCreated !== null &&
      mintedRef !== undefined &&
      refCreated.createdNodeId === mintedRef.id,
    `createdNodeId: ${JSON.stringify(refCreated?.createdNodeId)}, minted: ${JSON.stringify(mintedRef?.id)}`,
  );

  /* --- the id: file-unique, deterministic ---------------------------------- */

  /* Node ids are unique across the FILE (`validate.ts`), not per diagram, so
     the collision fixture puts the stem in the OTHER diagram — a per-diagram
     de-dupe would pass a same-diagram probe and still hand back a document
     the parser refuses. */
  const collision = c4Document(
    authored.replace(
      `  api:container "API" [Go]`,
      [`  api:container "API" [Go]`, `  new-database:database "Orders"`].join(
        "\n",
      ),
    ),
  );
  const collided = createdNodeEdit(
    collision,
    sourceTextFor(collision),
    "backend",
    "database",
  );
  const collidedIds =
    collided === null
      ? []
      : (collided.doc.synced.file.diagrams
          .find((diagram) => diagram.id === "backend")
          ?.nodes.map((node) => node.id) ?? []);
  check(
    "a taken id stem de-duplicates deterministically to -2",
    collidedIds.includes("new-database") &&
      collidedIds.includes("new-database-2"),
    `ids: ${collidedIds.join(", ")}`,
  );
  check(
    "creating twice from the same document is deterministic",
    created !== null &&
      createdNodeEdit(doc, authored, "ctx", "person")?.text === created.text,
    "two runs over identical input produced different text",
  );

  /* --- the refusals: null, never a throw ----------------------------------- */

  check(
    "a type the diagram's level cannot hold refuses",
    refuses(() => createdNodeEdit(doc, authored, "ctx", "container")),
    "a context diagram accepted a container — the re-parse will refuse it later, " +
      "where the reader cannot tell why",
  );
  check(
    "an unknown diagram refuses",
    refuses(() => createdNodeEdit(doc, authored, "nowhere", "person")),
    "a create against a missing diagram should be null, not a crash",
  );

  /* --- the named fallback, both forcing conditions -------------------------- */

  /* Pinned BY NAME, as section 13 pins the move's: `path` is the only thing
     that says which gestures are safe for the author's bytes. */
  const jsonPane = { ...doc, format: "json" };
  const inJson = createdNodeEdit(
    jsonPane,
    doc.synced.jsonText,
    "ctx",
    "person",
  );
  check(
    "a create against the JSON pane re-emits, and says so",
    inJson !== null &&
      inJson.path === "reemit" &&
      inJson.text === inJson.doc.synced.jsonText,
    `path: ${inJson === null ? "refused" : inJson.path}`,
  );
  /* The FALLBACK path names the newcomer too — the canvas's centring must not
     depend on which path the text took, or a JSON-pane create would land off
     screen while the patch path centres. */
  check(
    "the re-emit path still reports the created node's id",
    inJson !== null && inJson.createdNodeId === "new-person",
    `createdNodeId: ${JSON.stringify(inJson?.createdNodeId)}`,
  );
  /* An EMPTY diagram is the create-specific forcing condition: the spans map
     holds node and edge lines only, so there is no line to sit after and the
     module falls back rather than growing a second parser to find the diagram
     head. An empty diagram has no comments between members to lose. */
  const emptied = c4Document(
    [
      `archlab 1.0`,
      `title "Empty probe"`,
      ``,
      `@context ctx "Context"`,
      `  web:system "Web App" >backend`,
      ``,
      `@container backend owner=web`,
      ``,
    ].join("\n"),
  );
  const intoEmpty = createdNodeEdit(
    emptied,
    [
      `archlab 1.0`,
      `title "Empty probe"`,
      ``,
      `@context ctx "Context"`,
      `  web:system "Web App" >backend`,
      ``,
      `@container backend owner=web`,
      ``,
    ].join("\n"),
    "backend",
    "container",
  );
  check(
    "a create into an empty diagram falls back to the re-emit path, and says so",
    intoEmpty !== null &&
      intoEmpty.path === "reemit" &&
      intoEmpty.doc.synced.file.diagrams
        .find((diagram) => diagram.id === "backend")
        ?.nodes.some((node) => node.id === "new-container"),
    `verdict: ${intoEmpty === null ? "refused" : intoEmpty.path}`,
  );
  check(
    "the empty-diagram fallback reports the created node's id too",
    intoEmpty !== null && intoEmpty.createdNodeId === "new-container",
    `createdNodeId: ${JSON.stringify(intoEmpty?.createdNodeId)}`,
  );

  /* --- the affordance renders in the editable branch only ------------------ */

  /* Source assertions, the section-9 tactic, because the strip lives in a
     `.tsx` the harness cannot load. Presence-gated like every edit control:
     a read-only or locked canvas must show NO strip, never a disabled one —
     and a strip rendered unconditionally would be section 8's bug (a control
     in one branch only) inverted into a control that lies in every branch. */
  const canvas = read("src/features/viewer/components/viewer-canvas.tsx");
  const palette = read(
    "src/features/viewer/components/viewer-node-palette.tsx",
  );
  check(
    "the Add strip renders only while the canvas is editable",
    /\{editable \? \(\s*<ViewerNodePalette/.test(canvas),
    "the strip is missing, or offered on a canvas that cannot honour it",
  );
  check(
    "the strip's buttons come from the derived palette, not a hand-written list",
    /creatableNodeTypes\(level\)\.map\(/.test(palette),
    "a hand-listed strip is the drift this whole section exists to prevent",
  );
  /* The REFERENCE half is a click-to-open MENU. It has now worn three shapes —
     a `<select>`, then inline buttons, now a menu at the product owner's
     request — and two things survive every shape. WHERE THE LIST COMES FROM:
     `referenceableNodes` is also what the gesture guard reads
     (`createdRefEdit`), so a hand-listed half would offer references the
     guard then refuses. AND NEVER A BARE `<select>`: a native dropdown brings
     its own dismissal, so its Escape reaches the canvas ladder too — one
     press would close the list AND clear the reader's selection — and its
     rows cannot carry the name-plus-level layout the choice needs. */
  check(
    "the reference half is a menu of derived rows, never a <select>",
    /role="menu"/.test(palette) &&
      /role="menuitem"/.test(palette) &&
      /references\.map\(/.test(palette) &&
      !/<select/.test(palette),
    "the ref half stopped being a real menu over the derived candidate list — " +
      "or grew back the native dropdown whose Escape the canvas ladder also hears",
  );
  /* The trigger SAYS a menu opens (`aria-haspopup`) and reports whether it is
     open (`aria-expanded`) — an icon-plus-word button that silently sprouts a
     list is a control a screen-reader user cannot predict. */
  check(
    "the menu trigger declares the popup and its open state",
    /aria-haspopup="menu"/.test(palette) &&
      /aria-expanded=\{refsOpen\}/.test(palette),
    "the trigger no longer tells assistive tech a menu opens here",
  );
  /* THE ESCAPE CONTRACT IS THE ZOOM MENU'S, through ONE shared hook — the
     precedent that already negotiates with this canvas's Escape ladder. Two
     copies of the dismissal effect is how one of them later loses the consume
     and a menu press starts clearing selections (`dry.md`, same body → one
     definition). Asserted from both consumers AND from the hook's own source,
     because the sharing is worthless if the shared code drops the clause. */
  const dismissal = read("src/components/ui/menu-dismissal.ts");
  const zoomMenu = read("src/components/ui/zoom-menu.tsx");
  check(
    "the reference menu and the zoom menu share one dismissal hook",
    /useMenuDismissal\(/.test(palette) && /useMenuDismissal\(/.test(zoomMenu),
    "a second dismissal implementation appeared — the copy that drifts is " +
      "the one that forgets to consume Escape",
  );
  check(
    "that hook consumes Escape, so closing a menu cannot also clear the canvas selection",
    /event\.key !== "Escape"/.test(dismissal) &&
      /event\.preventDefault\(\);/.test(dismissal) &&
      /event\.stopPropagation\(\);/.test(dismissal) &&
      /addEventListener\("keydown", onKeyDown, true\)/.test(dismissal),
    "one Escape press would take two steps — close the menu AND run a rung " +
      "of the canvas's own ladder",
  );
  /* The trigger stays HONEST about emptiness: `referenceableNodes` returns
     empty on the root diagram and where everything above is already mirrored,
     and a trigger that opens an empty menu is a promise the model cannot
     keep — the whole group is withheld instead, as it always was. */
  check(
    "an empty candidate list withholds the reference group entirely",
    /references\.length > 0 \?/.test(palette),
    "a trigger now renders with nothing to offer — it would open an empty menu",
  );

  /* --- the created element is centred and selected -------------------------- */

  /* Source assertions (section-9 tactic — the camera lives in a `.tsx`).
     The module half above proves every create REPORTS its id; this half
     proves the id is FOLLOWED, because the announcement promises a rename in
     the details panel and the element lands below everything drawn — off
     screen on a tall diagram. Each hop is pinned: the host hands the id back,
     the canvas keeps it until the model containing the node arrives, and the
     one effect both selects and centres. */
  const playgroundSrc = readPlaygroundEditSurface();
  check(
    "all three create handlers hand the created id back to the canvas",
    (playgroundSrc.match(/return next\.createdNodeId \?\? null;/g) ?? [])
      .length === 3,
    "a create the canvas cannot follow — the new element stays off screen " +
      "while the announcement promises a rename",
  );
  check(
    "the canvas keeps the returned id until the model holding the node lands",
    /focusWhenCreated\(edit\?\.onNodeCreate\(/.test(canvas) &&
      /focusWhenCreated\(edit\?\.onRefCreate\(/.test(canvas) &&
      /pendingFocusRef\.current = createdNodeId/.test(canvas),
    "a returned id nothing stores — the camera would act on a model that " +
      "does not hold the node yet, or never act at all",
  );
  /* Selected AND centred, in that one effect, and the camera goes through the
     flow's own viewport pipe with the shared duration helper — `duration()`
     is 0 under prefers-reduced-motion, so the pan is a cut for the reader who
     asked for stillness, the same contract every level transition honours. */
  check(
    "the focus effect selects the new element and centres the camera on it",
    /pendingFocusRef\.current = null;[\s\S]{0,900}?selectNode\(nodeId\);[\s\S]{0,1200}?setViewport\(centred, \{ duration: duration\("levelTransition"\) \}\)/.test(
      canvas,
    ),
    "the created element is reported but not brought into view or not " +
      "selected — the announcement's rename instruction has no state behind it",
  );
}

/* ----------------------------------------------------------------------- */

console.log("\nLocking never offers a link to somewhere you already are");

{
  /* THE BUG THIS PINS: "Edit this diagram" is meant for hosts that cannot edit,
     and it was hidden whenever `edit` was passed. But locking the canvas
     WITHDRAWS those handlers, so `edit` went undefined and the link came
     back — locking a diagram to present it made a button appear offering to
     open it somewhere the reader already was.

     Capability and current state are different questions. `edit` is "editing
     is on right now"; `canEdit` is "editing is possible here". The link must
     read the second. */
  const shell = read("src/features/viewer/components/viewer-shell.tsx");
  const playground = read(
    "src/features/playground/components/view-playground.tsx",
  );

  check(
    "the shell takes a capability prop distinct from its handlers",
    /canEdit\?:\s*boolean/.test(shell),
    "without it the only signal is `edit`, which the lock withdraws",
  );
  check(
    "the edit link is gated on capability, not on editing being on",
    /canEdit === true \? null|edit !== undefined \|\| canEdit === true \? null/.test(
      shell,
    ),
    "gating on `edit` alone is what made the link reappear on lock",
  );
  check(
    "the playground declares the capability from the document, not the lock",
    /canEdit=\{CANVAS_EDIT_ENABLED && editability\.editable\}/.test(playground),
    "passing the lock state here would reintroduce the bug through the prop",
  );
}

/* -------------------------------------------------------------------------- */
/* 8. The lock is REACHABLE from every canvas branch it gates                  */
/* -------------------------------------------------------------------------- */

/* WHY THIS SECTION EXISTS, because every assertion above passed while the bug
   was live. They all ask whether the MODULE says a document is editable. None
   asked whether the control that decides it is rendered in the branch that
   document takes.

   The lock was written inline inside `doc.kind === "c4" ? (…)`. When the
   sequence canvas became editable it read the same `!canvasLocked`, so a
   reader who had ever locked the canvas found the sequence canvas silently
   uneditable with no control anywhere to unlock it — the pencil and the insert
   button withdrawn, and the explanation in the branch not taken.

   DERIVED FROM THE SEED TABLE, not from a list of kind names: the failure a
   hardcoded pair cannot notice is a seventh notation that becomes editable and
   renders in a third branch. Any kind the module reports editable under either
   ability must have a lock rendered for it, and the count of `CanvasLockButton`
   uses is checked against that number rather than against the literal 2. */
{
  const playground = read(
    "src/features/playground/components/view-playground.tsx",
  );
  const lockCopy = read(
    "src/features/playground/components/canvas-lock-button.tsx",
  );
  const kinds = Object.keys(VIEW_SEED_TEXT);

  const lockable = kinds.filter((kind) => {
    const parsed = parseViewSource(VIEW_SEED_TEXT[kind]);
    if (parsed.status !== "ok") return false;
    return (
      canvasEditability(parsed.value, "move").editable === true ||
      canvasEditability(parsed.value, "revise").editable === true
    );
  });

  check(
    "at least two notations are editable, so this section is not vacuous",
    lockable.length >= 2,
    `lockable: ${JSON.stringify(lockable)}`,
  );

  /* ONE RENDER PER LOCKABLE CANVAS. Fewer means a canvas the lock gates but
     cannot be reached from; more would mean two locks racing one cookie.

     The renders are now CONSTRUCTED as each viewer's `lockSlot` prop rather
     than written into the strips — the product owner moved the control onto
     the canvas itself — so this count alone stopped proving reachability: a
     playground that builds a lock a viewer never mounts would still pass it.
     The two assertions after it close that gap by asking each viewer's own
     source whether the slot reaches the screen. */
  const renders = playground.match(/<CanvasLockButton\b/g) ?? [];
  check(
    "the lock is constructed once for each canvas branch that can be locked",
    renders.length === lockable.length,
    `${renders.length} <CanvasLockButton> renders for ${lockable.length} lockable kinds (${lockable.join(", ")})`,
  );
  /* THE SLOT REACHES EACH CANVAS. Section 8's founding bug was a control
     correct in the module and unreachable on the screen; a slot prop is a new
     way to reproduce it (built, passed, never mounted), so each hop is
     pinned: the shell forwards, and each canvas renders — the C4 one inside
     its top-right panel, where the details card already lives, the sequence
     one over its diagram pane. */
  const shellSrc = read("src/features/viewer/components/viewer-shell.tsx");
  const canvasSrc = read("src/features/viewer/components/viewer-canvas.tsx");
  const sequenceSrc = read(
    "src/features/sequence/components/sequence-viewer.tsx",
  );
  check(
    "the shell forwards the lock slot to the C4 canvas",
    /lockSlot=\{lockSlot\}/.test(shellSrc),
    "the playground hands the shell a lock the canvas never receives",
  );
  check(
    "the C4 canvas mounts the lock slot in its top-right panel",
    /position="top-right"[\s\S]{0,700}\{lockSlot\}/.test(canvasSrc),
    "the C4 lock is built but never reaches the canvas corner — section 8's " +
      "bug in slot form",
  );
  check(
    "the sequence canvas mounts the lock slot over its diagram pane",
    /\{lockSlot !== undefined \?/.test(sequenceSrc) &&
      /\{lockSlot\}/.test(sequenceSrc),
    "the sequence lock is built but never reaches the canvas — the branch " +
      "this section exists for, again",
  );

  /* THE WORDING IS COMPLETE for every lockable kind. A control that borrows
     another notation's sentence tells the reader the wrong thing about what it
     just stopped — and a `Record` keyed by kind makes the omission a type
     error only if the key is actually there to omit. */
  for (const kind of lockable) {
    check(
      `CANVAS_LOCK_COPY names the ${kind} canvas`,
      lockCopy.includes(`\n  ${kind}: {`),
      "a lockable canvas with no wording of its own",
    );
    check(
      `the ${kind} lock is wired to that wording`,
      playground.includes(`CANVAS_LOCK_COPY.${kind}`),
      "the render exists but reads another canvas's sentence",
    );
  }

  /* AND NO SECOND COPY. The bug was one control written twice — once inline,
     and then not again where it was needed. An inline `aria-pressed` on a
     lock-shaped button outside the component is how that comes back. */
  check(
    "the playground holds no inline lock button beside the component",
    !/aria-pressed=\{canvasLocked\}/.test(playground),
    "an inline copy is how the two branches drifted apart the first time",
  );
  /* AND THE SAME SENTINEL, FORWARDS. The line above greps for the shape the
     inline copy actually had; the control has since dropped `aria-pressed`
     (an action-labelled button must not claim a pressed state), so on its own
     that grep can no longer catch tomorrow's copy. A copy must spell the
     lock's own sentence, and the sentence lives only in the module that owns
     the control. */
  check(
    "the lock's own wording lives only in the control module",
    !playground.includes("unlock the canvas") &&
      !playground.includes("Lock the canvas"),
    "the playground writes the lock's sentence itself — an inline copy of the " +
      "control, which is how the two branches drifted apart the first time",
  );

  /* ONE STATE WORD PER LOCKABLE CANVAS. This used to read "named beside it",
     when the state word sat next to a control whose faces were actions
     ("Edit", "Lock"). The product owner moved the control onto the canvas as
     an icon-only padlock — a deliberate reversal, argued in the control's
     header — so "beside" is gone, and what the word now carries is MORE, not
     less: the strip's `canvasStateLabel` is the only place the state is
     spelled out at all, since the padlock draws it but cannot say it. Counted
     against the lockable kinds rather than the literal 2, so a seventh
     notation cannot arrive without its word — and so the control's move
     could not silently take the word with it. */
  /* COUNTED AGAINST THE GATES, NOT AGAINST THE KINDS, and the difference is
     what a third lockable notation taught. `lockable.length` worked while
     kinds and strips were one-to-one; sequence and flowchart now render in the
     SAME branch under the same strip, so a per-kind count started demanding a
     third state word that would have had nowhere to go — and satisfying it
     would have meant printing the state twice in one row.

     What has to hold is not a number, it is that no lock is ever offered
     without its state also being spelled: the padlock draws the state but
     cannot say it. So every gate that decides whether a `CanvasLockButton`
     renders must ALSO decide a `canvasStateLabel` call. That survives another
     notation joining an existing strip (no new gate, no new word needed) and
     still fails the case this section exists for — a canvas whose lock
     appears under a gate no strip consults. */
  const lockGates = [
    ...playground.matchAll(/\{\s*(show[A-Za-z]*CanvasLock)\s*\?\s*\(?\s*</g),
  ].map((match) => match[1]);
  /* No `{` anchor on this one: the C4 strip's word is the tail of a NESTED
     ternary (`!editable ? reason : showCanvasLock ? canvasStateLabel(…)`),
     which is correct — a document that cannot be edited shows the reason
     instead of a state — and an anchored pattern would only have matched the
     branch that happens to sit at the top of its expression. */
  const wordGates = [
    ...playground.matchAll(
      /(show[A-Za-z]*CanvasLock)\s*\r?\n?\s*\?\s*canvasStateLabel\(/g,
    ),
  ].map((match) => match[1]);
  const uniqueLockGates = [...new Set(lockGates)];
  check(
    "every lockable canvas still names its state in words, in the strip",
    uniqueLockGates.length > 0 &&
      uniqueLockGates.every((gate) => wordGates.includes(gate)),
    `locks render under [${uniqueLockGates.join(", ")}]; state words under [${[...new Set(wordGates)].join(", ")}]`,
  );
  check(
    "every lockable kind reaches one of those gates",
    lockable.length >= uniqueLockGates.length && lockable.length > 0,
    `${lockable.length} lockable kinds, ${uniqueLockGates.length} lock gates`,
  );

  /* AND NOTHING ELSE ON THE PAGE CONTRADICTS IT. The claim above — that the
     strip is the only place the state is spelled out — was false when it was
     written. `viewer-shell.tsx` carried an unconditional "View mode ·
     read-only" tag beside the model title, and the shell is mounted by the
     playground with edit handlers whenever the reader has the canvas unlocked.
     So unlocking put "Editable" in the strip above the canvas and "read-only"
     in the strip below it, at the same time, a screen apart.

     The tag is GONE rather than gated. Gating it on `edit` would have made it
     honest and left it pointless — a label reading "View mode" on the page the
     reader is already looking at — so the assertion is an ABSENCE: the shell
     must not spell a canvas state at all. That is the stronger pin as well as
     what shipped, because it also forbids the word returning in some third
     wording. Structural, not prose: the removal's own comment recounts the bug,
     and a regex over the comments would match the story instead of the code. */
  const shellCode = code("src/features/viewer/components/viewer-shell.tsx");
  check(
    "the shell spells no canvas state beside the title",
    !/read-only/i.test(shellCode),
    "the view-mode tag is back — on the playground it labels an unlocked " +
      'canvas read-only one strip below the word "Editable", which is the ' +
      "state the lock exists to make legible",
  );

  /* THE HEADING'S CLAIM MATCHES WHAT SHIPS. It said "C4 diagrams can also be
     edited on the canvas; the other kinds lay themselves out from the text"
     for as long as the sequence canvas was editable, and it was still on the
     page when a reader asked where the editing was. */
  check(
    "the heading does not still claim C4 is the only editable canvas",
    !/C4 diagrams can also be edited on the canvas/.test(playground),
    "the page contradicts the feature it is describing",
  );
  /* IT ALSO HAS TO NAME WHAT THE CANVAS DOES, not merely that it does
     something. The claim was "sequence messages edited on it" while the canvas
     had grown creation, repointing and removal for both messages and
     lifelines — true, and still useless to the reader it is written for, who
     is looking for a control they do not know exists. So the assertion moved
     from "the word sequence appears" to "the verbs appear": every gesture the
     dock and the strip offer is named in the sentence. If a gesture is added,
     this fails until the sentence grows — which is the point, and is cheaper
     than the alternative that already happened once (a shipped gesture no page
     mentioned for a whole release).

     Matched as an unordered set of words rather than one phrase, so rewording
     the sentence for readability does not fail a check about honesty. */
  /* Whitespace-normalised first: this is JSX, so the sentence is wrapped
     across source lines at arbitrary points and a phrase like "the other
     kinds" straddles a newline plus fourteen spaces of indentation. */
  const flowed = playground.replace(/\s+/g, " ");
  const playgroundCode = code(
    "src/features/playground/components/view-playground.tsx",
  );

  /* THE WALL, AND WHY IT WAS THIS FILE'S FAULT. The intro used to carry every
     gesture in one sentence between two anchors, and the window this check
     allowed was widened 240 → 340 → 380 as gestures were added — each
     widening recorded as if it were maintenance rather than a symptom. Ten
     gestures are a LIST, and the page now renders one; the reader was being
     handed a paragraph to parse for "why will my diagram not move?".

     What survives is the goal, which was always right: a gesture the canvas
     offers that the page never mentions is a feature nobody finds. So these
     assertions moved with the copy instead of dying with it, and the intro
     itself is now MEASURED — nothing measured it before, which is exactly how
     it grew. */
  const intro = /Nothing leaves your browser/.test(flowed);
  check(
    "the intro still promises the reader nothing leaves the browser",
    intro,
    "the privacy line is gone from the page's first paragraph",
  );
  check(
    "the intro still says the canvas is editable, in one derived clause",
    /CANVAS_EDITABLE_SUMMARY/.test(playgroundCode),
    "the intro no longer tells a reader the canvas can be edited at all, or " +
      "says so in hand-written prose that can outlive the grid",
  );
  /* MEASURED ON THE VALUE, not on the page source — the clause is derived, so
     the file holds an identifier and the words exist only at runtime. This is
     the assertion the old window should always have been: a number on the
     sentence itself, rather than a widening allowance on a regex. One short
     sentence naming the notations; the gestures live in the disclosure. */
  check(
    "and that clause stays one short sentence",
    CANVAS_EDITABLE_SUMMARY.length <= 120 &&
      CANVAS_EDITABLE_SUMMARY.split(". ").length === 1,
    `the intro clause is ${CANVAS_EDITABLE_SUMMARY.length} chars — it is ` +
      "growing back into the paragraph the gesture list was moved out of",
  );

  /* AND IT STILL FITS THE ONE SURFACE THAT IS ACTUALLY BUDGETED. `/live`'s
     meta description is the derived clause with a hand-written head in front of
     it, and a meta description has 160 characters for everything it says.
     Nothing measured the SUM before: the head's own comment recorded "154, six
     characters of headroom" and named itself as the line that would run out —
     and then the third editable canvas took it to 166, six over, with every
     check green. A comment cannot notice that; this can.

     THE HEAD IS READ OFF THE ROUTE rather than retyped here, because a copy
     would measure a string this file invented instead of the one that ships. */
  {
    const liveRoute = read("src/app/live/page.tsx");
    const headMatch =
      /description:\s*`([^`$]*)\$\{CANVAS_EDITABLE_SUMMARY\}`/.exec(liveRoute);
    check(
      "the /live description still names its head and the derived tail",
      headMatch !== null,
      "the description stopped being head-plus-derived-clause, so the budget " +
        "below is measuring nothing",
    );
    if (headMatch !== null) {
      const full = headMatch[1] + CANVAS_EDITABLE_SUMMARY;
      check(
        "and the whole /live meta description stays inside 160 characters",
        full.length <= 160,
        `the description is ${full.length} chars: ${JSON.stringify(full)}`,
      );
    }
  }

  /* DERIVED, NOT HAND-KEPT — the whole reason the list could move safely. The
     page maps the grid's own `onCanvas` cells and the sequence strip's own
     gesture record, so a new gesture reaches this page by being added where it
     is BUILT. Pinning the `.map` is what proves that: a hand-typed copy of
     today's clauses would pass a "does the page say 'repointed'" test and go
     stale the day the eleventh gesture landed. */
  check(
    "the canvas gestures on the page are the capability grid's own clauses",
    /CANVAS_GESTURE_CLAUSES\.map\(/.test(playgroundCode),
    "the page lists gestures it typed out itself — the list the grid knows " +
      "and the list the reader sees can now disagree",
  );
  check(
    "and the sequence gestures are the canvas strip's own record",
    /SEQUENCE_MOUSE_GESTURES\.map\(/.test(playgroundCode),
    "the sequence half of the list is hand-kept again",
  );
  check(
    "the list is somewhere a reader looking for it will open",
    /What you can do on the canvas/.test(flowed),
    "the disclosure that replaced the intro sentence is gone, so the gestures " +
      "are described nowhere a reader meets before opening the canvas",
  );

  /* THE TWO NO TABLE KNOWS. The marquee and the pan are canvas CONTROLS, not
     abilities, so no grid cell describes them and they are hand-kept in the
     page — which is exactly why they are pinned here. The pan in particular:
     it moved twice (a bare drag stopped panning when it became the lasso, and
     the hold-Space pan that replaced it broke three times before giving way
     to the toggle), and a reader who has panned this canvas by dragging knows
     the OLD gesture. A page naming only the lasso leaves them concluding that
     panning broke. */
  for (const phrase of ["drag selection", "Select / Pan toggle"]) {
    check(
      `the list names "${phrase}", which no grid cell can describe`,
      flowed.includes(phrase),
      "a canvas control the page must name by hand is unnamed",
    );
  }
  check(
    "and it still answers the reader whose flowchart box will not move",
    flowed.includes("the other kinds lay themselves out from the text"),
    "the refusal half of the answer is gone — the reader who drags a " +
      "flowchart node now has nowhere to learn why nothing happened",
  );
}

/* ----------------------------------------------------------------------- */
/* 14. Every sequence gesture is REACHABLE, not merely correct              */
/* ----------------------------------------------------------------------- */

/* THIS SECTION EXISTS BECAUSE SECTION 8 DID NOT CATCH IT ONCE ALREADY. The
   canvas lock was right in `canvasEditability` and absent from the branch the
   sequence canvas renders, for a whole release — a function nothing called.
   The same shape is available to every gesture: `sequence-edit.ts` can grow a
   perfectly guarded, perfectly patched removal that no button anywhere invokes,
   and `check:sequence` would pass all 265 of its assertions on it.

   So the list of gestures is DERIVED from the viewer's own handler interface —
   the contract the two sides already share — rather than hand-listed here. A
   hand-listed set cannot notice the gesture it has never heard of, which is the
   failure `codebase.md` habit 4 names and the reason `chrome.ts` reads a prefix
   instead of a list. Adding a handler to `SequenceEditHandlers` therefore adds
   two assertions automatically, and they fail until something calls it. */
console.log("\nEvery sequence gesture is reachable from the canvas it edits");
{
  const viewer = read("src/features/sequence/components/sequence-viewer.tsx");
  const playground = readPlaygroundEditSurface();

  const contract =
    /export interface SequenceEditHandlers \{([\s\S]*?)\n\}/.exec(viewer);
  check(
    "the viewer declares a handler contract this section can derive from",
    contract !== null,
    "SequenceEditHandlers not found — every assertion below would be vacuous",
  );
  const handlers = [
    ...new Set(
      [...(contract?.[1] ?? "").matchAll(/^\s{2}(on[A-Z]\w*)\s*[?:]/gm)].map(
        (m) => m[1],
      ),
    ),
  ];
  check(
    "the contract names at least the seven gestures the canvas ships",
    handlers.length >= 7,
    `found ${handlers.length}: ${handlers.join(", ")}`,
  );

  for (const handler of handlers) {
    /* CALLED, not merely accepted. `edit.onX(` / `edit?.onX(` is the viewer
       actually invoking it from a control or a gesture sink; a handler that
       only appears in the interface is a promise with nothing behind it. */
    check(
      `the viewer reaches ${handler} from a control`,
      /* `edit.onX(` for a call, or a bare `edit.onX` handed straight to an
         onClick — both are the handler being reached. What this rules out is
         the name appearing ONLY in the interface, which is a promise with
         nothing behind it. */
      new RegExp(`edit\\??\\.${handler}\\b`).test(viewer),
      "the handler is declared but nothing in the viewer reaches it",
    );
    /* AND THE HOST SUPPLIES IT. The bundle is memoised behind `sequenceEditable`,
       so a handler missing from it means the control is rendered and inert. */
    check(
      `the playground wires ${handler} into the sequence bundle`,
      new RegExp(`${handler}:\\s*handle`).test(playground),
      "the viewer would render a control the host never answers",
    );
  }

  /* THE CONTROLS THEMSELVES ARE GATED ON `edit`, which is what keeps a LOCKED
     canvas free of them rather than showing dead ones — the distinction PR #69
     landed and the thing section 8 guards for the lock itself. Counted rather
     than spot-checked: every one of these three strings introduces editing
     chrome, and one of them rendering unconditionally is the regression. */
  check(
    "the add-a-lifeline control is gated on the edit handlers being present",
    /edit === undefined \? null : \([\s\S]{0,400}?onInsertParticipant/.test(
      viewer,
    ),
    "a create control that renders on a locked or read-only canvas",
  );
  /* Counted from the RENDER SITES rather than from a gate pattern: there are
     two `<DockRemoveButton` renders (message and lifeline) and each must sit
     behind an `edit !== undefined` test. Written this way round because the two
     use different JSX shapes — one `&&` chain, one ternary — and a regex
     matching only the shape that existed when this was written would pass
     forever while the other drifted. */
  const removeSites = [...viewer.matchAll(/<DockRemoveButton/g)];
  check(
    "the dock renders exactly two remove controls — a message and a lifeline",
    removeSites.length === 2,
    `found ${removeSites.length}`,
  );
  check(
    "every remove control is gated on the edit handlers being present",
    removeSites.every((site) =>
      viewer
        .slice(Math.max(0, site.index - 700), site.index)
        .includes("edit !== undefined"),
    ),
    "a destructive control that renders without a host to answer it",
  );

  /* THE ENDPOINT GESTURE HAS TO BE REACHABLE WITHOUT A MODE, which is the one
     thing section 14 could not see when it was written. `onRepointMessage` was
     reached — from the armed two-click picker — so this section passed while the
     only route to it was a gesture a mouse user could not discover: pressing
     “Repoint on the canvas” closed the form and said what to do next into an
     `sr-only` region. "I cannot change from and to" was the report.

     So the form itself must carry the endpoints as MENUS. A menu cannot be
     mistyped (which is what kept them off the form originally) and needs no
     second click. Scoped to `MessageForm`'s own body, so a select somewhere
     else in the file cannot satisfy it. */
  {
    const start = viewer.indexOf("function MessageForm(");
    const form = viewer.slice(start, viewer.indexOf("\nfunction ", start + 1));
    check(
      "the message form is found, so the endpoint assertions are not vacuous",
      start !== -1 && form.length > 400,
      `MessageForm slice is ${form.length} characters`,
    );
    for (const [term, changed] of [
      ["From", "onRepointTo(event.target.value, message.to)"],
      ["To", "onRepointTo(message.from, event.target.value)"],
    ]) {
      check(
        `the form offers a ${term} menu that repoints the message`,
        new RegExp(`<DockField term="${term}">`).test(form) &&
          form.includes(changed),
        `no ${term} select wired to the repoint gesture`,
      );
    }
    /* THE MENU LISTS THE DOCUMENT'S OWN LIFELINES. Hardcoded options, or the
       ids rather than the names, would put the reader back to matching a token
       against a card — the thing that made typing one a bad idea. */
    check(
      "the menus are built from the participants the caller passes, by display name",
      /participants\.map\(\(participant\) => \(/.test(form) &&
        /value=\{participant\.id\}/.test(form) &&
        /\{participant\.name\}/.test(form),
      "the endpoint menus do not list the document's lifelines by name",
    );
    /* AND THE CANVAS GESTURE SURVIVES. It is the better one at the far end of a
       long flow, and it was never wrong — only undiscoverable. Removing it
       while adding the menus would be trading one gap for another. */
    check(
      "the canvas picker is still offered beside the menus",
      form.includes("onClick={onRepoint}") &&
        form.includes("Repoint on the canvas"),
      "the two-click gesture was dropped rather than made findable",
    );
    check(
      "the menus reach the host's repoint handler",
      /onRepointTo=\{handleRepointFromForm\}/.test(viewer) &&
        /const handleRepointFromForm[\s\S]{0,400}?edit\.onRepointMessage\(/.test(
          viewer,
        ),
      "the selects are rendered but change nothing",
    );
  }

  /* NO CONFIRM DIALOG, SO UNDO IS THE SAFETY NET, so both removals must go
     through the ring. `applyCanvasEdit` is the only thing that pushes onto it
     (section 9 proves the ring is bounded and separate from the textarea's), so
     a handler that called `setText` directly would lose the undo silently. */
  for (const handler of [
    "handleDeleteMessage",
    "handleDeleteParticipant",
    "handleRepointMessage",
    "handleInsertParticipant",
  ]) {
    const body = new RegExp(
      `const ${handler} = useCallback\\(([\\s\\S]*?)\\n  \\);`,
    ).exec(playground);
    check(
      `${handler} routes through applyCanvasEdit, so it lands on the undo ring`,
      body !== null &&
        body[1].includes("applyCanvasEdit(") &&
        !body[1].includes("setText("),
      "a canvas edit that cannot be undone",
    );
    check(
      `${handler} tells the reader how to undo it`,
      body !== null && /Cmd or Ctrl \+ Z/.test(body[1]),
      "a destructive or structural edit with no stated way back",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 15. An armed gesture is VISIBLE, and says the same thing to everyone     */
/* ----------------------------------------------------------------------- */

/* WHY THIS SECTION EXISTS, and it is the third variation of section 14's story
   rather than a new one. The repoint gesture was reachable (14 passed), correct
   (`check:sequence` passed) and unusable: pressing “Repoint on the canvas”
   closed the form, drew a dashed rule, and put "click the sending lifeline,
   then the receiving one" into the playground's `sr-only` live region and
   nowhere else. A mouse user saw a panel disappear and reported the feature as
   broken. Reachable is not the same as legible, and nothing here asked the
   second question.

   So: the instruction must exist ON SCREEN while a gesture is armed, and the
   two surfaces must come from ONE source. The second half is the part that
   rots — a visible prompt and an announcement written separately will drift,
   and a reader comparing them cannot tell which is true. The sentences are
   therefore DERIVED here by calling the function, never typed into this file,
   so rewording the prompt cannot make these assertions vacuous. */
console.log("\nAn armed gesture says the same thing on screen and out loud");
{
  const { armingPrompt, armingCancelled, ARMING_PROMPT_CLASS } = await load(
    "src/features/sequence/lib/arming-prompt.ts",
  );
  const viewer = read("src/features/sequence/components/sequence-viewer.tsx");

  /* EVERY SHAPE THE STATE CAN TAKE, enumerated rather than sampled: the branch
     that was missing "Escape cancels" was the second click, which is the one a
     reader most needs it on — they have already committed a click. */
  const states = [
    { purpose: "insert", step: null, fromName: null },
    { purpose: "insert", step: 3, fromName: null },
    { purpose: "insert", step: 3, fromName: "Storefront" },
    { purpose: "repoint", step: 4, fromName: null },
    { purpose: "repoint", step: 4, fromName: "Storefront" },
  ];
  const prompts = states.map((state) => armingPrompt(state));
  check(
    "every armed state has a prompt, and every one of them offers the way out",
    prompts.length === states.length &&
      prompts.every(
        (text) => text.length > 20 && text.endsWith("Escape cancels."),
      ),
    JSON.stringify(prompts),
  );
  /* THE PROMPT SAYS WHAT TO CLICK NEXT. Both halves of the gesture name a
     lifeline, because "repointing step 4" alone tells a reader what is
     happening and not what to do about it. */
  check(
    "every prompt names the lifeline the reader must click",
    prompts.every((text) => /lifeline/.test(text)),
    JSON.stringify(prompts),
  );
  /* THE TWO CLICKS READ DIFFERENTLY. Not "every state is unique" — once the
     sender is chosen, both purposes ask the same question and deliberately
     share a sentence. What must never happen is the prompt standing still while
     the gesture advances, which would leave a reader who has already clicked
     once with no sign that it landed. */
  const owedSender = states
    .filter((state) => state.fromName === null)
    .map((state) => armingPrompt(state));
  const owedReceiver = states
    .filter((state) => state.fromName !== null)
    .map((state) => armingPrompt(state));
  check(
    "the prompt changes after the first click, so the reader can see it landed",
    owedSender.length > 0 &&
      owedReceiver.length > 0 &&
      owedSender.every((text) => !owedReceiver.includes(text)),
    JSON.stringify({ owedSender, owedReceiver }),
  );
  check(
    "each purpose says which gesture it is while the first click is owed",
    new Set(owedSender).size === owedSender.length,
    "two different armed gestures look identical before the first click",
  );

  /* ONE SOURCE, MEASURED FROM THE OUTPUT. If any prompt's own words appear in
     the viewer as a literal, the sentence has been written twice and the two
     copies are free to diverge — which is exactly how the announcement came to
     be the only one that existed. */
  for (const text of prompts) {
    check(
      `the viewer does not spell "${text.slice(0, 34)}…" out for itself`,
      !viewer.includes(text),
      "the prompt wording is duplicated in the component — it will drift",
    );
  }
  check(
    "the cancel sentence is shared too, not retyped at the button",
    !viewer.includes(armingCancelled("insert")) &&
      !viewer.includes(armingCancelled("repoint")) &&
      /armingCancelled\(/.test(viewer),
    "the two ways out of an armed gesture would say different things",
  );

  /* BOTH SURFACES, from that one source. The announcement is the pre-existing
     half; the rendered node is the fix. Asserted separately because losing
     either one is a different bug with the same symptom. */
  check(
    "the armed gesture is still announced, through the shared prompt",
    /onAnnounce\(\s*armingPrompt\(/.test(viewer),
    "the live region lost its instruction",
  );
  check(
    "and the prompt is RENDERED, gated on something being armed",
    /armingPromptText === null \? null : \(/.test(viewer) &&
      /armingPromptText\s*=\s*\n?\s*arming === null/.test(viewer),
    "a mouse user would be back to watching a panel vanish with no instruction",
  );
  check(
    "the rendered prompt carries the chrome class, so it can never reach an export",
    new RegExp(`ARMING_PROMPT_CLASS`).test(viewer) &&
      ARMING_PROMPT_CLASS.includes("af-seq-chrome-"),
    `${ARMING_PROMPT_CLASS} is not chrome, or the render does not use it`,
  );
}

/* ----------------------------------------------------------------------- */
/* 16. The guide gives every gesture an ICON and an ACCESSIBLE NAME         */
/* ----------------------------------------------------------------------- */

/* THE FOURTH TIME THE SAME SHAPE. Section 8 asks whether the page's heading
   names the gestures; it does that against a hand-listed set of verbs, which
   cannot notice the gesture it has never heard of. Section 14 fixed that for
   reachability by deriving the list from `SequenceEditHandlers`. This does it
   for the thing a reader actually reads: the affordance strip under the canvas
   and the tour step built from the same list.

   Twice on this branch a shipped, correct gesture was reported as missing —
   the endpoint change, and step numbering, which had no control at all. Both
   would have failed here. Adding a handler to `SequenceEditHandlers` adds three
   assertions below and they fail until the guide grows an entry, an icon and a
   name for it.

   THE STRIP USED TO BE A PARAGRAPH and was rebuilt as icon-led affordances,
   which is why the assertions are STRONGER here rather than merely different.
   The old shape only had to contain a sentence per gesture. An icon strip can
   fail in a way prose cannot: an icon-only control with no accessible name is a
   regression for a screen-reader user, and an icon the canvas does not actually
   render sends a reader hunting for a glyph that is not there. So every entry
   must carry an icon AND a name, the icon must resolve in the viewer's own
   glyph table, and the table must be total. "An icon exists somewhere" would
   pass while both of those were broken. */
console.log("\nThe guide gives every gesture an icon and an accessible name");
{
  const {
    SEQUENCE_MOUSE_GESTURES,
    SEQUENCE_MOUSE_GUIDE,
    SEQUENCE_MOUSE_GUIDE_CAVEAT,
  } = await load("src/features/sequence/lib/mouse-guide.ts");
  const viewer = read("src/features/sequence/components/sequence-viewer.tsx");

  /* THE SAME DERIVATION SECTION 14 USES, deliberately re-read rather than
     shared: if the two ever disagree about what the contract says, the
     assertions below are measuring a different set from the ones above. */
  const contract =
    /export interface SequenceEditHandlers \{([\s\S]*?)\n\}/.exec(viewer);
  const handlers = [
    ...new Set(
      [...(contract?.[1] ?? "").matchAll(/^\s{2}(on[A-Z]\w*)\s*[?:]/gm)].map(
        (m) => m[1],
      ),
    ),
  ];
  check(
    "the guide has an entry for each of the gestures the contract declares",
    handlers.length >= 10 && SEQUENCE_MOUSE_GESTURES.length === handlers.length,
    `${SEQUENCE_MOUSE_GESTURES.length} guide entries for ${handlers.length} gestures`,
  );

  /* THE GLYPH TABLE IS READ OUT OF THE COMPONENT, not listed here. The pair
     that has to agree is (icon name in a pure module) ↔ (lucide component in a
     `.tsx` the harness cannot load), which is exactly the TypeScript/TypeScript
     split `dry.md` requires a check to pin. A hand-listed set of names here
     could not notice the tenth icon the day it was added. */
  const glyphTable = /const GUIDE_GLYPH: Record<[\s\S]*?\n\};/.exec(viewer);
  const glyphKeys = new Set(
    [
      ...(glyphTable?.[0] ?? "").matchAll(/^\s{2}"?([a-z-]+)"?:\s*[A-Z]\w*,/gm),
    ].map((m) => m[1]),
  );
  check(
    "the viewer's glyph table was found and is not empty",
    glyphTable !== null && glyphKeys.size > 0,
    "GUIDE_GLYPH is gone or has been reshaped — the assertions below measure nothing",
  );

  const taught = new Set(SEQUENCE_MOUSE_GESTURES.map((g) => g.handler));
  for (const handler of handlers) {
    const entry = SEQUENCE_MOUSE_GESTURES.find((g) => g.handler === handler);
    check(
      `the guide gives ${handler} an icon the viewer can draw`,
      entry !== undefined && glyphKeys.has(entry.icon),
      /* THE FAILURE THIS PREVENTS: a legend showing a glyph the screen does not
         carry is worse than no legend — it is a control the reader will look
         for and never find. */
      `icon ${JSON.stringify(entry?.icon)} is not in GUIDE_GLYPH`,
    );
    check(
      `the guide gives ${handler} an accessible name`,
      /* BOTH HALVES. `label` is the visible two or three words and `mouse` is
         the sr-only sentence, and the strip renders the icon `aria-hidden` —
         so an entry missing either one is an icon with no name, which is the
         regression this redesign could most easily have shipped. */
      entry !== undefined &&
        typeof entry.label === "string" &&
        entry.label.length > 3 &&
        typeof entry.mouse === "string" &&
        entry.mouse.length > 12,
      `label ${JSON.stringify(entry?.label)}, name ${JSON.stringify(entry?.mouse)}`,
    );
  }
  /* AND NOTHING ELSE, in either direction. An entry for a handler that no
     longer exists teaches a control that has been removed, which sends a reader
     hunting exactly as an unmentioned one does; an icon in the table that no
     entry names is dead weight that hides the next omission. */
  check(
    "the guide teaches no gesture the contract does not declare",
    [...taught].every((handler) => handlers.includes(handler)),
    `${[...taught].filter((h) => !handlers.includes(h)).join(", ")} is taught but not declared`,
  );
  const iconsUsed = new Set(SEQUENCE_MOUSE_GESTURES.map((g) => g.icon));
  check(
    "the glyph table carries no icon the guide never names",
    [...glyphKeys].every((key) => iconsUsed.has(key)),
    `${[...glyphKeys].filter((k) => !iconsUsed.has(k)).join(", ")} is in the table but unused`,
  );

  /* IT MUST NOT CLAIM A GESTURE THAT DOES NOT EXIST — and the set of those has
     CHANGED, which is why this block is rewritten rather than tightened. There
     IS a drag now: a message drags to another row, a lifeline card drags to
     another column. What there is not is notes and fragments (neither carries a
     line span — `SequenceSpans`), and what there is REALLY not is
     POSITIONING. The old assertion was `!/drag/` on the gesture list, and it
     was the shipped-stale-claim failure waiting to happen: it would have kept
     passing on a page that still said the canvas has no drag. */
  check(
    "the gesture list promises no note or fragment editing",
    !/\bnote|\bfragment/i.test(SEQUENCE_MOUSE_GUIDE),
    "neither has a span to patch, so neither has a canvas gesture",
  );
  /* THE REORDER GESTURES ARE NAMED AS DRAGS, in the entries themselves. A
     gesture whose only route a mouse user can discover is a drag, described in
     words that never say "drag", is undiscoverable by exactly the reader it was
     built for. */
  for (const handler of ["onReorderMessage", "onReorderParticipant"]) {
    const entry = SEQUENCE_MOUSE_GESTURES.find((g) => g.handler === handler);
    check(
      `${handler} is taught as a drag AND as a key`,
      entry !== undefined &&
        /\bdrag/i.test(entry.mouse) &&
        /\balt\b/i.test(entry.mouse),
      /* BOTH ROUTES IN ONE SENTENCE because they are one gesture: the drag is
         the discoverable half and the keyboard is the precise half, and a
         reader told only about the drag cannot reach it without a mouse. */
      `${JSON.stringify(entry?.mouse)} names only one route`,
    );
  }

  /* THE CAVEAT IS THE SUBTLE ONE NOW. It used to say "nothing on the canvas is
     moved by dragging", which was true until a message could be dragged to
     another row — the exact class of stale claim this branch has already
     shipped twice. Its three clauses each answer an assumption a reader
     arriving from a drawing tool brings with them, so all three are pinned:
     dragging an element REORDERS, dragging bare canvas PANS, and nothing is
     POSITIONED (a dropped element takes a slot; it does not stay under the
     cursor). The third is the one that stops a first drag reading as a canvas
     that snaps back. */
  check(
    "the caveat says a drag on an element reorders it",
    /\bdrag\w*\b[^.]*\breorder/i.test(SEQUENCE_MOUSE_GUIDE_CAVEAT),
    "a reader is left to guess what dragging a message does",
  );
  check(
    "the caveat still says a drag on bare canvas pans",
    /\bpan/i.test(SEQUENCE_MOUSE_GUIDE_CAVEAT),
    "the gesture a reader tries first on empty canvas is unexplained",
  );
  check(
    "the caveat says nothing here is POSITIONED",
    /\bposition/i.test(SEQUENCE_MOUSE_GUIDE_CAVEAT) &&
      /\border\b|\bplace\b/i.test(SEQUENCE_MOUSE_GUIDE_CAVEAT),
    "a reader from a drawing tool will expect their box to stay where they drop it",
  );

  /* BOTH SURFACES RENDER THE ONE LIST, and now they render DIFFERENT SHAPES of
     it — the strip takes the entries (icon-led), the tour takes the joined
     prose. That is the point of the redesign, and it is also the new risk:
     two shapes is one more chance for one of them to be written by hand. So
     each is pinned to its own derived export. */
  check(
    "the affordance strip is built from the derived entry list",
    /SEQUENCE_MOUSE_GESTURES\.map\(/.test(viewer),
    "the strip is writing its own copy of the gesture list",
  );
  check(
    "the guide renders each entry's icon, its label and its full name",
    /GUIDE_GLYPH\[gesture\.icon\]/.test(viewer) &&
      /\{gesture\.label\}/.test(viewer) &&
      /\{gesture\.mouse\}/.test(viewer),
    /* AN ICON WITH NO NAME is the regression an icon strip ships. This used to
       require `gesture.mouse` inside an `sr-only` span, because the list lived
       in a 28px row that had nowhere to put the long half and hid it in a
       `title` — hover-only, so invisible to a touch reader. The list now opens
       in a panel, where the full path is ordinary visible text, so the
       assertion asks that it is RENDERED rather than that it is hidden from
       sight. Demanding `sr-only` here would now forbid the fix. */
    "an entry is rendered without one of its three parts",
  );
  check(
    "the icons are aria-hidden, so the name comes from the text and not from a filename",
    /<Glyph\s+aria-hidden="true"/.test(viewer),
    "a lucide glyph with no aria-hidden is announced as an unnamed graphic",
  );
  check(
    "the tour step still reads the joined prose",
    /SEQUENCE_MOUSE_GUIDE\b/.test(
      /const EDIT_TOUR_STEP[\s\S]*?\n\};/.exec(viewer)?.[0] ?? "",
    ),
    "the long prose has no home left — nothing on the page teaches the list in full",
  );
  /* THE STRIP'S CONTENT IS GATED, ITS EXISTENCE IS NOT — and the difference is
     a bug the old spelling of this assertion required.

     It used to pin `edit === undefined ? null : (… GESTURES …)`, i.e. the strip
     rendering only while editing was on. That was right about the wording (a
     read-only canvas must not list gestures it does not offer) and wrong about
     the layout: the drawing is PANE-FITTED, so a row that appears re-fits the
     whole diagram at a different scale. Once the canvas started locked by
     default, pressing Edit both revealed the legend and shrank the diagram —
     the reader's first act on the canvas resized it.

     So both halves are asserted separately: the gestures stay behind the gate,
     and the container stays outside it.

     ONE OTHER GATE IS LEGITIMATE, and only one: immersive mode, where the row
     stops rendering at all. The rule this section defends is that a row must
     not appear or vanish INSIDE a stable layout, because that re-fits a
     pane-fitted drawing at a different scale. Entering immersive takes the
     whole pane out of flow and re-fits the drawing by definition, so a row
     removed on that transition costs nothing the transition was not already
     spending. `edit` has no such excuse and stays forbidden — which is what
     these assertions measure, so the immersive gate needs no exception in
     them.

     WHAT THE STRIP HOLDS CHANGED, AND THESE ASSERTIONS FOLLOWED IT. The ten
     labelled glyphs and the caveat used to BE the strip's contents, scrolling
     sideways in the row. Three surfaces taught that same list — the page's
     disclosure, this strip, and the tour — and this was the only one a reader
     could not put away, so it became one button opening a panel. Every rule
     the row bought stays (fixed height, no wrap, present either way); what is
     re-pinned is the list's REACHABILITY, since a panel with no trigger is
     section 8's unreachable-control bug in a new costume. */
  /* ANCHORED ON WHAT THE STRIP IS, not on a property asserted below. An earlier
     spelling anchored on `h-7`, so removing the height made the block "not
     found" and failed every assertion here identically — a break has to name
     the thing it broke. The strip is the one `hidden … sm:flex` row in the
     file. The caveat is no longer the landmark it was: it moved into the panel,
     which is a SIBLING of the strip rather than a child (see the clipping
     assertion below), so anchoring on it would now walk past the end of the
     row.

     NO HARD-CODED SHAPE IN THE END ANCHOR, because two of them bit in
     consecutive commits: first an eight-space indent, so wrapping the row in a
     conditional re-indented it; then a 1600-character ceiling, so growing a
     comment inside the row pushed its close out of range. Both times every
     assertion in this section failed at once and none named what had actually
     changed — the exact fault the paragraph above warns about, committed twice
     in fixes for it.

     The end is now the first `</div>`, at any indent and any distance, and the
     premise that makes that correct is asserted rather than assumed. */
  const stripAt = /<div className="hidden[^"]*sm:flex"/.exec(viewer);
  const strip =
    stripAt === null
      ? ""
      : (/^[\s\S]*?\n\s*<\/div>/.exec(viewer.slice(stripAt.index))?.[0] ?? "");
  /* THE PREMISE OF THAT END ANCHOR, ASSERTED. "First `</div>` is the row's own"
     holds only while the row has no nested `<div>`; if one ever appears the
     extraction stops early and every measurement below silently describes a
     fragment of the row instead of the row. */
  check(
    "the strip extraction stopped at the strip's own closing tag",
    strip !== "" && !/<div\b/.test(strip.slice(1)),
    "the row grew a nested <div>, so this section measures the wrong element " +
      "and its other assertions cannot be trusted",
  );
  /* READ THE TEXT BEFORE THE CONTAINER, not the container itself. The first
     spelling of this tested `strip` for a leading `{edit === undefined ? null :`
     — which sits OUTSIDE the match, so re-introducing the original bug passed
     green. Measured on the characters preceding the tag instead. */
  const beforeStrip =
    stripAt === null
      ? ""
      : viewer.slice(Math.max(0, stripAt.index - 140), stripAt.index);
  check(
    "the affordance strip renders whether or not editing is on",
    strip !== "" &&
      !/\?\s*null\s*:\s*$/.test(beforeStrip.trimEnd() + "") &&
      !/edit === undefined \? null :/.test(beforeStrip),
    "a strip that appears with the edit toggle rescales a pane-fitted drawing",
  );
  /* THE GATE MOVED INTO THE PANEL, with the sentence it switches between. The
     row used to hold a button when editing was on and the read-only sentence
     when it was not; it holds one control in both states now, and the panel
     carries the difference — so this reads the panel. Same rule, one surface
     later: a read-only canvas must not list gestures it cannot offer. */
  check(
    "the gesture guide is still gated on the edit handlers",
    /edit === undefined \? \([\s\S]{0,400}?SEQUENCE_READ_ONLY_HINT[\s\S]{0,600}?SEQUENCE_MOUSE_GESTURES/.test(
      viewer,
    ),
    "a read-only canvas would offer a guide to gestures it does not have",
  );
  /* AND THE READING HALF SURVIVED THE MOVE. It was a row of its own under the
     diagram before it became a section of this panel, and a row deleted in a
     refactor leaves nothing behind to notice — no import breaks, no type
     fails, and the loss is one sentence in a screenshot nobody takes. Two
     clauses are pinned: the one naming what to click, which is this viewer's
     whole interaction, and the fold clause, which is conditional and therefore
     the easiest to drop by accident. */
  /* Named apart from section 14's `flowed`, which flattens the PAGE. Two
     bindings of one name over two different sources, in one file, is how a
     later edit reads the wrong one. */
  const viewerFlowed = viewer.replace(/\s+/g, " ");
  check(
    "the guide still teaches reading, not only editing",
    /fragment chip to focus it/.test(viewerFlowed) &&
      /folds away the services only it uses/.test(viewerFlowed),
    "the reading clauses were dropped rather than moved — nothing on the " +
      "canvas says its messages and lifelines can be clicked",
  );
  /* HEIGHT STATED, NOT INFERRED FROM CONTENT, and no wrapping — the two
     properties that keep the pane a constant size. `flex-wrap` is what let the
     caveat take a second row at some widths and not others, so resizing the
     window rescaled the drawing; the sideways scroll is what replaces it. The
     row holds one button now and could not plausibly overflow, and the rules
     stay anyway: they are what makes the height independent of the content,
     which is the property being defended, not a reaction to today's content. */
  check(
    "the strip states a fixed height and never wraps",
    /\bh-7\b/.test(strip) &&
      !/\bflex-wrap\b/.test(strip) &&
      /\boverflow-x-auto\b/.test(strip) &&
      /\bwhitespace-nowrap\b/.test(strip),
    "content-sized or wrapping, either of which re-fits the diagram",
  );
  check(
    "the read-only canvas gets a sentence of its own rather than an empty strip",
    /SEQUENCE_READ_ONLY_HINT/.test(viewer),
    "a blank row holds the height but tells the reader nothing",
  );
  /* THE LIST IS REACHABLE. Putting the gestures behind a disclosure is only
     safe while something opens it: a panel built, rendered and openable by
     nothing is exactly section 8's founding bug — correct in the module,
     absent from the screen — and it is how a shipped gesture goes unnamed for
     a release. So the trigger is pinned as a DISCLOSURE specifically: a button
     that owns the panel by id and says whether it is open. */
  check(
    "a disclosure opens the gesture guide, and says so",
    /aria-expanded=\{guideOpen\}/.test(viewer) &&
      /aria-controls=\{guidePanelId\}/.test(viewer) &&
      /id=\{guidePanelId\}/.test(viewer),
    "the guide is rendered behind a control that does not exist, does not " +
      "own it, or does not report its state — the list is unreachable, or " +
      "unreachable to a screen reader",
  );
  /* AND IT IS NOT CLIPPED BY THE ROW IT HANGS OFF. `overflow-x` on the strip
     computes `overflow-y` to `auto` as well, so a panel nested inside the strip
     is clipped on BOTH axes — it would open into a 28px slot and show one line
     of itself. The panel is therefore a SIBLING that precedes the strip inside
     a `relative` wrapper, which is also what keeps it out of the layout and
     away from the pane re-fit. Ordering is the cheap structural proof: if the
     panel is ever nested back inside the strip, it stops preceding it. */
  check(
    "the guide panel hangs outside the scrolling row, not inside it",
    stripAt !== null &&
      viewer.indexOf("id={guidePanelId}") !== -1 &&
      viewer.indexOf("id={guidePanelId}") < stripAt.index,
    "a panel inside the `overflow-x-auto` strip is clipped to the row's own " +
      "28 pixels on both axes",
  );
}

/* -------------------------------------------------------------------------- */
/* 17. The host remembers what the numbering toggle has to put back            */
/* -------------------------------------------------------------------------- */

/* `toggledAutonumberEdit` cannot answer "which off state was this document in"
   from the text once the flag reads `autonumber`, so it takes the answer as an
   argument and the HOST supplies it. That split is only safe while the host
   actually captures it, and a wrong capture is invisible: both off spellings
   render the same, so the symptom is a line quietly appearing or disappearing
   in someone's file.

   `check:sequence` asserts the GESTURE is lossless given a correct argument.
   These assert the host computes one — the other half of a coupling that
   `sequence-edit.ts`'s header and the check's own helper both claim exists. */
{
  const playground = readPlaygroundEditSurface();

  check(
    "the playground remembers an off spelling for the numbering toggle",
    /autonumberOffSpellingRef\s*=\s*useRef</.test(playground),
    "without it the off position has to guess, and guessing edits the file",
  );
  /* CAPTURED ON THE WAY ON, which is what makes a ref safe here: there is
     nothing to invalidate when the document changes, because the next turn-on
     reads the file again. A capture on the way OFF would read the flag it is
     about to overwrite and always answer "absent". */
  check(
    "it captures the spelling while numbering is still off",
    /if\s*\(!numberedNow\)\s*\{\s*autonumberOffSpellingRef\.current\s*=/.test(
      playground,
    ),
    "capturing after the flag is set reads the wrong state",
  );
  check(
    "an explicit `autonumber false` is what gets remembered",
    /autonumberOffSpellingRef\.current\s*=[\s\S]{0,180}?autonumber === false[\s\S]{0,60}?"false"/.test(
      playground,
    ),
    "the state whose silent deletion this whole mechanism exists to stop",
  );
  /* A FILE THAT ARRIVED NUMBERED was never off, so there is nothing to
     remember and the fallback decides. It has to keep the author's line where
     they put it, not remove it — a re-added flag lands after the block's
     leading prose, which moves a flag the author wrote above their comment. */
  check(
    "a file that arrived numbered falls back to keeping its flag line",
    /autonumberOffSpellingRef\.current \?\? "false"/.test(playground),
    'falling back to "absent" moves the author\'s flag below their comment',
  );
  check(
    "the toggle is called with a restore argument, not the default",
    /toggledAutonumberEdit\(\s*doc,\s*text,\s*autonumberOffSpellingRef/.test(
      playground,
    ),
    "a two-argument call takes the default and cannot restore anything",
  );
}

/* -------------------------------------------------------------------------- */
/* 18. A drag to reorder cannot steal a pan, a click, or an export             */
/* -------------------------------------------------------------------------- */

/* THE GESTURE THIS SECTION GUARDS IS THREE MEANINGS ON ONE BUTTON. Primary
   drag on this canvas already meant PAN, and a press on a message already meant
   FOCUS; reordering is the third, and every one of them is invisible in a diff.
   The C4 canvas needed a whole pull request to separate a drag from a pan WITH
   xyflow's help (section 12); this canvas has no library to lean on, so the
   separation is four source facts and each one is a silent bug if it goes.

   These are SOURCE assertions, in the manner of sections 9, 12 and 14, because
   the machinery lives in `.tsx` that type stripping cannot load. What is
   asserted is the RELATIONSHIP between two files, not the presence of a string:
   one threshold shared, one gate on the fold, one prefix on the chrome. */
console.log("\nA reorder drag steals neither a pan, a click, nor an export");
{
  const viewer = read("src/features/sequence/components/sequence-viewer.tsx");
  const diagram = read("src/features/sequence/components/sequence-diagram.tsx");
  const { CANVAS_DRAG_THRESHOLD } = await load(
    "src/features/sequence/lib/reorder.ts",
  );
  const { SEQUENCE_CHROME_CLASS_PREFIX } = await load(
    "src/features/sequence/lib/chrome.ts",
  );

  /* ONE THRESHOLD, NOT TWO. Both gestures decide "was this a sloppy click or a
     deliberate drag" and they must decide it identically: with two numbers, a
     press of three pixels could pan without swallowing its trailing click while
     a press of five reordered, so the same press would read as two different
     intents depending on which surface it started on. Asserted by requiring
     BOTH files to name the constant and NEITHER to carry the bare number in the
     comparison — a literal is how the pair silently drifts. */
  check(
    "the pan gesture reads the shared drag threshold",
    /Math\.abs\(dx\) \+ Math\.abs\(dy\) >\s*CANVAS_DRAG_THRESHOLD/s.test(
      viewer,
    ),
    "the pan handler is back to its own literal, so the two gestures can disagree",
  );
  check(
    "the reorder gesture reads the same shared threshold",
    /CANVAS_DRAG_THRESHOLD/.test(diagram),
    "the drag surface has its own idea of when a press became a drag",
  );
  check(
    `neither file retypes the number (${CANVAS_DRAG_THRESHOLD})`,
    typeof CANVAS_DRAG_THRESHOLD === "number" &&
      !new RegExp(`\\)\\s*>\\s*${CANVAS_DRAG_THRESHOLD}\\b`).test(
        viewer + diagram,
      ),
    "a literal comparison against the threshold is how the pair drifts apart",
  );

  /* THE PAN LAYER IS WHAT KEEPS THE TWO APART, and it does so by WHERE the
     press starts rather than by what it hits later — its own limit two. So the
     reorder surfaces must live inside the hit regions the pan handler already
     declines, and that early return must still be there. Remove it and a drag
     on a message would pan the view AND reorder the step. */
  check(
    "the pan handler still declines a press that starts on an interactive target",
    new RegExp(
      `closest\\?\\.\\(\"\\.${SEQUENCE_CHROME_CLASS_PREFIX}hit\"\\)`,
    ).test(viewer.replace(/\\/g, "")) ||
      /closest\?\.\(["'`]\.af-seq-chrome-hit["'`]\)/.test(viewer),
    "the pan gesture would fire on top of a reorder drag",
  );
  /* AND THE REORDER PRESS STOPS PROPAGATING, which is the other half: the pane
     is an ancestor of the SVG, so a press that reached it would start a pan
     even though the pan handler declined to read it as one. */
  check(
    "a reorder press stops propagating to the pane",
    /onPointerDown: \(event\) => \{[\s\S]{0,220}?event\.stopPropagation\(\)/.test(
      diagram,
    ),
    "the press would reach the pane's own pointer handler as well",
  );

  /* THE CLICK IS THE THIRD MEANING. A drag that moved must swallow its trailing
     click or dragging a message also focuses it — and, worse, a drag that did
     NOT move must NOT swallow it, or clicking an arrow stops focusing it
     entirely. Both halves come from one predicate, read-and-clear, which is the
     same contract `panSuppressesClick` has. */
  check(
    "a moved drag swallows exactly one trailing click",
    /swallowsClick: \(\) => \{[\s\S]{0,200}?dragSuppressesClick\.current = false;[\s\S]{0,40}?return true;/.test(
      diagram,
    ),
    "reading the flag does not clear it, so one drag would eat every later click",
  );
  const swallowSites = [...diagram.matchAll(/swallowsClick\(\) === true/g)];
  check(
    "both draggable elements consult it before focusing",
    swallowSites.length === 2,
    /* TWO: the message hit path and the participant header rect. One of them
       missing is a drag that also focuses, on one axis only — the kind of
       asymmetry that gets reported as "sometimes it selects". */
    `found ${swallowSites.length} focus paths guarded by the drag flag`,
  );

  /* THE DROP INDICATOR CANNOT REACH AN EXPORT. A sequence export CLONES THE
     LIVE SVG (`export/render-svg.ts`), so anything on screen is in the file
     unless the chrome prefix takes it out. A drag holds pointer capture, so an
     export cannot physically overlap one — but the convention is a PREFIX
     rather than a judgement about reachability (`chrome.ts`), and the first
     insertion indicator to be spelled any other way would serialise into every
     SVG, PNG and all twenty GIF frames with no check going red. Derived from
     the prefix constant, never from the class name written out here. */
  const dropLayer = /<g className="([^"]*)"[^>]*>\s*\{drag\.axis/.exec(
    diagram.replace(/\s+/g, " ").replace(/> \{/g, ">\n          {"),
  );
  const dropClass = /className="(af-seq-chrome-[a-z-]*drop[a-z-]*)"/.exec(
    diagram,
  );
  check(
    "the drop indicator carries the chrome prefix, so the exporter strips it",
    dropClass !== null &&
      dropClass[1].includes(SEQUENCE_CHROME_CLASS_PREFIX) &&
      dropLayer !== null,
    "a dashed drop rule would be baked into every exported SVG, PNG and GIF frame",
  );
  check(
    "the drop indicator takes no pointer events",
    /className="af-seq-chrome-drop"[\s\S]{0,60}?pointerEvents="none"/.test(
      diagram,
    ),
    /* It is drawn LAST, over the lifelines the reader is dragging across; a
       hit-testable rule would swallow the pointer mid-gesture. */
    "the indicator would intercept the drag it is describing",
  );

  /* NO PER-ELEMENT ANIMATION on the drag feedback, which is `check:sequence-
     motion`'s rule and is right: the reader is choosing a slot, and a diagram
     that moves while they choose is fighting the choice. The dragged element
     dims — opacity only, inline, no transition and no keyframes. Asserted here
     as well as there because THIS is the file where the temptation lives. */
  const dimSites = [...diagram.matchAll(/opacity=\{drag\?\.active === true/g)];
  check(
    "the dragged element dims rather than animating or following the cursor",
    dimSites.length === 2 &&
      !/transition[^:]*:\s*[^;]*opacity/.test(diagram) &&
      !/af-seq-drag/.test(
        read("src/features/sequence/styles/sequence-motion.css"),
      ),
    /* FOLLOWING THE CURSOR was the tempting version and is wrong: everything
       here is layout-solved, so a translated arrow detaches from both lifelines
       and drags its label out of alignment — a broken drawing, not a moving
       one. */
    `${dimSites.length} of 2 axes dim the source element`,
  );

  /* THE FOLD GATE. `collapseSequence` renumbers 1..n over the VISIBLE subset
     and drops hidden participants from `shown.participants` outright, so a
     reorder addressed while anything is folded moves a DIFFERENT element from
     the one the reader dragged — silently, because both are plausible. The
     affordance therefore disappears entirely rather than being offered and
     refused, and the predicate is the identity `shown === file` because
     `collapseSequence` returns its argument unchanged when nothing is folded:
     the identity IS the fold state, and a count of hidden participants would be
     a second reading of it. */
  check(
    "the reorder bundle is withheld while anything is folded",
    /if \(edit === undefined \|\| shown !== file\) return null;/.test(viewer),
    "a drag while lifelines are folded would move a different element",
  );
  check(
    "the keyboard route says why, rather than doing nothing",
    /if \(reorder === null\) \{\s*onAnnounce\(FOLDED_REORDER_REFUSAL\);/.test(
      viewer,
    ),
    "a key that silently does nothing is indistinguishable from one that is unwired",
  );
  check(
    "the fold refusal names the control that clears the fold",
    /const FOLDED_REORDER_REFUSAL =[\s\S]{0,400}?Show all/.test(viewer),
    "a refusal with no next step is a dead end",
  );

  /* THE KEYBOARD IS PARITY, NOT A CONSOLATION. Alt + arrows must be checked
     BEFORE the plain arrows, or the modifier falls through to "walk focus" and
     the gesture is unreachable from the keyboard while looking wired. */
  check(
    "Alt + arrow is handled before the plain arrow keys",
    /if \(event\.altKey\) \{\s*handleReorderKey\(event\);\s*return;\s*\}[\s\S]{0,400}?case "ArrowRight":/.test(
      viewer,
    ),
    "the modifier would fall through and move the selection instead of the step",
  );
  check(
    "both axes are reachable from the keyboard",
    /ArrowUp[\s\S]{0,120}?"message"[\s\S]{0,200}?ArrowLeft[\s\S]{0,120}?"participant"/.test(
      viewer,
    ),
    "one of the two reorder axes has no keyboard route at all",
  );
}

/* -------------------------------------------------------------------------- */
/* 19. No surface still claims this canvas has no drag                        */
/* -------------------------------------------------------------------------- */

/* THIS IS THE THIRD STALE CLAIM ON ONE BRANCH. A heading said C4 was the only
   editable canvas after the sequence canvas became editable (section 8); the
   FAQ said the same; and the mouse guide's own header and caveat said "there is
   no drag on this canvas" right up to the release that added one. Each time the
   code was correct, every check passed, and the page was wrong.

   SO THE ASSERTION IS DERIVED FROM THE FILES, not from a hand-listed set of
   them. A list of surfaces cannot notice the surface it has never heard of —
   `codebase.md` habit 4 — and the whole failure mode here is a claim surviving
   in a file nobody thought to open. Every `.ts`, `.tsx`, `.md` and `.mjs` under
   the repo's own source, docs and check scripts is walked, and any sentence
   asserting the sequence canvas cannot be dragged or reordered fails.

   WHAT IS DELIBERATELY STILL ALLOWED, because it is still true: "there is no
   POSITION to move" (`canvasEditability`'s refusal, `constants.ts`, `/faq`).
   A sequence document genuinely has no coordinates — that is why a reorder is
   an array move and not a drag-to-place — and the refusal that says so now sits
   beside a canvas that does reorder on drag, which is a subtler sentence rather
   than a false one. The pattern below is written to catch the FALSE claim
   ("nothing is moved by dragging", "cannot be reordered", "no drag on this
   canvas") and to leave the true one alone. */
console.log("\nNo surface still claims the sequence canvas has no drag");
{
  const STALE = [
    /there is no drag on this canvas/i,
    /nothing (?:on the canvas )?is moved by dragging/i,
    /no drag(?:-to-\w+)? (?:on|for) (?:this|the sequence) canvas/i,
    /(?:column|lifeline|message|step)s? cannot be reordered/i,
    /a participant's column cannot be reordered/i,
    /there is no drag on this canvas to move it with/i,
  ];
  /* WALKED, not listed. `src` carries the app and every user-facing string,
     `scripts` carries the checks (one of which asserted the false claim and
     would have kept passing), and the two root documents are what a reader
     outside the app reads. */
  const roots = ["src", "scripts", "skills", "CHANGELOG.md", "README.md"];
  const EXTENSIONS = new Set([".ts", ".tsx", ".md", ".mjs", ".css"]);
  const files = [];
  const walk = (relative) => {
    const absolute = path.join(ROOT, relative);
    if (!existsSync(absolute)) return;
    if (statSync(absolute).isFile()) {
      if (EXTENSIONS.has(path.extname(relative))) files.push(relative);
      return;
    }
    for (const entry of readdirSync(absolute)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(path.join(relative, entry));
    }
  };
  for (const root of roots) walk(root);
  check(
    "the sweep found the source tree it is meant to walk",
    files.length > 200,
    /* A BROKEN WALK IS THE FAILURE MODE OF A CHECK LIKE THIS: an empty file
       list passes every assertion below forever. */
    `only ${files.length} files walked`,
  );
  const offenders = [];
  for (const relative of files) {
    /* THE ASSERTION ITSELF IS EXEMPT, and it has to be by NAME rather than by
       "skip the scripts directory": this file necessarily contains the very
       sentences it is looking for, and skipping every check script would blind
       the sweep to the next check that asserts a stale claim — which is exactly
       what happened here. */
    if (relative === path.join("scripts", "canvas-edit-check.mjs")) continue;
    const body = read(relative);
    for (const pattern of STALE) {
      if (pattern.test(body)) offenders.push(`${relative} — ${pattern}`);
    }
  }
  check(
    "no shipped surface says the sequence canvas cannot be dragged or reordered",
    offenders.length === 0,
    offenders.join("\n    "),
  );
  /* AND THE CLAIM THAT IS STILL TRUE IS STILL MADE. The refusal a reader gets
     when they drag a NON-sequence canvas has to keep naming the real reason —
     there is no position in those grammars to write one into — or the sweep
     above would be satisfied by deleting the honest sentence along with the
     false one, which is the cheapest possible way to pass this section. */
  const refusal = canvasEditability(
    { kind: "sequence", format: "alab", file: null },
    "move",
  );
  check(
    "the move refusal still explains that a sequence document has no position",
    /no position to move/i.test(refusal.reason ?? ""),
    "the honest half of the claim was deleted to satisfy the sweep above",
  );
}

/* -------------------------------------------------------------------------- */
/* 20. Grouping a lasso of elements: one gesture, one text, one undo           */
/* -------------------------------------------------------------------------- */

console.log("\nGrouping several elements into a boundary is ONE edit");
{
  /* NON-CANONICAL for section 13's reason, with the shapes only a GROUPING
     meets: an existing frame with a member (joins must not disturb it), a
     node with a `desc` continuation (a grouping patches declaration lines
     ONLY, so the continuation must survive untouched), and a `^ref`
     placeholder (a legal member — membership is local — where the same
     panel's field edit refuses). */
  const authored = [
    `archlab 1.0`,
    `title "Group probe"`,
    ``,
    `// The file's own note.`,
    `@context ctx "System context"`,
    `  frame f-edge "Edge"`,
    ``,
    `  // The people.`,
    `  cust:person "Customer" (400,240 160x96)`,
    `    desc "The paying kind."`,
    `  ops:person "Operator" (640,240 160x96)`,
    `  web:system "Web App" (400,480 160x96) >backend in=f-edge`,
    ``,
    `  cust -> web :"uses"`,
    ``,
    `@container backend owner=web`,
    `  api:container "API" [Go] (400,240 160x96)`,
    `  mirror:external ^ctx/cust (640,240 160x96)`,
    ``,
  ].join("\n");

  const doc = c4Document(authored);
  check(
    "the fixture is genuinely not canonical — otherwise this section is vacuous",
    authored !== sourceTextFor(doc),
    "the authored text already equals what the serializer emits",
  );

  const refuses = (run) => {
    try {
      return run() === null;
    } catch {
      return false;
    }
  };

  /* --- the grouping itself: N lines and one mint, in one edit -------------- */

  const grouped = groupedNodesEdit(doc, authored, "ctx", ["cust", "ops"], {
    kind: "new",
    label: "Trust zone",
  });
  check(
    "a grouping on authored text takes the PATCH path, by name",
    grouped !== null && grouped.path === "patch",
    `path: ${grouped === null ? "refused" : grouped.path}`,
  );
  const after = (grouped?.text ?? "").split("\n");
  const before = authored.split("\n");
  check(
    "the whole grouping adds exactly one line — the minted frame declaration",
    after.length === before.length + 1,
    `${before.length} lines became ${after.length}`,
  );
  check(
    "the minted frame line sits directly under the existing one, so frames stay together",
    after[before.indexOf(`  frame f-edge "Edge"`) + 1] ===
      `  frame f-trust-zone "Trust zone"`,
    `line after f-edge: ${JSON.stringify(after[before.indexOf(`  frame f-edge "Edge"`) + 1])}`,
  );
  /* EVERY byte the gesture is not about survives, asserted by subtraction:
     take the members' declaration lines out of both texts (and the minted
     line out of the patched one) and the remainders must be IDENTICAL —
     comments, the `desc` continuation, blank lines, the untouched `web`
     membership, the whole backend diagram. */
  const memberLine = (line) =>
    line.trimStart().startsWith("cust:person") ||
    line.trimStart().startsWith("ops:person");
  const rest = (lines, minted) =>
    lines.filter(
      (line) =>
        !memberLine(line) && (!minted || !line.includes("f-trust-zone")),
    );
  check(
    "every line the grouping is not about is byte-identical",
    JSON.stringify(rest(before, false)) === JSON.stringify(rest(after, true)),
    firstDiff(rest(after, true).join("\n"), rest(before, false).join("\n")),
  );
  /* The patched declarations are CANONICAL, proved against a full serialise
     of the grouped document — section 13's derivation, section 13's reason. */
  const canonicalAfter = sourceTextFor(grouped?.doc ?? doc);
  check(
    "each member's patched line is byte-identical to what the serializer would emit",
    ["cust:person", "ops:person"].every(
      (stem) =>
        after.find((line) => line.trimStart().startsWith(stem)) ===
        canonicalAfter
          .split("\n")
          .find((line) => line.trimStart().startsWith(stem)),
    ),
    "a grouped declaration diverged from canonical form",
  );
  const groupedDiagram = grouped?.doc.synced.file.diagrams.find(
    (d) => d.id === "ctx",
  );
  check(
    "the re-parse puts every member in the minted boundary",
    ["cust", "ops"].every(
      (id) =>
        groupedDiagram?.nodes.find((n) => n.id === id)?.frameId ===
        "f-trust-zone",
    ) && groupedDiagram?.frames?.some((f) => f.id === "f-trust-zone") === true,
    "a member came back outside the boundary it was grouped into",
  );

  /* ONE TEXT IS ONE UNDO ENTRY. The undo ring stores whole texts, so "one
     entry" is exactly "one edit object whose text carries the whole
     grouping": putting `authored` back reverses every membership AND the
     mint at once. Measured, not assumed — the pre-edit parse holds no
     grouped member, so there is no intermediate state an undo could land on. */
  const preEdit = c4Document(authored).synced.file.diagrams.find(
    (d) => d.id === "ctx",
  );
  check(
    "one undo entry reverses the whole grouping — the pre-edit text holds none of it",
    grouped !== null &&
      ["cust", "ops"].every(
        (id) => preEdit.nodes.find((n) => n.id === id).frameId === undefined,
      ) &&
      preEdit.frames?.some((f) => f.id === "f-trust-zone") !== true,
    "part of the grouping predates the edit — an undo would only partly reverse it",
  );

  /* --- joining an EXISTING boundary, and leaving all of them ---------------- */

  const joined = groupedNodesEdit(doc, authored, "ctx", ["cust", "ops"], {
    kind: "existing",
    frameId: "f-edge",
  });
  check(
    "grouping into an existing boundary mints nothing and patches only the members",
    joined !== null &&
      joined.path === "patch" &&
      joined.text.split("\n").length === before.length &&
      changedLines(authored, joined.text).every(
        (line) => memberLine(line.before ?? "") || memberLine(line.after ?? ""),
      ),
    "a join minted a line or touched a non-member",
  );
  const released = groupedNodesEdit(doc, authored, "ctx", ["web"], {
    kind: "none",
  });
  check(
    "releasing members writes `none` as membership coming off the line, frame kept",
    released !== null &&
      released.doc.synced.file.diagrams
        .find((d) => d.id === "ctx")
        .nodes.find((n) => n.id === "web").frameId === undefined &&
      released.doc.synced.file.diagrams
        .find((d) => d.id === "ctx")
        .frames?.some((f) => f.id === "f-edge") === true,
    "the release ate the frame declaration, or left the membership on",
  );

  /* --- the refusals, and which way a mixed selection falls ------------------ */

  check(
    "a selection naming an unknown id refuses WHOLLY — nothing partial",
    refuses(() =>
      groupedNodesEdit(doc, authored, "ctx", ["cust", "ghost"], {
        kind: "new",
        label: "Half",
      }),
    ),
    "a boundary was drawn missing a member the reader lassoed",
  );
  check(
    "an empty selection refuses rather than minting an empty boundary",
    refuses(() =>
      groupedNodesEdit(doc, authored, "ctx", [], { kind: "new", label: "X" }),
    ),
    "zero elements still produced an edit",
  );
  check(
    "a blank new label refuses — the shared resolver's rule",
    refuses(() =>
      groupedNodesEdit(doc, authored, "ctx", ["cust", "ops"], {
        kind: "new",
        label: "   ",
      }),
    ),
    "an unnamed boundary was minted",
  );
  check(
    "an unknown existing frame refuses — `in=` naming no frame will not parse",
    refuses(() =>
      groupedNodesEdit(doc, authored, "ctx", ["cust", "ops"], {
        kind: "existing",
        frameId: "f-ghost",
      }),
    ),
    "a membership was written against a frame the diagram does not declare",
  );
  check(
    "a no-op grouping refuses, so an idle Apply costs no undo entry",
    refuses(() =>
      groupedNodesEdit(doc, authored, "ctx", ["web"], {
        kind: "existing",
        frameId: "f-edge",
      }),
    ),
    "members already in the boundary still rewrote the pane",
  );
  check(
    "a Mermaid pane refuses the grouping — the C4 revise cell's own caveat",
    refuses(() =>
      groupedNodesEdit(
        { ...doc, format: "mermaid" },
        authored,
        "ctx",
        ["cust"],
        {
          kind: "new",
          label: "Zone",
        },
      ),
    ),
    "a membership was written against a pane whose emitter never reads frameId",
  );
  /* A `^ref` placeholder GROUPS, where the field editor refuses it: its own
     fields are derived from its target (forking them is what
     `revisedNodeEdit` refuses), but membership is a local fact — the
     serializer writes `in=` beside the `^` token. */
  const withMirror = groupedNodesEdit(
    doc,
    authored,
    "backend",
    ["api", "mirror"],
    { kind: "new", label: "Backend zone" },
  );
  const mirrorLine = (withMirror?.text ?? "")
    .split("\n")
    .find((line) => line.trimStart().startsWith("mirror:external"));
  check(
    "a ^ref placeholder is a legal member — membership is local, not derived",
    withMirror !== null &&
      withMirror.path === "patch" &&
      mirrorLine !== undefined &&
      mirrorLine.includes("^ctx/cust") &&
      mirrorLine.includes("in=f-backend-zone") &&
      !mirrorLine.includes('"'),
    `mirror line: ${JSON.stringify(mirrorLine)}`,
  );
  const jsonGrouped = groupedNodesEdit(
    { ...doc, format: "json" },
    JSON.stringify({ not: "the alab text" }),
    "ctx",
    ["cust", "ops"],
    { kind: "new", label: "Zone" },
  );
  check(
    "a JSON pane re-emits rather than splicing .alab line numbers into JSON",
    jsonGrouped !== null && jsonGrouped.path === "reemit",
    `path: ${jsonGrouped === null ? "refused" : jsonGrouped.path}`,
  );

  /* --- the gesture reaches the module through ONE host call ----------------- */

  const playground = readPlaygroundEditSurface();
  const canvas = read("src/features/viewer/components/viewer-canvas.tsx");
  const canvasCode = code("src/features/viewer/components/viewer-canvas.tsx");
  const groupBody =
    /const handleNodesGroup = useCallback\(([\s\S]*?)\n  \);/.exec(playground);
  check(
    "handleNodesGroup applies the whole grouping through exactly one applyCanvasEdit",
    groupBody !== null &&
      (groupBody[1].match(/applyCanvasEdit\(/g) ?? []).length === 1 &&
      groupBody[1].includes("groupedNodesEdit(") &&
      !groupBody[1].includes("setText("),
    "a second apply (or a direct pane write) would split one gesture into two undo entries",
  );
  check(
    "the canvas fires the grouping exactly once per Apply",
    (canvas.match(/edit\.onNodesGroup\(/g) ?? []).length === 1,
    "a second call site could commit the same lasso twice",
  );
  check(
    "the grouping refusal is announced, and the lasso is kept for a retry",
    groupBody !== null &&
      groupBody[1].includes("return false;") &&
      /if \(edit\.onNodesGroup\([\s\S]{0,120}?\)\) \{\s*\n\s*clearMultiSelection\(false\);/.test(
        canvas,
      ),
    "a refused grouping went silent, or a refusal still threw the selection away",
  );

  /* --- THE MARQUEE GUARD: 4fa7c36's loop must stay impossible --------------- */

  /* The crash: React Flow's rubber band emits `select` changes per mouse
     move; mirroring them into state the `nodes` prop derives from hands a
     fresh array identity to StoreUpdater every frame, which re-derives the
     selection against the adopted objects, and round again to React #185.
     The viewer's marquee is immune BY CONSTRUCTION, and each leg of that
     construction is pinned here so it cannot be relaxed unnoticed. */
  /* Matched as JSX PROPS (`name=`), not bare words: the canvas's comments
     rightly NAME these props while warning against them, and an assertion
     that fails on the warning would be failing on the guard itself. */
  check(
    "the viewer never engages React Flow's own selection machinery",
    /elementsSelectable=\{false\}/.test(canvas) &&
      !canvas.includes("onSelectionChange=") &&
      !canvas.includes("selectionOnDrag=") &&
      !canvas.includes("selectionKeyCode="),
    "the rubber band that crashed the editor (4fa7c36) is reachable again",
  );
  const nodesMemo = /const nodes = useMemo\(([\s\S]*?)\n  \);/.exec(canvas);
  const edgesMemo =
    /const edges = useMemo\(([\s\S]*?)\n  \}, \[([^\]]*)\]\);/.exec(canvas);
  check(
    "the nodes projection reads nothing the marquee writes",
    nodesMemo !== null &&
      !/marquee|multiSelected|activeMulti/i.test(nodesMemo[1]) &&
      nodesMemo[1].includes(
        "[model, draggedDiagram, editable, projectionCache]",
      ),
    "the nodes prop would gain a new identity per marquee frame — the loop's fuel",
  );
  check(
    "the edges projection reads nothing the marquee writes",
    edgesMemo !== null &&
      !/marquee|multiSelected|activeMulti/i.test(edgesMemo[0]),
    "the edges prop would gain a new identity per marquee frame — same loop, edge lane",
  );
  /* THE SHIPPED-LINK REGRESSION THIS SWAP COULD CAUSE. A bare drag now draws
     the lasso — but the lasso exists only where the canvas is editable AND
     in Select mode, and the canvas is LOCKED BY DEFAULT: every shared link
     and every presentation opens read-only. If the marquee ever claimed the
     press there, a reader who opened a shared diagram could not move around
     it at all, and the gesture they would reach for first is the one that
     broke. Two layers, both pinned, because either alone would be enough to
     regress:
       - the handler is not even ATTACHED unless `marqueeMode` (JSX gate),
         whose definition requires `editable`, so React Flow's own
         `panOnDrag` owns the press;
       - and the handler itself bails on a missing `edit` before it captures
         the pointer, so a future caller that attaches it unconditionally still
         cannot steal the pan. */
  check(
    "a bare drag still pans a read-only canvas — the marquee is not attached there",
    /onPointerDownCapture=\{marqueeMode \? handleMarqueeStart : undefined\}/.test(
      canvas,
    ) &&
      /const marqueeMode = editable && dragMode === "select";/.test(canvasCode),
    "the lasso is wired to a canvas that may be locked — a shared link would " +
      "stop panning, which is the one gesture every reader of one uses",
  );
  /* PAN MODE DETACHES THE MARQUEE, it does not bail inside it. The toggle's
     whole argument over the held-Space pan it replaced is that the pan owes
     nothing to any state a handler has to consult mid-gesture — the press
     must reach React Flow untouched, so ALL FOUR handlers hang off the same
     `marqueeMode` gate. One of them attached on bare `editable` would run in
     Pan mode: the capture-phase down would cancel the press and the pan would
     be broken again, in exactly the way three bug reports described. */
  check(
    "Pan mode does not attach the marquee — all four pointer handlers gate on the mode",
    [
      ["onPointerDownCapture", "handleMarqueeStart"],
      ["onPointerMove", "handleMarqueeMove"],
      ["onPointerUp", "handleMarqueeEnd"],
      ["onPointerCancel", "handleMarqueeCancel"],
    ].every(([prop, handler]) =>
      new RegExp(`${prop}=\\{marqueeMode \\? ${handler} : undefined\\}`).test(
        canvasCode,
      ),
    ),
    "a marquee handler is attached outside `marqueeMode` — in Pan mode it " +
      "would claim (or shadow) the press that is supposed to pan",
  );
  /* THE MODE CONTROL IS EDIT CHROME, presence-gated like the palette and the
     grouping card: a read-only or locked canvas ALWAYS pans, so it must show
     NO control — a disabled or ever-present toggle offers a Select mode that
     does not exist there, and this canvas's rule (bought by the lock bug,
     section 8's story) is that an affordance that cannot act does not
     render. */
  check(
    "the mode toggle renders only while the canvas is editable",
    /\{editable \? \(\s*<CanvasModeToggle/.test(canvas),
    "a mode control on a read-only canvas — it always pans, so the toggle " +
      "either lies (a Select option that does nothing) or ships disabled, " +
      "and this canvas ships neither",
  );
  /* SELECT IS THE DEFAULT: the toggle exists only on an editable canvas, and
     a reader who unlocked it did so to edit — defaulting to Pan would make
     the unlock's first drag pan, which reads as the unlock not working. */
  check(
    "the drag mode defaults to Select",
    /useState<CanvasDragMode>\("select"\)/.test(canvasCode),
    "an unlocked canvas opens in Pan mode — the reader's first drag after " +
      "unlocking pans, which reads as the unlock having done nothing",
  );
  /* THE ACTIVE MODE IS UNAMBIGUOUS TO A SCREEN READER. Two mutually
     exclusive states, exactly one active, is what radio semantics SAY —
     `aria-pressed` on two buttons was the runner-up, but "Select, toggle
     button, not pressed" makes the listener infer the mode from the other
     button. Checked on the group role plus aria-checked on the options,
     because the visual highlight is the one channel a screen reader cannot
     read. */
  const modeToggle = code("src/components/ui/canvas-mode-toggle.tsx");
  check(
    "the mode toggle is an honest radio group — role and checked state",
    /role="radiogroup"/.test(modeToggle) &&
      /role="radio"/.test(modeToggle) &&
      /aria-checked=\{checked\}/.test(modeToggle),
    "the toggle stopped reporting which mode is active as a checked state — " +
      "a screen reader is left to infer the mode from styling it cannot see",
  );
  const marqueeStart =
    /const handleMarqueeStart = useCallback\(([\s\S]*?)\n  \);/.exec(canvas);
  check(
    "and it refuses the press outright when the canvas hands it no edit",
    marqueeStart !== null &&
      /if \(edit === undefined\) return;/.test(marqueeStart[1]),
    "the marquee would capture a pointer on a canvas with nothing to select",
  );
  /* THE TWO THINGS CANCELLING THE PRESS TOOK AWAY, both reported as bugs
     ("cannot click focus everything", plus the pan of the day), and both
     from one cause. `preventDefault` on the pane pointerdown suppresses the
     compatibility mouse events, and those events were doing two jobs nobody
     had written down: moving focus, and delivering the plain background
     click. A press on the pane means "I am working on the drawing now" —
     Escape, the nudge arrows and the next Tab must aim at the diagram, not
     at the last control pressed (or stay locked out by the source
     textarea's form-field exemption). A gesture that claims a press owes
     back everything the press would have done. */
  check(
    "claiming the pane press hands focus to the canvas it suppressed",
    marqueeStart !== null &&
      /container\.focus\(\{ preventScroll: true \}\);/.test(marqueeStart[1]),
    "focus stays on whatever was clicked last — the canvas's own keys keep " +
      "aiming at a control (or a textarea) the reader has moved on from",
  );
  const marqueeEnd =
    /const handleMarqueeEnd = useCallback\(([\s\S]*?)\n  \);/.exec(canvas);
  check(
    "a press that never travelled is a click, not an empty selection box",
    marqueeEnd !== null &&
      /MARQUEE_CLICK_SLOP_PX/.test(marqueeEnd[1]) &&
      /clearSelection\(!travelled\)/.test(marqueeEnd[1]),
    "a plain background click reports 'no elements inside the selection box' " +
      "— describing a gesture the reader never made",
  );
  const marqueeMove =
    /const handleMarqueeMove = useCallback\(([\s\S]*?)\n  \);/.exec(canvas);
  check(
    "the per-frame marquee handler writes the overlay rect and nothing else",
    marqueeMove !== null &&
      marqueeMove[1].includes("setMarquee(") &&
      (marqueeMove[1].match(/set[A-Z]\w*\(/g) ?? []).every(
        (call) => call === "setMarquee(",
      ) &&
      !marqueeMove[1].includes("edit."),
    "a mouse move now writes state the projection can see — re-read 4fa7c36 first",
  );
  check(
    "the marquee claims a press on the pane ITSELF, never one inside it",
    /classList\.contains\("react-flow__pane"\)/.test(canvasCode) &&
      !/closest\("\.react-flow__pane"\)/.test(canvasCode) &&
      /event\.preventDefault\(\);\s*\n\s*event\.stopPropagation\(\);\s*\n\s*container\.setPointerCapture\(/.test(
        canvasCode,
      ),
    "React Flow v12 renders the graph as CHILDREN of .react-flow__pane, so a " +
      "`closest` test matches a press on a NODE and the lasso cancels it — " +
      "selecting, dragging and the focus handover the press owes all die",
  );
  /* THE SPACE MACHINERY IS GONE, WHOLLY — not parked as a half-working
     accelerator. Hold-Space-to-pan was reported broken three times and
     outlived two attempted fixes, because it was a held-key flag mirrored
     from window listeners: released by keyup, by window blur, by effect
     cleanup, yielded to focused controls — every one of those a place the
     flag and reality could disagree, and it never existed on touch at all.
     The Select/Pan toggle replaced it, so any of these names reappearing in
     the viewer means key-state plumbing is growing back BESIDE the toggle —
     two gates for one gesture, the exact "two halves that disagree" shape
     that produced the reports. `spaceHeld` is checked on the RAW source on
     purpose: even a comment still describing the Space pan is a page
     teaching a gesture that no longer exists. `panActivationKeyCode` is
     matched as a PROP USE (`=`), because the pan-props comment rightly names
     it while explaining why it is gone. */
  check(
    "no Space-pan machinery remains in the viewer canvas",
    !/spaceHeld/.test(canvas) && !/panActivationKeyCode=/.test(canvas),
    "spaceHeld or a panActivationKeyCode prop is back in viewer-canvas.tsx — " +
      "the pan is the Select/Pan toggle now, and a key beside it is a second " +
      "gate that can disagree with the mode",
  );
}

/* -------------------------------------------------------------------------- */
/* 20a. Removing a boundary re-homes what it held — never its members          */
/* -------------------------------------------------------------------------- */

/* The frame card shipped rename-only, holding removal to a written spec:
   decide where the members and any nested frames land before offering the
   button. `deletedFrameEdit` answers with the editor store's shipped verdict
   (`deleteFrame`: re-home one level out, never cascade — `check:frames`
   measures the store's half), and these assertions measure the canvas half
   against the same line, so the two authoring surfaces cannot mean different
   things by "remove". */
console.log("\nRemoving a boundary re-homes what it held");
{
  /* Non-canonical for section 13's reason, with the shapes only a REMOVAL
     meets: a nested frame (must lift out, not cascade), a member with a
     `desc` continuation (a removal patches declaration lines only), a member
     in the INNER frame (must land in the outer one, not loose), and a loose
     node (must not be touched at all). */
  const authored = [
    `archlab 1.0`,
    `title "Boundary removal probe"`,
    ``,
    `// The file's own note.`,
    `@context ctx "System context"`,
    `  frame f-outer "Outer"`,
    `  frame f-inner "Inner" in=f-outer`,
    ``,
    `  // The people.`,
    `  cust:person "Customer" in=f-outer`,
    `    desc "The paying kind."`,
    `  ops:person "Ops" in=f-inner`,
    `  web:system "Web App"`,
    ``,
    `  cust -> web :"uses"`,
    ``,
  ].join("\n");
  const doc = c4Document(authored);
  check(
    "the fixture is genuinely not canonical — otherwise this section is vacuous",
    authored !== sourceTextFor(doc),
    "the authored text already equals what the serializer emits",
  );
  const refuses = (run) => {
    try {
      return run() === null;
    } catch {
      return false;
    }
  };
  const ctxOf = (edit) =>
    edit?.doc.synced.file.diagrams.find((d) => d.id === "ctx");

  /* --- the outer ring comes off; everything it held stays ------------------- */

  const removed = deletedFrameEdit(doc, authored, "ctx", "f-outer");
  const removedCtx = ctxOf(removed);
  /* THE REQUIRED PROPERTY, and the whole design question the spec posed: a
     boundary is a view construct that owns no elements (`C4Frame`), so
     removing the ring must not remove the group — a removal that ate members
     would be a multi-delete wearing a smaller button's label. */
  check(
    "a boundary deletion leaves its members in the document",
    removed !== null &&
      removedCtx.nodes.length === 3 &&
      ["cust", "ops", "web"].every((id) =>
        removedCtx.nodes.some((n) => n.id === id),
      ),
    `nodes after: ${JSON.stringify(removedCtx?.nodes.map((n) => n.id))}`,
  );
  /* `removed !== null` is load-bearing: a refused edit would leave the whole
     chain `undefined === undefined` and pass this vacuously — observed while
     break-testing the member-eating variant. */
  check(
    "members of the removed top-level frame land loose",
    removed !== null &&
      removedCtx.nodes.find((n) => n.id === "cust").frameId === undefined,
    "a member kept a membership naming a frame the file no longer declares",
  );
  /* THE NESTED FRAME LIFTS OUT, never cascades: its declaration is the
     author's and survives the removal of the ring AROUND it, respelled by
     the serializer with its `in=` gone — no new nesting is stated, which is
     what keeps the mint's "always top-level" verdict intact next door. */
  check(
    "a nested frame lifts out — kept, top-level, its own members untouched",
    removedCtx?.frames?.length === 1 &&
      removedCtx.frames[0].id === "f-inner" &&
      (removedCtx.frames[0].parentFrameId ?? null) === null &&
      removedCtx.nodes.find((n) => n.id === "ops").frameId === "f-inner",
    `frames after: ${JSON.stringify(removedCtx?.frames)}`,
  );
  check(
    "the removal takes the patch path on authored text",
    removed !== null && removed.path === "patch",
    `path: ${removed === null ? "refused" : removed.path}`,
  );
  /* EVERY byte the removal is not about survives, by subtraction: take the
     frame lines and the re-homed member's declaration out of both texts and
     the remainders must be identical — the comment above the members, the
     `desc` continuation, the loose node, the relationship line. */
  const touched = (line) =>
    line.trimStart().startsWith("frame ") ||
    line.trimStart().startsWith("cust:person");
  check(
    "every line the removal is not about is byte-identical",
    removed !== null &&
      JSON.stringify(authored.split("\n").filter((l) => !touched(l))) ===
        JSON.stringify(removed.text.split("\n").filter((l) => !touched(l))),
    removed === null
      ? "the removal was refused"
      : firstDiff(
          removed.text
            .split("\n")
            .filter((l) => !touched(l))
            .join("\n"),
          authored
            .split("\n")
            .filter((l) => !touched(l))
            .join("\n"),
        ),
  );
  /* The respelled lines are CANONICAL — section 13's derivation: measured
     against a full serialise of the edited document, so a lifted frame's
     dropped `in=` and a re-homed member's membership are the serializer's
     own bytes. */
  const canonicalAfter = sourceTextFor(removed?.doc ?? doc);
  check(
    "the lifted frame's line and the member's line are the serializer's own",
    ["frame f-inner", "cust:person"].every(
      (stem) =>
        (removed?.text ?? "")
          .split("\n")
          .find((line) => line.trimStart().startsWith(stem)) ===
        canonicalAfter
          .split("\n")
          .find((line) => line.trimStart().startsWith(stem)),
    ),
    "a respelled line diverged from canonical form",
  );
  /* ONE TEXT, ONE UNDO ENTRY — the grouping's contract, measured the same
     way: the undo ring stores whole texts, so "one entry" is exactly "one
     edit whose text carries the whole removal", and the PRE-edit parse must
     hold everything the removal changed — the frame, the nesting AND the
     membership — or an undo would land on an intermediate state. */
  const preEdit = c4Document(authored).synced.file.diagrams.find(
    (d) => d.id === "ctx",
  );
  check(
    "one undo entry restores the boundary, the nesting and the memberships",
    removed !== null &&
      preEdit.frames?.some((f) => f.id === "f-outer") === true &&
      preEdit.frames?.find((f) => f.id === "f-inner")?.parentFrameId ===
        "f-outer" &&
      preEdit.nodes.find((n) => n.id === "cust").frameId === "f-outer",
    "part of the removal predates the edit — an undo would only partly reverse it",
  );

  /* --- an inner ring's members land in the OUTER one, not loose ------------- */

  const inner = deletedFrameEdit(doc, authored, "ctx", "f-inner");
  const innerOps = (inner?.text ?? "")
    .split("\n")
    .find((line) => line.trimStart().startsWith("ops:"));
  check(
    "members of a nested frame re-home to its parent — one level out, not loose",
    inner !== null &&
      innerOps !== undefined &&
      innerOps.includes("in=f-outer") &&
      ctxOf(inner).nodes.find((n) => n.id === "ops").frameId === "f-outer",
    `ops line: ${JSON.stringify(innerOps)}`,
  );

  /* --- the last frame's removal leaves no empty frames key ------------------ */

  /* Absence is how the format spells "no boundaries" — an empty array left
     behind would be a model shape no fresh parse produces, and the JSON twin
     would carry a `"frames": []` the author never wrote. */
  const bothGone = deletedFrameEdit(inner.doc, inner.text, "ctx", "f-outer");
  check(
    "removing the last boundary drops the frames key, not leaves it empty",
    bothGone !== null && ctxOf(bothGone).frames === undefined,
    `frames after: ${JSON.stringify(ctxOf(bothGone)?.frames)}`,
  );

  /* --- the refusals, and the panes ------------------------------------------ */

  check(
    "an unknown frame refuses rather than throws",
    refuses(() => deletedFrameEdit(doc, authored, "ctx", "f-ghost")),
    "a stale selection would take the page down instead of doing nothing",
  );
  check(
    "a Mermaid pane refuses the removal — the C4 revise cell's own caveat",
    refuses(() =>
      deletedFrameEdit(
        { ...doc, format: "mermaid" },
        authored,
        "ctx",
        "f-outer",
      ),
    ),
    "a boundary edit was written against a pane whose emitter never reads frames",
  );
  const inJson = deletedFrameEdit(
    { ...doc, format: "json" },
    doc.synced.jsonText,
    "ctx",
    "f-outer",
  );
  check(
    "a JSON pane re-emits rather than splicing .alab line numbers into JSON",
    inJson !== null && inJson.path === "reemit",
    `path: ${inJson === null ? "refused" : inJson.path}`,
  );

  /* --- the host and the card ------------------------------------------------ */

  const playground = readPlaygroundEditSurface();
  const frameCardCode = code(
    "src/features/viewer/components/viewer-frame-detail.tsx",
  );
  const deleteBody =
    /const handleFrameDelete = useCallback\(([\s\S]*?)\n  \);/.exec(playground);
  check(
    "handleFrameDelete applies through exactly one applyCanvasEdit and announces the refusal",
    deleteBody !== null &&
      (deleteBody[1].match(/applyCanvasEdit\(/g) ?? []).length === 1 &&
      deleteBody[1].includes("deletedFrameEdit(") &&
      !deleteBody[1].includes("setText(") &&
      deleteBody[1].includes("if (next === null)") &&
      /Cmd or Ctrl \+ Z/.test(deleteBody[1]),
    "a second apply would split one gesture into two undo entries, or a " +
      "refused removal went silent",
  );
  /* The announcement answers the design question the reader will actually
     have — "what happened to my elements?" — rather than only naming the
     frame that went. */
  check(
    "the announcement says where the members landed",
    deleteBody !== null && /one level out/.test(deleteBody[1]),
    "the one thing a removal must say is unsaid",
  );
  /* The card's Remove sits OUTSIDE the rename form: the rename is a field
     Apply rewrites, the removal is an act — Enter in the name field must
     never remove the boundary. Positional, like the edit-keys exemption:
     the button has to come after the form closes. */
  const formEnd = frameCardCode.indexOf("</form>");
  const removeAt = frameCardCode.indexOf("onClick={onDelete}");
  check(
    "the card's Remove button lives outside the rename form",
    formEnd !== -1 && removeAt !== -1 && formEnd < removeAt,
    "Enter in the rename field would submit a removal",
  );
  /* Read from `code(...)`, NOT the raw source: the card's own header comment
     states the contract in almost the same words, and the raw-source version
     of this assertion stayed green with the sentence deleted from the JSX —
     the sixth firing of the trap `code()` exists for, observed while
     break-testing this very section. */
  check(
    "the card says everything the boundary holds stays, whenever it holds anything",
    /everything it holds stays on the\s+canvas/.test(
      frameCardCode.replace(/\s+/g, " "),
    ),
    "Remove beside a populated group reads as removing the group",
  );
}

/* -------------------------------------------------------------------------- */
/* 21. A connect is an INSERT patch, and one gesture can mint both lines       */
/* -------------------------------------------------------------------------- */

console.log("\nConnecting two elements is one inserted relationship line");
{
  /* NON-CANONICAL for section 13's reason, with the shapes only a CONNECT
     meets: an existing relationship line (the insert must land under it, and
     its pair is the duplicate fixture), a diagram with NO relationship lines
     (the blank-separator anchor), and a `^ref` placeholder (a legal endpoint
     — an edge is a local fact — where the field editor refuses). */
  const authored = [
    `archlab 1.0`,
    `title "Connect probe"`,
    ``,
    `// The file's own note.`,
    `@context ctx "System context"`,
    ``,
    `  // The people.`,
    `  cust:person "Customer" (400,240 160x96)`,
    `    desc "The paying kind."`,
    `  ops:person "Operator" (640,240 160x96)`,
    `  web:system "Web App" (400,480 160x96) >backend`,
    ``,
    `  cust -> web :"uses"`,
    ``,
    `@container backend owner=web`,
    `  api:container "API" [Go] (400,240 160x96)`,
    `  db:database "Orders DB" (640,240 160x96)`,
    `  mirror:external ^ctx/cust (880,240 160x96)`,
    ``,
  ].join("\n");

  const doc = c4Document(authored);
  check(
    "the fixture is genuinely not canonical — otherwise this section is vacuous",
    authored !== sourceTextFor(doc),
    "the authored text already equals what the serializer emits",
  );
  const before = authored.split("\n");
  const refuses = (run) => {
    try {
      return run() === null;
    } catch {
      return false;
    }
  };

  /* --- the fresh pair: one line, under the last relationship line ----------- */

  const connected = connectedNodesEdit(doc, authored, "ctx", "ops", "web");
  check(
    "a connect on authored text takes the PATCH path, by name",
    connected !== null && connected.path === "patch",
    `path: ${connected === null ? "refused" : connected.path}`,
  );
  const after = (connected?.text ?? "").split("\n");
  check(
    "the connect adds exactly one line — the relationship",
    after.length === before.length + 1,
    `${before.length} lines became ${after.length}`,
  );
  const edgeLineAt = before.indexOf(`  cust -> web :"uses"`) + 1;
  check(
    "the new line sits directly under the diagram's last relationship line",
    after[edgeLineAt] === `  ops -> web`,
    `line under the existing edge: ${JSON.stringify(after[edgeLineAt])}`,
  );
  check(
    "every line the connect is not about is byte-identical",
    JSON.stringify([
      ...after.slice(0, edgeLineAt),
      ...after.slice(edgeLineAt + 1),
    ]) === JSON.stringify(before),
    firstDiff(
      [...after.slice(0, edgeLineAt), ...after.slice(edgeLineAt + 1)].join(
        "\n",
      ),
      authored,
    ),
  );
  /* The patched line is CANONICAL, proved against a full serialise of the
     connected document — section 13's derivation, section 13's reason. */
  check(
    "the inserted line is byte-identical to what the serializer would emit",
    connected !== null &&
      sourceTextFor(connected.doc).split("\n").includes(after[edgeLineAt]),
    "the spliced relationship diverged from canonical form",
  );
  const connectedDiagram = connected?.doc.synced.file.diagrams.find(
    (d) => d.id === "ctx",
  );
  check(
    "the re-parse holds the relationship, forward, under its default id",
    connectedDiagram?.edges.some(
      (e) =>
        e.id === "e-ops-web" &&
        e.source === "ops" &&
        e.target === "web" &&
        e.direction === "forward",
    ) === true,
    `edges: ${JSON.stringify(connectedDiagram?.edges.map((e) => e.id))}`,
  );

  /* --- the duplicate: a CAUTION, never a refusal ----------------------------- */

  /* The verdict model's own call (`connect-verdict.ts`): parallel
     relationships are a real feature the canvas already draws as separate
     curves, so the module must not refuse them — it de-collides the id
     instead, and the id must land on the line or the round trip would fuse
     the pair back into one. */
  const doubled = connectedNodesEdit(doc, authored, "ctx", "cust", "web");
  check(
    "an already-related pair connects again — a caution, never a refusal",
    doubled !== null &&
      doubled.path === "patch" &&
      doubled.text.includes("  cust -> web id=e-cust-web-2") &&
      doubled.doc.synced.file.diagrams
        .find((d) => d.id === "ctx")
        .edges.filter((e) => e.source === "cust" && e.target === "web")
        .length === 2,
    `text gained: ${JSON.stringify(
      changedLines(authored, doubled?.text ?? authored).map((l) => l.after),
    )}`,
  );

  /* --- the refusals ---------------------------------------------------------- */

  check(
    "the same element twice refuses — the verdict model's cancel",
    refuses(() => connectedNodesEdit(doc, authored, "ctx", "cust", "cust")),
    "a self-edge was written",
  );
  check(
    "a cross-diagram target refuses — an edge names nodes of ONE diagram",
    refuses(() => connectedNodesEdit(doc, authored, "ctx", "cust", "api")),
    "an edge was written into a diagram that does not hold its target",
  );
  check(
    "an unknown target refuses",
    refuses(() => connectedNodesEdit(doc, authored, "ctx", "cust", "ghost")),
    "an edge was written against a node the file does not hold",
  );
  check(
    "a Mermaid pane refuses the connect — the connect cell's own caveat",
    refuses(() =>
      connectedNodesEdit(
        { ...doc, format: "mermaid" },
        authored,
        "ctx",
        "ops",
        "web",
      ),
    ),
    "an edge was written against a pane that gives it no id and one diagram",
  );
  const jsonConnected = connectedNodesEdit(
    { ...doc, format: "json" },
    JSON.stringify({ not: "the alab text" }),
    "ctx",
    "ops",
    "web",
  );
  check(
    "a JSON pane re-emits rather than splicing .alab line numbers into JSON",
    jsonConnected !== null && jsonConnected.path === "reemit",
    `path: ${jsonConnected === null ? "refused" : jsonConnected.path}`,
  );

  /* --- the ^ref endpoint, and the first edge of a diagram --------------------- */

  /* One gesture, two facts: a placeholder is a LEGAL endpoint (an edge is a
     local fact the serializer writes beside the `^` token — the grouping's
     argument, not the field editor's refusal), and a diagram with no
     relationship lines yet takes the blank separator the serializer writes
     between the sections, so the first connect leaves the diagram spelled
     exactly as a full serialise would order it. */
  const toMirror = connectedNodesEdit(
    doc,
    authored,
    "backend",
    "api",
    "mirror",
  );
  const mirrorAfter = (toMirror?.text ?? "").split("\n");
  const mirrorDeclAt = before.indexOf(
    `  mirror:external ^ctx/cust (880,240 160x96)`,
  );
  check(
    "a ^ref placeholder is a legal endpoint — an edge is local, not derived",
    toMirror !== null &&
      toMirror.path === "patch" &&
      toMirror.doc.synced.file.diagrams
        .find((d) => d.id === "backend")
        .edges.some((e) => e.source === "api" && e.target === "mirror"),
    "connecting to a mirror was refused — drawing the outer system talking " +
      "to local elements is what placeholders exist for",
  );
  check(
    "the diagram's first relationship arrives with the canonical blank separator",
    mirrorAfter.length === before.length + 2 &&
      mirrorAfter[mirrorDeclAt + 1] === "" &&
      mirrorAfter[mirrorDeclAt + 2] === "  api -> mirror",
    `lines under the last node: ${JSON.stringify(
      mirrorAfter.slice(mirrorDeclAt + 1, mirrorDeclAt + 3),
    )}`,
  );

  /* --- the menu's list shares the verdict table ------------------------------ */

  const ctxDiagram = doc.synced.file.diagrams.find((d) => d.id === "ctx");
  const targets = connectTargets(ctxDiagram, "cust");
  check(
    "connectTargets offers every OTHER element, flagging the related pair",
    targets.length === 2 &&
      targets.every((t) => t.node.id !== "cust") &&
      targets.find((t) => t.node.id === "web")?.related === true &&
      targets.find((t) => t.node.id === "ops")?.related === false,
    `targets: ${JSON.stringify(
      targets.map((t) => `${t.node.id}:${t.related}`),
    )}`,
  );
  check(
    "the reverse direction wears the same flag — the pair is unordered",
    connectTargets(ctxDiagram, "web").find((t) => t.node.id === "cust")
      ?.related === true,
    "B→A of an existing A→B reads as fresh — the parallel-curve surprise the " +
      "verdict model exists to warn about",
  );

  /* --- create-then-connect: two lines, ONE text, ONE undo entry --------------- */

  const minted = connectedNewNodeEdit(
    doc,
    authored,
    "ctx",
    "web",
    "softwareSystem",
  );
  check(
    "create-then-connect patches, names its node, and stays ONE edit",
    minted !== null &&
      minted.path === "patch" &&
      minted.createdNodeId === "new-system",
    `got: ${minted === null ? "refused" : `${minted.path}, ${minted.createdNodeId}`}`,
  );
  const mintedAfter = (minted?.text ?? "").split("\n");
  const webDeclAt = before.findIndex((line) => line.startsWith(`  web:system`));
  check(
    "it adds exactly two lines — the declaration under the nodes, the relationship under the edges",
    mintedAfter.length === before.length + 2 &&
      mintedAfter[webDeclAt + 1].startsWith(`  new-system:system`) &&
      mintedAfter[edgeLineAt + 1] === `  web -> new-system`,
    `node slot: ${JSON.stringify(mintedAfter[webDeclAt + 1])}, edge slot: ${JSON.stringify(mintedAfter[edgeLineAt + 1])}`,
  );
  /* ONE TEXT IS ONE UNDO ENTRY, measured as the grouping measures it: the
     pre-edit text holds NEITHER half, so putting it back reverses both at
     once and no intermediate state exists for an undo to land on. Two edits
     here would strand the reader with a stray unnamed node connected to
     nothing after one Cmd/Ctrl+Z. */
  const preEdit = c4Document(authored).synced.file.diagrams.find(
    (d) => d.id === "ctx",
  );
  check(
    "one undo entry reverses both halves — the pre-edit text holds neither",
    minted !== null &&
      preEdit.nodes.every((n) => n.id !== "new-system") &&
      preEdit.edges.every((e) => e.target !== "new-system"),
    "half the gesture predates the edit — an undo would only partly reverse it",
  );
  /* The minted node lands in the clear band BELOW everything drawn —
     `vacantPosition`'s contract, re-measured on this call path because it is
     a separate entry point from the Add strip's. */
  const mintedDiagram = minted?.doc.synced.file.diagrams.find(
    (d) => d.id === "ctx",
  );
  const mintedNode = mintedDiagram?.nodes.find((n) => n.id === "new-system");
  check(
    "the connected newcomer overlaps nothing",
    mintedNode !== undefined &&
      mintedDiagram.nodes.every(
        (other) =>
          other.id === mintedNode.id ||
          other.position.x + other.size.width <= mintedNode.position.x ||
          mintedNode.position.x + mintedNode.size.width <= other.position.x ||
          other.position.y + other.size.height <= mintedNode.position.y ||
          mintedNode.position.y + mintedNode.size.height <= other.position.y,
      ),
    `newcomer at ${JSON.stringify(mintedNode?.position)}`,
  );
  check(
    "a type the level refuses is refused here too — the palette's own gate",
    refuses(() =>
      connectedNewNodeEdit(doc, authored, "ctx", "web", "container"),
    ),
    "a container was written into a context diagram",
  );
  /* THE TIED ANCHOR: on a diagram with no relationship lines, the node line
     and the blank-plus-edge insert anchor after the same last declaration,
     and the node patch's list position is what keeps the declaration ABOVE
     the relationship — `applyPatches` sorts stably. This is the assertion
     that fails if someone reorders the patch list. */
  const backendMint = connectedNewNodeEdit(
    doc,
    authored,
    "backend",
    "api",
    "container",
  );
  const backendAfter = (backendMint?.text ?? "").split("\n");
  check(
    "on a diagram with no edges, the declaration lands above the blank and the relationship",
    backendMint !== null &&
      backendAfter[mirrorDeclAt + 1].startsWith(`  new-container:container`) &&
      backendAfter[mirrorDeclAt + 2] === "" &&
      backendAfter[mirrorDeclAt + 3] === `  api -> new-container`,
    `lines under the last node: ${JSON.stringify(
      backendAfter.slice(mirrorDeclAt + 1, mirrorDeclAt + 4),
    )}`,
  );

  /* --- the Mermaid caveat is MEASURED against the real emitter ---------------- */

  /* The connect cell's `unlessPane.because` claims two losses; both are read
     off `serializeMermaidC4`'s real output here, not off its comments, so the
     refusal cannot outlive the emitter growing the slot. */
  const { serializeMermaidC4 } = await load("src/features/mermaid/lib/emit.ts");
  const mermaid = serializeMermaidC4(doubled.doc.synced.file);
  check(
    "the Mermaid emitter writes no edge id — a duplicate pair fuses on the round trip",
    mermaid.includes("Rel(cust, web") && !mermaid.includes("e-cust-web-2"),
    "the emitter now carries an edge id — the connect cell's caveat is stale " +
      "and the Mermaid refusal may be droppable",
  );
  check(
    "the Mermaid emitter writes ONE diagram — an edge on another level is not in the pane",
    !mermaid.includes("api") && !mermaid.includes("backend"),
    "the emitter now writes more than the root diagram — re-measure the caveat",
  );

  /* --- the host: one applyCanvasEdit per gesture, refusals announced ---------- */

  const playground = readPlaygroundEditSurface();
  const connectBody =
    /const handleNodeConnect = useCallback\(([\s\S]*?)\n  \);/.exec(playground);
  check(
    "handleNodeConnect applies through exactly one applyCanvasEdit and announces the refusal",
    connectBody !== null &&
      (connectBody[1].match(/applyCanvasEdit\(/g) ?? []).length === 1 &&
      connectBody[1].includes("connectedNodesEdit(") &&
      !connectBody[1].includes("setText(") &&
      connectBody[1].includes("if (next === null)") &&
      /Cmd or Ctrl \+ Z/.test(connectBody[1]),
    "a second apply would split one gesture into two undo entries, or a " +
      "refused connect went silent",
  );
  const mintBody =
    /const handleConnectCreate = useCallback\(([\s\S]*?)\n  \);/.exec(
      playground,
    );
  check(
    "handleConnectCreate applies ONCE — the one-undo contract crosses the host too",
    mintBody !== null &&
      (mintBody[1].match(/applyCanvasEdit\(/g) ?? []).length === 1 &&
      mintBody[1].includes("connectedNewNodeEdit(") &&
      !mintBody[1].includes("setText("),
    "the node and its relationship became two undo entries on the way through",
  );

  /* --- the gesture never re-engages React Flow's connection machinery --------- */

  /* The 4fa7c36 discipline, applied to the SECOND drag that could have woken
     the store: the viewer's flow declares no connection handler and keeps
     `nodesConnectable` false, and the grip is hand-rolled — pointer capture
     on its own button, per-frame state feeding its own portal overlay and
     nothing the projections read. Matched as JSX PROPS (`name=`) via
     `code(...)`, the marquee guard's rule: comments rightly NAME these props
     while warning against them. */
  const canvasCode = code("src/features/viewer/components/viewer-canvas.tsx");
  check(
    "the flow keeps every connection prop off",
    /nodesConnectable=\{false\}/.test(canvasCode) &&
      !canvasCode.includes("onConnect=") &&
      !canvasCode.includes("onConnectStart=") &&
      !canvasCode.includes("onConnectEnd=") &&
      !canvasCode.includes("connectionMode="),
    "React Flow's connection machinery is reachable — its per-move connection " +
      "state re-engages the store the marquee guard keeps disengaged",
  );
  const gripCode = code(
    "src/features/viewer/components/viewer-connect-grip.tsx",
  );
  check(
    "the grip is hand-rolled — it never imports React Flow",
    !gripCode.includes("@xyflow/react"),
    "the grip reached for the library's connection machinery — re-read the " +
      "marquee guard (4fa7c36) before wiring any of it",
  );
  check(
    "the grip's press cannot start a node drag — nodrag, stopped, captured",
    /af-connect-grip nodrag/.test(gripCode) &&
      /event\.stopPropagation\(\);\s*\n\s*event\.preventDefault\(\);\s*\n\s*event\.currentTarget\.setPointerCapture\(/.test(
        gripCode,
      ),
    "a press on the grip would drag the node under it — the relate grip's " +
      "own bug, reintroduced on the viewer",
  );
  check(
    "the grip's menu shares the dismissal hook, so Escape closes it without clearing the selection",
    /useMenuDismissal\(/.test(gripCode),
    "a third dismissal implementation — the copy that drifts is the one that " +
      "forgets to consume Escape",
  );
  /* The projections must not read anything the grip's drag writes — the ghost
     is the grip's OWN state. The nodes memo's pinned dep list (the marquee
     guard) already proves the canvas side; this proves the grip keeps its
     per-frame state local instead of lifting it. */
  check(
    "the ghost line is the grip's own state, portalled, never canvas state",
    /const \[ghost, setGhost\] = useState<GhostLine \| null>\(null\);/.test(
      gripCode,
    ) && /createPortal\(/.test(gripCode),
    "the drag's per-frame state left the grip — the projection memos are one " +
      "dependency away from a per-frame identity change",
  );
}

/* -------------------------------------------------------------------------- */
/* 22. Revising and deleting a relationship: the edge card is the node card's  */
/*     twin                                                                    */
/* -------------------------------------------------------------------------- */

/* WHY THIS SECTION EXISTS. The relationship card shipped read-only for a
   release after the connect grip could CREATE edges — the text could spell a
   label, an arrow and a deletion the canvas could not. These gestures ride
   `"revise"` (they gate on the two facts every revise gates on and never
   consult the relationship set, which is `connect`'s own question), so this
   section holds them to section 14's standard: block patch, no-op refusal,
   authored bytes outside the span untouched — plus the two facts only an edge
   has: direction and dashedness are ONE arrow token with six spellings, and
   solid has TWO spellings (`->` and `style=solid`) that a careless toggle
   would collapse (`4a1254e`, the numbering toggle's shipped bug). */
console.log("\nRevising and deleting a relationship are line patches");
{
  const authored = [
    `archlab 1.0`,
    `title "Edge probe"`,
    ``,
    `// The file's own note.`,
    `@context ctx "System context"`,
    ``,
    `  // The people.`,
    `  cust:person "Customer" (400,240 160x96)`,
    `    desc "The paying kind."`,
    `  ops:person "Operator" (640,240 160x96)`,
    `  web:system "Web App" (400,480 160x96) >backend`,
    ``,
    `  // Reads and writes.`,
    `  cust -> web :"uses" [HTTPS]`,
    `  ops -> web :"operates" style=solid`,
    ``,
    `@container backend owner=web`,
    `  api:container "API" [Go] (400,240 160x96)`,
    `  db:database "Orders DB" (640,240 160x96)`,
    ``,
    `  api -> db :"reads" ~e-cust-web`,
    ``,
  ].join("\n");

  const doc = c4Document(authored);
  check(
    "the fixture is genuinely not canonical — otherwise this section is vacuous",
    authored !== sourceTextFor(doc),
    "the authored text already equals what the serializer emits",
  );
  const before = authored.split("\n");
  const edgeLineAt = before.indexOf(`  cust -> web :"uses" [HTTPS]`);

  /* --- a revise is a block patch of the edge's own line ---------------------- */

  const reworded = revisedEdgeEdit(doc, authored, "ctx", "e-cust-web", {
    label: "places orders",
    technology: undefined,
    direction: "forward",
    style: undefined,
  });
  check(
    "an edge revise on authored text takes the PATCH path, by name",
    reworded !== null && reworded.path === "patch",
    `path: ${reworded === null ? "refused" : reworded.path}`,
  );
  const rewordedAfter = (reworded?.text ?? "").split("\n");
  check(
    /* Clearing `technology` must REMOVE the `[…]` token, not write `[""]` —
       the form's "blank means absent" contract measured on the module side,
       the way section 14 measures it for a node's desc. */
    "the revise rewrites the relationship line, clearing a field removes its token",
    rewordedAfter[edgeLineAt] === `  cust -> web : "places orders"`,
    `line: ${JSON.stringify(rewordedAfter[edgeLineAt])}`,
  );
  check(
    "every line the revise is not about is byte-identical",
    JSON.stringify([
      ...rewordedAfter.slice(0, edgeLineAt),
      ...rewordedAfter.slice(edgeLineAt + 1),
    ]) ===
      JSON.stringify([
        ...before.slice(0, edgeLineAt),
        ...before.slice(edgeLineAt + 1),
      ]),
    firstDiff(reworded?.text ?? "", authored),
  );
  check(
    /* Section 13's derivation, section 13's reason: a patch that writes
       almost-canonical text trades a silent loss for a worse one. */
    "the patched relationship line is byte-identical to a full serialise's",
    reworded !== null &&
      sourceTextFor(reworded.doc)
        .split("\n")
        .includes(rewordedAfter[edgeLineAt]),
    "the spliced relationship line diverged from canonical form",
  );

  /* --- a no-op revise costs no undo entry ------------------------------------ */

  check(
    /* The host pushes the pre-edit text onto the undo ring on every applied
       edit, so `null` here IS the assertion that an untouched Apply costs no
       undo entry — the same contract every gesture in the module states. */
    "a revise that changes nothing refuses (null) — no text change, no undo entry",
    revisedEdgeEdit(doc, authored, "ctx", "e-cust-web", {
      label: "uses",
      technology: "HTTPS",
      direction: "forward",
      style: undefined,
    }) === null,
    "an untouched form rewrote the pane and cost the reader an undo entry",
  );
  check(
    "an unknown edge refuses rather than throwing",
    revisedEdgeEdit(doc, authored, "ctx", "e-ghost", {
      label: undefined,
      technology: undefined,
      direction: "forward",
      style: undefined,
    }) === null,
    "expected null",
  );
  check(
    "an edge of ANOTHER diagram refuses — spans are per (diagram, edge)",
    revisedEdgeEdit(doc, authored, "ctx", "e-api-db", {
      label: undefined,
      technology: undefined,
      direction: "forward",
      style: undefined,
    }) === null,
    "a backend edge was revised through the context diagram",
  );

  /* --- the six arrow forms round-trip ----------------------------------------- */

  /* Direction × dashedness is ONE token with six spellings (`ARROWS` in
     archtext/lib/keywords.ts). Each is driven through the revise and read
     back off the RE-PARSE, so the assertion is the round trip — a revise
     whose arrow did not survive the parser would show once and snap back. */
  const ARROW_FORMS = [
    { direction: "forward", style: undefined, arrow: "->" },
    { direction: "forward", style: "dashed", arrow: "..>" },
    { direction: "bidirectional", style: undefined, arrow: "<->" },
    { direction: "bidirectional", style: "dashed", arrow: "<..>" },
    { direction: "none", style: undefined, arrow: "--" },
    { direction: "none", style: "dashed", arrow: ".." },
  ];
  for (const form of ARROW_FORMS) {
    const revised = revisedEdgeEdit(doc, authored, "ctx", "e-cust-web", {
      // A fresh label per form so the forward-solid case is not the no-op.
      label: `probe ${form.arrow}`,
      technology: undefined,
      direction: form.direction,
      ...(form.style === undefined ? {} : { style: form.style }),
    });
    const line = (revised?.text ?? "").split("\n")[edgeLineAt] ?? "";
    const parsedBack = revised?.doc.synced.file.diagrams
      .find((d) => d.id === "ctx")
      ?.edges.find((e) => e.id === "e-cust-web");
    check(
      `direction "${form.direction}"${form.style === "dashed" ? " dashed" : ""} round-trips through ${form.arrow}`,
      revised !== null &&
        line.startsWith(`  cust ${form.arrow} web`) &&
        parsedBack?.direction === form.direction &&
        parsedBack?.style === form.style,
      `line: ${JSON.stringify(line)}, parsed back: ${JSON.stringify({
        direction: parsedBack?.direction,
        style: parsedBack?.style,
      })}`,
    );
  }

  /* --- solid's TWO spellings both survive ------------------------------------- */

  /* `ops -> web … style=solid` is the author writing the default out. A
     wording-only revise submits the CURRENT spelling (the card's contract at
     `C4EdgeRevision`), so the hand-written attribute must still be on the
     line — the transition that loses information, asserted directly, which
     is the lesson `4a1254e` bought. */
  const opsLineAt = before.indexOf(`  ops -> web :"operates" style=solid`);
  const wordingOnly = revisedEdgeEdit(doc, authored, "ctx", "e-ops-web", {
    label: "runs",
    technology: undefined,
    direction: "forward",
    style: "solid",
  });
  check(
    "a wording-only revise keeps a hand-written style=solid on the line",
    wordingOnly !== null &&
      wordingOnly.text.split("\n")[opsLineAt] ===
        `  ops -> web : "runs" style=solid`,
    `line: ${JSON.stringify(wordingOnly?.text.split("\n")[opsLineAt])}`,
  );

  /* --- the Mermaid refusal, measured against the real emitter ----------------- */

  /* The revise cell's caveat now claims a relationship's undirected form and
     dashed style would be lost through a Mermaid pane. Measured the way the
     node fields are: an undirected dashed edge goes through the app's own
     converter and comes back a plain forward arrow — while a BIDIRECTIONAL
     edge survives (BiRel), so the refusal claims exactly the losses that are
     real and no more. */
  const { convertedSourceText } = await load(
    "src/features/playground/input/parse.ts",
  );
  const arrowProbe = c4Document(
    [
      `archlab 1.0`,
      `title "Arrow probe"`,
      ``,
      `@context ctx "Context"`,
      `  a:system "A"`,
      `  b:system "B"`,
      `  c:system "C"`,
      ``,
      `  a .. b :"peers"`,
      `  a <-> c :"syncs"`,
      ``,
    ].join("\n"),
  );
  const probeBack = parseViewSource(convertedSourceText(arrowProbe, "mermaid"));
  const probeEdges =
    probeBack.status === "ok" && probeBack.value.kind === "c4"
      ? probeBack.value.synced.file.diagrams[0].edges
      : [];
  const peers = probeEdges.find((e) => e.source === "a" && e.target === "b");
  const syncs = probeEdges.find((e) => e.source === "a" && e.target === "c");
  check(
    "an undirected dashed edge is measured to come back forward and solid",
    peers !== undefined &&
      peers.direction === "forward" &&
      peers.style === undefined,
    `after the round trip: ${JSON.stringify({
      direction: peers?.direction,
      style: peers?.style,
    })}`,
  );
  check(
    "a bidirectional edge is measured to SURVIVE — the refusal must not over-claim",
    syncs !== undefined && syncs.direction === "bidirectional",
    `after the round trip: ${JSON.stringify(syncs?.direction)} — if BiRel is ` +
      "gone the caveat under-claims instead",
  );
  const mermaidVerdict = canvasEditability(
    { ...doc, format: "mermaid" },
    "revise",
  );
  check(
    "the Mermaid revise refusal names the relationship losses beside the node's",
    mermaidVerdict.editable === false &&
      /undirected form or dashed style/.test(mermaidVerdict.reason ?? ""),
    `reason: ${JSON.stringify(mermaidVerdict)}`,
  );
  const { MERMAID_C4_EXPORT_CAVEAT } = await load(
    "src/features/playground/input/parse.ts",
  );
  check(
    "the C4 export caveat documents the arrow loss the refusal cites",
    /undirected or dashed line/.test(MERMAID_C4_EXPORT_CAVEAT),
    "the caveat no longer supports the refusal that cites it",
  );
  check(
    "a Mermaid pane refuses the edge revise and the edge delete outright",
    revisedEdgeEdit(
      { ...doc, format: "mermaid" },
      authored,
      "ctx",
      "e-cust-web",
      {
        label: "x",
        technology: undefined,
        direction: "forward",
        style: undefined,
      },
    ) === null &&
      deletedEdgeEdit(
        { ...doc, format: "mermaid" },
        authored,
        "ctx",
        "e-cust-web",
      ) === null,
    "an edge edit was written against a pane that cannot spell it",
  );
  const jsonRevised = revisedEdgeEdit(
    { ...doc, format: "json" },
    JSON.stringify({ not: "the alab text" }),
    "ctx",
    "e-cust-web",
    {
      label: "x",
      technology: undefined,
      direction: "forward",
      style: undefined,
    },
  );
  check(
    "a JSON pane re-emits rather than splicing .alab line numbers into JSON",
    jsonRevised !== null && jsonRevised.path === "reemit",
    `path: ${jsonRevised === null ? "refused" : jsonRevised.path}`,
  );

  /* --- a delete removes ITS line and nothing else ----------------------------- */

  const deleted = deletedEdgeEdit(doc, authored, "ctx", "e-cust-web");
  check(
    "an edge delete on authored text takes the PATCH path, by name",
    deleted !== null && deleted.path === "patch",
    `path: ${deleted === null ? "refused" : deleted.path}`,
  );
  const deletedAfter = (deleted?.text ?? "").split("\n");
  check(
    /* THE ENDPOINTS ARE LEFT ALONE — the removal's stated verdict. Nothing
       about either element derives from the edge, so exactly one line goes
       and every other byte survives; contrast the NODE delete, whose edges
       must cascade or the document stops parsing. */
    "deleting a relationship removes exactly its own line — endpoints untouched",
    deletedAfter.length === before.length - 1 &&
      JSON.stringify(deletedAfter) ===
        JSON.stringify([
          ...before.slice(0, edgeLineAt),
          ...before.slice(edgeLineAt + 1),
        ]),
    firstDiff(
      deleted?.text ?? "",
      [...before.slice(0, edgeLineAt), ...before.slice(edgeLineAt + 1)].join(
        "\n",
      ),
    ),
  );
  const deletedDiagram = deleted?.doc.synced.file.diagrams.find(
    (d) => d.id === "ctx",
  );
  check(
    "the re-parse drops the relationship and keeps both elements",
    deletedDiagram !== undefined &&
      deletedDiagram.edges.every((e) => e.id !== "e-cust-web") &&
      deletedDiagram.nodes.some((n) => n.id === "cust") &&
      deletedDiagram.nodes.some((n) => n.id === "web"),
    `edges: ${JSON.stringify(deletedDiagram?.edges.map((e) => e.id))}, ` +
      `nodes: ${JSON.stringify(deletedDiagram?.nodes.map((n) => n.id))}`,
  );
  check(
    "deleting an unknown edge refuses rather than throwing",
    deletedEdgeEdit(doc, authored, "ctx", "e-ghost") === null,
    "expected null",
  );
  /* WHAT IT CARRIES RATHER THAN EATS: the child edge's `~realizes` names the
     deleted relationship, the model does not validate the pointer, and
     rewriting another diagram's line to chase it would give one deleted line
     a refactor's blast radius. The edit must APPLY and the pointer must
     still be there — dangling, visibly, the reader's to fix in the pane. */
  const childEdge = deleted?.doc.synced.file.diagrams
    .find((d) => d.id === "backend")
    ?.edges.find((e) => e.id === "e-api-db");
  check(
    "a child edge's ~realizes naming the deleted edge is carried, not eaten",
    deleted !== null && childEdge?.realizes === "e-cust-web",
    `realizes after the delete: ${JSON.stringify(childEdge?.realizes)}`,
  );

  /* --- the key dispatches on WHICH selection is active ------------------------ */

  /* Structural, so `code(...)`: the comments in the listener rightly quote
     the very calls asserted here. One listener, one focus guard, one
     form-field exemption — the edge branch must sit in the SAME listener
     (the two-keydown count at the top of this file pins that there is no
     third), after the exemption, and behind the node branch so a node
     selection still wins the key it always had. */
  const canvasCode = code("src/features/viewer/components/viewer-canvas.tsx");
  const exemptAt = canvasCode.indexOf('focused.tagName === "TEXTAREA"');
  const nodeDeleteAt = canvasCode.indexOf("edit.onNodeDelete(");
  const edgeDeleteAt = canvasCode.indexOf("edit.onEdgeDelete(");
  check(
    "Delete dispatches node-first then edge, inside the exempted edit-keys listener",
    exemptAt !== -1 &&
      nodeDeleteAt !== -1 &&
      edgeDeleteAt !== -1 &&
      exemptAt < nodeDeleteAt &&
      nodeDeleteAt < edgeDeleteAt,
    "the edge delete key sits outside the guarded listener, or ahead of the " +
      "node branch — Backspace in the card's label field would eat the edge",
  );

  /* --- the card: the node card's twin, presence-gated the same way ------------ */

  const cardCode = code(
    "src/features/viewer/components/viewer-edge-detail.tsx",
  );
  const card = read("src/features/viewer/components/viewer-edge-detail.tsx");
  check(
    "the pencil and the bin are presence-gated — no disabled controls, ever",
    /onRevise !== undefined && !editing \?/.test(cardCode) &&
      /onDelete !== undefined && !editing \?/.test(cardCode),
    "a locked or read-only canvas would render a dead pencil or bin",
  );
  check(
    "the form is keyed by the edge, so selecting another connector cannot re-aim it",
    /<EdgeEditForm\s+key=\{edge\.id\}/.test(card),
    "an open form would silently point at a relationship the reader was not editing",
  );
  check(
    "the form submits blank optional fields as absent",
    /label: orAbsent\(label\)/.test(cardCode) &&
      /technology: orAbsent\(technology\)/.test(cardCode),
    'a cleared field would submit "" and write a token the reader cannot see',
  );
  check(
    /* The card half of the `style=solid` contract measured on the module
       above: solid submits the edge's OWN spelling, so only a genuine flip
       changes it. */
    "the style submit preserves the authored solid spelling",
    /edge\.style === "solid"/.test(cardCode) && /"dashed"/.test(cardCode),
    "the card collapses solid's two spellings — the numbering toggle's bug, " +
      "one format over",
  );

  /* --- the host: one applyCanvasEdit per gesture, refusals said ---------------- */

  const playground = readPlaygroundEditSurface();
  const reviseBody =
    /const handleEdgeRevise = useCallback\(([\s\S]*?)\n  \);/.exec(playground);
  check(
    "handleEdgeRevise applies ONCE and lets a null refuse quietly — no undo entry",
    reviseBody !== null &&
      (reviseBody[1].match(/applyCanvasEdit\(/g) ?? []).length === 1 &&
      reviseBody[1].includes("revisedEdgeEdit(") &&
      !reviseBody[1].includes("setText(") &&
      reviseBody[1].includes("if (next === null) return;") &&
      /Cmd or Ctrl \+ Z/.test(reviseBody[1]),
    "a second apply, a refusal that rewrites the pane, or no stated way back",
  );
  const deleteBody =
    /const handleEdgeDelete = useCallback\(([\s\S]*?)\n  \);/.exec(playground);
  check(
    "handleEdgeDelete applies ONCE, announces its refusal, and names the undo key",
    deleteBody !== null &&
      (deleteBody[1].match(/applyCanvasEdit\(/g) ?? []).length === 1 &&
      deleteBody[1].includes("deletedEdgeEdit(") &&
      !deleteBody[1].includes("setText(") &&
      deleteBody[1].includes("setAnnouncement(") &&
      /Cmd or Ctrl \+ Z/.test(deleteBody[1]),
    "a pressed bin that goes silent on refusal, or a delete with no stated " +
      "way back",
  );
}

/* -------------------------------------------------------------------------- */
/* 23. Every menu in the dock acts at once                                     */
/* -------------------------------------------------------------------------- */

/* REPORTED AS "I cannot change the style of the line". The reader could — the
   gesture writes `~>` and `..>` correctly — but the arrow-kind menu only called
   `setKind`, so nothing happened until an Apply nobody knew was owed, while the
   From and To menus one row above committed on change. Two semantics in one
   panel with no signal which was which.

   DERIVED FROM THE FORMS, not from a list of the two menus that were wrong: the
   failure a hand-listed pair cannot notice is the THIRD menu somebody adds. So
   this finds every `<select>` in the viewer and requires each one's `onChange`
   to reach a commit — `onSubmit`, `onRepointTo`, or another handler prop — and
   not merely a `setX`. A text input is deliberately exempt: typing is
   mid-thought until its author says otherwise, which is what Apply is for. */
{
  const viewer = read("src/features/sequence/components/sequence-viewer.tsx");

  /* Each select's onChange body, taken from the tag to its closing brace. A
     count guard first, because a regex that matched nothing would make every
     assertion below vacuously true — the way three checks on this branch passed
     while the feature under them was broken. */
  /* Sliced from each `<select` to the next one (or the end), rather than
     matched with a closing anchor: the first spelling ended on
     `}\n<spaces>className`, which prettier's reflow moved, so it found two of
     the four and the loop below passed on a sample that excluded both menus
     that were broken. A count guard alone would not have caught that — 2 is
     also >= 2 — which is why the guard now knows how many selects exist. */
  /* THE onChange EXPRESSION ONLY, brace-matched. Two earlier spellings were
     both wrong in the same direction — too greedy — and the second passed while
     the reported bug was reintroduced:

       - anchoring the end on `}\n<spaces>className` found two of the four,
         because prettier's reflow moved that shape;
       - slicing from one `<select` to the NEXT swallowed everything between,
         including the Apply button's own `onSubmit`, so a menu that only called
         `setKind` still matched a commit that belonged to its neighbour.

     Counting braces from the `{` after `onChange=` cannot do either. */
  const onChangeBodies = (source) => {
    const bodies = [];
    for (const tag of [...source.matchAll(/<select\b/g)]) {
      const at = source.indexOf("onChange={", tag.index ?? 0);
      if (at === -1) {
        bodies.push("");
        continue;
      }
      let depth = 0;
      let index = at + "onChange=".length;
      const from = index;
      for (; index < source.length; index += 1) {
        if (source[index] === "{") depth += 1;
        else if (source[index] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      bodies.push(source.slice(from, index + 1));
    }
    return bodies;
  };
  const selects = onChangeBodies(viewer);
  for (const [index, body] of selects.entries()) {
    check(
      `select ${index + 1} commits on change rather than waiting for Apply`,
      /onSubmit\(|onRepointTo\(|onToggle|onPick/.test(body),
      "a menu that only sets state reads as a control that does nothing",
    );
  }
  /* AND THE COMMIT CARRIES THE WHOLE FORM, which is what makes acting at once
     safe. A select that submitted only its own field would discard whatever the
     reader had typed and not yet applied — trading a control that appears
     broken for one that silently destroys an edit in progress. */
  check(
    "an immediate commit carries the rest of the form with it",
    (viewer.match(/revisionWith\(/g) ?? []).length >= 4,
    "a partial revision would drop label and detail typed but not applied",
  );
}

/* THE SAME DERIVATION FOR THE FLOWCHART CANVAS, and it is owed for the same
   reason the sequence one is: this canvas ships six gestures now, and the
   expensive failure in this area is not a broken gesture but a correct one no
   control invokes. Two of the six were added in a pass that also fixed a drag
   bug, which is exactly the situation where a control gets forgotten.

   DERIVED FROM `FlowchartEditHandlers`, never hand-listed — a list cannot
   notice the gesture it has never heard of (`codebase.md`, habit 4). Adding a
   handler to that interface adds two assertions here and they fail until
   something calls it. */
console.log("\nEvery flowchart gesture is reachable from the canvas it edits");
{
  const viewer = read("src/features/flowchart/components/flowchart-viewer.tsx");
  const playground = read("src/features/playground/lib/use-canvas-editing.ts");

  const contract =
    /export interface FlowchartEditHandlers \{([\s\S]*?)\n\}/.exec(viewer);
  check(
    "the flowchart viewer declares a handler contract to derive from",
    contract !== null,
    "FlowchartEditHandlers not found — every assertion below would be vacuous",
  );
  const handlers = [
    ...new Set(
      [...(contract?.[1] ?? "").matchAll(/^\s{2}(on[A-Z]\w*)\s*[?:]/gm)].map(
        (m) => m[1],
      ),
    ),
  ];
  check(
    "the contract names at least the six gestures this canvas ships",
    handlers.length >= 6,
    `found ${handlers.length}: ${handlers.join(", ")}`,
  );

  for (const handler of handlers) {
    check(
      `the flowchart viewer reaches ${handler} from a control`,
      new RegExp(`edit\\??\\.${handler}\\b`).test(viewer),
      "the handler is declared but nothing in the viewer reaches it",
    );
    check(
      `the playground wires ${handler} into the flowchart bundle`,
      new RegExp(`${handler}:\\s*handle`).test(playground),
      "the viewer would render a control the host never answers",
    );
  }

  /* THE MULTI-SELECT GESTURE IS THE C4 CANVAS'S, NOT A SECOND INVENTION.
     This canvas first shipped grouping as a shift-click, which is not how the
     canvas next door works — so a reader who had learned one had not learned
     the other, which is `codebase.md` habit 2 ("when adding the Nth of
     something, open the (N-1)th and match it"). All four halves of the C4
     contract are pinned, because any one of them going missing brings back a
     canvas that only LOOKS like its neighbour. */
  check(
    "the flowchart canvas offers the same Select/Pan toggle as the C4 canvas",
    /<CanvasModeToggle/.test(viewer),
    "multi-select is reachable some other way than the neighbouring canvas's, " +
      "so learning one canvas does not teach the other",
  );
  check(
    "and both canvases take that toggle from one definition",
    /@\/components\/ui\/canvas-mode-toggle/.test(viewer) &&
      /@\/components\/ui\/canvas-mode-toggle/.test(
        read("src/features/viewer/components/viewer-canvas.tsx"),
      ),
    "one of the two canvases has its own copy of the mode toggle, which is " +
      "the drift `dry.md` moved this component to components/ui to prevent",
  );
  check(
    "the lasso is offered only where it can do something",
    /const marqueeMode =[\s\S]{0,40}?edit !== undefined/.test(viewer),
    "a locked, read-only or Mermaid-pane canvas would lasso into a grouping " +
      "gesture it cannot perform — a bare drag must still pan there",
  );
  check(
    "the marquee selects on FULL containment, as the C4 marquee does",
    /node\.x \+ node\.width <= box\.x \+ box\.width/.test(viewer),
    "a box that merely clips a step would conscript it into the group, which " +
      "is not what the neighbouring canvas's marquee does",
  );

  /* CHROME FLOATING OVER THE PANE OWNS ITS OWN PRESSES. The grouping card and
     the padlock are CHILDREN of the pane that starts the lasso, so without a
     guard a press on either began a marquee, took pointer capture, and
     swallowed the click — reported as "cannot click Clear", and the padlock had
     it too. Two assertions, because the guard and the markers can each go
     missing on their own: a guard with nothing marked is inert, and a marker
     with no guard is decoration. */
  check(
    "the lasso stands down for chrome floating over the pane",
    /closest\?\.\("\[data-af-flow-chrome\]"\)/.test(viewer),
    "a press on the grouping card or the padlock starts a marquee and the " +
      "button never sees its click",
  );
  {
    const overlays = (viewer.match(/className="absolute [^"]*z-2\d/g) ?? [])
      .length;
    /* THE ATTRIBUTE, NOT THE SELECTOR. A bare count also matched the guard's
       own `"[data-af-flow-chrome]"`, which inflated the total by one and made
       this assertion unfailable — removing a marker still cleared the
       threshold. The negative lookahead drops the bracketed selector. */
    const marked = (viewer.match(/data-af-flow-chrome(?!\])/g) ?? []).length;
    check(
      "and every overlay inside the pane is marked as chrome",
      marked >= overlays && marked >= 2,
      `${overlays} positioned overlays, ${marked} marked — an unmarked one is ` +
        "a control whose clicks the lasso eats",
    );
  }

  /* THE DRAG MOVES THE REAL SYMBOL, at reduced opacity. It first shipped as a
     dashed ghost outline, on the reasoning that the laid-out arrows cannot
     follow mid-drag; the product owner asked for the symbol itself, because a
     reader dragging a box wants to see the box rather than translate between
     two shapes. The arrows touching it are dimmed for the length of the drag,
     which is the half of the compromise that keeps the drawing honest. */
  check(
    "a dragged step is drawn at the pointer, not as a separate outline",
    /* THE `node` PROP ITSELF must be the thing overridden. Testing merely that
       the comparison appears anywhere passed on the sibling `dragging=` prop,
       so the outline could have come back with this still green. */
    /node=\{\s*nodeDrag\?\.id === node\.id/.test(
      read("src/features/flowchart/components/flowchart-diagram.tsx"),
    ),
    "the dragged symbol is back to a ghost outline beside the real one",
  );
  check(
    "and the arrows that still describe its old place are dimmed",
    /edge\.from === nodeDrag\.id \|\| edge\.to === nodeDrag\.id/.test(
      read("src/features/flowchart/components/flowchart-diagram.tsx"),
    ),
    "a stale arrow is drawn at full strength while the step it points at has " +
      "moved, which is the drawing asserting something untrue",
  );

  /* AND THE GROUPING GESTURE'S KEYBOARD PATH. Shift-click is the pointer
     gesture; a keyboard has no shift-click, and without a control in the dock
     the whole grouping feature was reachable by pointer only. Pinned as an
     `aria-pressed` toggle rather than by its label, so rewording it is free. */
  check(
    "grouping has a keyboard path, not only a modifier-click",
    /aria-pressed=\{inSelection\}/.test(viewer),
    "the selection can only be built with a pointer, so a keyboard reader " +
      "cannot reach the grouping gesture at all",
  );
  /* A MODIFIER-CLICK MUST NOT START A DRAG. This shipped: shift-clicking to
     group started a pin drag, and any hand tremor past the threshold turned the
     selection into a move — so building a selection was impossible in practice.
     The guard is structural, in the drag's own entry point. */
  check(
    "a modifier-click is excluded from the pin drag",
    /shiftKey \|\| event\.metaKey \|\| event\.ctrlKey\) return;/.test(viewer),
    "a shift-click can still become a drag, which is the bug that made " +
      "multi-select unusable",
  );
  /* AND THE DRAG THRESHOLD IS A PHYSICAL DISTANCE. In layout user units it
     shrank with the zoom — at the default "fit" scale two pixels of jitter
     cleared it — which is what made the above bug reachable on every click. */
  check(
    "the drag threshold is measured on client pixels, not user units",
    /event\.clientX - nodeDrag\.from\.clientX/.test(viewer),
    "the threshold is back in user units, so it is a hair-trigger whenever " +
      "the chart is scaled below 1:1 — which is the default",
  );
}

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"} — ${assertions - failures}/${assertions} assertions\n`,
);
process.exit(failures === 0 ? 0 : 1);
