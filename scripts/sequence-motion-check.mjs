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

/* ---- 2b. the opening settle ---------------------------------------------- */

/*
 * The settle is the one animation that plays BEFORE hydration, which makes its
 * two guarantees worth pinning rather than trusting:
 *
 *   - The duration has one source of truth. The stylesheet's fallback is what
 *     actually runs at first paint (the `--seq-*` properties arrive on mount),
 *     so a change to `enter:` in lib/motion.ts that forgot the fallback would
 *     silently keep the old timing forever.
 *   - Reduced motion is honoured WITHOUT JS. A 0ms custom property cannot
 *     suppress an animation that already played, so the rule has to sit inside
 *     `prefers-reduced-motion: no-preference` — a reader who asked for no
 *     motion must get none on the very first frame.
 */
const enter = motion.match(/enter:\s*(\d+)/);
check("SEQUENCE_DURATIONS declares the opening settle", enter !== null);

const enterFallback = css.match(
  /animation:\s*af-seq-enter\s+var\(--seq-enter,\s*(\d+)ms\)/,
);
check(
  "the stylesheet's settle fallback equals SEQUENCE_DURATIONS.enter (it is what runs before hydration)",
  enter !== null &&
    enterFallback !== null &&
    Number(enterFallback[1]) === Number(enter[1]),
);

check(
  "the settle is gated on `prefers-reduced-motion: no-preference`, so it cannot play for a reader who declined motion",
  /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^}]*\.af-seq-svg\s*\{[^}]*af-seq-enter/s.test(
    css,
  ),
);

check(
  "the settle animates opacity and transform only — never a layout property",
  (() => {
    const frames = css.match(/@keyframes af-seq-enter\s*\{(.*?)\n\}/s);
    if (frames === null) return false;
    const properties = [...frames[1].matchAll(/^\s{4}([a-z-]+):/gm)].map(
      (m) => m[1],
    );
    return (
      properties.length > 0 &&
      properties.every((p) => p === "opacity" || p === "transform")
    );
  })(),
);

check(
  "the settle does not stage content — one rule, on the drawing root, not per message",
  !/af-seq-enter[^}]*--seq-rank/s.test(css) &&
    !/\.af-seq-msg[^{]*\{[^}]*af-seq-enter/s.test(css),
);

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
  "the comet is painted AFTER the line it rides — SVG has no z-index",
  (() => {
    // The bug this catches shipped: with the flow group before the line, the
    // 1.5px stroke covered its own comet and only the blurred glow bled past
    // the edges, so the motion read as a faint smudge. Everything else about
    // it was correct — the bands existed, the CSS matched C4, the animation
    // ran — which is exactly why source order needs an assertion rather than
    // a reading.
    const line = diagram.indexOf('className="af-seq-line af-seq-draw"');
    const flow = diagram.indexOf('className="af-seq-flow"');
    return line > 0 && flow > 0 && flow > line;
  })(),
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

/* ---- 4. one idle-motion switch, honoured by BOTH viewers ----------------- */

/*
 * The reader's toggle is one preference for the whole app, not one per route:
 * "stop the diagrams moving" is a statement about diagrams. That only holds if
 * both viewers read the same module and gate on the same attribute, so it is
 * asserted across all three files rather than left to convention.
 */
const idleModule = read("src/lib/idle-motion.ts");
const shell = read("src/features/viewer/components/viewer-shell.tsx");
const seqViewer = read("src/features/sequence/components/sequence-viewer.tsx");

check(
  "the preference and the OS query both live in the shared module",
  /export function useIdleMotion/.test(idleModule) &&
    /export function useReducedMotion/.test(idleModule) &&
    /export function idleMotionState/.test(idleModule),
);

check(
  "neither viewer keeps a private copy of the reduced-motion hook",
  !/function useReducedMotion/.test(shell) &&
    !/function useReducedMotion/.test(seqViewer),
);

for (const [label, source] of [
  ["the C4 viewer", shell],
  ["the sequence viewer", seqViewer],
]) {
  check(
    `${label} reads the shared idle-motion module`,
    /from "@\/lib\/idle-motion"/.test(source),
  );
}

check(
  "the C4 shell stamps the gate attribute the canvas selects on",
  /data-af-idle=\{idleState\}/.test(shell) &&
    /const idleState = idleMotionState\(reducedMotion, idleMotion\)/.test(
      shell,
    ),
);

check(
  "reduced motion wins outright — it is the first argument, not an override",
  /idleMotionState\(\s*reduced: boolean,\s*idleMotion: boolean,\s*\): "on" \| "off" \{\s*return reduced \|\| !idleMotion \? "off" : "on";/s.test(
    idleModule,
  ),
);

/*
 * THE DRIFT MUST BE WITHDRAWN, NOT SLOWED. A parked marching dash is not a
 * resting connector — it is a connector wearing a dash pattern that means
 * "different kind of relationship" in C4. So the default is display:none and
 * the gate adds it back, which is the one shape a custom property cannot
 * express: a var changes a value, only a selector retracts a rule.
 */
/*
 * The C4 resting overlay is a COMET now, the same three-band shape this
 * stylesheet gives a solid message — which is the point of asserting it from
 * here. What must stay true is the gate, not the class name: withdrawn by
 * default, added back by the shared attribute, and alive on hover regardless.
 */
check(
  "the C4 resting comet is off by default and switched on by the attribute",
  /\.viewer-canvas \.viewer-edge-rest \{\s*display: none;/s.test(c4) &&
    /\[data-af-idle="on"\] \.viewer-canvas \.viewer-edge-rest \{\s*display: inline;/s.test(
      c4,
    ),
);

check(
  "hover survives the gate — motion the reader asked for is not idle motion",
  /\.viewer-canvas \.react-flow__edge:hover \.viewer-edge-rest \{\s*display: inline;/s.test(
    c4,
  ),
);

check(
  "reduced motion removes the C4 comet, hover included",
  /\.viewer-canvas \.viewer-edge-rest,\s*\.viewer-canvas \.react-flow__edge:hover \.viewer-edge-rest \{\s*display: none;/s.test(
    c4,
  ),
);

/*
 * Both viewers now answer "a solid line at rest" with the same three bands, so
 * the BAND COUNT and their ordering are asserted across the two stylesheets.
 * The exact widths differ on purpose — C4's resting comet has to stay
 * subordinate to its own selection comet, which the sequence viewer has no
 * equivalent of — so only the shape is pinned, not the values.
 */
check(
  "the C4 resting comet has the same three bands, in the same order",
  ["glow", "tail", "head"].every((band) =>
    new RegExp(`\\.viewer-canvas \\.viewer-edge-rest-${band} \\{`).test(c4),
  ) &&
    c4.indexOf("viewer-edge-rest-glow") < c4.indexOf("viewer-edge-rest-tail") &&
    c4.indexOf("viewer-edge-rest-tail") < c4.indexOf("viewer-edge-rest-head"),
);

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} sequence-motion assertions passed.`);
