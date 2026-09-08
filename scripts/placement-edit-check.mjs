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
 *
 * AND ONE SECTION THAT IS NOT ABOUT PLACEMENT: the use-case canvas answers
 * `revise` as well, from the details dock it already opened to show an
 * element's `desc`. It lives here rather than in a script of its own because
 * it shares this file's fixture — the element whose indentation a wording
 * patch can get wrong is the same element inside the same boundary — and what
 * it proves is the same class of thing: an edit that becomes text, and text
 * that still means what it did. Its assertions are:
 *
 *  11. THE GESTURE ASKS THE GRID ITSELF, so the whole section is gated on the
 *      `revise` cell's own answer and proves the refusal while that cell
 *      refuses.
 *  12. A WORDING EDIT LEAVES A BOUNDARY MEMBER INSIDE ITS BOUNDARY. This is
 *      the failure a round trip cannot see: the pad is read off the block
 *      being replaced, and a re-derived one dedents a use case out of the
 *      system box while every serialiser assertion stays green.
 *  13. `id` AND `kind` ARE REFUSED. Both are spellable as extra keys on a
 *      revision object at runtime, and both would be a graph edit wearing a
 *      field edit's clothes — a rename detaches every line that names the
 *      element, and a kind change moves it across the boundary and rewrites
 *      what its edges mean.
 *  14. AN EMPTY LABEL IS REFUSED, because the parser refuses it: a reader who
 *      cleared the box would be left with an error over a diagram they could
 *      no longer edit.
 *  15. A WORDING EDIT CARRIES THE PLACEMENT KEYS. Rebuilding an element
 *      without them would run the release gesture from the wrong control.
 *
 * AND THE ER CANVAS ANSWERS `revise` TOO, from the detail panel it already
 * opened to name a table's joins. Same reason it lives here: same fixture,
 * same class of thing proved. What it asserts that the use-case section does
 * not is what an ER entity's id COSTS — every relationship line names it — and
 * what its columns are:
 *
 *  16. THE GESTURE ASKS THE GRID ITSELF, so this section is gated on the
 *      `revise` cell's own answer and proves the refusal while it refuses.
 *  17. A LINE PATCH, NOT A RE-EMIT: every comment and blank line survives.
 *  18. THE PATCHED TEXT RE-PARSES TO THE NEW WORDING, read off the adopted
 *      document rather than off the bytes, so a gesture that wrote text one
 *      way and handed back a model built another cannot pass.
 *  19. A NO-OP REVISE IS REFUSED, and an emptied box REMOVES its field.
 *  20. `id` AND `attributes` ARE REFUSED, both spellable as extra keys on a
 *      revision object at runtime. A rename leaves every relationship line
 *      pointing at a table that is no longer there; a column list would make
 *      a prose panel the second reader of the `attr` grammar.
 *  21. AN EMPTY LABEL IS REFUSED — whitespace included, because the
 *      serializer would quote it and draw a box with no name on it.
 *  22. A WORDING EDIT CARRIES THE PLACEMENT KEYS.
 *  23. A MERMAID PANE IS REFUSED, measured against `serializeMermaidEr`.
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
/* THE NEIGHBOURING CANVAS, for one assertion. `flowchart-edit.ts` is loaded
   by NO check script — `check:canvas-edit` pins the purity of its three
   siblings and never imports this one — so none of its nine gestures has a
   direct assertion, which is how the bug below shipped. This covers the one
   failure the ER and use-case wording gestures were built to avoid; the wider
   gap is bigger than this file. */
const flow = await load("src/features/playground/input/flowchart-edit.ts");
const uc = await load("src/features/playground/input/usecase-edit.ts");
const { canvasEditability } = await load(
  "src/features/playground/input/canvas-edit.ts",
);
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

/* ----------------------------------------------------------------------- */
/* The use-case wording gesture                                            */
/* ----------------------------------------------------------------------- */

console.log("");
console.log("usecase: the wording gesture");

const wording = NOTATIONS.find((n) => n.kind === "usecase");
const wordingSeed = wording.source;
const wordingDoc = parse(wordingSeed);
const revise = (d, t, id, fields) =>
  uc.revisedUseCaseElementEdit(d, t, id, fields);

/* 11. THE GESTURE ASKS THE GRID ITSELF, and this script asks it the same
   question rather than hard-coding the answer. While the `revise` cell
   refuses a use case there is exactly one thing to prove — that the gesture
   refuses too, at the gesture and not advisorily at the table. The moment the
   cell offers, everything below runs and a hand-typed expectation here would
   have been the stale claim `canvas-editing.md` spends a paragraph on. */
