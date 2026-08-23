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
 *   6. THE REFUSALS ARE COMPLETE, derived from the seed table rather than a
 *      hand-listed set of kinds: every non-C4 document the playground can hold
 *      reports itself uneditable with a reason. A hardcoded list cannot notice
 *      a seventh notation the day it is added; the table can. The table is
 *      looped TWICE, once per `CanvasEditAbility`, because there are two things
 *      a canvas can write back and the notations answer them in opposite
 *      directions — C4 allows `move` and refuses `revise`, a sequence document
 *      does the reverse. The one-argument default must keep meaning `move`, or
 *      a sequence document silently reports itself draggable.
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
const { canvasEditability, deletedNodeEdit, movedNodeEdit, ownsChildDiagram } =
  await load("src/features/playground/input/canvas-edit.ts");
const { revisedMessageEdit } = await load(
  "src/features/playground/input/sequence-edit.ts",
);
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
/* 10. The lock: editable by default, decided by the server                 */
/* ----------------------------------------------------------------------- */

console.log("\nThe canvas lock defaults to editable and is read server-side");

{
  const { isLockedCookie, CANVAS_LOCK_COOKIE } = await load(
    "src/features/playground/lib/canvas-lock.ts",
  );

  /* EDITABLE IS THE DEFAULT, and this is the assertion that keeps it so. A
     reader with no cookie must get the editable canvas; flipping the stored
     sense (storing "editable" instead of "locked") would silently make every
     first-time reader read-only and hide the feature entirely. */
  check(
    "no cookie means editable",
    isLockedCookie(undefined) === false,
    "an absent cookie locked the canvas — the feature would be invisible",
  );
  check(
    "an unrecognised cookie value means editable, not locked",
    isLockedCookie("") === false && isLockedCookie("true") === false,
    "a stale or foreign value locked the canvas",
  );
  check(
    "the stored lock reads back as locked",
    isLockedCookie("locked") === true,
    "the lock does not survive a reload",
  );

  /* READ ON THE SERVER, for the reason the source fold already established:
     a preference applied after hydration shows one frame of the wrong state,
     and for a lock that frame is one in which a drag can land. */
  const route = read("src/app/view/page.tsx");
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
  const lock = read("src/features/playground/lib/canvas-lock.ts");
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
     back (`CanvasEditAbility`) and the notations answer them differently: C4
     allows `move` and refuses `revise`, a sequence document does the opposite.
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
    check(
      `a ${kind} document refuses "revise", with a reason a reader can act on`,
      verdict.editable === false &&
        typeof verdict.reason === "string" &&
        verdict.reason.length > 20,
      `verdict: ${JSON.stringify(verdict)}`,
    );
    /* And the refusal is REAL, not advisory: the gesture itself declines, or a
       caller that forgot to ask would splice into a grammar whose line numbers
       mean something else. */
    check(
      `revisedMessageEdit declines a ${kind} document`,
      revisedMessageEdit(parsed.value, "", [0], {
        label: "x",
        kind: "sync",
      }) === null,
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

  /* THE HEADING'S CLAIM MATCHES WHAT SHIPS. It said "C4 diagrams can also be
     edited on the canvas; the other kinds lay themselves out from the text"
     for as long as the sequence canvas was editable, and it was still on the
     page when a reader asked where the editing was. */
  check(
    "the heading does not still claim C4 is the only editable canvas",
    !/C4 diagrams can also be edited on the canvas/.test(playground),
    "the page contradicts the feature it is describing",
  );
  check(
    "the heading names the sequence canvas",
    /sequence messages\s*\n?\s*edited on it|sequence messages edited/.test(
      playground,
    ),
    "a shipped editable canvas the page never mentions",
  );
}

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"} — ${assertions - failures}/${assertions} assertions\n`,
);
process.exit(failures === 0 ? 0 : 1);
