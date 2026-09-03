#!/usr/bin/env node
/**
 * The layout direction has to be able to do something, and the control has to
 * say so when it cannot.
 *
 * WHAT WAS WRONG. A C4 node's `(x,y wxh)` token beats the layout PER NODE —
 * the parser resolves `node.geometry ?? layout.get(id)` one node at a time —
 * and every drag mints one. So the diagram somebody had arranged by hand was
 * exactly the diagram where the direction menu wrote a `direction` line and
 * moved nothing: a correct module, a correct write, and a control that read as
 * broken. The one place that fact was written down was the `column-layout`
 * advisory, which reaches `/validate` and the MCP `validate_model` and never
 * the menu the reader had just pressed.
 *
 * It loads the REAL modules through Node's type stripping — the archtext
 * serializer, the viewer's pane parser, the playground's `input/canvas-edit.ts`
 * and `lib/prose.ts` — so this proves what the page does rather than a copy of
 * it, and pins the purity of the gesture module the way `check:canvas-edit`
 * already does for its siblings.
 *
 * What it asserts:
 *
 *   1. A DIRECTION MOVES A TOKEN-FREE DOCUMENT, and both layouts land on the
 *      format's 8px grid. Without this every assertion below could pass on a
 *      layout that never moves anything.
 *   2. A TOKEN WINS PER NODE, NOT GLOBALLY. One tokened node keeps its exact
 *      coordinates under `lr` while every other node takes the `lr` layout's
 *      slot. This is the rule the whole feature's copy rests on — "3 of 7
 *      elements are placed by hand" is only true if precedence is per node —
 *      so it is pinned here rather than left implicit in the parser.
 *   3. `hasAuthoredGeometry` AGREES WITH THE SERIALIZER, for every node of
 *      every bundled example and every fixture: true exactly when a full
 *      serialize writes a `(` on that node's line. The menu's counts, the
 *      panel's row and the gesture's filter all read that one function, so
 *      the failure this forbids is the "two halves of one thing" one — a menu
 *      offering to release a node whose line carries nothing, or silent about
 *      one that does. Read from the FILESYSTEM rather than a hand-listed set
 *      of example names, so an example added tomorrow is covered.
 *   4. RESETTING ONE ELEMENT IS A ONE-LINE PATCH. `path === "patch"`, exactly
 *      one line changes, that line is byte-identical to what a full serialize
 *      would write for the node, it carries no geometry token, and the
 *      author's comments, blank lines and `desc` continuations are untouched.
 *      Driven from deliberately NON-canonical text, because a re-emit of
 *      canonical text is canonical text and would pass anything else.
 *   5. RESETTING A LAYER IS ONE EDIT. Exactly as many lines change as there
 *      are placed elements, one `CanvasEdit` comes back, and the handler that
 *      invokes it makes exactly ONE `applyCanvasEdit` call — so seven released
 *      elements cost one Cmd+Z rather than seven.
 *   6. THE RESET MAKES THE DIRECTION TAKE EFFECT. This is the assertion the
 *      script exists for: after reset-all, every node sits where
 *      `defaultPositions(…, "lr")` puts it, and applying `tb` afterwards moves
 *      every one of them to the `tb` layout. Measured on the reparsed text, so
 *      it proves the round trip a reader actually gets rather than a model in
 *      memory.
 *   7. THE RESET TEXT ROUND-TRIPS. It parses, and serializing the parse is
 *      idempotent — a reset that produced almost-canonical text would trade a
 *      silent loss for a noisier one on the next save.
 *   8. A NO-OP REFUSES, so it costs no undo entry: an element the layout
 *      already places, a layer with nothing placed, an id the document does
 *      not hold, and a Mermaid pane (refused through `canvasEditability`,
 *      which every gesture asks for itself).
 *   9. A `pin`ned ELEMENT SURVIVES THE SWEEP and is counted apart. The
 *      attribute parsed and round-tripped for two releases while no consumer
 *      read it and its doc comment named a feature that has never existed
 *      here; this is the assertion that stops it becoming decoration again.
 *      Asked for BY NAME it still releases — the exemption is from the sweep,
 *      not from the author.
 *  10. THE CONTROL IS REACHABLE AND HONEST. The note and the row exist in the
 *      menu that gates them, the "nothing moved" branch exists in the
 *      announcement, and the reset announcement names the undo key. A past
 *      release shipped a correct module behind a control nobody could reach
 *      (`67b35ae`) with every assertion green, because they all asked whether
 *      the MODULE agreed and none asked whether the CONTROL did.
 *
 * Exits non-zero on any failure. Run with: pnpm check:layout-reset
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The same source with its comments removed, for assertions that pin CODE.
 *
 * `check:canvas-edit`'s helper, and it is here for the reason its own comment
 * gives: a regex over a source file matches the prose explaining the code as
 * readily as the code, and the prose most likely to quote a fragment is the
 * comment about that exact fragment. Structural assertions read `code(...)`,
 * prose assertions read `read(...)`.
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

const {
  canonicalNodeLine,
  defaultPositions,
  defaultSizeFor,
  hasAuthoredGeometry,
  parseArchText,
  serializeArchText,
} = await load("src/features/archtext/index.ts");
const {
  canvasEditability,
  layerPlacement,
  movedNodeEdit,
  resetLayerPositionsEdit,
  resetNodePositionEdit,
  revisedDirectionEdit,
} = await load("src/features/playground/input/canvas-edit.ts");
const { parseViewSource } = await load(
  "src/features/playground/input/parse.ts",
);
const { resetLayerLabel } = await load("src/lib/prose.ts");

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

/** The lines that differ between two texts, with both sides, for a failure. */
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

