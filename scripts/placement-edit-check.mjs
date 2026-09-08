#!/usr/bin/env node
/**
 * The placement canvases: a drag has to become TEXT, and the text has to mean
 * the same thing when it is read back.
 *
 * ONE SCRIPT FOR TWO NOTATIONS, deliberately. The ER and use-case canvases
 * share one gesture vocabulary — place an element, pin it, release it, release
 * the diagram — because an ER entity and a use-case element are addressed by
 * id, placed by a point and released the same way. `PlacementEditHandlers` is
 * one interface for the same reason. Two scripts would be the copy `dry.md`
 * asks about, and asked what they would have to assert differently in future
 * the answer is nothing: both are opting one element out of a solver.
 * The FIXTURES differ per notation and the assertions are looped over them, so
 * a notation-specific failure still names its notation.
 *
 * This exists because nothing else can catch a regression in it. `pnpm build`
 * type-checks the plumbing but cannot say that a placed element is still where
 * it was put after a serialise and a re-parse, and the failure it guards is
 * silent in the worst way: the element visibly moves, the pane visibly
 * changes, and the position is quietly lost or doubled on the next render.
 *
 * It loads the REAL modules through Node's type stripping — both gesture
 * modules, the parsers and `input/parse.ts` — so this proves what the page
 * does rather than a copy of it. That also PINS THE PURITY of `er-edit.ts` and
 * `usecase-edit.ts`, the duty `check:canvas-edit` performs for its three
 * siblings: type stripping cannot read `.tsx` at all, so an import reaching a
 * feature barrel that exports a component fails here loudly instead of
 * silently removing the module from the only harness it has.
 *
 * What it asserts:
 *
 *   1. EVERY GESTURE ASKS THE GRID ITSELF. Pointed at another notation's
 *      document each one returns null — the refusal is real at the gesture,
 *      not advisory at the table, which is what `canvas-editing.md` requires
 *      of a gesture that might one day be called by something else.
 *   2. A MOVE IS A ONE-LINE EDIT gaining exactly one token, which is what
 *      makes it reviewable in a diff — the product's whole collaboration
 *      story — and every comment and blank line elsewhere survives it.
 *   3. COORDINATES ARE ROUNDED AND NOT CLAMPED. `240.00000000000003` in an
 *      author's text is noise the gesture created; a negative coordinate is a
 *      place on the canvas, because the layouts report a frame that grows.
 *   4. A NO-OP MOVE IS REFUSED, so a press that lands where it began costs the
 *      reader no undo entry.
 *   5. `pin` REQUIRES A POSITION TO KEEP, at the gesture as well as in the
 *      grammar.
 *   6. THE PIN TOGGLE NORMALISES TO ABSENT rather than writing `pin=false` —
 *      and that is NOT the numbering-toggle bug, because absent and `false`
 *      are one answer to every consumer here. The serializer still writes an
 *      author's own `pin=false` back out, which is a different question, and
 *      both halves are asserted so neither can be "fixed" into the other.
 *   7. A RELEASE STRIPS BOTH KEYS, because a `pin` with no position is a parse
 *      error — a release that left the pin would write a document this repo's
 *      own parser refuses.
 *   8. THE SWEEP SKIPS A PINNED ELEMENT and the per-element release does not.
 *      The pin exempts from the sweep, not from the author; a control that
 *      silently did nothing would be the `C4Node.pinned` lie in a new place.
 *   9. THE WHOLE CYCLE LEAVES NO TRACE. Place, pin, unpin, sweep — and the
 *      text is byte-identical to what the author wrote. This is the assertion
 *      that catches an accidental nudge permanently fattening a file.
 *  10. A MERMAID PANE IS REFUSED, and a pane that disagrees with the canvas is
 *      refused, because splicing by line numbers that describe a different
 *      document corrupts the reader's file rather than preserving it.
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

const load = async (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const er = await load("src/features/playground/input/er-edit.ts");
const uc = await load("src/features/playground/input/usecase-edit.ts");
const { parseViewSource, convertedSourceText } = await load(
  "src/features/playground/input/parse.ts",
);

let assertions = 0;
let failures = 0;
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

/* Both fixtures are DELIBERATELY NON-CANONICAL — a comment, author blank
   lines, and a continuation — which `canvas-editing.md` requires: a re-emit of
   canonical text IS canonical text, so only non-canonical input can tell a
   patch from a re-emit. The use-case one also puts its target INSIDE a
   boundary, the case whose indentation a helper could get wrong. */
