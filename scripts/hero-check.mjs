#!/usr/bin/env node
/**
 * Home page hero check.
 *
 * THE HAZARD THIS EXISTS FOR is a class whose entire body is one
 * `animation-delay`. The hero shows all four document kinds by running ONE
 * keyframe on every panel and offsetting each by a quarter of the cycle, so
 * `.af-hero-kind-2/-3/-4` are single declarations — and a single declaration is
 * beaten by an inline style. The moment an element carrying a phase class is
 * also given a staged entrance with `style={delay(...)}`, it snaps back into
 * phase with the FIRST kind and two diagrams print on top of each other. That
 * shipped once, on the header's flow title. Nothing about it is a type error,
 * nothing about it throws, and the page still renders.
 *
 * So this asserts the WIRING, not the stylesheet:
 *
 *   1. The offsets are the cycle's own quarters, read out of the duration
 *      rather than trusted as literals — changing 26s in one place cannot
 *      silently leave three delays describing a different cycle.
 *   2. A panel is only lit for its own quarter, and the fade windows do not
 *      overlap.
 *   3. Every kind is present four times over — panel, header subtitle, dot,
 *      name — because a kind that has a dot and no panel is a lit dot over
 *      somebody else's diagram.
 *   4. No element that carries a phase class carries an inline style. This is
 *      the one that catches the bug above.
 *   5. Reduced motion parks on exactly ONE complete diagram, not on four
 *      stacked ones.
 *   6. Both new panels' artwork is inside the 350×336 box they share. Off-box
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

/* ---- 1. the offsets are the cycle's quarters ------------------------------ */

const cycleMatch = ruleBody(globals, ".af-hero-kind")?.match(
  /animation: af-hero-swap ([\d.]+)s/,
);

check("the swap cycle declares a duration", () => {
  assert.notEqual(cycleMatch, null, "no `animation: af-hero-swap <n>s` found");
});

const cycleSeconds = cycleMatch === null ? 0 : Number(cycleMatch[1]);

check(
  `every phase class is a negative quarter of the ${cycleSeconds}s cycle`,
  () => {
    const quarter = cycleSeconds / KINDS.length;
    for (const [index, kind] of KINDS.entries()) {
      if (kind.phase === null) continue;
      const body = ruleBody(globals, `.${kind.phase}`);
      assert.notEqual(body, null, `.${kind.phase} has no rule`);
      const delay = Number(body.match(/animation-delay: (-?[\d.]+)s/)?.[1]);
      assert.equal(
        delay,
        -(index * quarter),
        `.${kind.phase} is offset ${delay}s, but kind ${index + 1} of ` +
          `${KINDS.length} sits at ${-(index * quarter)}s`,
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

/* ---- 2. one quarter lit, and no overlap ---------------------------------- */

check("a panel is lit for its own quarter and no more", () => {
  const frame = globals.match(/@keyframes af-hero-swap \{([\s\S]*?)\n\}/)?.[1];
  assert.notEqual(frame, undefined, "no af-hero-swap keyframe");

  // EVERY stop, not only the ones a `{` follows: the keyframe groups its
  // percentages (`0%,\n 21.7% {`), so matching on the brace silently skips
  // half of them — which is exactly how this assertion first passed a cycle it
  // had mis-read.
  const stops = [...frame.matchAll(/([\d.]+)%/g)].map((m) => Number(m[1]));
  // Lit from 0, plateau ends, hidden, the next fade-in starts, restart.
  const [, litUntil, hiddenFrom, hiddenUntil] = stops;
  const quarter = 100 / KINDS.length;

  assert.ok(
    litUntil < quarter && hiddenFrom <= quarter,
    `the lit window runs to ${hiddenFrom}%, past this kind's ${quarter}% ` +
      `slot — two diagrams would be on screen at once`,
  );
  assert.ok(
    hiddenUntil > 100 - quarter,
    `the fade back in starts at ${hiddenUntil}%, more than one slot before ` +
      `the cycle restarts`,
  );
  assert.ok(
    frame.includes("visibility: hidden"),
    "the off frames stay `visible` — an invisible diagram would be " +
      "composited for three quarters of every cycle",
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

check("all four panel components are rendered", () => {
  for (const component of ["SequencePanel", "FlowchartPanel", "UseCasePanel"]) {
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
  const parked = globals.match(
    /\.af-hero-kind-2,\n\s*\.af-hero-kind-3,\n\s*\.af-hero-kind-4 \{([^}]*)\}/,
  )?.[1];
  assert.notEqual(parked, null, "the other three kinds are not parked at all");
  assert.ok(
    parked.includes("opacity: 0") && parked.includes("visibility: hidden"),
    `the other three keep their from-frame and stack on the C4 panel: ${parked}`,
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

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} hero assertions passed.`);