const offersWording = canvasEditability(wordingDoc, "revise").editable;
check(
  "the wording gesture agrees with the grid's own `revise` cell for a use case",
  (revise(wordingDoc, wordingSeed, "pay", { label: "Pay the courier" }) ===
    null) ===
    !offersWording,
  offersWording
    ? "the cell offers `revise` and the gesture still declined"
    : "the cell refuses `revise` and the gesture edited anyway",
);

if (offersWording) {
  check(
    "the wording gesture declines another notation's document",
    revise(
      parse(NOTATIONS.find((n) => n.kind === "er").source),
      wordingSeed,
      "pay",
      {
        label: "Pay the courier",
      },
    ) === null,
    "it acted on a document of the wrong kind",
  );

  const revised = revise(wordingDoc, wordingSeed, "pay", {
    label: "Pay the courier",
    technology: "Stripe",
    tags: ["checkout"],
    description: "Card on file, or cash at the door.",
  });
  check("a wording edit produces an edit", revised !== null, "got null");
  if (revised !== null) {
    const blanks = (text) => text.split("\n").filter((l) => l === "").length;
    check(
      "the wording edit is a patch, and every comment and blank line survives it",
      revised.path === "patch" &&
        comments(revised.text) === comments(wordingSeed) &&
        blanks(revised.text) === blanks(wordingSeed),
      `path ${revised.path}, ${comments(revised.text)} comments against ` +
        `${comments(wordingSeed)}, ${blanks(revised.text)} blank lines ` +
        `against ${blanks(wordingSeed)}`,
    );

    /* 12. STILL INSIDE ITS BOUNDARY. Read off the patched text's own
       indentation rather than off the model, because the model cannot say
       where the line sits — which is the whole reason the pad is read and not
       derived. */
    const payLine = revised.text
      .split("\n")
      .find((line) => line.includes("usecase pay"));
    check(
      "a wording edit leaves a boundary member INSIDE its boundary",
      payLine !== undefined && /^ {4}usecase pay/.test(payLine),
      `the line dedented out of the system box: ${JSON.stringify(payLine)}`,
    );

    check(
      "the patched text re-parses to the new wording",
      (() => {
        const element = revised.doc.file.elements.find((e) => e.id === "pay");
        return (
          element?.label === "Pay the courier" &&
          element.description === "Card on file, or cash at the door." &&
          element.tags?.join(" ") === "checkout"
        );
      })(),
      "the adopted document does not carry what the dock submitted",
    );

    /* 3. A NO-OP REVISE IS REFUSED, so a form submitted with nothing changed
       in it costs the reader no undo entry. */
    check(
      "a wording edit that changes nothing costs no undo entry",
      revise(revised.doc, revised.text, "pay", {
        label: "Pay the courier",
        technology: "Stripe",
        tags: ["checkout"],
        description: "Card on file, or cash at the door.",
      }) === null,
      "it rewrote the pane for nothing",
    );

    check(
      "an emptied field REMOVES it rather than writing an empty one",
      (() => {
        const cleared = revise(revised.doc, revised.text, "pay", {
          label: "Pay the courier",
        });
        return (
          cleared !== null &&
          !cleared.text.includes("[Stripe]") &&
          !cleared.text.includes("#checkout") &&
          !/\bdesc\b/.test(
            cleared.text.split("\n").find((l) => l.includes("usecase pay")) ??
              "",
          ) &&
          cleared.doc.file.elements.find((e) => e.id === "pay")?.technology ===
            undefined
        );
      })(),
      "a cleared box left the old value behind, or wrote an empty token",
    );
  }

  /* 13. `id` AND `kind` ARE REFUSED — spelled as the extra keys a caller can
     put on a revision object at runtime, which is the only way this refusal
     can be provoked at all now that the type omits them. */
  const smuggled = revise(wordingDoc, wordingSeed, "pay", {
    label: "Pay the courier",
    technology: "Stripe",
    id: "paid",
    kind: "actor",
  });
  check(
    "a revision cannot rename an element: `id` is refused",
    smuggled !== null &&
      !smuggled.text.includes("paid") &&
      smuggled.text.includes("usecase pay") &&
      smuggled.doc.file.elements.some((e) => e.id === "pay"),
    "a rename detaches every association and dependency line that names it",
  );
  check(
    "a revision cannot turn a use case into an actor: `kind` is refused",
    smuggled !== null &&
      !/\bactor pay\b/.test(smuggled.text) &&
      smuggled.doc.file.elements.find((e) => e.id === "pay")?.kind ===
        "usecase",
    "a kind change moves the symbol across the boundary and rewrites what " +
      "its edges mean",
  );

  /* 14. AN EMPTY LABEL. */
  check(
    "an empty label is refused rather than written",
    revise(wordingDoc, wordingSeed, "pay", { label: "" }) === null,
    "the parser refuses an empty element label, so this would leave an " +
      "error over a diagram the reader could no longer edit",
  );

  /* 15. THE PLACEMENT KEYS SURVIVE A WORDING EDIT. */
  const placed = uc.movedUseCaseElementEdit(wordingDoc, wordingSeed, "pay", {
    x: 320,
    y: 96,
  });
  const pinned =
    placed === null
      ? null
      : uc.pinnedUseCaseElementEdit(placed.doc, placed.text, "pay", true);
  check(
    "a wording edit carries the position and the pin rather than releasing them",
    (() => {
      if (pinned === null) return false;
      const next = revise(pinned.doc, pinned.text, "pay", {
        label: "Pay the courier",
        technology: "Stripe",
      });
      return (
        next !== null &&
        next.text.includes("(320,96)") &&
        /\bpin\b/.test(next.text)
      );
    })(),
    "retyping a caption ran the release gesture from the wrong control",
  );

  /* 10 again, for this gesture: A MERMAID PANE IS REFUSED. Measured against
     `serializeMermaidUseCase`, whose own caveat names an element's desc
     detail, [technology] and #tags among what the convention cannot hold — so
     the pane has no line numbers to splice into AND no slot for three of the
     four fields this form writes. */
  const asMermaid = convertedSourceText(wordingDoc, "mermaid");
  const mermaidDoc = parse(asMermaid);
  check(
    "a use-case document in a Mermaid pane refuses the wording edit",
    revise(mermaidDoc, asMermaid, "pay", { label: "Pay the courier" }) === null,
    "Mermaid holds no desc, [technology] or #tags for an element, so the " +
      "edit would show once and be lost on the next parse",
  );
} else {
  console.log(
    "  · the `revise` cell refuses a use case, so the wording assertions " +
      "below it are the refusal itself",
  );
}

