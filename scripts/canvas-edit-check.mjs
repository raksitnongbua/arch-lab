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
 *      silently reports itself draggable.
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
 *
 * Exits non-zero on any failure. Run with: pnpm check:canvas-edit
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

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
  canvasEditability,
  deletedNodeEdit,
  movedNodeEdit,
  ownsChildDiagram,
  revisedNodeEdit,
} = await load("src/features/playground/input/canvas-edit.ts");
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
  /* The ring lives in a `.tsx` component, which type stripping cannot load,
     so these are source assertions — the same tactic `check:shortcuts` and
     `check:viewer-motion` use for facts that only exist in a component. Each
     names the failure it prevents; a source scan that merely restated the
     implementation would pass forever. */
  const page = read("src/features/playground/components/view-playground.tsx");
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
  check(
    "the nudge keys and the undo chord share one listener",
    (canvas.match(/window\.addEventListener\("keydown"/g) ?? []).length === 2,
    "expected exactly two keydown listeners in the canvas (the Escape ladder " +
      "and the edit keys); a third means a second guard to keep in step",
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
     rather than by the default: the locked face offers "Edit" with a pencil,
     asserted below and in section 8, and if that regresses this default is
     wrong again. `canvas-lock.ts` carries the full argument. */
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
     These three assertions are the price of the flip above, and each names a
     way the old control failed to say it. */
  const control = read(
    "src/features/playground/components/canvas-lock-button.tsx",
  );
  check(
    "the locked face offers the edit action rather than reporting the state",
    /<Pencil\b/.test(control) && /locked \? "Edit"/.test(control),
    'the locked face is a padlock labelled "Locked" again — it names what the ' +
      "reader can already see and leaves them to guess that pressing is allowed",
  );
  /* NEVER ICON-ONLY. `hidden sm:inline` was on the only text this control had,
     so on a phone the whole affordance was one padlock glyph — on the notation
     whose canvas had just learned five new gestures. Matched as a `className`
     attribute, not as bare text: the module's header quotes the class it
     replaced, and a grep for the words alone fails on the explanation. */
  check(
    "the label survives a narrow viewport",
    !/className="[^"]*\bhidden\b/.test(control),
    "the lock's label is hidden below the sm breakpoint — a bare icon is the " +
      "control nobody thinks to look for",
  );
  /* MEASURED, not asserted by eye: WCAG 2.5.3 wants the visible words to OPEN
     the accessible name, so a voice-control user saying "click Edit" reaches
     the control they can see. Comparing the two strings catches the drift that
     a pair of separate regexes would not — either one being rewritten alone. */
  const namedLocked = /const name = locked\s*\?\s*`([^`]*)`/.exec(control)?.[1];
  const namedUnlocked = /const name = locked[\s\S]*?:\s*"([^"]*)"/.exec(
    control,
  )?.[1];
  const faceLabels = /\{locked \? "([^"]+)" : "([^"]+)"\}/.exec(control);
  check(
    "each face's visible label opens its accessible name",
    namedLocked !== undefined &&
      namedUnlocked !== undefined &&
      faceLabels !== null &&
      namedLocked.startsWith(faceLabels[1]) &&
      namedUnlocked.startsWith(faceLabels[2]),
    `visible ${JSON.stringify(faceLabels?.slice(1))} against names ` +
      `${JSON.stringify([namedLocked, namedUnlocked])} — a control whose ` +
      "spoken name does not start with its printed one cannot be reached by " +
      "the word on it",
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
    "the grid names both abilities and nothing else",
    abilities.length === 2 &&
      abilities.includes("move") &&
      abilities.includes("revise"),
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
      /<FrameLayer diagram=\{draggedDiagram\}/.test(canvas),
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
  const playground = read(
    "src/features/playground/components/view-playground.tsx",
  );

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
     cannot be reached from; more would mean two locks racing one cookie. */
  const renders = playground.match(/<CanvasLockButton\b/g) ?? [];
  check(
    "the lock is rendered once for each canvas branch that can be locked",
    renders.length === lockable.length,
    `${renders.length} <CanvasLockButton> renders for ${lockable.length} lockable kinds (${lockable.join(", ")})`,
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

  /* ONE STATE WORD PER LOCK. The control's faces are ACTIONS ("Edit",
     "Lock"), which is what makes a locked-by-default canvas findable — and it
     is also why the state has to be said somewhere. `canvasStateLabel` is
     that word, and a strip that renders the lock without it leaves a reader
     pressing to find out which state they were in. Counted against the
     renders rather than against the literal 2, for the same reason as above. */
  const stateWords = playground.match(/canvasStateLabel\(/g) ?? [];
  check(
    "every rendered lock has the canvas state named beside it",
    stateWords.length === renders.length,
    `${stateWords.length} canvasStateLabel() uses for ${renders.length} lock renders`,
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
  const claim =
    /C4 nodes can be dragged.{0,240}?the other kinds lay themselves out/.exec(
      flowed,
    );
  check(
    "the heading still carries the canvas-editing claim",
    claim !== null,
    "the sentence that tells a reader the canvas is editable is gone",
  );
  for (const verb of [
    "sequence messages",
    "lifelines",
    "added",
    "edited",
    "repointed",
    "removed",
    /* Added with the numbering toggle. This list is hand-kept and section 16 is
       the derived answer to that, but the two ask different questions: this one
       is about the sentence a reader meets BEFORE they open the canvas. */
    "numbered",
    /* Added with the reorder drag, and this one had to be here rather than only
       in section 16: a reader who has used a drawing tool arrives ASKING
       whether they can move things, and the sentence they meet first is the
       page's own. */
    "reordered",
    /* Added with the C4 revise. Two strings, because each half can go stale
       alone: "wording edited" is the gesture, "details panel" is where — a
       claim naming the first without the second sends the reader
       double-clicking a box that only drills down. */
    "wording edited",
    "details panel",
  ]) {
    check(
      `the heading's claim names "${verb}"`,
      claim !== null && claim[0].includes(verb),
      "a gesture the canvas offers that the page never mentions",
    );
  }
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
  const playground = read(
    "src/features/playground/components/view-playground.tsx",
  );

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
    "the strip renders each entry's icon, its label and its full name",
    /GUIDE_GLYPH\[gesture\.icon\]/.test(viewer) &&
      /\{gesture\.label\}/.test(viewer) &&
      /sr-only[^>]*>—? ?\{gesture\.mouse\}/.test(viewer),
    /* AN ICON WITH NO NAME is the regression an icon strip ships. The visible
       label is short by design, so the sr-only sentence is what makes the item
       findable by a screen-reader user at all. */
    "an entry is rendered without one of its three parts",
  );
  check(
    "the icons are aria-hidden, so the name comes from the text and not from a filename",
    /<Glyph aria-hidden="true"/.test(viewer),
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

     So both halves are asserted separately now: the gestures stay behind the
     gate, and the container stays outside it. */
  /* ANCHORED ON WHAT THE STRIP IS, not on a property asserted below. An earlier
     spelling anchored on `h-7`, so removing the height made the block "not
     found" and failed every assertion here identically — a break has to name
     the thing it broke. The caveat is the strip's last child and is required by
     its own assertion elsewhere, which makes it a stable landmark. */
  const stripAt = /<div className="hidden[^"]*"/.exec(viewer);
  const strip =
    stripAt === null
      ? ""
      : (/^[\s\S]{0,2600}?SEQUENCE_MOUSE_GUIDE_CAVEAT[\s\S]{0,240}?\n      <\/div>/.exec(
          viewer.slice(stripAt.index),
        )?.[0] ?? "");
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
  check(
    "the gesture legend is still gated on the edit handlers",
    /edit === undefined \? \([\s\S]{0,400}?SEQUENCE_READ_ONLY_HINT[\s\S]{0,400}?SEQUENCE_MOUSE_GESTURES/.test(
      strip,
    ),
    "a read-only canvas would list gestures it does not offer",
  );
  /* HEIGHT STATED, NOT INFERRED FROM CONTENT, and no wrapping — the two
     properties that keep the pane a constant size. `flex-wrap` is what let the
     caveat take a second row at some widths and not others, so resizing the
     window rescaled the drawing; the sideways scroll is what replaces it. */
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
  const playground = read(
    "src/features/playground/components/view-playground.tsx",
  );

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

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"} — ${assertions - failures}/${assertions} assertions\n`,
);
process.exit(failures === 0 ? 0 : 1);
