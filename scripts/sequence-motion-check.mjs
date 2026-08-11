#!/usr/bin/env node
/**
 * Sequence idle-motion check.
 *
 * Idle motion uses ONE MECHANISM PER KIND, and the split is the thing most at
 * risk of being "simplified" back into a bug:
 *
 *   - Replies march their dash (React Flow's animated edge). Safe, because
 *     `..>` is dashed at rest anyway, so moving the pattern overwrites nothing.
 *   - Sync and async keep an unbroken SOLID line and a travelling highlight
 *     inside the line's own gradient instead. Marching them was tried and was
 *     wrong: giving a solid arrow a dasharray makes it read as async-or-reply,
 *     so the motion silently overwrote the message kind.
 *
 * What this asserts, and why each one is here rather than left to review:
 *
 *   1. Solid kinds are never given a dasharray while idle, and DO get the
 *      glint. This is the regression guard for the whole design.
 *   2. The reply's keyframes advance exactly its own dash period (a seamless
 *      loop), and `MARCH_PERIOD` agrees with the dasharray the stylesheet
 *      marches. CSS cannot import from TypeScript, so those numbers genuinely
 *      are duplicated; this asserts the duplication agrees.
 *   3. The glint's stagger divisor equals the STOP COUNT the renderer emits.
 *      Disagree and the highlight either never reaches the end of the line or
 *      jumps back before it does — an animation that still runs and still
 *      looks plausible, which is exactly what review misses.
 *   4. Reduced motion stops both mechanisms and parks each kind on the
 *      appearance that carries its meaning.
 *   5. No overlay path survives — the doubled-line bug four designs died on.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(root, relative), "utf8");

const css = read("src/features/sequence/styles/sequence-motion.css");
const motion = read("src/features/sequence/lib/motion.ts");
const diagram = read("src/features/sequence/components/sequence-diagram.tsx");
const globals = read("src/app/globals.css");

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

const glint = ruleBody(':not\\(\\[data-kind="reply"\\]\\)\\s*\\.af-seq-glint');
check("idle solid lines drive the glint", glint !== null);
check(
  "the glint runs forever, on the glint clock",
  glint !== null &&
    /animation-name:\s*af-seq-glint/.test(glint) &&
    /animation-iteration-count:\s*infinite/.test(glint) &&
    /var\(--seq-glint/.test(glint),
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

/* ---- 3. the glint's stagger matches the stop count ---------------------- */

const stops = diagram.match(/GLINT_STOPS\s*=\s*\[([^\]]*)\]/);
check("GLINT_STOPS is declared in the renderer", stops !== null);
const stopCount = stops === null ? null : stops[1].split(",").length;
check(
  "the stops span the whole line, sender to receiver",
  stops !== null && /^\s*0\s*,/.test(stops[1]) && /,\s*1\s*$/.test(stops[1]),
);

/*
 * The divisor is the STOP COUNT, not the count minus one. With N stops the
 * phases must be i/N so the last stop sits one step BEFORE the wrap; dividing
 * by N−1 gives the final stop a full-cycle delay, which puts it in phase with
 * stop 0 and lights both ends of the line simultaneously instead of travelling.
 */
const divisor = glint?.match(/var\(--glint-i[^)]*\)\s*\*[^/]*\/\s*(\d+)/);
check(
  "the glint stagger divides by the stop count — off by one and the light appears at both ends at once",
  divisor != null && stopCount !== null && Number(divisor[1]) === stopCount,
);

/*
 * THE SELECTOR MUST BE ABLE TO MATCH. The glint rule is a DESCENDANT selector
 * rooted at `.af-seq-msg`, so the gradient carrying the stops has to live
 * inside the message's own group. It shipped once in a shared top-level
 * <defs>, where the stops are not descendants of any message group: the rule
 * matched nothing, no error was raised anywhere, and the light simply never
 * ran. Everything else about that build was correct — the stops existed, the
 * vars were stamped, the keyframes were valid — which is exactly why this
 * needs an assertion rather than a reading.
 */
check(
  "the glint rule is scoped under .af-seq-msg (so it needs the gradient nested there)",
  /\.af-seq-msg\[data-idle\][^{]*\.af-seq-glint/.test(css),
);
check(
  "the renderer defines each message's gradient INSIDE the message group, where that selector can reach it",
  (() => {
    // Split on the Message component: everything before it is the diagram
    // shell, which owns the top-level <defs>. The glinting stops must appear
    // only after that boundary — i.e. inside the per-message subtree.
    const boundary = diagram.indexOf("function Message(");
    if (boundary < 0) return false;
    const shell = diagram.slice(0, boundary);
    const perMessage = diagram.slice(boundary);
    // The class as APPLIED, not merely mentioned: the shell legitimately
    // names it in a doc comment, and legitimately holds the participant CARD
    // gradients (which never glint).
    const applied = /className="af-seq-glint"/;
    return (
      !applied.test(shell) &&
      /<linearGradient/.test(perMessage) &&
      applied.test(perMessage)
    );
  })(),
);

const glintFrames = css.match(/@keyframes af-seq-glint\s*\{(.*?)\n\}/s);
check("the glint keyframes exist", glintFrames !== null);
check(
  "the glint returns to its base colour, so a stop's resting paint is the gradient's own",
  glintFrames !== null &&
    /100%\s*\{[^}]*stop-color:\s*var\(--glint-base\)/s.test(glintFrames[1]),
);
check(
  "the lit window is a short passing highlight, not the whole line pulsing",
  glintFrames !== null &&
    (() => {
      const lit = glintFrames[1].match(
        /(\d+)%\s*\{\s*stop-color:\s*var\(--glint-lit\)/,
      );
      return lit !== null && Number(lit[1]) <= 20;
    })(),
);

/* ---- the highlight is derived from its own base, in both themes --------- */

check(
  "the lit colour is the stop's OWN base brightened, not a fourth colour system",
  /--glint-lit":\s*`oklch\(from \$\{base\}/.test(diagram),
);
check(
  "the brightness shift is a theme token, defined in BOTH themes with opposite signs — 'brighter' is +L on dark and −L on light",
  (() => {
    const all = [...globals.matchAll(/--seq-glint-l:\s*(-?[\d.]+)/g)].map((m) =>
      Number(m[1]),
    );
    return all.length === 2 && all[0] * all[1] < 0;
  })(),
);

/* ---- 4. reduced motion parks on the MEANINGFUL appearance --------------- */

const reduced = css.match(
  /@media \(prefers-reduced-motion: reduce\)\s*\{(.*)\n\}/s,
);
check("the stylesheet has a reduced-motion block", reduced !== null);
check(
  "reduced motion stops the march AND the glint",
  reduced !== null &&
    /\.af-seq-line,[\s\S]{0,200}?\.af-seq-glint\s*\{[^}]*animation:\s*none/.test(
      reduced[1],
    ),
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