/* ----------------------------------------------------------------------- */
/* The ER wording gesture                                                  */
/* ----------------------------------------------------------------------- */

console.log("");
console.log("er: the wording gesture");

const erSeed = NOTATIONS.find((n) => n.kind === "er").source;
const erDoc = parse(erSeed);
const erRevise = (d, t, id, fields) => er.revisedErEntityEdit(d, t, id, fields);

/* 16. THE GESTURE ASKS THE GRID ITSELF, and so does this section rather than
   hard-coding what the cell currently says. While the `revise` cell refuses an
   ER document there is exactly one thing to prove — that the gesture refuses
   too, at the gesture and not advisorily at the table. The moment the cell
   offers, everything below runs; a hand-typed expectation here would be the
   stale claim `canvas-editing.md` spends a paragraph on. */
const offersErWording = canvasEditability(erDoc, "revise").editable;
check(
  "the wording gesture agrees with the grid's own `revise` cell for an ER document",
  (erRevise(erDoc, erSeed, "order", { label: "Purchase order" }) === null) ===
    !offersErWording,
  offersErWording
    ? "the cell offers `revise` and the gesture still declined"
    : "the cell refuses `revise` and the gesture edited anyway",
);

if (offersErWording) {
  check(
    "the ER wording gesture declines another notation's document",
    erRevise(
      parse(NOTATIONS.find((n) => n.kind === "usecase").source),
      erSeed,
      "order",
      { label: "Purchase order" },
    ) === null,
    "it acted on a document of the wrong kind",
  );

  const erRevised = erRevise(erDoc, erSeed, "order", {
    label: "Purchase order",
    technology: "partitioned",
    tags: ["billing"],
    description: "One line per basket, kept for seven years.",
  });
  check("an ER wording edit produces an edit", erRevised !== null, "got null");
  if (erRevised !== null) {
    /* 17. A LINE PATCH, NOT A RE-EMIT — proved from the fixture's own
       non-canonical shape, because a re-emit of canonical text IS canonical
       text. The author's comment and their blank lines are what a re-emit ate
       once, so both are counted rather than the diff being eyeballed. */
    const erBlanks = (text) => text.split("\n").filter((l) => l === "").length;
    check(
      "the ER wording edit is a patch, and every comment and blank line survives it",
      erRevised.path === "patch" &&
        comments(erRevised.text) === comments(erSeed) &&
        erBlanks(erRevised.text) === erBlanks(erSeed),
      `path ${erRevised.path}, ${comments(erRevised.text)} comments against ` +
        `${comments(erSeed)}, ${erBlanks(erRevised.text)} blank lines against ` +
        `${erBlanks(erSeed)}`,
    );

    /* 18. THE PATCHED TEXT RE-PARSES TO THE NEW WORDING. Read off the adopted
       document rather than off the bytes: `adopt` re-parses, and a gesture
       that wrote text one way and handed back a model built another way is the
       two-halves-disagreeing failure `codebase.md` names. */
    check(
      "the patched ER text re-parses to the new wording",
      (() => {
        const entity = erRevised.doc.file.entities.find(
          (e) => e.id === "order",
        );
        return (
          entity?.label === "Purchase order" &&
          entity.technology === "partitioned" &&
          entity.description === "One line per basket, kept for seven years." &&
          entity.tags?.join(" ") === "billing"
        );
      })(),
      "the adopted document does not carry what the panel submitted",
    );

    /* 19. A NO-OP REVISE IS REFUSED, so a form submitted with nothing changed
       in it costs the reader no undo entry. */
    check(
      "an ER wording edit that changes nothing costs no undo entry",
      erRevise(erRevised.doc, erRevised.text, "order", {
        label: "Purchase order",
        technology: "partitioned",
        tags: ["billing"],
        description: "One line per basket, kept for seven years.",
      }) === null,
      "it rewrote the pane for nothing",
    );

    check(
      "an emptied ER field REMOVES it rather than writing an empty one",
      (() => {
        const cleared = erRevise(erRevised.doc, erRevised.text, "order", {
          label: "Purchase order",
        });
        const entity = cleared?.doc.file.entities.find((e) => e.id === "order");
        return (
          cleared !== null &&
          !cleared.text.includes("[partitioned]") &&
          !cleared.text.includes("#billing") &&
          entity?.technology === undefined &&
          entity.description === undefined &&
          entity.tags === undefined
        );
      })(),
      "a cleared box left the old value behind, or wrote an empty token",
    );
  }

  /* 20. `id` AND `attributes` ARE REFUSED — spelled as the extra keys a caller
     can put on a revision object at runtime, which is the only way this
     refusal can be provoked now that the type omits them. A rename would
     detach every relationship line that names the entity; a column list would
     make a prose panel the second reader of the `attr` grammar. */
  const erSmuggled = erRevise(erDoc, erSeed, "order", {
    label: "Purchase order",
    id: "purchase_order",
    attributes: [],
  });
  check(
    "an ER revision cannot rename an entity: `id` is refused",
    erSmuggled !== null &&
      !erSmuggled.text.includes("purchase_order") &&
      /\bentity order\b/.test(erSmuggled.text) &&
      erSmuggled.doc.file.entities.some((e) => e.id === "order"),
    "a rename leaves every relationship line pointing at a table that is " +
      "no longer there",
  );
  check(
    "an ER revision cannot drop a column: `attributes` is refused",
    erSmuggled !== null &&
      erSmuggled.text.includes("attr id uuid pk") &&
      erSmuggled.doc.file.entities.find((e) => e.id === "order")?.attributes
        ?.length === 1,
    "the panel edits prose; a column is its own line with its own syntax",
  );

  /* 21. AN EMPTY LABEL IS REFUSED, because the parser refuses it ("the entity
     label must not be empty"): a reader who cleared the box would be left with
     an error over a diagram they could no longer edit. Whitespace counts —
     `entity order " "` parses and draws a box with no name on it. */
  /* A THROW IS A FAILURE, NOT AN ESCAPE. `serializeErText` refuses an empty
     label by THROWING, so a gesture that stopped guarding it would take the
     page down from the panel's Apply rather than dropping the edit — and an
     assertion that let the throw escape would kill this script before its own
     line was printed, which is one of the five ways an assertion here has
     already failed to fail. */
  const refusesLabel = (label) => {
    try {
      return erRevise(erDoc, erSeed, "order", { label }) === null
        ? true
        : "it wrote the edit";
    } catch (error) {
      return `it threw instead of refusing: ${error.message}`;
    }
  };
  const emptyLabel = refusesLabel("");
  const blankLabel = refusesLabel("   ");
  check(
    "an empty ER label is refused rather than written",
    emptyLabel === true && blankLabel === true,
    `empty: ${emptyLabel}; whitespace: ${blankLabel}`,
  );

  /* 22. THE PLACEMENT KEYS SURVIVE A WORDING EDIT. The block patch respells
     the whole declaration line, so an entity rebuilt from the revision alone
     comes back released — retyping a caption would have run the release
     gesture from the wrong control, a gesture the reader last used elsewhere. */
  const erPlaced = er.movedErEntityEdit(erDoc, erSeed, "order", {
    x: 320,
    y: 96,
  });
  const erPinned =
    erPlaced === null
      ? null
      : er.pinnedErEntityEdit(erPlaced.doc, erPlaced.text, "order", true);
  check(
    "an ER wording edit carries the position and the pin rather than releasing them",
    (() => {
      if (erPinned === null) return false;
      const next = erRevise(erPinned.doc, erPinned.text, "order", {
        label: "Purchase order",
      });
      return (
        next !== null &&
        next.text.includes("(320,96)") &&
        /\bpin\b/.test(next.text)
      );
    })(),
    "retyping a caption ran the release gesture from the wrong control",
  );

  /* 23. A MERMAID PANE IS REFUSED, and the refusal is MEASURED against
     `serializeMermaidEr` rather than assumed: that emitter writes an entity as
     its id, an optional `["Label"]` alias and its columns, and nothing else —
     `MERMAID_ER_EXPORT_CAVEAT` names the `[technology]`, the `#tags` and the
     entity's own description as what `erDiagram` has nowhere to put, because
     its only comment slot is on a COLUMN. Three of the four fields this panel
     writes would show once and be gone on the next parse. */
  const erAsMermaid = convertedSourceText(erDoc, "mermaid");
  const erMermaidDoc = parse(erAsMermaid);
  check(
    "an ER document in a Mermaid pane refuses the wording edit",
    erRevise(erMermaidDoc, erAsMermaid, "order", {
      label: "Purchase order",
    }) === null,
    "Mermaid erDiagram holds no description, [technology] or #tags for an " +
      "entity, so the edit would show once and be lost on the next parse",
  );
} else {
  console.log(
    "  · the `revise` cell refuses an ER document, so the wording " +
      "assertions below it are the refusal itself",
  );
}

