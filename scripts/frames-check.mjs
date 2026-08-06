#!/usr/bin/env node
/**
 * Frame (C4 boundary) editing check: the store's frame actions must uphold the
 * same invariants every other mutation does, and must never produce a document
 * the file validator would refuse.
 *
 * That last part is the reason this exists. `io/validate.ts` already rejects a
 * frame with an empty label, a `parentFrameId` that does not resolve, a nesting
 * cycle, and a node whose `frameId` names no frame on its own canvas. The
 * editor is the only thing that WRITES frames, so a gap between what it can
 * create and what the reader accepts shows up as "the file I just saved will
 * not open" — the worst failure this app has.
 *
 * Loads the REAL store and the REAL serializer through the same `registerHooks`
 * resolver pattern as `scripts/validate-samples-check.mjs`. What it proves:
 *
 *   1. Creating a boundary around a selection is ONE history entry: undo puts
 *      back both the frame and its members' membership.
 *   2. Invalid input throws and leaves the model EXACTLY as it was, with no
 *      history entry — a refused action must not cost the user an undo.
 *   3. Nesting cycles are refused, both directly and transitively.
 *   4. Deleting a boundary re-homes its children and members one level out
 *      rather than cascading — a frame owns no elements.
 *   5. Frames survive a full serialize → parse → serialize round trip, and
 *      every state reached here passes the real file validator.
 *
 * Exits non-zero on any failure. Run with: pnpm check:frames
 */

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* ----------------------------------------------------------------------- */
/* Module resolution: `@/*` alias + extensionless relative imports -> .ts   */
/* ----------------------------------------------------------------------- */

const SRC_PREFIX = pathToFileURL(path.join(ROOT, "src")).href;

/**
 * Same resolver as the other check scripts, with ONE addition: the relative →
 * URL rewrite is scoped to importers inside our own `src/`.
 *
 * The store pulls in Zustand, which pulls in React, whose CommonJS entry does
 * `require("./cjs/react.development.js")`. Handing that a `file://` URL breaks
 * the CJS loader — so anything imported from outside `src/` is passed straight
 * through untouched. The other check scripts never load a React-dependent
 * module, which is why only this one needs the guard.
 */
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
      if (!context.parentURL.startsWith(SRC_PREFIX)) {
        return nextResolve(specifier, context);
      }
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

const { useEditorStore } = await import(
  pathToFileURL(path.join(ROOT, "src/features/editor/state/store.ts")).href
);
const { serializeModel } = await import(
  pathToFileURL(path.join(ROOT, "src/features/editor/io/serialize.ts")).href
);
const { validateArchLabFile } = await import(
  pathToFileURL(path.join(ROOT, "src/features/editor/io/validate.ts")).href
);

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let checks = 0;

const ok = (message) => {
  checks += 1;
  console.log(`  ok  ${message}`);
};
const fail = (message, detail) => {
  checks += 1;
  failures += 1;
  console.error(`  FAIL  ${message}\n        ${detail}`);
};

const store = () => useEditorStore.getState();
const activeDiagram = () => store().model.diagrams[store().activeDiagramId];
const framesOf = () => activeDiagram().frames ?? [];
const nodeById = (id) => activeDiagram().nodes.find((n) => n.id === id);

/**
 * The current model as the exact JSON text the editor would write, put back
 * through the real load-time validator.
 *
 * Round-tripping through the TEXT rather than handing the validator an
 * in-memory object is the point: the saved file is what a collaborator opens,
 * so that string is the artefact whose validity matters.
 */
function savedFile() {
  return JSON.parse(serializeModel(store().model));
}

function fileIsValid() {
  try {
    validateArchLabFile(savedFile());
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      problems: (error.issues ?? [error.message]).slice(0, 3),
    };
  }
}

/* ----------------------------------------------------------------------- */
/* Fixture                                                                  */
/* ----------------------------------------------------------------------- */

const diagramId = store().activeDiagramId;
const nodeIds = ["a", "b", "c"].map((_, index) =>
  store().createNode({
    diagramId,
    type: "softwareSystem",
    position: { x: 100 + index * 200, y: 100 },
    name: `System ${index + 1}`,
  }),
);

