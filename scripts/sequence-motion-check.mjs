#!/usr/bin/env node
/**
 * Sequence idle-march coupling check.
 *
 * The marching dash — React Flow's animated-edge technique on the message
 * line itself — spreads ONE fact across three files, and nothing but a
 * comment has been holding them together:
 *
 *   1. `MARCH_PERIOD` in src/features/sequence/lib/motion.ts, which derives
 *      each kind's animation DURATION from the shared march speed.
 *   2. The `stroke-dasharray` each kind marches, in sequence-motion.css.
 *   3. The `from` offset of that kind's keyframes, also in the stylesheet —
 *      one whole period, so the loop is seamless.
 *
 * If those drift the failure is quiet and ugly rather than loud: a dasharray
 * whose keyframe advances the wrong distance still animates, it just jumps
 * every cycle, and nobody reads a stylesheet looking for arithmetic. A
 * mismatched duration is worse — the two kinds march at visibly different
 * speeds and it reads as a rendering bug.
 *
 * Why a text check rather than an imported constant: CSS cannot import from
 * TypeScript, so the numbers genuinely are duplicated. This asserts the
 * duplication agrees.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(
  join(root, "src/features/sequence/styles/sequence-motion.css"),
  "utf8",
);
const motion = readFileSync(
  join(root, "src/features/sequence/lib/motion.ts"),
  "utf8",
);

let assertions = 0;
let failures = 0;
const check = (label, ok) => {
  assertions += 1;
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
};

/* ---- what the stylesheet marches ---------------------------------------- */

/** The dasharray inside the rule that marches `kind`. */
function marchedDash(kindSelector) {
  const rule = css.match(
    new RegExp(
      `\\[data-seq-march="on"\\][^{]*${kindSelector}[^{]*\\{([^}]*)\\}`,
      "s",
    ),
  );
  if (rule === null) return null;
  const dash = rule[1].match(/stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/);
  return dash === null ? null : [Number(dash[1]), Number(dash[2])];
}