/* --------------------------------------------------------------------- */

console.log("");
console.log("flowchart: a wording edit keeps the position (the bug next door)");

{
  /* WHY THIS LIVES HERE. The ER and use-case wording gestures carry their
     `position` and `pin` through a revision on purpose, because a block patch
     respells the whole declaration line and a rebuilt element without them
     would run the RELEASE gesture from the wording control. Writing that
     assertion is what found the same bug already shipped next door:
     `revisedFlowNodeEdit` rebuilt its node without `position`, so retyping a
     step's caption deleted its `(x,y)` and the node jumped back to where the
     solver wanted it. It is asserted beside its siblings rather than in a
     script of its own because this is where it was found. */
  const PINNED = `archlab 1.0 flowchart
title "Checkout"

// A comment the author wrote.
@flowchart
  start begin "Start"
  step pay "Take payment" (320,96)

  begin -> pay
`;
  const doc = parse(PINNED);
  const revised = flow.revisedFlowNodeEdit(doc, PINNED, "pay", {
    label: "Charge the card",
  });
  check(
    "a flowchart wording edit produces an edit, so the assertion is real",
    revised !== null,
    "got null — the fixture or the guard changed",
  );
  if (revised !== null) {
    check(
      "retyping a pinned step's label KEEPS its (x,y)",
      revised.text.includes("(320,96)") &&
        revised.text.includes('"Charge the card"'),
      "the wording control ran the release gesture: " +
        JSON.stringify(
          revised.text.split("\n").find((line) => line.includes("pay")),
        ),
    );
    check(
      "and it stays a one-line patch that keeps the author's comment",
      comments(revised.text) === comments(PINNED) &&
        revised.text.split("\n").length === PINNED.split("\n").length,
      "the edit rewrote more than the step's own line",
    );
  }
}

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} placement-edit assertions passed.`);