if (nodeIds.length === 3 && nodeIds.every((id) => typeof id === "string")) {
  ok(`fixture: three nodes in ${diagramId}`);
} else {
  fail("fixture: three nodes", JSON.stringify(nodeIds));
}

/* ----------------------------------------------------------------------- */
/* 1. Create is one history entry                                           */
/* ----------------------------------------------------------------------- */

const frameId = store().createFrame({
  diagramId,
  label: "AWS Region",
  nodeIds: nodeIds.slice(0, 2),
});

{
  const frames = framesOf();
  const members = nodeIds.filter((id) => nodeById(id).frameId === frameId);
  if (
    frames.length === 1 &&
    frames[0].label === "AWS Region" &&
    members.length === 2
  ) {
    ok(`createFrame adds "${frames[0].id}" and moves its 2 members in`);
  } else {
    fail(
      "createFrame adds the frame and moves its members in",
      `frames=${JSON.stringify(frames)} members=${JSON.stringify(members)}`,
    );
  }

  store().undo();
  const undoneFrames = framesOf();
  const undoneMembers = nodeIds.filter(
    (id) => nodeById(id).frameId !== undefined,
  );
  if (undoneFrames.length === 0 && undoneMembers.length === 0) {
    ok("ONE undo removes the frame and the membership together");
  } else {
    fail(
      "ONE undo removes the frame and the membership together",
      `frames=${JSON.stringify(undoneFrames)} members=${JSON.stringify(undoneMembers)}`,
    );
  }
  store().redo();
}

/* ----------------------------------------------------------------------- */
/* 2. A refused action changes nothing and costs no undo                    */
/* ----------------------------------------------------------------------- */

