#!/usr/bin/env node
/**
 * Home page hero check.
 *
 * THE HAZARD THIS EXISTS FOR is a class whose entire body is one
 * `animation-delay`. The hero shows every document kind by running ONE
 * keyframe on every panel and offsetting each by its own share of the cycle, so
 * `.af-hero-kind-2` … `-9` are single declarations — and a single declaration is
 * beaten by an inline style. The moment an element carrying a phase class is
 * also given a staged entrance with `style={delay(...)}`, it snaps back into
 * phase with the FIRST kind and two diagrams print on top of each other. That
 * shipped once, on the header's flow title. Nothing about it is a type error,
 * nothing about it throws, and the page still renders.
 *
 * So this asserts the WIRING, not the stylesheet:
 *
 *   1. The offsets are the cycle's own equal shares, read out of the duration
 *      rather than trusted as literals — changing the cycle length in one place
 *      cannot silently leave the delays describing a different cycle.
 *   2. A panel is only lit for its own share, and the fade windows do not
 *      overlap.
 *   3. Every kind is present four times over — panel, header subtitle, dot,
 *      name — because a kind that has a dot and no panel is a lit dot over
 *      somebody else's diagram.
 *   4. No element that carries a phase class carries an inline style. This is
 *      the one that catches the bug above.
 *   5. Reduced motion parks on exactly ONE complete diagram, not on the whole
 *      stack at once.
 *   6. The panels' artwork is inside the 350×336 box they share. Off-box
 *      coordinates are invisible rather than wrong-looking, which is how a
 *      whole illustration once shipped scaled off-screen.
 *
 * Run with: pnpm check:hero
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const globals = read("src/app/globals.css");
const hero = read("src/features/marketing/hero-diagram.tsx");

/** The kinds, in cycle order, and the class that offsets each. */
const KINDS = [
  { name: "C4", phase: null },
  { name: "Sequence", phase: "af-hero-kind-2" },
  { name: "Flowchart", phase: "af-hero-kind-3" },
  { name: "Use case", phase: "af-hero-kind-4" },
  { name: "ER", phase: "af-hero-kind-5" },
  { name: "Dictionary", phase: "af-hero-kind-6" },
  { name: "Gantt", phase: "af-hero-kind-7" },
  { name: "Timeline", phase: "af-hero-kind-8" },
  { name: "Lifecycle", phase: "af-hero-kind-9" },
];

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

/** The declarations of the first rule whose selector is exactly `selector`. */
function ruleBody(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"));
  return match === null ? null : match[1];
}

/* ---- 1. the offsets are the cycle's equal shares -------------------------- */

const cycleMatch = ruleBody(globals, ".af-hero-kind")?.match(
  /animation: af-hero-swap ([\d.]+)s/,
);

check("the swap cycle declares a duration", () => {
  assert.notEqual(cycleMatch, null, "no `animation: af-hero-swap <n>s` found");
});

const cycleSeconds = cycleMatch === null ? 0 : Number(cycleMatch[1]);

check(
  `every phase class is a negative ${KINDS.length}th of the ${cycleSeconds}s cycle`,
  () => {
    const share = cycleSeconds / KINDS.length;
    for (const [index, kind] of KINDS.entries()) {
      if (kind.phase === null) continue;
      const body = ruleBody(globals, `.${kind.phase}`);
      assert.notEqual(body, null, `.${kind.phase} has no rule`);
      const delay = Number(body.match(/animation-delay: (-?[\d.]+)s/)?.[1]);
      assert.equal(
        delay,
        -(index * share),
        `.${kind.phase} is offset ${delay}s, but kind ${index + 1} of ` +
          `${KINDS.length} sits at ${-(index * share)}s`,
      );
    }
  },
);

