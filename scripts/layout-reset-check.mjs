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
 *   3. `placedByHand` IS WHAT THE SOURCE SAID, in both languages: for every
 *      `.alab` fixture, true exactly when the element's own declaration line
 *      carries a token, read off the spans rather than off a re-serialize;
 *      for every bundled `.archlab.json`, true for every element, because
 *      `position` is required there and no JSON document can leave one to the
 *      layout. Measured against the SOURCE deliberately — this section used
 *      to measure the predicate against the serializer, and both sides shared
 *      one wrong idea (see 12). It also pins that the mark reaches neither
 *      output, which is why it is a symbol rather than a field. Read from the
 *      FILESYSTEM rather than a hand-listed set of example names, so an
 *      example added tomorrow is covered.
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
 *      menu that gates them, and the reset announcement names the undo key. A
 *      past release shipped a correct module behind a control nobody could
 *      reach (`67b35ae`) with every assertion green, because they all asked
 *      whether the MODULE agreed and none asked whether the CONTROL did.
 *  11. A SIGHTED READER IS TOLD, AT THE MOMENT OF THE PRESS. The menu's note
 *      is read BEFORE the press and the menu closes on it; the announcement
 *      beside it is `sr-only`. So the press itself raises a toast, and this
 *      section proves the sentence for all four shapes a layer can be in
 *      (nothing placed — silent; some placed; all placed; all pinned), that
 *      the toast's action is labelled from `resetLayerLabel` so it cannot
 *      drift from the menu row it runs, and that the path is reachable from
 *      the direction handler rather than a correct module behind nothing.
 *      It also pins the four judgements the wording rests on: the file-scope
 *      press warns with a layer-scoped sentence, `clearDirection` does not
 *      warn, the placement prose lives in ONE channel (the toast is itself a
 *      live region, so leaving it in the announcement too would say it twice),
 *      and a repeated press raises no second toast because the edit refuses
 *      first.
 *  12. A TOKEN WHOSE NUMBERS EQUAL THE DEFAULT SLOT still beats the direction
 *      — the shape the other eleven assertions could not see. The fixture is
 *      built by COMPUTATION (parse the token-free layer, write its own
 *      coordinates back onto its lines), because a hand-typed `(40,40 …)`
 *      stops being the default the day the layout changes. It proves the
 *      premise (the direction moves nothing, and had somewhere to move it
 *      to), then that the layer counts every element placed, that the press
 *      is not silent, that the sweep removes every token including the
 *      coincidental ones, and that the direction then applies. It also pins
 *      the emitter's numeric test on its own terms — a full serialize still
 *      omits a default-valued token, which is a decision about canonical
 *      bytes and the one place the two questions answer differently.
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
  parseArchText,
  parseArchTextWithSpans,
  serializeArchText,
  spanKey,
} = await load("src/features/archtext/index.ts");
const {
  canvasEditability,
  directionInertWarning,
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
const { placedByHand } = await load("src/types/c4.ts");
const { deserializeModel } = await load(
  "src/features/editor/io/deserialize.ts",
);
const { fileFromEditorModel } = await load(
  "src/features/viewer/input/parse-input.ts",
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

/**
 * The same layer with every element's DEFAULT coordinates written back onto
 * its line as an explicit token — the document the whole feature was blind to.
 *
 * BUILT BY COMPUTATION, never by hand. The coordinates come from parsing the
 * token-free fixture and reading what the layout chose, so the fixture cannot
 * encode a stale idea of where `tb` puts anything: hand-typing `(40,40 176x88)`
 * would stop being the default the day `defaultPositions` changes, and this
 * fixture would then be testing an ordinary dragged document.
 *
 * WHY IT MATTERS. Every one of these tokens beats the layout — the parser
 * resolves `node.geometry ?? layout.get(id)` and the token is present — so the
 * direction moves nothing. But the numbers are exactly what the layout would
 * have chosen, so a comparison against the default layout answers "nothing is
 * placed here", which is how a diagram that refuses every direction came to be
 * described by a menu with no note and a press with no toast.
 */
function defaultsWrittenBack(text) {
  const doc = c4Document(text);
  const nodes = nodesById(doc, DIAGRAM_ID);
  return text
    .split("\n")
    .map((line) => {
      const declared = /^ {2}([\w-]+):\w+ /.exec(line);
      const node = declared === null ? undefined : nodes.get(declared[1]);
      if (node === undefined) return line;
      return `${line} (${node.position.x},${node.position.y} ${node.size.width}x${node.size.height})`;
    })
    .join("\n");
}

/** The `tb` defaults written back, under a file header that asks for `lr`. */
const DEFAULTS_AS_TOKENS = defaultsWrittenBack(FREE_TB).replace(
  'title "Reset"',
  'title "Reset"\ndirection lr',
);

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
/* 3. `placedByHand` is what the SOURCE said, in both languages             */
/* ----------------------------------------------------------------------- */

console.log("\nplacedByHand says exactly what the source stated");

{
  /* THE `.alab` SIDE, MEASURED AGAINST THE AUTHOR'S OWN LINES rather than
     against a re-serialize. The predicate used to be measured against the
     serializer's output, and both sides shared one wrong idea — a token whose
     numbers equal the default slot is omitted on the way out, so the pair
     agreed on "not placed" for an element the text plainly places. The source
     text cannot agree with that mistake: the spans say which line each element
     is declared on, and either the token is on it or it is not. */
  const tokenOnLine = /\((-?[\d.]+),(-?[\d.]+) (-?[\d.]+)x(-?[\d.]+)\)/;
  for (const [label, text] of [
    ["fixture: token-free tb", FREE_TB],
    ["fixture: token-free lr", FREE_LR],
    ["fixture: every element dragged", everyElementDragged(FREE_LR).text],
    ["fixture: the defaults written back as tokens", DEFAULTS_AS_TOKENS],
  ]) {
    const { file, spans } = parseArchTextWithSpans(text);
    const lines = text.split("\n");
    const disagreed = [];
    for (const diagram of file.diagrams) {
      for (const node of diagram.nodes) {
        const span = spans.nodes.get(spanKey(diagram.id, node.id));
        const declared = lines[span.start - 1];
        const inText = tokenOnLine.test(declared);
        if (placedByHand(node) !== inText) {
          disagreed.push(
            `${diagram.id}/${node.id}: predicate ${placedByHand(node)}, line "${declared.trim()}"`,
          );
        }
      }
    }
    check(
      `${label}: the predicate matches the declaration line, every element`,
      disagreed.length === 0,
      disagreed.join("; "),
    );
  }

  /* THE JSON SIDE. `position` is required of every element there — there is no
     way for a `.archlab.json` document to leave one to the layout — so every
     element read through the app's own reader is placed, and the direction
     control on that pane has to say so. Read through `deserializeModel`, not
     `JSON.parse`: the mark is put on by the reader, and a section that parsed
     the bytes itself would be measuring a model the app never builds.

     FROM THE FILESYSTEM, never a hand-listed set of names: a hardcoded list
     cannot notice the example it has never heard of, which is how three checks
     in this repo passed while the feature under them was broken. */
  const dataDir = "src/features/viewer/service/data";
  const names = readdirSync(path.join(ROOT, dataDir))
    .filter((name) => name.endsWith(".archlab.json"))
    .sort();
  check(
    "there are bundled JSON examples to measure against",
    names.length > 0,
    `no .archlab.json under ${dataDir} — this section would be vacuous`,
  );
  for (const name of names) {
    const text = read(`${dataDir}/${name}`);
    const file = fileFromEditorModel(deserializeModel(text));
    const nodes = file.diagrams.flatMap((diagram) => diagram.nodes);
    check(
      `${name}: every element states its own position, so every one is placed`,
      nodes.length > 0 &&
        nodes.every((node) => placedByHand(node)) &&
        /"position"/.test(text),
      `${nodes.filter((node) => !placedByHand(node)).length} of ${nodes.length} unmarked`,
    );
    /* THE MARK IS INVISIBLE TO BOTH WRITERS, which is the whole reason it is a
       symbol: a string field would be document content, would collide with an
       author's own `! authoredGeometry` line, and would have to be stripped in
       two serializers. `check:roundtrip` proves the JSON bytes; this proves
       the name reaches neither output. */
    check(
      `${name}: the mark reaches neither the JSON nor the .alab text`,
      !JSON.stringify(file).includes("authoredGeometry") &&
        !serializeArchText(file).includes("authoredGeometry"),
      "a read-time annotation leaked into the document",
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
      .every((node) => placedByHand(node)),
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
    "the canvas decides that from placedByHand, not its own comparison",
    /placedAt: placedByHand\(node\)/.test(canvas) &&
      /canRelease = edit !== undefined && nodeDetail\?\.placedAt != null/.test(
        canvas,
      ),
    "a second opinion about what counts as placed by hand",
  );
}

/* ----------------------------------------------------------------------- */
/* 11. The press tells a SIGHTED reader, and only once                      */
/*                                                                          */
/* The menu's note warns BEFORE the press and the menu closes on it, and    */
/* the announcement beside it is `sr-only` — so the reader who pressed a    */
/* direction, watched the diagram sit still and is deciding whether the      */
/* control works was the one person told nothing. `directionInertWarning` is */
/* that sentence. It is called here rather than regex-matched, because a     */
/* message nothing ever evaluates is a message whose shape nothing proved.  */
/* ----------------------------------------------------------------------- */

console.log("\nThe press says what did not move, to the reader who can see");

{
  /** The layer with `ids` dragged and the rest left to the layout. */
  function dragged(text, ids) {
    let doc = c4Document(text);
    let current = text;
    for (const id of ids) {
      const node = nodesById(doc, DIAGRAM_ID).get(id);
      const next = movedNodeEdit(doc, current, DIAGRAM_ID, id, {
        x: node.position.x + 80,
        y: node.position.y + 160,
      });
      if (next === null) throw new Error(`the drag of ${id} was refused`);
      doc = next.doc;
      current = next.text;
    }
    return doc;
  }

  /* THE SILENT HAPPY PATH FIRST. Everything below is a warning, and a warning
     that also fires on the working case is noise — which is the state that
     trains a reader to ignore the press that mattered. */
  const free = layerPlacement(c4Document(FREE_TB), DIAGRAM_ID);
  check(
    "a layer the layout places freely raises nothing at all",
    free.placed === 0 &&
      free.pinned === 0 &&
      directionInertWarning(free) === null,
    JSON.stringify(free),
  );
  check(
    "and a document this cannot be asked about raises nothing either",
    directionInertWarning(null) === null,
    "a null placement would have to be read as 'everything is placed'",
  );

  /* SOME PLACED. The count is the whole content of this sentence: a reader
     told only that "some elements are placed" has learned nothing they can
     act on, and a half-turned diagram is the case that needs explaining. */
  const partly = layerPlacement(
    dragged(FREE_TB, ["web", "api", "db"]),
    DIAGRAM_ID,
  );
  const partlyWarning = directionInertWarning(partly);
  check(
    "the fixture really is partly placed, or the sentence below is the wrong one",
    partly.placed === 3 && partly.total > 3 && partly.pinned === 0,
    JSON.stringify(partly),
  );
  check(
    "a partly placed layer is warned about, and the message names the count",
    partlyWarning !== null &&
      partlyWarning.message.includes(`3 of ${partly.total} elements`),
    partlyWarning?.message,
  );
  check(
    "it says the rest DID move, so it is not read as the inert case",
    partlyWarning !== null &&
      /the rest took the new direction/.test(partlyWarning.message) &&
      !partlyWarning.message.includes("Nothing"),
    partlyWarning?.message,
  );

  /* ALL PLACED — the press did nothing visible at all, which is a different
     fact and gets a different sentence. */
  const all = layerPlacement(everyElementDragged(FREE_TB).doc, DIAGRAM_ID);
  const allWarning = directionInertWarning(all);
  check(
    "an entirely placed layer is told plainly that nothing moved",
    allWarning !== null &&
      allWarning.message.startsWith("Nothing in this layer moved") &&
      allWarning.message.includes(`all ${all.total} of its elements`),
    allWarning?.message,
  );
  check(
    "and the two cases are not the same sentence with a number swapped",
    allWarning.message !== partlyWarning.message &&
      !/\d+ of \d+ elements/.test(allWarning.message) &&
      !partlyWarning.message.startsWith("Nothing"),
    "blurring 'nothing moved' into 'some moved' is the wording this forbids",
  );

  /* THE ACTION IS THE MENU'S ROW, under the menu's own label. Two spellings of
     one control is the drift `resetLayerLabel` exists to prevent — and a
     reader who read "Let the layout place them" in the menu must not be
     offered "Release positions" by the toast. */
  check(
    "the release is offered under the shared row label, not a second spelling",
    allWarning.releaseLabel === resetLayerLabel(all.placed) &&
      partlyWarning.releaseLabel === resetLayerLabel(partly.placed),
    `${allWarning.releaseLabel} / ${partlyWarning.releaseLabel}`,
  );

  /* ALL PINNED. There is no release row on a layer whose every placed element
     is `pin`ned, so there must be no button either — naming a remedy that is
     not there is the failure this whole feature exists to stop. */
  const pinnedOnly = directionInertWarning({ total: 2, placed: 0, pinned: 2 });
  check(
    "an all-pinned layer is warned about with no action to press",
    pinnedOnly !== null &&
      pinnedOnly.releaseLabel === null &&
      pinnedOnly.message.includes("pinned"),
    JSON.stringify(pinnedOnly),
  );
  /* AND WHAT THE ACTION WILL LEAVE. The release skips pins, so a message
     counting four while the button frees two would promise more than it does. */
  const mixed = directionInertWarning({ total: 4, placed: 2, pinned: 2 });
  check(
    "a mix says what stays behind, so the action cannot over-promise",
    mixed.message.includes("The 2 pinned ones stay in place either way") &&
      mixed.releaseLabel === resetLayerLabel(2),
    mixed.message,
  );

  /* JUDGEMENT 1 — THE FILE-SCOPE PRESS. It warns, because the reader's
     evidence is identical: they pressed, and the diagram in front of them did
     not move. What keeps that honest with no file-wide release to offer is
     that the SENTENCE is layer-scoped — it never claims anything about the
     diagrams nobody is looking at, so the layer-only action does exactly what
     the message implies. */
  check(
    "the warning never talks about the file, so it is honest at both scopes",
    [allWarning, partlyWarning, mixed, pinnedOnly].every(
      (warning) =>
        warning.message.includes("this layer") &&
        !/\bfile\b|\bdiagrams\b/.test(warning.message),
    ),
    "a file-scope toast whose action can only release one layer",
  );

  /* JUDGEMENT 4 — A REPEATED PRESS. No dedupe is needed because the EDIT
     refuses first: choosing the direction already in force returns null, and
     the handler returns before the toast. Pinned here rather than reasoned
     about, because "it cannot happen" is what a stacking bug looks like from
     the inside. */
  const placedDoc = everyElementDragged(FREE_TB).doc;
  const turned = revisedDirectionEdit(
    placedDoc,
    serializeArchText(placedDoc.synced.file),
    DIAGRAM_ID,
    "lr",
  );
  check(
    "pressing the direction already in force is refused, so no toast stacks",
    turned !== null &&
      revisedDirectionEdit(turned.doc, turned.text, DIAGRAM_ID, "lr") === null,
    "a repeated press would raise a second toast for an edit that did nothing",
  );

  /* REACHABILITY. `67b35ae` again, and the branch has already spent one round
     on it: a correct module behind a control nothing invokes is the same bug
     as no module at all. Read from the source with comments stripped — the
     prose above this handler names the toast, and a regex counting the comment
     would report success for exactly the state this forbids. */
  const hookCode = code("src/features/playground/lib/use-canvas-editing.ts");
  check(
    "the hook imports the toast from the one renderer the app mounts",
    /import \{ toast \} from "@\/components\/ui\/toast"/.test(hookCode),
    "a second toast implementation, or none",
  );
  const applyBody =
    /const applyDirection = useCallback\(([\s\S]*?)\n {4}\[/.exec(hookCode);
  check(
    "the direction handler exists in the hook this reads",
    applyBody !== null,
    "applyDirection not found — the assertions below would be vacuous",
  );
  check(
    "the direction press is what raises the toast",
    applyBody !== null &&
      /directionInertWarning\(placement\)/.test(applyBody[1]) &&
      /toast\(\{/.test(applyBody[1]) &&
      /tone: "warning"/.test(applyBody[1]),
    "a warning nobody can trigger is a warning that does not exist",
  );
  check(
    "its action is labelled from the module, not typed again in the handler",
    applyBody !== null &&
      /label: inert\.releaseLabel/.test(applyBody[1]) &&
      !/Let the layout place/.test(applyBody[1]),
    "the toast and the menu row could be reworded apart",
  );
  /* THE STALE-CLOSURE TRAP. A toast outlives the render that raised it, so a
     release captured at raise time patches the PRE-EDIT bytes and drops the
     `direction` line the reader just wrote. The ref is read at press time. */
  check(
    "the action runs the CURRENT release path, not the one captured at raise",
    applyBody !== null &&
      /releaseRef\.current\(diagramId\)/.test(applyBody[1]) &&
      !/run: \(\) => resetLayerPositions\(/.test(applyBody[1]),
    "pressing the toast would undo the direction it is warning about",
  );

  /* JUDGEMENT 3 — ONE CHANNEL PER FACT. `<Toaster />` is `aria-live` with a
     `role="status"` per entry, so the placement prose in the announcement TOO
     would tell a screen-reader user the same thing twice. The announcement
     keeps what the FILE now says; the toast keeps what the picture did. */
  const toaster = code("src/components/ui/toast.tsx");
  check(
    "the toast really is a live region, which is why the double had to go",
    /aria-live="polite"/.test(toaster) && /role="status"/.test(toaster),
    "if it were silent to assistive tech the announcement would have to keep the fact",
  );
  check(
    "the announcement carries no placement prose of its own any more",
    applyBody !== null &&
      !/placed by hand|nothing moved|stayed where/.test(applyBody[1]),
    "the same fact in two live regions — said twice to anyone listening",
  );
  check(
    "and it says what the FILE says, not what the shape did, when inert",
    applyBody !== null && /now says \$\{/.test(applyBody[1]),
    "a live region claiming the layer turned beside a toast saying it did not",
  );

  /* JUDGEMENT 2 — CLEARING DOES NOT WARN. It asks for no shape, so there is
     no expectation to falsify: the line leaves the document, which is exactly
     what the reader asked for, and the menu's own tick answers it. */
  const clearBody =
    /const clearDirection = useCallback\(([\s\S]*?)\n {4}\[/.exec(hookCode);
  check(
    "the clearing handler exists in the hook this reads",
    clearBody !== null,
    "clearDirection not found — the assertion below would be vacuous",
  );
  check(
    "clearing raises no toast, so the warning stays about a refused shape",
    clearBody !== null && !/toast\(/.test(clearBody[1]),
    "a toast on every direction press is one nobody reads on the press that matters",
  );
}

/* ----------------------------------------------------------------------- */
/* 12. A TOKEN THAT EQUALS THE DEFAULT still beats the direction            */
/*                                                                          */
/* The section the other eleven could not have caught, and the reason this  */
/* one is written from the SOURCE rather than from the serializer. Section  */
/* 3 used to measure the predicate against a full serialize and both sides  */
/* held the same wrong idea: the writer omits a token whose numbers equal   */
/* the default slot, so a document that writes its defaults out was read as */
/* placing nothing. Every assertion was green while three of three elements */
/* refused the direction, the menu carried no note and the press raised no  */
/* toast — the exact bug this feature exists to end, in its quietest shape. */
/* ----------------------------------------------------------------------- */

console.log("\nA coordinate that equals the default is still a coordinate");

{
  const doc = c4Document(DEFAULTS_AS_TOKENS);
  const nodes = nodesById(doc, DIAGRAM_ID);
  const lrLayout = layoutAt(doc, DIAGRAM_ID, "lr");

  /* THE PREMISE FIRST, so the assertions below document the bug rather than
     just the fix. Two halves: changing the direction moves NOTHING (every
     element keeps its token's coordinates), and the direction would otherwise
     have had somewhere to move it to — an element whose `tb` slot happens to
     be its `lr` slot proves nothing either way, so the second half is "at
     least one" rather than "all". */
  const underTb = nodesById(
    c4Document(DEFAULTS_AS_TOKENS.replace("\ndirection lr", "")),
    DIAGRAM_ID,
  );
  const budged = [...nodes.keys()].filter(
    (id) =>
      underTb.get(id).position.x !== nodes.get(id).position.x ||
      underTb.get(id).position.y !== nodes.get(id).position.y,
  );
  check(
    "the direction genuinely does not apply — lr moves not one element",
    budged.length === 0 && nodes.size > 1,
    `${budged.length} of ${nodes.size} elements moved: ${budged.join(", ")}`,
  );
  const offLrSlot = [...nodes.keys()].filter(
    (id) =>
      at(lrLayout, id).x !== nodes.get(id).position.x ||
      at(lrLayout, id).y !== nodes.get(id).position.y,
  );
  check(
    "and lr had somewhere to put them, so the refusal is what stopped it",
    offLrSlot.length > 0,
    "every tb slot is also an lr slot — this fixture would prove nothing",
  );
  check(
    "and the tokens really are the default coordinates, not a drag",
    nodesById(c4Document(FREE_TB), DIAGRAM_ID).size === nodes.size &&
      [...nodes.keys()].every((id) => {
        const free = nodesById(c4Document(FREE_TB), DIAGRAM_ID).get(id);
        return (
          free.position.x === nodes.get(id).position.x &&
          free.position.y === nodes.get(id).position.y
        );
      }),
    "the fixture drifted from the tb layout it was built from",
  );

  /* THE COUNT. `placed: 0` here was the whole defect: a layer that refuses
     every direction, reported as free to move. */
  const placement = layerPlacement(doc, DIAGRAM_ID);
  check(
    "every element is counted as placed, not one of them written off",
    placement.total === nodes.size &&
      placement.placed === nodes.size &&
      placement.pinned === 0,
    JSON.stringify(placement),
  );

  /* AND THE READER IS TOLD. Silence was the second half of the defect: no
     note before the press because nothing was counted, and no toast after it
     for the same reason. */
  const warning = directionInertWarning(placement);
  check(
    "the press is not silent, and the sentence is the inert one",
    warning !== null &&
      warning.message.startsWith("Nothing in this layer moved") &&
      warning.message.includes(`all ${nodes.size} of its elements`) &&
      warning.releaseLabel === resetLayerLabel(nodes.size),
    JSON.stringify(warning),
  );

  /* THE SWEEP TAKES ALL OF THEM. Under the comparison this replaced, the
     coincidental tokens were skipped — so the reader pressed a row that
     promised the layer back and the tokens defeating the direction stayed in
     the file. Counted by TOKEN, not by line, because a skipped element leaves
     a line the patch never touched. */
  const edit = resetLayerPositionsEdit(doc, DEFAULTS_AS_TOKENS, DIAGRAM_ID);
  check(
    "the sweep applies as a patch",
    edit !== null && edit.path === "patch",
    `path: ${edit === null ? "refused" : edit.path}`,
  );
  const leftover = edit.text
    .split("\n")
    .filter((line) => /^ {2}[\w-]+:\w+ .*\(-?[\d.]+,/.test(line));
  check(
    "not one token survives it, including the coincidental ones",
    leftover.length === 0,
    leftover.join(" | "),
  );

  /* AND THE DIRECTION FINALLY APPLIES, measured on the reparsed text: the
     point of the whole gesture is the picture, not the bytes. */
  const after = nodesById(c4Document(edit.text), DIAGRAM_ID);
  const off = [...after.keys()].filter(
    (id) =>
      after.get(id).position.x !== at(lrLayout, id).x ||
      after.get(id).position.y !== at(lrLayout, id).y,
  );
  check(
    "after the sweep every element sits where lr puts it",
    off.length === 0 && after.size === nodes.size,
    off.join(", "),
  );
  check(
    "and the layer now reports nothing placed",
    layerPlacement(c4Document(edit.text), DIAGRAM_ID).placed === 0,
    JSON.stringify(layerPlacement(c4Document(edit.text), DIAGRAM_ID)),
  );

  /* THE WRITER'S OWN TEST, ON ITS OWN TERMS. `emitNode` still omits a token
     whose numbers equal the default slot, and that is a DECISION rather than
     an oversight: `serializeArchText` is documented as a pure function of the
     model, and the mark is a read-time annotation that no share link, JSON
     round trip or `structuredClone` carries — so honouring it in the emitter
     would make canonical bytes depend on which reader happened to load the
     document. The consequence is pinned here rather than discovered: this is
     the one place where the two questions give different answers, and the
     release still removes the token from the SOURCE because it patches lines
     (above) rather than re-emitting the file. */
  const canonical = serializeArchText(doc.synced.file);
  const stillTokened = canonical
    .split("\n")
    .filter((line) => /^ {2}[\w-]+:\w+ .*\(-?[\d.]+,/.test(line));
  check(
    "a full serialize omits the tokens the emitter's numeric test calls default",
    stillTokened.length < nodes.size,
    `${stillTokened.length} of ${nodes.size} lines kept a token`,
  );
  check(
    "so the two questions provably differ here, and only the source's wins",
    [...nodes.values()].every((node) => placedByHand(node)) &&
      canonical !== DEFAULTS_AS_TOKENS,
    "if these agreed, this whole section would be measuring nothing",
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
} else {
  console.log(`\nPASS — ${assertions}/${assertions} assertions`);
}
process.exit(failures === 0 ? 0 : 1);