for (const [label, run] of [
  [
    "createFrame with an unknown parent",
    () => store().createFrame({ diagramId, parentFrameId: "f-nope" }),
  ],
  [
    "createFrame with an unknown node",
    () => store().createFrame({ diagramId, nodeIds: ["ghost"] }),
  ],
  [
    "setNodeFrame into an unknown frame",
    () => store().setNodeFrame(diagramId, [nodeIds[0]], "f-nope"),
  ],
  [
    "updateFrame on an unknown frame",
    () => store().updateFrame(diagramId, "f-nope", { label: "x" }),
  ],
]) {
  const before = JSON.stringify(store().model);
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  const after = JSON.stringify(store().model);
  if (threw && before === after) {
    ok(`${label} throws and leaves the model untouched`);
  } else {
    fail(
      `${label} throws and leaves the model untouched`,
      threw ? "the model changed anyway" : "it did not throw",
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 3. Cycles are refused                                                    */
/* ----------------------------------------------------------------------- */

const innerId = store().createFrame({
  diagramId,
  label: "Private subnet",
  parentFrameId: frameId,
});

{
  let threw = false;
  try {
    store().updateFrame(diagramId, frameId, { parentFrameId: innerId });
  } catch {
    threw = true;
  }
  if (
    threw &&
    (framesOf().find((f) => f.id === frameId)?.parentFrameId ?? null) === null
  ) {
    ok("a frame cannot nest inside its own child");
  } else {
    fail(
      "a frame cannot nest inside its own child",
      threw ? "it changed anyway" : "it did not throw",
    );
  }

  let selfThrew = false;
  try {
    store().updateFrame(diagramId, frameId, { parentFrameId: frameId });
  } catch {
    selfThrew = true;
  }
  if (selfThrew) ok("a frame cannot nest inside itself");
  else fail("a frame cannot nest inside itself", "it did not throw");

  // Transitive: outer -> inner -> deepest, then outer inside deepest.
  const deepestId = store().createFrame({
    diagramId,
    label: "Deepest",
    parentFrameId: innerId,
  });
  let deepThrew = false;
  try {
    store().updateFrame(diagramId, frameId, { parentFrameId: deepestId });
  } catch {
    deepThrew = true;
  }
  if (deepThrew) ok("a cycle two levels deep is refused too");
  else fail("a cycle two levels deep is refused too", "it did not throw");
  store().deleteFrame(diagramId, deepestId);
}

/* ----------------------------------------------------------------------- */
/* 4. Delete re-homes, never cascades                                       */
/* ----------------------------------------------------------------------- */

{
  // outer("AWS Region") holds 2 nodes and inner("Private subnet"). Put the
  // third node in the inner one, then delete the OUTER.
  store().setNodeFrame(diagramId, [nodeIds[2]], innerId);
  const nodesBefore = activeDiagram().nodes.length;

  store().deleteFrame(diagramId, frameId);

  const frames = framesOf();
  const inner = frames.find((f) => f.id === innerId);
  const rehomed = nodeIds
    .slice(0, 2)
    .every((id) => nodeById(id).frameId === undefined);
  const innerKept = nodeById(nodeIds[2]).frameId === innerId;

  if (
    activeDiagram().nodes.length === nodesBefore &&
    frames.length === 1 &&
    inner !== undefined &&
    (inner.parentFrameId ?? null) === null &&
    rehomed &&
    innerKept
  ) {
    ok(
      "deleting the outer boundary keeps every node and lifts the inner one out",
    );
  } else {
    fail(
      "deleting the outer boundary keeps every node and lifts the inner one out",
      `nodes=${activeDiagram().nodes.length}/${nodesBefore} frames=${JSON.stringify(frames)}`,
    );
  }

  // Deleting the last frame must drop `frames` entirely, so a diagram that
  // never had boundaries serializes exactly as it did before.
  store().setNodeFrame(diagramId, [nodeIds[2]], null);
  store().deleteFrame(diagramId, innerId);
  if (activeDiagram().frames === undefined) {
    ok(
      "the last boundary's removal drops the `frames` key, not leaves it empty",
    );
  } else {
    fail(
      "the last boundary's removal drops the `frames` key",
      `frames=${JSON.stringify(activeDiagram().frames)}`,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* 5. Ids, labels, and the file the editor would save                       */
/* ----------------------------------------------------------------------- */

{
  const first = store().createFrame({ diagramId, label: "Internal" });
  const second = store().createFrame({ diagramId, label: "Internal" });
  if (first !== second && framesOf().length === 2) {
    ok(
      `two boundaries with one label get distinct ids ("${first}", "${second}")`,
    );
  } else {
    fail(
      "two boundaries with one label get distinct ids",
      `${first} vs ${second}`,
    );
  }

  // An all-whitespace rename would produce a file the validator refuses.
  store().updateFrame(diagramId, first, { label: "   " });
  if (framesOf().find((f) => f.id === first)?.label === "Internal") {
    ok("a blank rename is ignored rather than written");
  } else {
    fail(
      "a blank rename is ignored rather than written",
      `label=${JSON.stringify(framesOf().find((f) => f.id === first)?.label)}`,
    );
  }

  store().setNodeFrame(diagramId, nodeIds, first);
  store().updateFrame(diagramId, second, { parentFrameId: first });

  const verdict = fileIsValid();
  if (verdict.ok) {
    ok("the file the editor would save passes the real validator");
  } else {
    fail(
      "the file the editor would save passes the real validator",
      JSON.stringify(verdict.problems),
    );
  }

  // Round trip through the serializer: frames and membership must come back.
  const diagram = savedFile().diagrams.find((d) => d.id === diagramId);
  const roundTripped =
    JSON.stringify(diagram.frames) ===
      JSON.stringify(
        [...framesOf()].sort((a, b) => a.id.localeCompare(b.id)),
      ) && diagram.nodes.every((node) => node.frameId === first);
  if (roundTripped) {
    ok("frames and membership survive serialization, sorted by id");
  } else {
    fail(
      "frames and membership survive serialization",
      JSON.stringify(diagram.frames),
    );
  }
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${checks} frame check(s) FAILED`);
  process.exit(1);
}
console.log(`\nframes-check: all ${checks} checks passed.`);
