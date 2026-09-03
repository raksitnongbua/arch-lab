#!/usr/bin/env node
/**
 * Paths check — the invariants that keep an authored walk both correct and
 * legible, in the manner `purpose.md` requires of every customisation surface.
 *
 * A path is the first feature here that spans the whole stack: it is grammar
 * (a document on disk), model (a field older readers must tolerate), and
 * presentation (three tiers of dim composed over the two the canvas already
 * had). Each half has a way of breaking that a diff does not show:
 *
 *   - the GRAMMAR can start accepting a walk that lights the wrong elements,
 *     which is silent — the diagram renders, just not the one the author
 *     wrote;
 *   - the OVERLAY can fork a fourth set of dim values. Nothing fails, and the
 *     canvas simply grows a second visual language for the same idea, which a
 *     reader has to learn.
 *
 * So the assertions here are RELATIONS and ERROR TEXTS, never restated
 * numbers: the tier values are compared between the two sources that spell
 * them, and the parse refusals are checked for the id they name rather than
 * for having thrown.
 *
 * Run with: pnpm check:paths
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* Same `@/*` + extensionless-relative resolver every other check that loads
   the real library uses (see `archtext-check.mjs`), so this script and the app
   exercise one implementation. */
registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(path.join(ROOT, "src", resolved.slice(2))).href;
    } else if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      context.parentURL !== undefined
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      if (!existsSync(asPath) || !statSync(asPath).isFile()) {
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

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

/**
 * Source with `//` and block comments removed.
 *
 * Every code assertion below reads this rather than the raw file, for
 * `canvas-chrome-check.mjs`'s reason: a regex matches prose as readily as
 * syntax, and these particular comments quote the very selectors and constants
 * being asserted — so a check reading the raw text could pass on the strength
 * of a sentence describing the rule after the rule itself was deleted.
 */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const { parseArchText } = await import("@/features/archtext/lib/parse.ts");
const { serializeArchText } =
  await import("@/features/archtext/lib/serialize.ts");

const canvasRaw = read("src/features/viewer/components/viewer-canvas.tsx");
const canvas = stripComments(canvasRaw);
const player = stripComments(
  read("src/features/viewer/components/viewer-path-player.tsx"),
);
const pill = stripComments(
  read("src/features/viewer/components/viewer-paths-pill.tsx"),
);
const constants = read("src/features/viewer/lib/canvas-constants.ts");
const shell = read("src/features/viewer/components/viewer-shell.tsx");

let assertions = 0;
let failures = 0;
function check(label, run) {
  assertions += 1;
  try {
    run();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
  }
}

/* ------------------------------------------------------------------------- */
/* 1. The grammar                                                            */
/* ------------------------------------------------------------------------- */

const BASE = `archlab 1.0
title "Paths check"

@context ctx "Root"
  a:person "A"
  b:system "B"
  c:external "C"

  a -> b : "asks"
  b -> a : "answers"
  b -> c : "calls" id=e-bc
`;

const WITH_PATHS = `${BASE}
  path send "The send path"
    beat "A asks B, and B answers"
      a -> b
    beat "B calls C, and A is still in the picture"
      b -> c ~e-bc
      a -> b

  path other "The other path"
    beat "C is reached from B"
      c -> b
`;

check("a document carrying paths round-trips byte-identically", () => {
  assert.equal(serializeArchText(parseArchText(WITH_PATHS)), WITH_PATHS);
});

check("a document carrying NO paths is emitted exactly as before", () => {
  assert.equal(serializeArchText(parseArchText(BASE)), BASE);
  assert.equal(parseArchText(BASE).diagrams[0].paths, undefined);
});

check(
  "a comment between two paths does not end the first or eat the second",
  () => {
    const commented = WITH_PATHS.replace(
      "  path other",
      "  // the other story\n  path other",
    );
    const ids = parseArchText(commented).diagrams[0].paths.map((p) => p.id);
    assert.deepEqual(ids, ["send", "other"]);
  },
);

check("author order is preserved, never sorted by id", () => {
  const ids = parseArchText(WITH_PATHS).diagrams[0].paths.map((p) => p.id);
  // "other" sorts before "send"; the emitted order must still be as written.
  assert.deepEqual(ids, ["send", "other"]);
  const emitted = serializeArchText(parseArchText(WITH_PATHS));
  assert.ok(
    emitted.indexOf("path send") < emitted.indexOf("path other"),
    "the serializer reordered the paths — a reader's menu is the author's " +
      "argument, and sorting rewrites it",
  );
});

/**
 * Every refusal, checked for the ID IT NAMES rather than for throwing. A
 * parser that threw the wrong error for the right input would satisfy
 * `assert.throws` forever, and the whole point of these messages is that they
 * name the thing the author has to go and fix.
 */
const REFUSALS = [
  [
    "a beat naming an absent element",
    '  path p "P"\n    beat "x"\n      a -> ghost\n',
    "beat names 'ghost'",
  ],
  [
    "a hop nothing joins",
    '  path p "P"\n    beat "x"\n      a -> c\n',
    "no relationship joins 'a' and 'c'",
  ],
  [
    "an anchor that is not on its hop",
    '  path p "P"\n    beat "x"\n      a -> b ~e-bc\n',
    "~e-bc does not join 'a' and 'b'",
  ],
  [
    "a duplicate path id",
    '  path p "P"\n    beat "x"\n      a -> b\n  path p "Q"\n    beat "y"\n      a -> b\n',
    'duplicate path id "p"',
  ],
  ["a path with no beats", '  path p "P"\n', "a path needs at least one beat"],
  [
    "a beat naming no relationship",
    '  path p "P"\n    beat "x"\n',
    "a beat must name at least one relationship",
  ],
  [
    "a chain of one element",
    '  path p "P"\n    beat "x"\n      a\n',
    "a chain of one element names no relationship",
  ],
  [
    "any arrow but ->",
    '  path p "P"\n    beat "x"\n      a <-> b\n',
    '"<->" is not allowed in a beat',
  ],
  [
    "a chain with no beat above it",
    '  path p "P"\n      a -> b\n',
    'no "beat" line is open above it',
  ],
  [
    "a node line indented into a path",
    '  path p "P"\n    d:person "D"\n',
    "is not allowed inside a path",
  ],
  [
    "an indent the grammar has no production for",
    '  path p "P"\n   beat "x"\n',
    "inconsistent indentation of 3 spaces",
  ],
];

for (const [what, tail, expected] of REFUSALS) {
  check(`refuses ${what}, naming it`, () => {
    let message = null;
    try {
      parseArchText(`${BASE}\n${tail}`);
    } catch (error) {
      message = error.message;
    }
    assert.ok(message !== null, "the parse succeeded — nothing was refused");
    assert.ok(
      message.includes(expected),
      `refused, but not for its own reason — wanted ${JSON.stringify(expected)}, got ${JSON.stringify(message)}`,
    );
  });
}

/* ------------------------------------------------------------------------- */
/* 2. The overlay borrows its depths — it does not fork a fourth set          */
/* ------------------------------------------------------------------------- */

/** The number a `const NAME = <n>;` declaration carries, from source. */
function constantIn(source, name) {
  const found = source.match(new RegExp(`const ${name} = ([\\d.]+);`))?.[1];
  assert.ok(
    found !== undefined,
    `${name} is no longer a named constant this can read`,
  );
  return Number(found);
}

/** The body of a named `useMemo`, from its declaration to its dependency array. */
function memoBody(source, name) {
  const start = source.indexOf(`const ${name} = useMemo`);
  assert.ok(start !== -1, `${name} is no longer a memo this can find`);
  const end = source.indexOf("\n  }, [", start);
  assert.ok(end !== -1, `${name}'s dependency array is no longer findable`);
  return source.slice(start, end);
}

check("the path overlay dims by the constants, not by fresh numbers", () => {
  const body = memoBody(canvas, "pathFocusCss");
  for (const name of [
    "DIM_NODE_OPACITY",
    "DIM_EDGE_OPACITY",
    "HOVER_DIM_NODE_OPACITY",
    "HOVER_DIM_EDGE_OPACITY",
  ]) {
    assert.ok(
      body.includes(`\${${name}}`),
      `pathFocusCss no longer interpolates ${name} — a spelled-out number ` +
        "here is a fourth dimming system nothing would notice",
    );
  }
  assert.doesNotMatch(
    body,
    /opacity: 0?\.\d/,
    "pathFocusCss spells an opacity as a literal; every depth it uses must " +
      "be one the canvas already owns",
  );
});

check(
  "the three tiers stay ordered: off-path deeper than the rest of the walk",
  () => {
    const off = constantIn(canvas, "DIM_NODE_OPACITY");
    const mid = constantIn(canvas, "HOVER_DIM_NODE_OPACITY");
    assert.ok(
      off < mid && mid < 1,
      `off-path ${off}, rest-of-walk ${mid} — the walk's own context must read ` +
        "as nearer than the diagram it is lifted out of",
    );
    const offEdge = constantIn(canvas, "DIM_EDGE_OPACITY");
    const midEdge = constantIn(canvas, "HOVER_DIM_EDGE_OPACITY");
    assert.ok(
      offEdge < midEdge && midEdge < 1,
      `the same must hold for connectors — got ${offEdge} and ${midEdge}`,
    );
  },
);

check("selection outranks the path: the overlay stands down under one", () => {
  const body = memoBody(canvas, "pathFocusCss");
  for (const state of [
    "detail !== null",
    "selectedNodeId !== null",
    "activeMultiIds !== null",
    "selectedFrameId !== null",
  ]) {
    assert.ok(
      body.includes(state),
      `pathFocusCss no longer stands down for ${state} — two dims re-aiming ` +
        "one opacity is the flicker the canvas has always guarded against",
    );
  }
});

check("the path outranks hover: the reveal stands down under a walk", () => {
  const body = memoBody(canvas, "hoverFocusCss");
  assert.ok(
    body.includes("activePath !== null"),
    "hoverFocusCss no longer names the active path in its guard — the cursor " +
      "could re-aim a dim the reader deliberately chose",
  );
});

check("the beat's nodes are marked, and the mark does not move", () => {
  const body = memoBody(canvas, "pathFocusCss");
  /* The ring is allowed and required: un-dimming alone reads as a difference
     in weight rather than a mark, and a reader scanning for "which ones am I
     being shown" had to compare instead of look. It is the multi-select's own
     static affordance, reused. */
  assert.match(
    body,
    /viewer-node-selected-ring/,
    "the beat's elements wear no mark — at a glance the walk then reads as " +
      "the diagram being slightly faded rather than as a set being shown",
  );
  /* What must never come back is MOTION. A beat's moving light is its
     connectors; N marching outlines would be N moving lights. */
  assert.doesNotMatch(
    body,
    /viewer-node-flow-|animation:/,
    "the path overlay animates a node — the beat's moving light is its " +
      "connectors, and N marching outlines is N moving lights",
  );
});

check("a boundary recedes with the elements inside it", () => {
  const body = memoBody(canvas, "pathFocusCss");
  assert.match(
    body,
    /data-frame-id=/,
    "the overlay no longer dims frames — a boundary left bright while its " +
      "members dim reads as the boundary being what is in focus, and on a " +
      "diagram with three namespaces it is most of the ink on screen",
  );
  const layer = read("src/features/editor/components/frame-layer.tsx");
  assert.ok(
    (layer.match(/data-frame-id=\{frame\.id\}/g) ?? []).length >= 2,
    "the frame layer stopped labelling both its box and its caption — the " +
      "overlay addresses frames by id, and a caption left behind stays lit " +
      "over a dimmed boundary",
  );
});

/* ------------------------------------------------------------------------- */
/* 3. Chrome: tokens only, gated, and inside the camera's budget             */
/* ------------------------------------------------------------------------- */

check("the path chrome introduces no colour of its own", () => {
  for (const [name, source] of [
    ["the player", player],
    ["the pill", pill],
  ]) {
    assert.doesNotMatch(
      source,
      /#[0-9a-fA-F]{3,8}\b|oklch\(|rgba?\(/,
      `${name} carries a colour literal — every theme is complete and ` +
        "contrast-measured, and a literal is outside all nine of them",
    );
  }
});

check("the player exists only while a walk is on", () => {
  assert.match(
    canvas,
    /walk !== null \? \([\s\S]{0,400}ViewerPathPlayer/,
    "the player is no longer gated on there being a walk — permanent prose " +
      "over the drawing is the hint strip this project already deleted once",
  );
});

check(
  "the beat's elements are lit from behind, without repainting them",
  () => {
    const aura = canvas.match(/const LIT_AURA =([\s\S]*?);\n/)?.[1] ?? "";
    assert.ok(aura !== "", "LIT_AURA is no longer a constant this can read");
    assert.match(
      aura,
      /var\(--primary\)/,
      "the aura no longer takes its colour from the theme's own token",
    );
    assert.doesNotMatch(
      aura,
      /#[0-9a-fA-F]{3,8}\b|rgba?\(/,
      "the aura carries a colour literal — nine themes, and a literal is " +
        "outside all of them",
    );
    /* Two shadows: a tight bright bloom over a wide faint one. One blur reads
       as a smudge at the edge; two read as light, which is the difference
       between an element that is lit and one that is outlined. */
    assert.equal(
      (aura.match(/color-mix\(/g) ?? []).length,
      2,
      "the aura is no longer layered — a single blur reads as a smudge at the " +
        "node's edge rather than as light behind it",
    );
    /* And no hard ring inside it: the span it hangs on already draws one, and
       a third edge inside the node's own border made a lit element look
       re-bordered rather than lit. */
    assert.doesNotMatch(
      aura,
      /0 0 0 \d/,
      "the aura carries a hard ring again — that is a third edge inside the " +
        "node's own border, and it reads as a repaint rather than as light",
    );
    const body = memoBody(canvas, "pathFocusCss");
    assert.ok(
      body.includes("litNodeCss("),
      "the beat's elements are no longer lit from behind — dimming alone tells " +
        "a reader which elements are NOT being shown, and never makes the ones " +
        "that are reach forward",
    );
    /* An SVG filter near this canvas is forbidden outright: a percentage filter
     region on a flat path painted bands across a whole diagram, and three
     commits went into chasing them. A box-shadow has no region to collapse. */
    assert.doesNotMatch(
      body,
      /filter:/,
      "the overlay reached for a filter — this canvas draws its soft edges with " +
        "shadows for a reason that cost three commits to learn",
    );
    /* Focus dims and lights; it does not repaint the notation. */
    assert.doesNotMatch(
      body,
      /\b(stroke|fill|border-width|stroke-width):/,
      "the overlay repaints a node — focus may dim and light, but a focused " +
        "element that restyles is a new border appearing where one already was",
    );
  },
);

/**
 * The aura arrived for a path, and would have been a fourth visual language if
 * it had stayed there. "This is the element I am showing you" is a claim
 * selection and multi-select already make, so all three light one thing.
 */
check("every state that marks an element lights the same aura", () => {
  assert.equal(
    (canvas.match(/const LIT_AURA =/g) ?? []).length,
    1,
    "the aura has more than one definition — two spellings of one light is " +
      "how the canvas ends up with a fourth visual language for an idea it " +
      "already had",
  );
  for (const memo of ["nodeFocusCss", "multiFocusCss", "pathFocusCss"]) {
    assert.ok(
      memoBody(canvas, memo).includes("litNodeCss("),
      `${memo} no longer lights the shared aura — a reader who focuses an ` +
        "element one way would get a different state from focusing it another",
    );
  }
  /* The single selection's aura sits OUTSIDE its motion split: a reader with
     motion off must not get a quieter selection than one with it on. */
  const selection = memoBody(canvas, "nodeFocusCss");
  const litAt = selection.indexOf("litNodeCss(");
  const splitAt = selection.indexOf("prefers-reduced-motion");
  assert.ok(
    litAt !== -1 && splitAt !== -1 && litAt < splitAt,
    "the selection's aura moved inside its motion split — one of the two " +
      "readers then gets a dimmer selection than the other for no reason " +
      "either of them chose",
  );
  /* Hover stays out of it, and has its own rule saying why. */
  assert.ok(
    !memoBody(canvas, "hoverFocusCss").includes("litNodeCss("),
    "hover lights the aura — a preview you get for free by moving the mouse " +
      "changes opacity and nothing else, or the canvas lights up under a " +
      "wandering cursor",
  );
});

check("the walk's control and the walk itself share one place", () => {
  const panel = canvas.match(
    /<Panel[^>]*position="bottom-center"[\s\S]*?<\/Panel>/,
  )?.[0];
  assert.ok(panel, "the bottom-centre panel is gone");
  for (const name of ["ViewerPathPlayer", "ViewerPathsPill"]) {
    assert.ok(
      panel.includes(name),
      `${name} left the bottom-centre panel — entering a path should expand a ` +
        "control in place, not send a reader hunting for a new one somewhere " +
        "else on the canvas",
    );
  }
  /* And it must NOT be back in the top-left stack, which already carries the
     breadcrumb and, on an unlocked canvas, the node palette. */
  const topLeft = canvas.match(
    /<Panel position="top-left"[\s\S]*?<\/Panel>/,
  )?.[0];
  assert.ok(topLeft, "the top-left panel is gone");
  assert.doesNotMatch(
    topLeft,
    /ViewerPathsPill/,
    "the paths control is back under the breadcrumb, where it stacks with the " +
      "node palette and answers a different question from the corner it is in",
  );
});

check("a diagram with no paths shows no path chrome at all", () => {
  assert.match(
    pill,
    /if \(paths\.length === 0\) return null;/,
    "the pill no longer renders nothing for a pathless diagram — a disabled " +
      "control offering a feature the document does not have is worse than " +
      "no control",
  );
});

check("the player's height stays inside the camera's bottom inset", () => {
  const inset = Number(constants.match(/bottom: "(\d+)px"/)?.[1]);
  assert.ok(
    Number.isFinite(inset),
    "FIT_PADDING.bottom is no longer a px literal this can read",
  );
  /* The player is two rows — a clamped 2-line caption and a control row — in
     a card with py-2. Measured generously: 2 × 20px caption + 28px controls +
     16px padding + 4px gap = 88px would already overflow, so the assertion is
     that the inset leaves room for the shape the component actually declares
     rather than for an arbitrary number. */
  assert.match(
    player,
    /line-clamp-2/,
    "the caption is no longer clamped, so the player has no bounded height " +
      `to fit inside the ${inset.toString()}px the camera reserves`,
  );
  /* The card's SHAPE must not depend on the sentence in it. It was `w-fit`
     with a clamped caption, so a shorter beat narrowed the card, bottom-centre
     re-centred it, and the Next button slid out from under the cursor between
     every step — a stepper whose step button moves when you press it. Both
     halves are pinned: a fixed width, and a caption box that reserves its
     second line whether or not the sentence needs it. */
  assert.match(
    player,
    /className="flex w-\[min\(/,
    "the player sized itself to its content again — the controls then move " +
      "between beats and Next walks away from the cursor",
  );
  assert.match(
    player,
    /min-h-\[[\d.]+rem\]/,
    "the caption no longer reserves both its lines, so a one-line beat " +
      "shortens the card and the control row jumps vertically",
  );
  assert.ok(
    inset >= 80,
    `FIT_PADDING.bottom is ${inset.toString()}px — too little for the player, ` +
      "which would then cover the last row of nodes the camera just framed",
  );
});

check(
  "the bottom inset's comment names the player, not the deleted strip",
  () => {
    assert.doesNotMatch(
      constants,
      /hint pill|hint strip/,
      "FIT_PADDING still justifies itself with the hint pill, which was deleted",
    );
    assert.match(
      constants,
      /path player/,
      "FIT_PADDING.bottom no longer says what is actually down there",
    );
  },
);

/* ------------------------------------------------------------------------- */
/* 4. Keys, the ladder, and reduced motion                                   */
/* ------------------------------------------------------------------------- */

check("a presentation remote steps the walk", () => {
  for (const key of ["PageDown", "PageUp"]) {
    assert.ok(
      player.includes(`"${key}"`),
      `the player no longer answers ${key} — that is what a clicker sends, ` +
        "and presenting from one is the feature's best argument",
    );
  }
});

check("the beat keys live in the player, not on the canvas", () => {
  assert.equal(
    (canvas.match(/window\.addEventListener\("keydown"/g) ?? []).length,
    2,
    "the canvas gained or lost a keydown listener — `check:canvas-edit` pins " +
      "it at two, and the beat keys belong to the player, which is mounted " +
      "only while they mean something",
  );
  assert.match(
    player,
    /window\.addEventListener\("keydown"/,
    "the player no longer owns its own keys",
  );
});

check("the beat keys stand down inside a form field", () => {
  assert.match(
    player,
    /TEXTAREA|isContentEditable/,
    "the player's keys no longer exempt form fields — an arrow typed into " +
      "the details panel would step the walk out from under the reader",
  );
});

check("Escape leaves the path between deselecting and climbing", () => {
  const ladder = canvas.slice(
    canvas.indexOf('if (event.key !== "Escape"'),
    canvas.indexOf('window.addEventListener("keydown", onKeyDown);'),
  );
  const deselect = ladder.indexOf("clearSelection()");
  const leave = ladder.indexOf("leavePath()");
  const climb = ladder.indexOf("climbTo(");
  assert.ok(
    deselect !== -1 && leave !== -1 && climb !== -1,
    "the Escape ladder no longer has all three rungs",
  );
  assert.ok(
    deselect < leave && leave < climb,
    "the rungs are out of order — most local first is what stops one press " +
      "doing two things to a presenter mid-story",
  );
  assert.match(
    shell,
    /a path is being walked → leave the path/,
    "the shell's documented ladder no longer records the path rung",
  );
});

check("Play is asked for, never offered", () => {
  assert.doesNotMatch(
    player,
    /useState\(true\)/,
    "the player autoplays on mount — the tour was cured of exactly this, and " +
      "a walk that starts moving unasked is the same mistake",
  );
});

/* ------------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(
    `${failures.toString()} of ${assertions.toString()} paths assertion(s) FAILED`,
  );
  process.exit(1);
}
console.log(`All ${assertions.toString()} paths assertions passed.`);
