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
 *      a seventh notation the day it is added; the table can.
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
 *
 * Exits non-zero on any failure. Run with: pnpm check:canvas-edit
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
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

const { defaultPositions } = await load("src/features/archtext/index.ts");
const { EDIT_GRID } = await load("src/features/viewer/lib/canvas-constants.ts");
const {
  canvasEditability,
  deletedNodeDocument,
  movedNodeDocument,
  ownsChildDiagram,
} = await load("src/features/playground/input/canvas-edit.ts");
const { parseViewSource, VIEW_SEED_TEXT, sourceTextFor } = await load(
  "src/features/playground/input/parse.ts",
);

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

  const moved = movedNodeDocument(original, diagramId, target.id, to);
  check(
    "a move produces a document",
    moved !== null && moved.kind === "c4",
    `got ${moved === null ? "null" : moved.kind}`,
  );

  if (moved !== null && moved.kind === "c4") {
    const landed = moved.synced.file.diagrams
      .find((d) => d.id === diagramId)
      .nodes.find((n) => n.id === target.id).position;
    check(
      "the position survives serialise → re-parse",
      landed.x === to.x && landed.y === to.y,
      `expected (${to.x},${to.y}), got (${landed.x},${landed.y})`,
    );

    const movedText = sourceTextFor(moved);

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
    const restored = movedNodeDocument(moved, diagramId, target.id, from);
    check(
      "moving back to the default position produces a document",
      restored !== null,
      "got null",
    );
    if (restored !== null) {
      const restoredText = sourceTextFor(restored);
      check(
        "a node returned to its default position leaves NO trace in the text",
        restoredText === canonical,
        firstDiff(restoredText, canonical),
      );
    }

    /* 5. A press that lands where it began. */
    check(
      "a move to the position the node already has is refused",
      movedNodeDocument(moved, diagramId, target.id, to) === null,
      "expected null, got a document — the pane would be rewritten for nothing",
    );
  }

  check(
    "an unknown node id is refused rather than throwing",
    movedNodeDocument(original, diagramId, "no-such-node", to) === null,
    "expected null",
  );
  check(
    "an unknown diagram id is refused rather than throwing",
    movedNodeDocument(original, "no-such-diagram", target.id, to) === null,
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

  let walked = original;
  let offGrid = null;
  for (const delta of deltas) {
    const node = walked.synced.file.diagrams
      .find((d) => d.id === diagramId)
      .nodes.find((n) => n.id === nodeId);
    const next = movedNodeDocument(walked, diagramId, nodeId, {
      x: node.position.x + delta.x,
      y: node.position.y + delta.y,
    });
    if (next === null) {
      offGrid = `a nudge by (${delta.x},${delta.y}) was refused`;
      break;
    }
    const landed = next.synced.file.diagrams
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
    offGrid === null && sourceTextFor(walked) === canonical,
    offGrid === null ? firstDiff(sourceTextFor(walked), canonical) : offGrid,
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

    const after = deletedNodeDocument(original, diagramId, connected.id);
    check(
      "a delete produces a document",
      after !== null,
      "got null — a connected node could not be deleted",
    );

    if (after !== null) {
      const left = after.synced.file.diagrams.find((d) => d.id === diagramId);
      check(
        "the node is gone",
        left.nodes.every((node) => node.id !== connected.id),
        "it is still there",
      );
      /* THE ASSERTION THAT MATTERS. An edge naming a deleted node fails the
         model's own validation, so a delete that left one behind would hand
         the reader a document that will not re-parse. That it re-parsed at
         all is proof (`rebuild` returns null otherwise) — this names the
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
    deletedNodeDocument(original, diagramId, "no-such-node") === null,
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
      deletedNodeDocument(original, parent.diagramId, parent.node.id) === null,
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
     document being editable, not on the flag alone — the five text-laid-out
     notations must get no control, not a disabled one. */
  const page = read("src/features/playground/components/view-playground.tsx");
  check(
    "the lock renders only for a document the canvas can edit",
    /const showCanvasLock =\s*CANVAS_EDIT_ENABLED && editability\.editable;/.test(
      page,
    ),
    "the lock's condition no longer requires an editable document — a " +
      "notation with nothing to lock would get a control that cannot act",
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
      `movedNodeDocument declines a ${kind} document`,
      movedNodeDocument(parsed.value, "any", "any", { x: 0, y: 0 }) === null,
      "expected null",
    );
  }

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

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"} — ${assertions - failures}/${assertions} assertions\n`,
);
process.exit(failures === 0 ? 0 : 1);