/** The diagram a fixture's assertions are about, by id. */
const layerOf = (doc, id) =>
  doc.synced.file.diagrams.find((diagram) => diagram.id === id);

const nodesById = (doc, id) =>
  new Map(layerOf(doc, id).nodes.map((node) => [node.id, node]));

/** The layout the parser would have used for this diagram, at `direction`. */
function layoutAt(doc, diagramId, direction) {
  const diagram = layerOf(doc, diagramId);
  return defaultPositions(
    diagram.nodes.map((node) => node.id),
    diagram.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    })),
    direction,
  );
}

const at = (map, id) => map.get(id) ?? { x: NaN, y: NaN };

/* ----------------------------------------------------------------------- */
/* The fixtures                                                             */
/*                                                                          */
/* DELIBERATELY NON-CANONICAL: comments, a diagram `desc`, node `desc`       */
/* continuations and author blank lines. A re-emit of canonical text IS      */
/* canonical text, so a fixture without these cannot catch the failure       */
/* 0a9cbf1 bought — a gesture that deleted every `//` comment in the file    */
/* and passed every assertion for a release.                                 */
/* ----------------------------------------------------------------------- */

const DIAGRAM_ID = "ctx-root";

/** `header` is the file's `direction` line, or "" to inherit top-down. */
const LAYER = (header) => `archlab 1.0
title "Reset"
${header === "" ? "" : `${header}\n`}
// a comment the author wrote and must keep
@context ctx-root "Reset"
  desc "The layer a direction is supposed to be able to turn."

  cust:person "Customer"
  web:system "Web app"
    desc "A description that must survive the gesture."

  // another comment, mid-block
  api:system "API" [Go 1.22]
  db:external "Orders"
  queue:external "Events"
  ops:person "Operator"
  audit:system "Audit"

  cust -> web : "Uses"
  web -> api : "Calls"
  api -> db : "Reads"
  api -> queue : "Publishes"
  ops -> api : "Administers"
  queue -> audit : "Feeds"
`;

const FREE_TB = LAYER("");
const FREE_LR = LAYER("direction lr");

/**
 * The same layer with every element dragged, built BY DRAGGING rather than by
 * hand-typing coordinates.
 *
 * Two things this buys. The tokens are whatever `movedNodeEdit` actually
 * writes, so the fixture cannot encode a stale idea of the format; and the
 * comments and `desc` lines arrive in the state a real session would leave
 * them, which is what sections 4 and 5 measure against.
 */
function everyElementDragged(text) {
  let doc = c4Document(text);
  let current = text;
  for (const node of layerOf(doc, DIAGRAM_ID).nodes) {
    const next = movedNodeEdit(doc, current, DIAGRAM_ID, node.id, {
      x: node.position.x + 80,
      y: node.position.y + 160,
    });
    if (next === null) throw new Error(`the drag of ${node.id} was refused`);
    doc = next.doc;
    current = next.text;
  }
  return { doc, text: current };
}

/* ----------------------------------------------------------------------- */
/* 1. A direction moves a token-free document                               */
/* ----------------------------------------------------------------------- */

console.log("\nA direction moves a document that writes no coordinates");