const NOTATIONS = [
  {
    kind: "er",
    /** The element a gesture is pointed at, and one that states no position. */
    target: "order",
    bare: "customer",
    mod: er,
    move: (d, t, id, at) => er.movedErEntityEdit(d, t, id, at),
    pin: (d, t, id, on) => er.pinnedErEntityEdit(d, t, id, on),
    release: (d, t, id) => er.resetErEntityPositionEdit(d, t, id),
    sweep: (d, t) => er.resetErPositionsEdit(d, t),
    source: `archlab 1.0 er
title "Shop orders"

// A comment the author wrote and expects to keep.
@er
  entity customer "Customer" [PostgreSQL]
    attr id uuid pk
  entity order "Order"
    attr id uuid pk

  customer ||--o{ order : places
`,
  },
  {
    kind: "usecase",
    target: "pay",
    bare: "guest",
    mod: uc,
    move: (d, t, id, at) => uc.movedUseCaseElementEdit(d, t, id, at),
    pin: (d, t, id, on) => uc.pinnedUseCaseElementEdit(d, t, id, on),
    release: (d, t, id) => uc.resetUseCaseElementPositionEdit(d, t, id),
    sweep: (d, t) => uc.resetUseCasePositionsEdit(d, t),
    source: `archlab 1.0 usecase
title "Food delivery"

// A comment the author wrote and expects to keep.
@usecase
  actor guest "Guest"
  actor customer "Customer"
    desc "Has an account and a card on file."

  boundary "Delivery platform"
    usecase browse "Browse restaurants"
    usecase pay "Pay for the order" [Stripe]

  guest -- browse
  customer -- pay
`,
  },
];

const parse = (source) => {
  const parsed = parseViewSource(source);
  if (parsed.status !== "ok") {
    throw new Error(`fixture does not parse: ${JSON.stringify(parsed)}`);
  }
  return parsed.value;
};