check("a phase class sets NOTHING but its delay", () => {
  for (const kind of KINDS) {
    if (kind.phase === null) continue;
    const declarations = ruleBody(globals, `.${kind.phase}`)
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part !== "");
    assert.deepEqual(
      declarations.map((part) => part.split(":")[0]),
      ["animation-delay"],
      `.${kind.phase} carries more than the offset: ${declarations.join("; ")}`,
    );
  }
});

/* ---- 2. one share lit, and no overlap ------------------------------------ */

check("a panel is lit for its own share of the cycle and no more", () => {
  const frame = globals.match(/@keyframes af-hero-swap \{([\s\S]*?)\n\}/)?.[1];
  assert.notEqual(frame, undefined, "no af-hero-swap keyframe");

  // EVERY stop, not only the ones a `{` follows: the keyframe groups its
  // percentages (`0%,\n 21.7% {`), so matching on the brace silently skips
  // half of them — which is exactly how this assertion first passed a cycle it
  // had mis-read.
  const stops = [...frame.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
  // Lit from 0, plateau ends, hidden, the next fade-in starts, restart.
  const [, litUntil, hiddenFrom, hiddenUntil] = stops;
  const share = 100 / KINDS.length;

  assert.ok(
    litUntil < share && hiddenFrom <= share,
    `the lit window runs to ${hiddenFrom}%, past this kind's ${share}% ` +
      `slot — two diagrams would be on screen at once`,
  );
  assert.ok(
    hiddenUntil > 100 - share,
    `the fade back in starts at ${hiddenUntil}%, more than one slot before ` +
      `the cycle restarts`,
  );
  assert.ok(
    frame.includes("visibility: hidden"),
    "the off frames stay `visible` — an invisible diagram would be " +
      "composited for every slot but its own",
  );
});

/* ---- 3. every kind is wired end to end ----------------------------------- */

check("every kind has a panel, a subtitle, a dot and a name", () => {
  for (const kind of KINDS) {
    assert.ok(
      hero.includes(`name: "${kind.name}"`),
      `${kind.name} is missing from the KINDS table, so it has no dot and ` +
        `no name in the header strip`,
    );
    if (kind.phase === null) continue;
    // Counted as QUOTED table values, not as bare occurrences of the name:
    // the file's own comments discuss these classes, and a comment mentioning
    // one is not a use of it.
    const entries = hero.match(new RegExp(`phase: "${kind.phase}"`, "g")) ?? [];
    assert.equal(
      entries.length,
      2,
      `${kind.phase} is a table value ${entries.length} time(s) — expected ` +
        `both KINDS (its dot and its name) and SUBTITLES (its header line)`,
    );
    assert.ok(
      new RegExp(`af-hero-kind ${kind.phase} absolute inset-0`).test(hero),
      `${kind.phase} has no panel wrapper, so its dot lights over another ` +
        `kind's diagram`,
    );
  }
});

check("every SVG panel component is rendered", () => {
  /* THE C4 PANEL IS ABSENT ON PURPOSE: it is HTML boxes written inline in the
     card, not a component, so there is nothing to name here. Every other kind
     draws through a function, and a panel that is defined and never mounted is
     a lit dot over somebody else's diagram — the same failure item 3 catches
     from the other end. */
  for (const component of [
    "SequencePanel",
    "FlowchartPanel",
    "UseCasePanel",
    "ErPanel",
    "DictPanel",
    "GanttPanel",
    "TimelinePanel",
    "LifecyclePanel",
  ]) {
    assert.ok(
      hero.includes(`<${component} />`),
      `<${component} /> is defined but never rendered`,
    );
  }
});

/* ---- 4. THE ONE THAT MATTERS: no inline delay on a phase element --------- */

check("no element carrying a phase class carries an inline style", () => {
  // Every JSX opening tag, whole. A phase class and a `style` prop inside the
  // same tag is the bug: the inline `animation-delay` wins and the element
  // runs in phase with the first kind.
  for (const [tag] of hero.matchAll(/<[a-zA-Z][^<>]*?>/gs)) {
    if (!/af-hero-kind-\d/.test(tag)) continue;
    assert.ok(
      !/\bstyle=/.test(tag),
      `an element is both offset and inline-styled, which cancels the ` +
        `offset:\n      ${tag.replace(/\s+/g, " ").slice(0, 160)}`,
    );
  }
  // The same trap, one level out: `cn(...)` composes the class, so the phase
  // may arrive from a variable. Those elements are checked above by tag too.
  assert.ok(
    !/style=\{delay\([^)]*\)\}\s+className=\{cn\(\s*"af-hero-kind /.test(hero),
    "a phase element receives `delay()` through cn() composition",
  );
});

/* ---- 5. reduced motion parks on ONE diagram ------------------------------ */

check("reduced motion parks on exactly one complete diagram", () => {
  /* The selector is DERIVED from KINDS, not spelled out. It used to be the
     literal `.af-hero-kind-2, .af-hero-kind-3, .af-hero-kind-4`, so adding a
     fifth kind made the pattern miss entirely — and `assert.notEqual(x, null)`
     passes for `undefined`, so the failure surfaced as a TypeError on the next
     line instead of as the real message. Both are fixed here: the list grows
     with the table, and the guard tests for a match rather than for null. */
  const others = KINDS.filter((kind) => kind.phase !== null).map(
    (kind) => `\\.${kind.phase}`,
  );
  const parked = globals.match(
    new RegExp(`${others.join(",\\s*")}\\s*\\{([^}]*)\\}`),
  )?.[1];
  assert.ok(
    parked !== undefined,
    `the other ${others.length} kinds are not parked together — expected a rule listing ${others.length} phase classes`,
  );
  assert.ok(
    parked.includes("opacity: 0") && parked.includes("visibility: hidden"),
    `the other ${others.length} keep their from-frame and stack on the C4 panel: ${parked}`,
  );
});

/* ---- 5b. the ER panel's connectors ATTACH to its tables ------------------ */

check("the ER panel derives its connectors from its table rects", () => {
  /* THE BUG THIS EXISTS FOR: the panel's paths and crow's feet were
     hand-written coordinates while its tables were placed by a SEPARATE set of
     hand-written coordinates. The two disagreed, so the dashed connector began
     at y=150 in a panel whose Customer table ends at y=78 — a line starting in
     mid-air, attached to nothing. It rendered, it stayed inside the box, and
     every other assertion here passed.

     Rather than re-deriving the geometry (which would be this check owning a
     second copy of the thing that went wrong), it asserts the panel has no
     literal path data at all: every `d` must be computed. A panel that
     computes its paths from its own rects cannot detach them. */
  const panel = hero.match(/function ErPanel\(\)[\s\S]*?\n\}/)?.[0];
  assert.notEqual(panel, undefined, "no ErPanel found");
  const literalPaths = panel.match(/d="M [\d.]/g) ?? [];
  assert.equal(
    literalPaths.length,
    0,
    `${literalPaths.length} hand-written path(s) in ErPanel — derive them from the table rects, or they will drift out of step with where the tables actually are`,
  );
  assert.ok(
    /const TABLES = \{/.test(panel) && /const link = \(/.test(panel),
    "ErPanel should place its tables in one table and derive the links from it",
  );
});

/* ---- 6. the new artwork is inside the box -------------------------------- */

const BOX = { w: 350, h: 336 };

check(`every flowchart node sits inside the ${BOX.w}×${BOX.h} box`, () => {
  const table = hero.match(/const FLOW_NODES[\s\S]*?\n\];/)[0];
  // Whitespace-tolerant on purpose: the table is prettier-formatted, and
  // whether it lands on one line per node or four is not this check's business.
  // A tighter pattern read zero nodes after a reformat and only the count
  // assertion below noticed — so the count stays, whatever the pattern.
  const rows = [
    ...table.matchAll(
      /cx:\s*(\d+),\s*cy:\s*(\d+),\s*w:\s*(\d+),\s*h:\s*(\d+)/g,
    ),
  ];
  assert.equal(rows.length, 6, `found ${rows.length} nodes, expected 6`);
  for (const [, cx, cy, w, h] of rows) {
    const [x, y, width, height] = [cx, cy, w, h].map(Number);
    assert.ok(
      x - width / 2 >= 0 && x + width / 2 <= BOX.w,
      `x out of box: ${x}`,
    );
    assert.ok(
      y - height / 2 >= 0 && y + height / 2 <= BOX.h,
      `y out of box: ${y}`,
    );
  }
});

check(`every path coordinate in the new panels is inside the box`, () => {
  const panels = hero.slice(hero.indexOf("const FLOW_NODES"));
  for (const [, body] of panels.matchAll(/d=[{"]?[`"]([^"`]+)[`"]/g)) {
    // Absolute path data only — every path in these two panels is written
    // absolute except the arrowhead legs, which are relative to a tip already
    // checked as part of its own path.
    if (/[lvhcqmastz]/.test(body)) continue;
    const numbers = [...body.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) =>
      Number(m[0]),
    );
    for (const value of numbers) {
      assert.ok(
        value >= 0 && value <= Math.max(BOX.w, BOX.h),
        `${value} in "${body}" is outside the box`,
      );
    }
  }
});

check("the new panels paint from theme tokens only", () => {
  const panels = hero.slice(hero.indexOf("const FLOW_NODES"));
  const literals =
    panels.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? [];
  assert.deepEqual(literals, [], `colour literals: ${literals.join(", ")}`);
  for (const token of ["--flow-", "--uc-", "--node-foreground"]) {
    assert.ok(
      panels.includes(`var(${token}`) || panels.includes(token),
      `the panels name no ${token} token, so a theme cannot repaint them`,
    );
  }
});

/* The card is shown on phones now, and it is still a fixed 384px wide — so the
   only thing keeping it inside a narrow viewport is the zoom factor in
   `.af-hero-fit`. Those two numbers were chosen against each other and live in
   different files, which is exactly the pairing that drifts: widening the card
   to `w-[28rem]` is a one-token edit that looks local and silently pushes the
   hero back off the side of a phone. Relational rather than pinned, so either
   number may move as long as the result still fits. */
check("the fitted card clears the gutters on the narrowest phone", () => {
  const REM = 16;
  /** iPhone SE / 13 mini, the smallest width still worth supporting. */
  const NARROWEST_VIEWPORT = 375;
  /** `px-5` on the hero section, both sides. */
  const GUTTERS = 2 * 20;

  const width = /af-hero-card relative w-(\d+)/.exec(hero);
  assert.ok(width !== null, "could not find the hero card's width class");
  const cardPx = (Number(width[1]) / 4) * REM;

  const rule = /\.af-hero-fit\s*\{\s*zoom:\s*([\d.]+);/.exec(globals);
  assert.ok(rule !== null, ".af-hero-fit does not set a zoom factor");
  const fitted = cardPx * Number(rule[1]);

  assert.ok(
    fitted + GUTTERS <= NARROWEST_VIEWPORT,
    `the card fits to ${fitted}px and needs ${fitted + GUTTERS}px of viewport, ` +
      `over the ${NARROWEST_VIEWPORT}px budget — lower the zoom or narrow the card`,
  );
});

/* `zoom` is load-bearing and reads like a stylistic choice, which is how it gets
   "modernised" into a transform. A transform does not affect layout, so the card
   would paint smaller and still reserve its full box, leaving a band of dead
   space under the hero that nobody would connect back to this edit. */
check("the fit scales the layout box, not just the paint", () => {
  const block = /\.af-hero-fit\s*\{([^}]*)\}/.exec(globals);
  assert.ok(block !== null, ".af-hero-fit is gone");
  assert.ok(
    !/transform|scale\(/.test(block[1]),
    "a transform leaves the card's layout box at full size — use zoom",
  );
});

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} hero assertions passed.`);