{
  const tb = c4Document(FREE_TB);
  const lr = c4Document(FREE_LR);
  const tbNodes = nodesById(tb, DIAGRAM_ID);
  const lrNodes = nodesById(lr, DIAGRAM_ID);

  /* WITHOUT THIS, EVERYTHING BELOW IS VACUOUS. If the two layouts agreed, a
     reset could be a no-op and section 6 would still pass. */
  const moved = [...tbNodes.keys()].filter(
    (id) =>
      tbNodes.get(id).position.x !== lrNodes.get(id).position.x ||
      tbNodes.get(id).position.y !== lrNodes.get(id).position.y,
  );
  check(
    "lr and tb put at least one element in a different place",
    moved.length > 0,
    "the two layouts agree — nothing below would be measuring anything",
  );

  /* THE GRID IS THE FORMAT'S. A released element lands on a coordinate the
     layout chose, so if the layout left the grid every released element would
     sit a few pixels out of step with the ones still tokened. */
  const offGrid = [...tbNodes.values(), ...lrNodes.values()].filter(
    (node) => node.position.x % 8 !== 0 || node.position.y % 8 !== 0,
  );
  check(
    "every laid-out position is on the format's 8px grid, both directions",
    offGrid.length === 0,
    offGrid.map((n) => `${n.id} at ${n.position.x},${n.position.y}`).join(", "),
  );

  check(
    "a token-free document writes no geometry token at all",
    !serializeArchText(tb.synced.file)
      .split("\n")
      .some((line) => /^ {2}\w[\w-]*:\w+ .*\(/.test(line)),
    "the fixture already carries coordinates — sections 2 and 8 would drift",
  );
}

/* ----------------------------------------------------------------------- */
/* 2. A token wins PER NODE, not globally                                   */
/*                                                                          */
/* This is the rule every sentence the feature says out loud depends on.    */
/* "3 of 7 elements are placed by hand and won't move" is a claim about     */
/* per-node precedence; if precedence were global the copy would be a lie   */
/* and nothing else here would notice.                                      */
/* ----------------------------------------------------------------------- */

console.log("\nA hand-written coordinate wins for its own element only");

{
  const placed = { x: 800, y: 800 };
  const size = defaultSizeFor("external");
  const oneToken = FREE_LR.replace(
    '  db:external "Orders"',
    `  db:external "Orders" (${placed.x},${placed.y} ${size.width}x${size.height})`,
  );
  const doc = c4Document(oneToken);
  const nodes = nodesById(doc, DIAGRAM_ID);
  const lrLayout = layoutAt(doc, DIAGRAM_ID, "lr");

  check(
    "the tokened element keeps its exact coordinates under lr",
    nodes.get("db").position.x === placed.x &&
      nodes.get("db").position.y === placed.y,
    `db at ${nodes.get("db").position.x},${nodes.get("db").position.y}`,
  );
  const others = [...nodes.values()].filter((node) => node.id !== "db");
  const wrong = others.filter(
    (node) =>
      node.position.x !== at(lrLayout, node.id).x ||
      node.position.y !== at(lrLayout, node.id).y,
  );
  check(
    "every OTHER element still takes the lr layout's slot",
    wrong.length === 0,
    wrong
      .map(
        (n) =>
          `${n.id} at ${n.position.x},${n.position.y}, layout says ${at(lrLayout, n.id).x},${at(lrLayout, n.id).y}`,
      )
      .join("; "),
  );
  const placement = layerPlacement(doc, DIAGRAM_ID);
  check(
    "layerPlacement counts exactly that one element as placed",
    placement.placed === 1 &&
      placement.pinned === 0 &&
      placement.total === nodes.size,
    JSON.stringify(placement),
  );
}

/* ----------------------------------------------------------------------- */
/* 3. `hasAuthoredGeometry` agrees with the serializer, everywhere           */
/* ----------------------------------------------------------------------- */

console.log("\nhasAuthoredGeometry says exactly what the serializer writes");

{
  /** True ⇔ a full serialize writes a geometry token on this node's line. */
  const tokenedIds = (file) => {
    const out = new Set();
    for (const line of serializeArchText(file).split("\n")) {
      const match = /^ {2}([\w-]+):\w+ .*\((-?[\d.]+),/.exec(line);
      if (match !== null) out.add(match[1]);
    }
    return out;
  };

  const cases = [];
  /* FROM THE FILESYSTEM, never a hand-listed set of names: a hardcoded list
     cannot notice the example it has never heard of, which is how three
     checks in this repo passed while the feature under them was broken. */
  const dataDir = "src/features/viewer/service/data";
  for (const name of readdirSync(path.join(ROOT, dataDir)).sort()) {
    if (!name.endsWith(".archlab.json")) continue;
    /* The committed `.archlab.json` IS an `ArchLabFile` — the same four
       top-level keys the app's own reader knows — so it goes to the
       serializer unconverted rather than through a round of model shapes
       that could normalise away the very geometry this measures. */
    cases.push({ label: name, file: JSON.parse(read(`${dataDir}/${name}`)) });
  }
  check(
    "there are bundled examples to measure against",
    cases.length > 0,
    `no .archlab.json under ${dataDir} — this section would be vacuous`,
  );
  for (const [label, text] of [
    ["fixture: token-free tb", FREE_TB],
    ["fixture: token-free lr", FREE_LR],
    ["fixture: every element dragged", everyElementDragged(FREE_LR).text],
  ]) {
    cases.push({ label, file: c4Document(text).synced.file });
  }

  for (const { label, file } of cases) {
    const written = tokenedIds(file);
    const disagreed = [];
    for (const diagram of file.diagrams) {
      for (const node of diagram.nodes) {
        const predicted = hasAuthoredGeometry(file, diagram, node);
        if (predicted !== written.has(node.id)) {
          disagreed.push(
            `${diagram.id}/${node.id}: predicate ${predicted}, text ${written.has(node.id)}`,
          );
        }
      }
    }
    check(
      `${label}: the predicate and the emitted line agree on every element`,
      disagreed.length === 0,
      disagreed.join("; "),
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 4. Resetting ONE element is a one-line patch                             */
/* ----------------------------------------------------------------------- */

console.log("\nResetting one element patches one line and nothing else");

{
  const dragged = everyElementDragged(FREE_LR);
  const edit = resetNodePositionEdit(
    dragged.doc,
    dragged.text,
    DIAGRAM_ID,
    "api",
  );
  check(
    "the gesture applies and reports the patch path",
    edit !== null && edit.path === "patch",
    `path: ${edit === null ? "refused" : edit.path}`,
  );
  const changed = changedLines(dragged.text, edit.text);
  check(
    "exactly one line changes",
    changed.length === 1,
    changed.map((c) => `${c.index + 1}: ${c.before} -> ${c.after}`).join("; "),
  );
  check(
    "the changed line is byte-identical to what a full serialize would write",
    changed[0]?.after ===
      canonicalNodeLine(edit.doc.synced.file, DIAGRAM_ID, "api"),
    `patched ${JSON.stringify(changed[0]?.after)}, serializer says ${JSON.stringify(canonicalNodeLine(edit.doc.synced.file, DIAGRAM_ID, "api"))}`,
  );
  check(
    "and it carries no geometry token",
    !changed[0]?.after.includes("("),
    changed[0]?.after,
  );
  /* The `[Go 1.22]` on that same line is what makes this worth asserting: the
     patch rewrites the WHOLE declaration line, so a technology, a tag or an
     icon the author wrote has to come back with it. */
  check(
    "the element's other attributes come back on the patched line",
    changed[0]?.after.includes("[Go 1.22]"),
    changed[0]?.after,
  );

  const survivors = [
    "// a comment the author wrote and must keep",
    "  // another comment, mid-block",
    '  desc "The layer a direction is supposed to be able to turn."',
    '    desc "A description that must survive the gesture."',
  ];
  const lost = survivors.filter(
    (line) => !edit.text.split("\n").includes(line),
  );
  check(
    "every comment and desc line in the file survives the gesture",
    lost.length === 0,
    lost.join("; "),
  );
  check(
    "the author's blank lines survive too",
    edit.text.split("\n").filter((line) => line === "").length ===
      dragged.text.split("\n").filter((line) => line === "").length,
    "a blank line was eaten or added",
  );
  check(
    "every OTHER element keeps the coordinates it was dragged to",
    layerOf(edit.doc, DIAGRAM_ID)
      .nodes.filter((node) => node.id !== "api")
      .every((node) =>
        hasAuthoredGeometry(
          edit.doc.synced.file,
          layerOf(edit.doc, DIAGRAM_ID),
          node,
        ),
      ),
    "releasing one element released others",
  );
}

/* ----------------------------------------------------------------------- */
/* 5. Resetting a LAYER is ONE edit, therefore one undo                     */
/* ----------------------------------------------------------------------- */

console.log("\nResetting a layer is one edit and one undo entry");

{
  const dragged = everyElementDragged(FREE_LR);
  const placement = layerPlacement(dragged.doc, DIAGRAM_ID);
  const edit = resetLayerPositionsEdit(dragged.doc, dragged.text, DIAGRAM_ID);
  check(
    "every dragged element counts as placed",
    placement.placed === placement.total && placement.total > 1,
    JSON.stringify(placement),
  );
  check(
    "the gesture applies and reports the patch path",
    edit !== null && edit.path === "patch",
    `path: ${edit === null ? "refused" : edit.path}`,
  );
  const changed = changedLines(dragged.text, edit.text);
  check(
    "exactly as many lines change as there are placed elements",
    changed.length === placement.placed,
    `${changed.length} line(s) changed, ${placement.placed} placed`,
  );
  check(
    "not one of them carries a geometry token afterwards",
    changed.every((line) => !line.after.includes("(")),
    changed
      .filter((line) => line.after.includes("("))
      .map((line) => line.after)
      .join("; "),
  );
  check(
    "the file's own comments and desc lines are all still there",
    edit.text.includes("// a comment the author wrote and must keep") &&
      edit.text.includes("// another comment, mid-block") &&
      edit.text.includes('desc "A description that must survive the gesture."'),
    "a whole-layer patch ate a line it was not about",
  );

  /* ONE `applyCanvasEdit` CALL IN THE HANDLER, which is what makes the whole
     sweep one Cmd+Z. Read from the source with comments stripped: the prose
     above the handler mentions the funnel by name, and a regex that counted
     the comment would report success for the state this forbids. */
  const hook = code("src/features/playground/lib/use-canvas-editing.ts");
  const body =
    /const resetLayerPositions = useCallback\(([\s\S]*?)\n {4}\[/.exec(hook);
  check(
    "the layer handler exists in the hook this reads",
    body !== null,
    "resetLayerPositions not found — the assertions below would be vacuous",
  );
  check(
    "it makes exactly one applyCanvasEdit call, so the sweep is one undo",
    (body?.[1].match(/applyCanvasEdit\(/g) ?? []).length === 1,
    `${(body?.[1].match(/applyCanvasEdit\(/g) ?? []).length} call(s) — a loop here would charge the reader one undo per element`,
  );
  check(
    "and it never writes the pane itself, so the edit lands on the undo ring",
    body !== null && !body[1].includes("setText("),
    "a canvas edit that cannot be undone",
  );
}

/* ----------------------------------------------------------------------- */
/* 6. The reset makes the direction take effect                             */
/*                                                                          */
/* THE ASSERTION THIS SCRIPT EXISTS FOR. Everything above proves the edit    */
/* is well behaved; this proves it fixes the thing the reader complained     */
/* about. Measured on the REPARSED TEXT, because that is what a reader gets  */
/* — a model held in memory could be right while the bytes were wrong.      */
/* ----------------------------------------------------------------------- */

console.log("\nAfter the reset, the direction finally moves the picture");

{
  const dragged = everyElementDragged(FREE_LR);
  const before = nodesById(dragged.doc, DIAGRAM_ID);
  const lrLayout = layoutAt(dragged.doc, DIAGRAM_ID, "lr");
  const tbLayout = layoutAt(dragged.doc, DIAGRAM_ID, "tb");

  check(
    "before the reset, not one element sits where lr would put it",
    [...before.values()].every(
      (node) =>
        node.position.x !== at(lrLayout, node.id).x ||
        node.position.y !== at(lrLayout, node.id).y,
    ),
    "the fixture is not actually arranged by hand",
  );

  const reset = resetLayerPositionsEdit(dragged.doc, dragged.text, DIAGRAM_ID);
  const afterReset = c4Document(reset.text);
  const released = nodesById(afterReset, DIAGRAM_ID);
  const stillPlaced = [...released.values()].filter(
    (node) =>
      node.position.x !== at(lrLayout, node.id).x ||
      node.position.y !== at(lrLayout, node.id).y,
  );
  check(
    "after the reset, every element sits exactly where lr puts it",
    stillPlaced.length === 0,
    stillPlaced
      .map(
        (n) =>
          `${n.id} at ${n.position.x},${n.position.y}, lr says ${at(lrLayout, n.id).x},${at(lrLayout, n.id).y}`,
      )
      .join("; "),
  );
  check(
    "and the layer reports nothing placed any more",
    layerPlacement(afterReset, DIAGRAM_ID).placed === 0,
    JSON.stringify(layerPlacement(afterReset, DIAGRAM_ID)),
  );

  /* AND NOW THE CONTROL WORKS. The direction gesture the reader pressed
     first is applied second here, on the released document, and the picture
     moves — which is the whole promise the menu's row makes. */
  const turned = revisedDirectionEdit(afterReset, reset.text, DIAGRAM_ID, "tb");
  check(
    "applying tb to the released layer is a patch, not a re-emit",
    turned !== null && turned.path === "patch",
    `path: ${turned === null ? "refused" : turned.path}`,
  );
  const afterTurn = nodesById(c4Document(turned.text), DIAGRAM_ID);
  const wrong = [...afterTurn.values()].filter(
    (node) =>
      node.position.x !== at(tbLayout, node.id).x ||
      node.position.y !== at(tbLayout, node.id).y,
  );
  check(
    "every element now sits where tb puts it — the direction moved the picture",
    wrong.length === 0,
    wrong
      .map(
        (n) =>
          `${n.id} at ${n.position.x},${n.position.y}, tb says ${at(tbLayout, n.id).x},${at(tbLayout, n.id).y}`,
      )
      .join("; "),
  );
  check(
    "and something actually moved between the two directions",
    [...afterTurn.values()].some(
      (node) =>
        node.position.x !== at(lrLayout, node.id).x ||
        node.position.y !== at(lrLayout, node.id).y,
    ),
    "tb and lr agreed on every element — this proves nothing",
  );
}

/* ----------------------------------------------------------------------- */
/* 7. The reset text round-trips                                            */
/* ----------------------------------------------------------------------- */

console.log("\nThe text a reset leaves behind is a document like any other");

{
  const dragged = everyElementDragged(FREE_LR);
  const reset = resetLayerPositionsEdit(dragged.doc, dragged.text, DIAGRAM_ID);
  const parsed = parseArchText(reset.text);
  const once = serializeArchText(parsed);
  const twice = serializeArchText(parseArchText(once));
  check(
    "the reset text parses",
    parsed.diagrams.length > 0,
    "the gesture produced a document the parser refuses",
  );
  check(
    "serializing the parse is idempotent",
    once === twice,
    "a second save would change bytes the first one wrote",
  );
  check(
    "and canonical form of it carries no geometry token",
    !once.split("\n").some((line) => /^ {2}[\w-]+:\w+ .*\(/.test(line)),
    "a released element still writes coordinates",
  );
}

/* ----------------------------------------------------------------------- */
/* 8. A no-op refuses, so it costs no undo entry                            */
/* ----------------------------------------------------------------------- */

console.log("\nNothing to do means nothing written and no undo entry");

{
  const free = c4Document(FREE_LR);
  check(
    "an element the layout already places is refused",
    resetNodePositionEdit(free, FREE_LR, DIAGRAM_ID, "api") === null,
    "a press that rewrites the pane with identical text",
  );
  check(
    "a layer with nothing placed is refused",
    resetLayerPositionsEdit(free, FREE_LR, DIAGRAM_ID) === null,
    "the menu row would be pressable and inert",
  );
  check(
    "an id the document does not hold is refused",
    resetNodePositionEdit(free, FREE_LR, DIAGRAM_ID, "not-a-node") === null,
    "a stale selection would produce an edit",
  );
  check(
    "an unknown diagram id is refused, both gestures",
    resetNodePositionEdit(free, FREE_LR, "no-such-layer", "api") === null &&
      resetLayerPositionsEdit(free, FREE_LR, "no-such-layer") === null,
    "a pane lagging the canvas would produce an edit",
  );

  /* THE PANE LANGUAGE IS ASKED THROUGH `canvasEditability`, which is the rule
     `canvas-editing.md` states for every gesture: a gesture that trusts its
     caller is unguarded the day somebody points it at another notation. */
  const dragged = everyElementDragged(FREE_LR);
  const asMermaid = { ...dragged.doc, format: "mermaid" };
  const verdict = canvasEditability(asMermaid, "move");
  check(
    "the move ability is refused in a Mermaid pane, with a reason",
    verdict.editable === false && (verdict.reason ?? "").length > 0,
    JSON.stringify(verdict),
  );
  check(
    "so both reset gestures refuse a Mermaid pane",
    resetNodePositionEdit(asMermaid, dragged.text, DIAGRAM_ID, "api") ===
      null &&
      resetLayerPositionsEdit(asMermaid, dragged.text, DIAGRAM_ID) === null,
    "a gesture writing .alab geometry into a pane the reader is viewing as Mermaid",
  );
}

/* ----------------------------------------------------------------------- */
/* 9. A `pin` survives the sweep, and is counted apart                      */
/*                                                                          */
/* `C4Node.pinned` parsed and round-tripped for two releases with NO        */
/* consumer at all, and its doc comment named a "Tidy layout" that has      */
/* never existed in this repo. Giving it the one meaning it can have —      */
/* exempt from the sweep — is only real while something asserts it.         */
/* ----------------------------------------------------------------------- */

console.log("\nA pinned element keeps its place when the layer is released");

{
  const dragged = everyElementDragged(FREE_LR);
  const opsLine = dragged.text
    .split("\n")
    .find((line) => line.startsWith("  ops:person"));
  const pinnedText = dragged.text.replace(
    opsLine,
    opsLine.replace('"Operator"', '"Operator" pin'),
  );
  const doc = c4Document(pinnedText);
  check(
    "the fixture's pin parsed",
    nodesById(doc, DIAGRAM_ID).get("ops").pinned === true,
    "the `pin` attribute did not survive the fixture edit",
  );

  const placement = layerPlacement(doc, DIAGRAM_ID);
  check(
    "the pinned element is counted apart from the releasable ones",
    placement.pinned === 1 &&
      placement.placed === placement.total - 1 &&
      placement.total > 1,
    JSON.stringify(placement),
  );

  const edit = resetLayerPositionsEdit(doc, pinnedText, DIAGRAM_ID);
  const changed = changedLines(pinnedText, edit.text);
  check(
    "the sweep patches one line fewer than the layer has elements",
    changed.length === placement.placed,
    `${changed.length} line(s) changed, ${placement.placed} releasable`,
  );
  check(
    "the pinned element's line is byte-identical, token and all",
    edit.text
      .split("\n")
      .includes(opsLine.replace('"Operator"', '"Operator" pin')),
    "the sweep released a pinned element",
  );
  const after = nodesById(c4Document(edit.text), DIAGRAM_ID);
  check(
    "and it is still the only placed element afterwards",
    layerPlacement(c4Document(edit.text), DIAGRAM_ID).placed === 0 &&
      layerPlacement(c4Document(edit.text), DIAGRAM_ID).pinned === 1 &&
      after.get("ops").position.x ===
        nodesById(doc, DIAGRAM_ID).get("ops").position.x,
    JSON.stringify(layerPlacement(c4Document(edit.text), DIAGRAM_ID)),
  );

  /* ASKED FOR BY NAME IT STILL RELEASES. The exemption is from the sweep, not
     from the author — a reader pointing at one element and pressing the
     panel's button has said which element they mean. */
  const byName = resetNodePositionEdit(doc, pinnedText, DIAGRAM_ID, "ops");
  check(
    "a pinned element asked for by name is released anyway",
    byName !== null &&
      changedLines(pinnedText, byName.text).length === 1 &&
      !changedLines(pinnedText, byName.text)[0].after.includes("("),
    byName === null
      ? "refused — the panel's button would be dead on a pinned element"
      : changedLines(pinnedText, byName.text)[0]?.after,
  );
  check(
    "and it keeps its pin, which is a field the reset has no business editing",
    byName !== null &&
      changedLines(pinnedText, byName.text)[0].after.includes(" pin"),
    changedLines(pinnedText, byName.text)[0]?.after,
  );
}

/* ----------------------------------------------------------------------- */
/* 10. The control is reachable, and says the true thing                    */
/*                                                                          */
/* `67b35ae` is the lesson: a correct module behind a control nobody could  */
/* reach, for a whole release, with every assertion green — because they    */
/* all asked whether the MODULE agreed and none asked whether the CONTROL   */
/* did. The reachability of the per-element button is covered by            */
/* `check:canvas-edit`, which derives its loop from `CanvasEditHandlers`;   */
/* this section covers the two surfaces that loop cannot see.              */
/* ----------------------------------------------------------------------- */

console.log("\nThe menu offers the release, and the announcement is honest");

{
  const menu = code(
    "src/features/playground/components/layout-direction-menu.tsx",
  );
  const page = code("src/features/playground/components/view-playground.tsx");

  check(
    "the menu takes the placement counts from the gesture module",
    /placement:\s*LayerPlacement \| null/.test(menu) &&
      /placementNote\(placement\)/.test(menu),
    "the note would be counting something of its own",
  );
  check(
    "the note renders above the direction rows of the layer section",
    menu.indexOf("{note}") !== -1 &&
      menu.indexOf("{note}") < menu.indexOf("DIRECTIONS.map"),
    "a caveat read after the press is a caveat that arrived too late",
  );
  check(
    "the note is worded from the counts, all three cases",
    /All \$\{held\} elements are placed by hand/.test(menu) &&
      /\$\{held\} of \$\{placement\.total\} elements are placed by hand/.test(
        menu,
      ) &&
      /is pinned and keeps its place/.test(menu),
    "one of the three sentences the reader can land on is missing",
  );
  /* THE ROW ITSELF, not "somewhere in this file": a distance-bounded regex
     from the clearing row above would reach the release row's label and pass
     with the release row's own `role` deleted. */
  const row = /placement\.placed > 0 \? \(([\s\S]*?)\) : null/.exec(menu);
  check(
    "the menu has a release row this section can read",
    row !== null,
    "the row was not found — the assertions about it would be vacuous",
  );
  check(
    "the row is a menuitem, labelled from the shared spelling",
    row !== null &&
      /role="menuitem"/.test(row[1]) &&
      /resetLayerLabel\(placement\.placed\)/.test(row[1]),
    "the row is unlabelled, spells its label a second time, or is not a menuitem",
  );
  check(
    "the row's title names what leaves the file, and the undo",
    /Removes the \(x,y\) written on \$\{placement\.placed\} element/.test(
      menu,
    ) && /One undo\./.test(menu),
    "a destructive row that does not say what it removes",
  );
  check(
    "the row is ABSENT when nothing is placed, not disabled",
    /placement\.placed > 0 \? \(/.test(menu) && !/disabled/.test(menu),
    "a row whose press does nothing — this menu's founding rule",
  );
  check(
    "the trigger's own name and tooltip carry the placed count",
    (menu.match(/\$\{heldSuffix\}/g) ?? []).length === 2,
    "the reader hovering the button after nothing moved is told nothing",
  );
  check(
    "the playground actually hands the menu its counts and its handler",
    /placement=\{layerPlacement\(doc, activeDiagramId\)\}/.test(page) &&
      /onRelease=\{/.test(page),
    "a correct row behind a prop nobody passes — 67b35ae in a new costume",
  );

  const hook = read("src/features/playground/lib/use-canvas-editing.ts");
  check(
    "the direction announcement has a branch for a layer that cannot move",
    /so nothing moved/.test(hook) && /placed by hand/.test(hook),
    "the announcement would claim the layer turned when it did not",
  );
  check(
    "and it points at the row by its shared label rather than a typed copy",
    /resetLayerLabel\(/.test(hook),
    "prose naming a control that can be reworded out from under it",
  );
  check(
    "the mixed case is said too, not folded into the inert one",
    /stayed where/.test(hook),
    "a half-applied direction would be announced as a whole one",
  );
  check(
    "both reset announcements name the undo key",
    (
      hook.match(
        /handed back to the layout[\s\S]{0,200}Cmd or Ctrl \+ Z with the diagram focused to undo/g,
      ) ?? []
    ).length === 2,
    "an edit with nothing left on screen to put back by hand, and no stated way back",
  );
  check(
    "the shared row label is the one the menu and the announcement both read",
    resetLayerLabel(3) === "Let the layout place them" &&
      resetLayerLabel(1) === "Let the layout place it",
    resetLayerLabel(3),
  );

  /* THE VALIDATOR'S ADVICE POINTS SOMEWHERE NOW. It used to end at "the shape
     is only changed by moving them", which was true while nothing offered to
     remove the coordinates and became a dead end the day something did. */
  const advisories = read("src/features/validate/lib/advisories.ts");
  check(
    "the column-layout advice points at the row instead of ending",
    /resetLayerLabel\(/.test(advisories) &&
      /direction menu/.test(advisories) &&
      !/the shape is only changed by moving them/.test(advisories),
    "advice a reader cannot act on",
  );

  /* THE PANEL'S ROW, and the fact it renders from the shared predicate rather
     than from a coordinate comparison of its own. */
  const panel = code("src/features/viewer/components/viewer-node-detail.tsx");
  const canvas = code("src/features/viewer/components/viewer-canvas.tsx");
  check(
    "the panel says where the element was placed, and offers the release",
    /Placed at \{Math\.round\(detail\.placedAt\.x\)\}/.test(panel) &&
      /Let the layout place it/.test(panel),
    "a reader has no way to learn that their drag wrote a number into the file",
  );
  check(
    "the row is gated on the element being placed AND the canvas editable",
    /detail\.placedAt !== null && onReleasePosition !== undefined \? \(/.test(
      panel,
    ),
    "a release button on a read-only canvas, or on an element nothing placed",
  );
  check(
    "the canvas decides that from hasAuthoredGeometry, not its own comparison",
    /hasAuthoredGeometry\(archLabFileFrom\(model\), diagram, node\)/.test(
      canvas,
    ) &&
      /canRelease = edit !== undefined && nodeDetail\?\.placedAt != null/.test(
        canvas,
      ),
    "a second opinion about what counts as placed by hand",
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
} else {
  console.log(`\nPASS — ${assertions}/${assertions} assertions`);
}
process.exit(failures === 0 ? 0 : 1);