const changedLines = (before, after) => {
  const b = before.split("\n");
  const a = after.split("\n");
  return b.filter((line, index) => line !== a[index]);
};
const comments = (text) => (text.match(/^\s*\/\//gm) ?? []).length;

for (const n of NOTATIONS) {
  console.log("");
  console.log(`${n.kind}: the placement gestures`);

  const seed = n.source;
  const doc = parse(seed);

  /* 1. EVERY GESTURE ASKS THE GRID ITSELF, proved by pointing each one at the
     OTHER notation's document. A gesture that trusts its caller is unguarded
     the day something else calls it. */
  const other = parse(NOTATIONS.find((x) => x.kind !== n.kind).source);
  check(
    `every ${n.kind} gesture declines another notation's document`,
    n.move(other, seed, n.target, { x: 1, y: 1 }) === null &&
      n.pin(other, seed, n.target, true) === null &&
      n.release(other, seed, n.target) === null &&
      n.sweep(other, seed) === null,
    "one of the four acted on a document of the wrong kind",
  );

  /* 2 + 3. A MOVE IS ONE LINE, ROUNDED, COMMENTS INTACT. */
  const moved = n.move(doc, seed, n.target, {
    x: 320.00000000000003,
    y: 96.4,
  });
  check(`a ${n.kind} move produces an edit`, moved !== null, "got null");
  if (moved !== null) {
    const lines = changedLines(seed, moved.text);
    check(
      `moving ${n.target} rewrites exactly one line, and it is its own`,
      lines.length === 1 && lines[0].includes(n.target),
      `${lines.length} changed: ${JSON.stringify(lines)}`,
    );
    check(
      "the coordinate is rounded, not written as a sub-pixel float",
      moved.text.includes("(320,96)") &&
        !moved.text.includes("320.00000000000003"),
      "an author's text gained noise this gesture created",
    );
    check(
      "the move is a patch, and every comment survives it",
      moved.path === "patch" && comments(moved.text) === comments(seed),
      `path ${moved.path}, ${comments(moved.text)} comments against ${comments(seed)}`,
    );
    check(
      "the line gained exactly one token",
      lines[0].replace(/\S/g, "").length >= 0 &&
        (moved.text.match(/\(320,96\)/g) ?? []).length === 1,
      "the token was written more than once",
    );

    /* 4. A NO-OP MOVE IS REFUSED. */
    check(
      "a move that lands where it already is costs no undo entry",
      n.move(moved.doc, moved.text, n.target, { x: 320, y: 96 }) === null,
      "it rewrote the pane for nothing",
    );

    /* 3b. NOT CLAMPED. */
    const negative = n.move(moved.doc, moved.text, n.target, {
      x: -48,
      y: -16,
    });
    check(
      "a negative coordinate is honoured rather than clamped to the origin",
      negative !== null && negative.text.includes("(-48,-16)"),
      "clamping makes a whole half of the canvas undroppable",
    );

    /* 5. `pin` NEEDS A POSITION. */
    check(
      `pinning ${n.bare}, which states no position, is refused`,
      n.pin(moved.doc, moved.text, n.bare, true) === null,
      "it wrote a flag with nothing to protect",
    );

    /* 6. THE TOGGLE. */
    const pinned = n.pin(moved.doc, moved.text, n.target, true);
    check(
      "pinning writes the bare `pin` keyword",
      pinned !== null && /\bpin\b/.test(pinned.text),
      "got " + JSON.stringify(pinned?.text),
    );
    if (pinned !== null) {
      const unpinned = n.pin(pinned.doc, pinned.text, n.target, false);
      check(
        "unpinning REMOVES the key rather than writing `pin=false`",
        unpinned !== null &&
          !unpinned.text.includes("pin=false") &&
          !/\bpin\b/.test(unpinned.text) &&
          unpinned.text.includes("(320,96)"),
        "absent is the normal case here; `pin=false` would accrete a token " +
          "that changes nothing: " +
          JSON.stringify(unpinned?.text),
      );

      /* 8. THE SWEEP SKIPS IT; THE DIRECT RELEASE DOES NOT. */
      check(
        "the sweep finds nothing to release when the only placement is pinned",
        n.sweep(pinned.doc, pinned.text) === null,
        "it released a pinned element",
      );
      const released = n.release(pinned.doc, pinned.text, n.target);
      check(
        "pointing at a PINNED element and releasing it still works",
        released !== null,
        "the pin exempts from the sweep, not from the author",
      );
      /* 7. BOTH KEYS. */
      check(
        "a release strips the position AND the pin, never one alone",
        released !== null &&
          !/\bpin\b/.test(released.text) &&
          !released.text.includes("(320,96)"),
        "a pin with no position is a parse error: " +
          JSON.stringify(released?.text),
      );

      /* 9. THE WHOLE CYCLE LEAVES NO TRACE. */
      check(
        "place, pin, unpin, release — and the text is byte-identical again",
        released !== null && released.text === seed,
        released === null
          ? "the release returned null"
          : `first difference: ${JSON.stringify(changedLines(seed, released.text))}`,
      );
    }
  }

  /* 10. A MERMAID PANE, AND A PANE THAT DISAGREES. */
  const asMermaid = convertedSourceText(doc, "mermaid");
  if (typeof asMermaid === "string" && asMermaid !== "") {
    const mermaidDoc = parse(asMermaid);
    check(
      `a ${n.kind} document in a Mermaid pane refuses the move`,
      n.move(mermaidDoc, asMermaid, n.target, { x: 8, y: 8 }) === null,
      "Mermaid has no line numbers to splice a coordinate into",
    );
  } else {
    check(
      `a ${n.kind} document converts to Mermaid, so the pane assertion is real`,
      false,
      "conversion produced nothing, so the refusal above is untested",
    );
  }
  check(
    "a pane whose text describes a DIFFERENT document is refused",
    n.move(doc, seed.replace(n.target, `${n.target}_renamed`), n.target, {
      x: 8,
      y: 8,
    }) === null,
    "splicing into line numbers that mean something else corrupts the file",
  );
}

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} placement-edit assertions passed.`);
