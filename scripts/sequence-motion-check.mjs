#!/usr/bin/env node
/**
 * Sequence idle-motion check.
 *
 * Idle motion uses ONE MECHANISM PER KIND, and the split is the thing most at
 * risk of being "simplified" back into a bug:
 *
 *   - Replies march their dash (React Flow's animated edge). Safe, because
 *     `..>` is dashed at rest anyway, so moving the pattern overwrites nothing.
 *   - Sync and async keep an unbroken SOLID line and the C4 viewer's COMET
 *     travels over them instead. Marching them was tried and was wrong: giving
 *     a solid arrow a dasharray makes it read as async-or-reply, so the motion
 *     silently overwrote the message kind.
 *
 * What this asserts, and why each one is here rather than left to review:
 *
 *   1. Solid kinds are never given a dasharray while idle. This is the
 *      regression guard for the whole design.
 *   2. The reply's keyframes advance exactly its own dash period (a seamless
 *      loop), and `MARCH_PERIOD` agrees with the dasharray the stylesheet
 *      marches. CSS cannot import from TypeScript, so those numbers genuinely
 *      are duplicated; this asserts the duplication agrees.
 *   3. The comet still MATCHES the C4 viewer's — every band's dasharray, every
 *      keyframe pair and the clock are read out of the C4 stylesheet and
 *      compared. "Looks the same as C4" was a requirement, and a requirement
 *      met by copying once is a requirement that rots the first time either
 *      side is tuned.
 *   4. Reduced motion removes the comet rather than freezing it, and parks each
 *      kind on the appearance that carries its meaning.
 *   5. The head stays low-duty. The rule the earlier overlay designs broke was
 *      never "no overlay" but "no second LINE'S WORTH of stroke" — short bands
 *      are a highlight passing, long ones are a doubled line.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(root, relative), "utf8");

const css = read("src/features/sequence/styles/sequence-motion.css");
const motion = read("src/features/sequence/lib/motion.ts");
const diagram = read("src/features/sequence/components/sequence-diagram.tsx");

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

/** The body of the first rule whose selector matches `selectorPattern`. */
function ruleBody(selectorPattern) {
  const match = css.match(
    new RegExp(
      `\\[data-seq-march="on"\\][^{}]*${selectorPattern}[^{}]*\\{([^}]*)\\}`,
      "s",
    ),
  );
  return match === null ? null : match[1];
}