/** The `from` offset of a named keyframes block. */
function keyframeFrom(name) {
  const block = css.match(
    new RegExp(`@keyframes ${name}\\s*\\{(.*?)\\n\\}`, "s"),
  );
  if (block === null) return null;
  const from = block[1].match(/from\s*\{\s*stroke-dashoffset:\s*([\d.]+)/);
  return from === null ? null : Number(from[1]);
}

const solidDash = marchedDash('\\:not\\(\\[data-kind="reply"\\]\\)');
const replyDash = marchedDash('\\[data-kind="reply"\\]');

check("the stylesheet marches a dash on the solid kinds", solidDash !== null);
check("the stylesheet marches a dash on replies", replyDash !== null);

/* ---- 1 & 3: keyframes advance exactly one period ------------------------ */

const solidPeriod = solidDash === null ? null : solidDash[0] + solidDash[1];
const replyPeriod = replyDash === null ? null : replyDash[0] + replyDash[1];

check(
  "the solid keyframes advance exactly one dash period (seamless loop)",
  keyframeFrom("af-seq-march-solid") === solidPeriod,
);
check(
  "the reply keyframes advance exactly one dash period (seamless loop)",
  keyframeFrom("af-seq-march-dashed") === replyPeriod,
);
/** The `to` offset of a named keyframes block. */
function keyframeTo(name) {
  const block = css.match(
    new RegExp(`@keyframes ${name}\\s*\\{(.*?)\\n\\}`, "s"),
  );
  if (block === null) return null;
  const to = block[1].match(/to\s*\{\s*stroke-dashoffset:\s*([\d.]+)/);
  return to === null ? null : Number(to[1]);
}

check(
  "both marches count the offset down to zero (pattern travels source → target)",
  keyframeTo("af-seq-march-solid") === 0 &&
    keyframeTo("af-seq-march-dashed") === 0,
);

/* ---- 2: motion.ts's periods match the marched dashes -------------------- */

const period = motion.match(
  /MARCH_PERIOD\s*=\s*\{\s*solid:\s*([\d.]+)\s*\+\s*([\d.]+),\s*dashed:\s*([\d.]+)\s*\+\s*([\d.]+)/,
);
check("MARCH_PERIOD is declared as dash + gap per kind", period !== null);
if (period !== null) {
  check(
    "MARCH_PERIOD.solid is the dash the stylesheet marches on solid kinds",
    Number(period[1]) === solidDash?.[0] &&
      Number(period[2]) === solidDash?.[1],
  );
  check(
    "MARCH_PERIOD.dashed is the dash the stylesheet marches on replies",
    Number(period[3]) === replyDash?.[0] &&
      Number(period[4]) === replyDash?.[1],
  );
}

/* ---- the stylesheet's fallback durations match the derived ones ---------- */

/*
 * The CSS carries a literal fallback for each duration var, for the frames
 * before the viewer stamps them. A fallback that disagrees with what
 * motion.ts derives means the pre-hydration march runs at a different speed
 * than the hydrated one — a visible hitch on load, and invisible in review.
 */
const speed = motion.match(/idleMarchSpeed:\s*([\d.]+)/);
check("idleMarchSpeed is declared", speed !== null);
if (speed !== null && solidPeriod !== null && replyPeriod !== null) {
  const derived = (p) => Math.round((p / Number(speed[1])) * 1000);
  const fallback = (name) => {
    const m = css.match(
      new RegExp(`var\\(--seq-march-${name},\\s*(\\d+)ms\\)`),
    );
    return m === null ? null : Number(m[1]);
  };
  check(
    "the solid fallback duration equals period ÷ speed",
    fallback("solid") === derived(solidPeriod),
  );
  check(
    "the reply fallback duration equals period ÷ speed",
    fallback("dashed") === derived(replyPeriod),
  );
  check(
    "both kinds march at the SAME speed — a shared duration would make the shorter pattern crawl",
    derived(solidPeriod) / solidPeriod === derived(replyPeriod) / replyPeriod,
  );
}

/* ---- the reply's resting pattern is the one it marches ------------------ */

check(
  "a reply marches the SAME 6/5 it wears at rest, so the toggle never changes what a reply is",
  replyDash !== null && replyDash[0] === 6 && replyDash[1] === 5,
);
check(
  "the solid kinds march a high-duty dash (reads as a moving line, not a dashed one)",
  solidDash !== null && solidDash[0] / (solidDash[0] + solidDash[1]) >= 0.6,
);

/* ---- reduced motion parks on the SEMANTIC pattern ----------------------- */

const reducedBlock = css.match(
  /@media \(prefers-reduced-motion: reduce\)\s*\{(.*)\n\}/s,
);
check("the stylesheet has a reduced-motion block", reducedBlock !== null);
check(
  "reduced motion stops the march",
  reducedBlock !== null &&
    /\[data-seq-march="on"\][^{]*\.af-seq-line\s*\{[^}]*animation:\s*none/s.test(
      reducedBlock[1],
    ),
);
check(
  "reduced motion puts replies BACK on 6/5 rather than withdrawing the dash — a dashless reply reads as a call, not a return",
  reducedBlock !== null &&
    /\[data-kind="reply"\][^{]*\.af-seq-line\s*\{[^}]*stroke-dasharray:\s*6\s+5/s.test(
      reducedBlock[1],
    ),
);
check(
  "reduced motion leaves the solid kinds solid",
  reducedBlock !== null &&
    /:not\(\[data-kind="reply"\]\)[^{]*\.af-seq-line\s*\{[^}]*stroke-dasharray:\s*none/s.test(
      reducedBlock[1],
    ),
);

/* ---- one stroke per line, by construction ------------------------------- */

const diagram = readFileSync(
  join(root, "src/features/sequence/components/sequence-diagram.tsx"),
  "utf8",
);
check(
  "no idle OVERLAY path survives — the doubled-line bug four designs died on",
  !/af-seq-idle/.test(diagram) && !/af-seq-idle/.test(css),
);
check(
  "pathLength is applied only while drawing, so the march keeps real-unit dashes",
  /animateRank !== null \? \{ pathLength: 1 \} : \{\}/.test(diagram),
);

/* ---- the paint stays in the cascade ------------------------------------- */

check(
  "the line's gradient is stamped as a custom property, never as an inline stroke (an inline stroke would outrank the focus rule)",
  /"--seq-line-paint": `url\(#\$\{paintId\}\)`/.test(diagram) &&
    !/\bstroke=\{`url\(#\$\{paintId\}\)`\}/.test(diagram),
);
check(
  "the resting line paints through the var with an --edge fallback",
  /stroke:\s*var\(--seq-line-paint,\s*var\(--edge\)\)/.test(css),
);
check(
  "the focus rule still overrides the gradient with --primary",
  /\.af-seq-msg\[data-focused="true"\]\s*\.af-seq-line\s*\{[^}]*stroke:\s*var\(--primary\)/s.test(
    css,
  ),
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} sequence-motion assertions passed.`);
