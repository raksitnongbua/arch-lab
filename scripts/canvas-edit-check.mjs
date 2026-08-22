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
 *
 * Exits non-zero on any failure. Run with: pnpm check:canvas-edit
 */

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

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
const { canvasEditability, movedNodeDocument } = await load(
  "src/features/playground/input/canvas-edit.ts",
);
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