/** A named keyframes block's `from`/`to` stroke-dashoffset values. */
function dashoffsetRange(name) {
  const block = css.match(
    new RegExp(`@keyframes ${name}\\s*\\{(.*?)\\n\\}`, "s"),
  );
  if (block === null) return null;
  const from = block[1].match(/from\s*\{\s*stroke-dashoffset:\s*([\d.]+)/);
  const to = block[1].match(/to\s*\{\s*stroke-dashoffset:\s*([\d.]+)/);
  return from === null || to === null
    ? null
    : { from: Number(from[1]), to: Number(to[1]) };
}

/* ---- 1. the solid kinds stay solid, and glint --------------------------- */

const solidLine = ruleBody(
  ':not\\(\\[data-kind="reply"\\]\\)\\s*\\.af-seq-line',
);
check("there is a rule for idle solid lines", solidLine !== null);
check(
  "an idle SOLID line is given NO dash — a dashed sync arrow reads as async or reply",
  solidLine !== null && /stroke-dasharray:\s*none/.test(solidLine),
);
check(
  "an idle solid line has no dash ANIMATION either",
  solidLine !== null && !/animation-name/.test(solidLine),
);

const band = css.match(/\.af-seq-flow-band\s*\{([^}]*)\}/s);
check("the comet bands share one rule", band !== null);
check(
  "the bands run forever, on the comet clock",
  band !== null &&
    /animation-iteration-count:\s*infinite/.test(band[1]) &&
    /animation-duration:\s*var\(--seq-flow/.test(band[1]) &&
    /animation-timing-function:\s*linear/.test(band[1]),
);

/* ---- 2. the reply march's arithmetic ------------------------------------ */

const replyLine = ruleBody('\\[data-kind="reply"\\]\\s*\\.af-seq-line');
check("there is a rule for idle reply lines", replyLine !== null);

const replyDash = replyLine?.match(/stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/);
check(
  "a reply marches the SAME 6/5 it wears at rest, so the toggle never changes what a reply is",
  replyDash != null && Number(replyDash[1]) === 6 && Number(replyDash[2]) === 5,
);

const replyPeriod =
  replyDash == null ? null : Number(replyDash[1]) + Number(replyDash[2]);
const replyRange = dashoffsetRange("af-seq-march-dashed");
check(
  "the reply keyframes advance exactly one dash period (seamless loop)",
  replyRange !== null && replyRange.from === replyPeriod,
);
check(
  "the reply march counts down to zero (pattern travels source → target)",
  replyRange !== null && replyRange.to === 0,
);

const period = motion.match(
  /MARCH_PERIOD\s*=\s*\{\s*dashed:\s*([\d.]+)\s*\+\s*([\d.]+)\s*\}/,
);
check("MARCH_PERIOD declares the reply dash as dash + gap", period !== null);
if (period !== null && replyDash != null) {
  check(
    "MARCH_PERIOD.dashed is the dash the stylesheet actually marches",
    Number(period[1]) === Number(replyDash[1]) &&
      Number(period[2]) === Number(replyDash[2]),
  );
}
check(
  "MARCH_PERIOD has no `solid` entry — solid kinds must never be given a dash",
  period !== null && !/MARCH_PERIOD\s*=\s*\{[^}]*solid:/.test(motion),
);

const speed = motion.match(/idleMarchSpeed:\s*([\d.]+)/);
check("idleMarchSpeed is declared", speed !== null);
if (speed !== null && replyPeriod !== null) {
  const derived = Math.round((replyPeriod / Number(speed[1])) * 1000);
  const fallback = css.match(/var\(--seq-march-dashed,\s*(\d+)ms\)/);
  check(
    "the stylesheet's fallback duration equals period ÷ speed (no hitch before hydration)",
    fallback !== null && Number(fallback[1]) === derived,
  );
}

/* ---- 3. the comet IS the C4 viewer's comet ------------------------------- */

/*
 * "Same as the C4" is a requirement, so it is asserted against the C4 file
 * itself rather than copied once and trusted. Each band's dasharray and each
 * keyframe pair is read out of viewer/components/viewer-canvas.tsx and compared
 * with this stylesheet's. Tune either side alone and this fails — which is the
 * only way "the two look the same" survives contact with time.
 */
const c4 = read("src/features/viewer/components/viewer-canvas.tsx");

/** `stroke-dasharray` inside a named class rule, from either stylesheet. */
function dashOf(source, className) {
  const rule = source.match(
    new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`, "s"),
  );
  if (rule === null) return null;
  const dash = rule[1].match(/stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/);
  return dash === null ? null : `${dash[1]} ${dash[2]}`;
}

/** A keyframes block's from/to dashoffset pair, from either stylesheet. */
function offsetsOf(source, name) {
  const block = source.match(
    new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  if (block === null) return null;
  const from = block[1].match(/from\s*\{\s*stroke-dashoffset:\s*(-?[\d.]+)/);
  const to = block[1].match(/to\s*\{\s*stroke-dashoffset:\s*(-?[\d.]+)/);
  return from === null || to === null ? null : `${from[1]} to ${to[1]}`;
}

for (const band of ["glow", "tail", "head"]) {
  const ours = dashOf(css, `af-seq-flow-${band}`);
  const theirs = dashOf(c4, `viewer-edge-flow-${band}`);
  check(
    `the ${band} band's dasharray matches the C4 viewer's (${theirs ?? "?"})`,
    ours !== null && ours === theirs,
  );
  const ourOffsets = offsetsOf(css, `af-seq-flow-${band}`);
  const theirOffsets = offsetsOf(c4, `viewer-edge-flow-${band}`);
  check(
    `the ${band} band travels the C4 viewer's offsets (${theirOffsets ?? "?"})`,
    ourOffsets !== null && ourOffsets === theirOffsets,
  );
}

/*
 * The CLOCK is the one thing allowed to differ, and it must differ in one
 * direction only. C4 runs a single comet on the edge you just selected, where
 * brisk reads as responsive; this runs on every resting message at once, where
 * the same pace reads as busy. So: strictly slower, never faster, never equal —
 * an equal clock would mean someone "restored" the match by undoing the
 * slowdown, and a faster one is simply wrong for eleven at a time.
 */
check(
  "the comet is deliberately SLOWER than the C4 viewer's edgeFlow, never faster",
  (() => {
    const viewer = read("src/features/viewer/lib/motion.ts").match(
      /edgeFlow:\s*(\d+)/,
    );
    const ours = motion.match(/idleFlow:\s*(\d+)/);
    return (
      viewer !== null && ours !== null && Number(ours[1]) > Number(viewer[1])
    );
  })(),
);

check(
  "the bands are normalised with pathLength=100, so the dash maths are percentages of any path",
  /className="af-seq-flow-band[\s\S]{0,140}?pathLength=\{100\}/.test(diagram),
);

check(
  "the comet paints from the LINE'S OWN ramp, never --primary (this view's focus colour)",
  (() => {
    const rule = css.match(/\.af-seq-flow-band\s*\{([^}]*)\}/s);
    return (
      rule !== null &&
      /stroke:\s*var\(--seq-line-paint,\s*var\(--edge\)\)/.test(rule[1]) &&
      !/--primary/.test(rule[1])
    );
  })(),
);

check(
  "the head stays a LOW-DUTY band — the boundary between a passing highlight and a second line",
  (() => {
    const dash = dashOf(css, "af-seq-flow-head");
    if (dash === null) return false;
    const [on, off] = dash.split(" ").map(Number);
    return on / (on + off) <= 0.12;
  })(),
);

check(
  "the comet is DISPLAY-gated, not just animation-gated — three parked bands are stripes, not a resting state",
  /\.af-seq-flow\s*\{[^}]*display:\s*none/s.test(css) &&
    /\[data-seq-march="on"\][^{]*\.af-seq-flow\s*\{[^}]*display:\s*inline/s.test(
      css,
    ),
);

check(
  "the renderer omits the comet on replies and on the focused set",
  /idle && kind !== "reply" && paintId !== null/.test(diagram),
);

/* ---- 4. reduced motion parks on the MEANINGFUL appearance --------------- */

const reduced = css.match(
  /@media \(prefers-reduced-motion: reduce\)\s*\{(.*)\n\}/s,
);
check("the stylesheet has a reduced-motion block", reduced !== null);
check(
  "reduced motion stops the reply march",
  reduced !== null &&
    /\.af-seq-msg\[data-idle\]\s*\.af-seq-line\s*\{[^}]*animation:\s*none/s.test(
      reduced[1],
    ),
);
check(
  "reduced motion REMOVES the comet rather than freezing it — parked bands are bright stripes on every line",
  reduced !== null &&
    /\.af-seq-flow\s*\{[^}]*display:\s*none/s.test(reduced[1]),
);
check(
  "reduced motion puts replies BACK on 6/5 rather than withdrawing the dash — a dashless reply reads as a call, not a return",
  reduced !== null &&
    /\[data-kind="reply"\][^{]*\.af-seq-line\s*\{[^}]*stroke-dasharray:\s*6\s+5/s.test(
      reduced[1],
    ),
);
check(
  "reduced motion leaves the solid kinds solid",
  reduced !== null &&
    /:not\(\[data-kind="reply"\]\)[^{]*\.af-seq-line\s*\{[^}]*stroke-dasharray:\s*none/s.test(
      reduced[1],
    ),
);

/* ---- 5. one stroke per line, by construction ---------------------------- */

check(
  "no idle OVERLAY path survives — the doubled-line bug four designs died on",
  !/af-seq-idle/.test(diagram) && !/af-seq-idle/.test(css),
);
check(
  "pathLength is applied only while drawing, so the reply march keeps real-unit dashes",
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
