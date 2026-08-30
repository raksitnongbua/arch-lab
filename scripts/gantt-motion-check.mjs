#!/usr/bin/env node
/**
 * Gantt motion check: the stylesheet and the component that feeds it.
 *
 * Mirrors `scripts/er-motion-check.mjs` group for group, and tightens the two
 * places ER's version is too weak to catch its own bug.
 *
 * The single most valuable assertion here is (1). CSS FAILS SILENTLY — a
 * selector that matches nothing is not an error, it is a rule that never runs.
 * THE DEFECT THAT BOUGHT IT: the ER canvas built a class list as
 * `` `af-er-edge af-er-${state}${dashed ? " af-er-edge-dashed" : ""}` ``, the
 * leading space was lost, and a dashed connector rendered
 * `af-er-noneaf-er-edge-dashed` — one nonsense class instead of two. Every
 * dashed-line rule stopped applying and nothing reported it: the page
 * rendered, the build passed, the layout check passed, and the only symptom
 * was a line that quietly failed to march.
 *
 * What it proves:
 *
 *   1. Every `af-gantt-*` class the stylesheet targets is actually EMITTED by
 *      `gantt-diagram.tsx`, and every class list in that component is an
 *      ARRAY JOINED WITH A SPACE — never a concatenation, where a lost space
 *      merges two classes into one. The reverse direction (an emitted class
 *      with no rule) is deliberately NOT asserted: a class with no rule is a
 *      legitimate hook, and failing on those punishes correct code.
 *
 *   2. MOTION IS OPT-OUT TWICE. Every `animation` sits inside
 *      `prefers-reduced-motion: no-preference` — a first-paint animation
 *      cannot be suppressed by JavaScript, so the media query is the only
 *      thing that can hold the reveal still — and every AMBIENT (infinite,
 *      runs-at-rest) animation is gated on `[data-af-idle="on"]`.
 *
 *      TWO THINGS ARE ASSERTED ABOUT THAT GATE THAT ER'S CHECK DOES NOT
 *      ASSERT, and this script exists in large part to stop the recurrence:
 *        - THE SPELLING IS `data-af-idle`, never `data-idle-motion`. ER's
 *          stylesheet gates on the latter, NOTHING IN THE APP STAMPS IT, and
 *          ER's ambient pulse has therefore never been switchable. Its own
 *          check passes because it only counts that such a rule EXISTS.
 *        - SOMETHING ACTUALLY STAMPS IT. The gate is checked against the
 *          component that renders the canvas, so a rule gating on an
 *          attribute nobody writes fails here rather than shipping as a dead
 *          switch.
 *
 *      FOCUS MOTION IS EXEMPT FROM THE IDLE GATE, and that is the preference's
 *      own rule, not a loophole: `src/lib/idle-motion.ts` says in as many
 *      words that "motion the reader ASKED for — a focus draw, a selection
 *      comet, an entrance — is not idle motion and is not gated by this". So
 *      the assertion below is per-rule: an infinite animation must be gated by
 *      the idle attribute OR scoped to `.af-gantt-has-focus`, and nothing may be
 *      infinite and ungated by either.
 *
 *   3. THE RESTING STATE IS A COMPLETE DIAGRAM. Nothing outside the media
 *      query sets `opacity: 0` on a row or an edge — a no-JS, reduced-motion
 *      reader must see the whole plan, not an empty canvas waiting for an
 *      animation that will never play. This is also what the crawlable example
 *      pages and the SVG export ship.
 *
 *   4. THE REVEAL FITS ITS BUDGET, computed FROM THE STYLESHEET'S OWN CUSTOM
 *      PROPERTIES rather than from numbers typed here, so retuning a property
 *      changes what this check enforces instead of drifting from it. Worst
 *      case must stay under 1.5s — the budget `check:er-motion` and
 *      `check:usecase-motion` hold their canvases to.
 *
 *   5. THE NOTATION SURVIVES THE MOTION. The current rides a SEPARATE path
 *      and never a dasharray on `.af-gantt-edge-line`, because that stroke
 *      carries critical-versus-slack and a travelling dash laid over it would
 *      overwrite the one distinction the reader came for. And NO `filter`
 *      appears on any connector rule: a percentage filter region is in
 *      `objectBoundingBox` units and an axis-aligned line has a zero-extent
 *      box in one axis, so the region collapses and the browser paints bands
 *      across the diagram. That shipped on the ER canvas and cost three
 *      commits, every one of them adjusting a stroke, because no stroke was
 *      drawing it. A Gantt is almost entirely horizontal and vertical runs, so
 *      this is the worst possible canvas to forget it on.
 *
 *   6. THE STAGGER CAPS AGREE ACROSS THE TS/CSS BOUNDARY. `--gantt-row-cap` and
 *      `--gantt-edge-cap` must equal `GANTT.waveCap` and `GANTT.edgeWaveCap`. CSS
 *      cannot import TypeScript, so the pair is genuinely duplicated and has
 *      to be pinned — the `check:sequence-motion` precedent. A cap that drifts
 *      makes the budget in group 4 wrong without anything failing.
 *
 *   7. THE AXIS SWEEP IS NOT A TODAY MARKER. arch-lab draws no today line
 *      anywhere on purpose: a share link carries its document but not the day
 *      it was minted, so a playhead would tell every reader after the first
 *      something different and wrong. The looping sweep along the axis is one
 *      changed coordinate away from being exactly that, so its confinement to
 *      the axis rule is asserted from the COMPONENT'S GEOMETRY rather than
 *      from the stylesheet's prose about it.
 *
 *   8. THE BAR HATCH LOOPS WITHOUT A SEAM, AND WITHOUT COSTING THE NOTATION.
 *      The march translates a group inside ONE shared `<pattern>` by EXACTLY
 *      one tile; the stripes are the family `x + y = k * tile`, so one tile is
 *      the only distance that maps the frame at 100% onto the frame at 0%.
 *      Any other and the reader sees a jump every cycle. And the hatch lies on
 *      the fill that carries planned/active/done/at-risk, so the wash it
 *      applies is computed here from `GANTT` and the stylesheet's opacity and
 *      held under a ceiling: a texture that flattens the four states toward
 *      one another has taken the notation to pay for the motion.
 *
 * Exits non-zero on any failure. Run with: pnpm check:gantt-motion
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

const { GANTT } = await load("src/features/gantt/lib/layout.ts");
const { IDLE_AFTER_MS, GANTT_SETTLE_MS } = await load(
  "src/features/gantt/lib/motion.ts",
);

const css = read("src/features/gantt/styles/gantt-motion.css");
const diagram = read("src/features/gantt/components/gantt-diagram.tsx");
const exportSvg = read("src/features/gantt/export/render-svg.ts");
const viewer = read("src/features/gantt/components/gantt-viewer.tsx");
/* The canvas with its comments stripped. Several assertions below name a
   mechanism in order to FORBID it — `patternTransform`, SMIL — and every one
   of those words also appears in the prose beside the code explaining why it
   was rejected. Scanning the raw file would match the explanation and pass
   with the mistake present, which is the `canvas-edit-check.mjs` precaution. */
const diagramCode = diagram.replace(/\/\*[\s\S]*?\*\//g, "");

/* The sequence canvas's comet, which this one now copies. Read out of ITS
   stylesheet rather than restated here, so "same as sequence" cannot rot when
   one side is tuned — the precedent is `check:sequence-motion`, which reads the
   same three bands out of the C4 canvas for exactly this reason. */
const sequenceCss = read("src/features/sequence/styles/sequence-motion.css");
const FLOW_BANDS = ["glow", "tail", "head"];

/**
 * The body of the rule whose selector is EXACTLY `selector`.
 *
 * Not a regex over the file, which is the trap here: the three bands also
 * share a grouped rule whose selector list ENDS in `.af-gantt-flow-head`, so
 * `/\.af-gantt-flow-head\s*\{/` finds that one first and reports the shared
 * body — no dasharray, no width, and a green check for a band that has
 * neither.
 */
const ruleBody = (cssText, selector) => {
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].trim() === selector) return match[2];
  }
  return "";
};

const dashOf = (cssText, className) => {
  const dash = /stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/.exec(
    ruleBody(cssText, `.${className}`),
  );
  return dash === null ? null : `${dash[1]} ${dash[2]}`;
};

let failures = 0;
let assertions = 0;
const check = (label, condition, detail) => {
  assertions += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
};

/** Rule blocks as [selector, body], with comments stripped first — every rule
 * here is also DESCRIBED in prose beside itself, so a scan over the raw file
 * would match the sentence saying what the code does and pass with the code
 * deleted (the `canvas-edit-check.mjs` precaution). */
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
const RULES = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((match) => [match[1].trim(), match[2]])
  /* Keyframe steps are dropped: `from`, `to` and `40%` are selectors to this
     regex but are not rules, and a keyframe's `opacity: 0` is the point of the
     animation rather than a resting state. */
  .filter(
    ([selector]) =>
      !selector.startsWith("@") &&
      !/^(from|to|[\d.]+%(\s*,\s*(from|to|[\d.]+%))*)$/.test(selector),
  );

/* ----------------------------------------------------------------------- */
console.log("classes (the stylesheet and the component must agree)");

{
  const targeted = new Set(
    [...css.matchAll(/\.(af-gantt-[a-z-]+)/g)].map((match) => match[1]),
  );
  const emitted = new Set(
    [...diagram.matchAll(/"(af-gantt-[a-z-]+)"/g)].map((match) => match[1]),
  );

  check(
    `the stylesheet targets a real canvas at all (${targeted.size} classes)`,
    targeted.size >= 10 && emitted.size >= 10,
    `${targeted.size} targeted, ${emitted.size} emitted — this section would pass vacuously`,
  );

  const orphanRules = [...targeted].filter((name) => !emitted.has(name));
  check(
    "every af-gantt-* class the stylesheet targets is emitted by the canvas",
    orphanRules.length === 0,
    `styled but never rendered: ${orphanRules.join(", ")} — a CSS selector that matches nothing fails silently`,
  );

  /* THE EXACT SHAPE OF THE ER BUG. Every dynamic class list must be an array
     joined with a space; a template literal that pastes one class against
     another needs a literal space nobody can see is missing. */
  const classAttributes = [
    ...diagram.matchAll(/className=\{([\s\S]*?)\}\n/g),
  ].map((match) => match[1]);
  const concatenated = classAttributes.filter(
    (value) => !/\.join\(" "\)/.test(value),
  );
  check(
    `every dynamic class list is an array joined with a space (${classAttributes.length} found)`,
    classAttributes.length > 0 && concatenated.length === 0,
    `${concatenated.join(" | ")} — a lost space merges two classes into one nonsense class, and nothing reports it`,
  );
  check(
    "no af-gantt-* literal sits directly against an interpolation",
    !/\$\{[^}]*\}"?af-gantt-/.test(diagram) &&
      !/`af-gantt-[a-z-]*\$\{[^}]*\}af-gantt-/.test(diagram),
    'build class lists with an array + join(" ") — see this file\'s header',
  );
}

/* ----------------------------------------------------------------------- */
console.log("opt out twice");

const QUERY = "@media (prefers-reduced-motion: no-preference)";

/**
 * Whether a rule body's `animation-delay` carries a real minus sign.
 *
 * THE HYPHENS IN THE IDENTIFIERS HAVE TO GO FIRST, and forgetting that made
 * this file's own negative-delay assertion vacuous for a whole release: every
 * staggered delay here is written `calc(var(--gantt-wave, 0) * -540ms)`, and a
 * bare `.includes("-")` is satisfied by the `--` in the custom property name
 * alone. The check passed with the sign flipped to positive — which is exactly
 * the bug it exists to catch, and exactly the class of silent pass the header
 * of this file is about. Strip every `--name` before looking for the operator.
 */
/**
 * Whether a rule body declares an infinite animation, in EITHER spelling.
 *
 * The running light sets `animation-name` through a custom property so one
 * rule can light three bands, which forces the longhands — and the shorthand
 * -only scan this file used to do would have silently stopped covering the
 * canvas's most prominent motion. Every gate assertion below runs off this,
 * so a motion that escapes it escapes all of them.
 */
const isInfinite = (body) =>
  /animation:[^;]*\binfinite\b/.test(body) ||
  /animation-iteration-count:\s*infinite/.test(body);

const delayIsNegative = (body) => {
  const delay = /animation-delay:([^;]+);/.exec(body);
  if (delay === null) return null;
  return delay[1].replace(/--[a-zA-Z0-9-]+/g, "").includes("-");
};

{
  const split = css.indexOf(QUERY);
  check(`the stylesheet has a "${QUERY}" block`, split !== -1);
  const unguarded = css.slice(0, split);
  const guarded = css.slice(split);

  check(
    "no animation is declared outside the reduced-motion media query",
    !/\banimation(-name)?\s*:/.test(unguarded.replace(/\/\*[\s\S]*?\*\//g, "")),
    "a first-paint animation cannot be suppressed by JS — the media query is the only gate",
  );

  const infinite = RULES.filter(
    ([selector, body]) =>
      isInfinite(body) && guarded.includes(selector.split(",")[0].trim()),
  );
  check(
    `the canvas has ambient and focus motion to gate at all (${infinite.length} infinite animations)`,
    infinite.length >= 2,
    "nothing infinite — the rest of this section would pass vacuously",
  );

  /* PER-RULE, not by counting: an infinite animation is either AMBIENT and
     gated on the idle attribute, or it is FOCUS motion the reader asked for
     (`src/lib/idle-motion.ts`: "motion the reader ASKED for … is not idle
     motion and is not gated by this"). Anything that is neither is motion
     nobody can stop. */
  const ungated = infinite.filter(
    ([selector]) =>
      !selector.includes('[data-af-idle="on"]') &&
      !selector.includes("af-gantt-has-focus"),
  );
  check(
    "every infinite animation is either gated on [data-af-idle] or scoped to focus",
    ungated.length === 0,
    `${ungated.map(([s]) => s).join(" | ")} — infinite motion no toggle and no gesture can stop`,
  );

  const ambient = infinite.filter(([selector]) =>
    selector.includes('[data-af-idle="on"]'),
  );
  check(
    `the ambient current is gated on [data-af-idle="on"] (${ambient.length} rule(s))`,
    ambient.length >= 1,
    "nothing ambient is gated — the app-wide idle toggle would do nothing here",
  );

  /* THE SPELLING, AND WHETHER ANYTHING STAMPS IT. ER's stylesheet gates on
     `data-idle-motion`, nothing writes that attribute, and ER's ambient pulse
     has therefore never been switchable — with a green check the whole time.
     Both halves are asserted here. */
  check(
    "the gate is spelled data-af-idle, NOT data-idle-motion (ER's dead spelling)",
    !/data-idle-motion/.test(withoutComments),
    "data-idle-motion is stamped by nothing in this app — a gate on it is a switch that is not wired to anything",
  );
  check(
    "the canvas actually stamps the attribute the gate reads",
    /data-af-idle=\{/.test(diagram) && /data-idle=\{/.test(diagram),
    "the stylesheet gates on [data-af-idle] and [data-idle]; if the component does not write them the ambient current never runs — or never stops",
  );

  /* THE BLINK. A POSITIVE delay on an infinite animation is invisible until
     an ancestor class changes; then the animation restarts and replays its
     silent head, so every connector vanishes for the length of the delay and
     comes back. That shipped on the ER canvas. */
  const positive = infinite.filter(
    ([, body]) => delayIsNegative(body) === false,
  );
  check(
    "every staggered infinite animation uses a NEGATIVE delay, so a restart is invisible",
    positive.length === 0,
    `${positive.map(([s]) => s).join(" | ")} — a positive delay blinks every connector off and on at each focus change`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("the resting state is a complete diagram");

{
  const unguarded = css.slice(0, css.indexOf(QUERY));
  /* The current path is inert at rest BY DESIGN — it is the travelling mark,
     not part of the resting picture — so its own rule is scoped out rather
     than left to a looser regex. */
  const withoutCurrent = unguarded.replace(
    /\.af-gantt-edge-current[\s\S]{0,60}?\{[^}]*\}/g,
    "",
  );
  check(
    "nothing outside the media query hides a row or an edge",
    !/opacity:\s*0\s*;/.test(withoutCurrent),
    "a reduced-motion or no-JS reader would get an empty canvas waiting for an animation that will never play",
  );
  check(
    "rows and edges are declared visible at rest, explicitly",
    /\.af-gantt-row,\s*\n?\s*\.af-gantt-edge\s*\{[^}]*opacity:\s*1/.test(
      unguarded,
    ),
    "the resting state is what the export and the crawlable pages ship",
  );
  /* The entrance's `opacity: 0` must live inside the query AND behind the
     reveal flag, so the export path (`reveal=false`) is never transparent. */
  check(
    'the entrance\'s opacity:0 is behind both the media query and [data-reveal="1"]',
    RULES.filter(([, body]) => /opacity:\s*0;/.test(body)).every(
      ([selector]) =>
        selector.includes('[data-reveal="1"]') ||
        selector.includes("af-gantt-edge-current"),
    ),
    "an unflagged opacity:0 makes the exported SVG and the example pages blank",
  );
}

/* ----------------------------------------------------------------------- */
console.log("budget");

{
  const ms = (name) => {
    const match = new RegExp(`--${name}:\\s*([\\d.]+)(ms|s)`).exec(css);
    if (match === null) throw new Error(`no --${name} in the stylesheet`);
    return Number(match[1]) * (match[2] === "s" ? 1000 : 1);
  };
  const count = (name) => {
    const match = new RegExp(`--${name}:\\s*(\\d+)`).exec(css);
    if (match === null) throw new Error(`no --${name} in the stylesheet`);
    return Number(match[1]);
  };

  /* Worst case, from the stylesheet's OWN properties: the last row rises after
     the capped stagger, and the last connector draws after its lead plus the
     capped edge stagger. Both start at t=0, so the reveal is over when the
     later of the two finishes. */
  const rows =
    count("gantt-row-cap") * ms("gantt-row-beat") + ms("gantt-row-rise");
  const edges =
    ms("gantt-edge-lead") +
    count("gantt-edge-cap") * ms("gantt-edge-beat") +
    ms("gantt-edge-draw");
  const worst = Math.max(rows, edges);
  check(
    `the reveal finishes inside 1.5s (worst case ${worst}ms: rows ${rows}ms, connectors ${edges}ms)`,
    worst <= 1500,
    `${worst}ms — a reveal longer than this reads as the page being slow`,
  );

  /* 7. THE AMBIENT MOTIONS WAIT FOR THE ENTRANCE, AND NOT A MOMENT LONGER.
     Both halves have shipped as bugs. Arming the first at-rest transition with
     `IDLE_AFTER_MS` left the hatch and the connector current dead for 3.2s
     after a cold load while the axis sweep ran alone — the reader saw the
     entrance, a long flat pause, then motions arriving from nowhere. Arming it
     with zero would be the opposite fault: a current travelling a line that is
     still drawing itself.

     So the settle is pinned to the reveal budget computed just above, FROM THE
     STYLESHEET's own properties. CSS cannot be imported into `lib/motion.ts`,
     which makes this a genuinely duplicated pair in the manner of
     `--gantt-row-cap`/`GANTT.waveCap` — and this is the assertion that stops raising
     a reveal timing from silently putting an ambient motion back on top of the
     entrance. */
  check(
    `the ambient motions wait out the entrance (settle ${GANTT_SETTLE_MS}ms >= reveal ${worst}ms)`,
    GANTT_SETTLE_MS >= worst,
    `settle ${GANTT_SETTLE_MS}ms is SHORTER than the ${worst}ms reveal the stylesheet computes to — the hatch would march under rows still fading in and the current would travel a line still drawing itself`,
  );
  check(
    "the settle is not just the idle wait by another name",
    GANTT_SETTLE_MS < IDLE_AFTER_MS,
    `settle ${GANTT_SETTLE_MS}ms vs idle ${IDLE_AFTER_MS}ms — a fresh page has not been fiddled with, and making it wait as though it had is the defect this constant exists to fix`,
  );
  check(
    "the viewer arms its FIRST at-rest transition with the settle, and interactions with the idle wait",
    /setTimeout\(\(\) => setAtRest\(true\), GANTT_SETTLE_MS\)/.test(viewer) &&
      /setTimeout\(\(\) => setAtRest\(true\), IDLE_AFTER_MS\)/.test(viewer),
    "a constant nothing reads is a fix that never shipped — the mount effect takes the settle, `stir` keeps the idle wait",
  );

  check(
    "the focused current travels faster than the ambient one — it is being read, not glanced at",
    ms("gantt-focus-current") < ms("gantt-current"),
    `focus ${ms("gantt-focus-current")}ms vs ambient ${ms("gantt-current")}ms`,
  );
  /* THE STAGGER MUST NOT LAP. The current now runs on every connector,
     staggered by dependency rank so it reads as a front travelling down the
     plan. If the spread across the capped range reaches a full cycle, the last
     rank comes back into phase with the first and the front appears to wrap —
     which destroys the direction the stagger was widened to show. Computed
     from the stylesheet's own properties and `GANTT.edgeWaveCap`, so retuning a
     duration is caught here rather than by eye. */
  for (const [label, cycle, step] of [
    ["ambient", "gantt-current", "gantt-current-step"],
    ["focus", "gantt-focus-current", "gantt-focus-current-step"],
  ]) {
    const spread = GANTT.edgeWaveCap * ms(step);
    check(
      `the ${label} stagger sweeps without lapping (${spread}ms across ${GANTT.edgeWaveCap} ranks, inside a ${ms(cycle)}ms cycle)`,
      spread < ms(cycle),
      `${spread}ms spread vs a ${ms(cycle)}ms cycle — the last rank laps back into phase with the first and the front reads as wrapping instead of travelling`,
    );
  }

  check(
    "the ambient current is slow enough not to nag (>= 2s per travel)",
    ms("gantt-current") >= 2000,
    `${ms("gantt-current")}ms — fast repeating motion in peripheral vision reads as a distraction`,
  );

  /* 6. THE TS/CSS PAIR. CSS cannot import TypeScript, so these two numbers are
     genuinely duplicated and nothing but this pins them. */
  check(
    `--gantt-row-cap equals GANTT.waveCap (${GANTT.waveCap})`,
    count("gantt-row-cap") === GANTT.waveCap,
    `stylesheet ${count("gantt-row-cap")}, layout ${GANTT.waveCap} — the budget above is computed from the CSS cap while the canvas staggers by the TS one`,
  );
  check(
    `--gantt-edge-cap equals GANTT.edgeWaveCap (${GANTT.edgeWaveCap})`,
    count("gantt-edge-cap") === GANTT.edgeWaveCap,
    `stylesheet ${count("gantt-edge-cap")}, layout ${GANTT.edgeWaveCap}`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("the notation survives the motion");

{
  check(
    "the running light rides SEPARATE paths, emitted beside the base line",
    FLOW_BANDS.every((band) =>
      new RegExp(`className="af-gantt-flow-${band}"`).test(diagram),
    ) && /className="af-gantt-edge-line"/.test(diagram),
    "the light must be its own paths — see the next assertion for what dashing the base line would cost",
  );
  check(
    "every band is pathLength-normalised, so its length is a share of the connector",
    (diagramCode.match(/pathLength=\{100\}/g) ?? []).length ===
      FLOW_BANDS.length,
    "a fixed-length head is a smear on a short hop and invisible on a long span — this is most of why the previous one could not be seen",
  );
  const lineRules = RULES.filter(([selector]) =>
    /\.af-gantt-edge-line\s*$|\.af-gantt-edge-line[,\s]/.test(selector),
  );
  const dashedLine = lineRules.filter(
    ([selector, body]) =>
      /stroke-dasharray/.test(body) && !selector.includes('[data-reveal="1"]'),
  );
  check(
    "no rule dashes the base line outside the one-shot entrance draw",
    dashedLine.length === 0,
    `${dashedLine.map(([s]) => s).join(" | ")} — the base stroke carries critical-versus-slack, and a travelling dash over it overwrites exactly that`,
  );

  /* NO SVG FILTER ON A CONNECTOR, ever — see the header. */
  const filtered = RULES.filter(
    ([selector, body]) =>
      /af-gantt-edge|af-gantt-arrow/.test(selector) && /filter:/.test(body),
  );
  check(
    "no filter is applied to a connector, whose bounding box is zero-extent in one axis",
    filtered.length === 0,
    `${filtered.map(([s]) => s).join(" | ")} — a percentage filter region on a flat path degenerates and paints bands across the diagram; draw a wider path instead`,
  );
  check(
    "no filter is applied anywhere on this canvas",
    !/filter:\s*url\(/.test(withoutComments),
    "the whole canvas is axis-aligned rectangles and orthogonal lines — there is no shape here a percentage filter region is safe on",
  );

  /* FOCUS DIMS AND ANIMATES, IT DOES NOT REPAINT. A focused line that
     recolours is a new border appearing where one already was; the ER canvas
     had that treatment added and removed twice. `:focus-visible` is the one
     exception, because a keyboard user has no hover to fall back on. */
  const focusRules = RULES.filter(
    ([selector]) =>
      selector.includes("af-gantt-has-focus") &&
      !selector.includes(":focus-visible"),
  );
  const repaints = focusRules.filter(([, body]) =>
    /(^|;|\s)(stroke|fill|stroke-width)\s*:/.test(body),
  );
  check(
    `focus changes opacity and animation only, never paint (${focusRules.length} focus rules)`,
    focusRules.length > 0 && repaints.length === 0,
    `${repaints.map(([s]) => s).join(" | ")} — dim the unrelated and animate the lit; a restyle is a second border`,
  );
  check(
    "the component never varies a paint attribute on the lit state",
    !/(stroke|strokeWidth|fill|opacity)=\{[^}]*lit/.test(diagram),
    "a lit-state paint expression is a border by another name — the signal is the animation",
  );
  check(
    "the keyboard exception is a focus RING, not a restyle of the notation",
    /\.af-gantt-hit:focus-visible\s*\{[^}]*outline:/.test(css),
    "a keyboard user has no hover; the ring is the one sanctioned paint",
  );

  /* THE AMBIENT CURRENT RUNS EVERY CONNECTOR. It was scoped to the critical
     chain, and that scope was the defect: criticality is already painted, in
     a heavier `--gantt-critical` stroke and the bar's leading cap, both of which
     survive a still export where the motion never did. Asserted so the scope
     cannot quietly come back. */
  const ambientCurrent = RULES.filter(
    ([selector, body]) =>
      selector.includes('[data-af-idle="on"]') &&
      selector.includes("af-gantt-flow-head") &&
      isInfinite(body),
  );
  check(
    `the ambient current runs on every connector, not only the critical chain (${ambientCurrent.length} rule(s))`,
    ambientCurrent.length === 1 &&
      !ambientCurrent[0][0].includes('[data-critical="1"]'),
    "scoping the current to criticality spends the canvas's only travelling mark on a meaning two painted signals already carry in full",
  );

  /* AND IT SWEEPS IN DEPENDENCY ORDER. The rank comes from the layout, stamped
     per edge as `--gantt-edge-wave`; a literal here would be an order invented in
     the stylesheet rather than read from the graph. */
  check(
    "the sweep is staggered by --gantt-edge-wave, the layout's own rank, never a literal",
    ambientCurrent.every(([, body]) =>
      /animation-delay:[^;]*var\(--gantt-edge-wave/.test(body),
    ) && /"--gantt-edge-wave": dependency\.wave/.test(diagram),
    "without the rank the currents fire together and the motion reads as the diagram twitching rather than as time running forward",
  );

  /* AND IT DOES NOT ERASE THE WEIGHT IT TRAVELS OVER. A flat-weight current on
     a 1.4 slack line thickened it to the 2.1 that means critical, for as long
     as the head was on it — the motion taking payment from the notation. Both
     now read one property. */
  /* THE OPAQUE BANDS ARE EXACTLY THE LINE'S WEIGHT. Stroke weight is half of
     how criticality is painted, so a light heavier than the line it rides
     thickens every slack connector to critical weight while it passes. The
     halo is the one sanctioned exception — at 0.22 it is light around the line
     rather than the line's weight — and it is asserted to be the ONLY one, so
     a second wide band cannot be added without this failing. */
  /* Matched against the PARSED rules and an exact selector, not a regex over
     the file: the three bands also share a grouped rule whose selector list
     ends in `.af-gantt-flow-head`, and a loose scan finds that one instead and
     reports no width at all. */
  const bodyOf = (selector) => ruleBody(css, selector);
  const widthOf = (band) =>
    /stroke-width:\s*([^;]+);/.exec(bodyOf(`.af-gantt-flow-${band}`))?.[1];
  check(
    "the opaque bands are exactly as heavy as the line they ride, so criticality survives the sweep",
    widthOf("head") === "var(--gantt-edge-weight)" &&
      widthOf("tail") === "var(--gantt-edge-weight)" &&
      /stroke-width:\s*var\(--gantt-edge-weight\)/.test(
        bodyOf(".af-gantt-edge-line"),
      ),
    `head ${widthOf("head")}, tail ${widthOf("tail")} — a light heavier than its line thickens every slack connector to critical weight while it passes`,
  );
  check(
    "the halo is the only band wider than its line, and it is translucent",
    /opacity:\s*0\.2/.test(bodyOf(".af-gantt-flow-glow")),
    "a wide band at full strength IS a stroke weight, and this canvas spends stroke weight on criticality",
  );

  /* ONE TOKEN FOR ALL THREE LAYERS. The halo, the tail and the head are one
     object seen as one object; letting a band carry its own `stroke` would
     mean a theme override moved two thirds of a comet. The shared rule is the
     only place the colour is named, and these assert that no band quietly
     re-paints itself. */
  const flowStroke = /stroke:\s*var\((--[a-z0-9-]+)\)/.exec(
    ruleBody(
      css,
      ".af-gantt-flow-glow,\n.af-gantt-flow-tail,\n.af-gantt-flow-head",
    ),
  )?.[1];
  check(
    `all three flow layers take one token (${flowStroke ?? "none"})`,
    flowStroke !== undefined &&
      FLOW_BANDS.every(
        (band) => !/stroke:\s/.test(ruleBody(css, `.af-gantt-flow-${band}`)),
      ),
    "a band with its own stroke splits the comet in two the moment a theme overrides the token",
  );
  check(
    "the light's colour is its OWN token, not the shared connector drift",
    flowStroke === "--gantt-flow",
    `${flowStroke} — the drift is a color-mix tuned for a light ground, is shared with the other kinds, and cannot even be measured by check:gantt-palette`,
  );

  /* NO ANIMATION IS NAMED THROUGH A CUSTOM PROPERTY. A declaration containing
     `var()` is re-resolved on every custom-property invalidation on that
     element, and a theme switch in this app is a class swap on `<html>` that
     re-resolves every inherited property on every node in the canvas. An
     `animation-name` that fails to resolve computes to `none` — the animation
     is CANCELLED while the `display: inline` in the same rule stays applied,
     leaving three bright stripes parked on every connector until the gate
     toggles. Shipping this file with one grouped rule taking its name from
     `--gantt-flow-anim` was two minutes of convenience for a defect that would
     have looked exactly like the theme bug it was written next to. */
  check(
    "no animation is named through a custom property",
    !/animation-name:\s*var\(/.test(withoutComments) &&
      !/animation:\s*var\(/.test(withoutComments),
    "a var()-named animation computes to `none` when the custom property fails to resolve, cancelling the motion while its rule's other declarations stay applied",
  );

  /* THE LIGHT IS SEQUENCE'S COMET, PINNED TO SEQUENCE'S OWN NUMBERS. A reader
     looked at the real page and could not see what we had; the fix was to copy
     a treatment that already ships and has already survived these rules, not
     to tune ours brighter by guesswork. Read out of that stylesheet rather
     than restated here, so the two cannot drift — `check:sequence-motion` pins
     itself to the C4 canvas the same way, for the same reason. */
  for (const band of FLOW_BANDS) {
    const ours = dashOf(withoutComments, `af-gantt-flow-${band}`);
    const theirs = dashOf(sequenceCss, `af-seq-flow-${band}`);
    check(
      `the ${band} band's duty matches the sequence canvas's (${theirs ?? "?"})`,
      ours !== null && ours === theirs,
      `ours ${ours}, sequence's ${theirs} — the duties sum to 100 against pathLength, and lengthening one turns a highlight passing over the line into a doubled, fuzzy line`,
    );
  }

  /* AND THE ONE THING OF SEQUENCE'S WE MAY NOT COPY. Its glow band is blurred;
     this canvas may never carry a filter, because a percentage filter region is
     in objectBoundingBox units and a Gantt connector is orthogonal, so its box
     is zero-extent in one axis and the paint lands somewhere else entirely.
     The general no-filter assertion above covers the whole stylesheet; this one
     names the temptation, so someone comparing the two files sees why the halo
     is a wide translucent band instead. */
  check(
    "the halo is a WIDER PATH, not sequence's blur — this canvas may not carry a filter",
    !/filter:/.test(bodyOf(".af-gantt-flow-glow")) &&
      /blur/.test(sequenceCss) &&
      /calc\(var\(--gantt-edge-weight\)/.test(bodyOf(".af-gantt-flow-glow")),
    "sequence blurs its glow; copying that here collapses the filter region on an axis-aligned connector — the ER bug that cost three commits",
  );

  /* CRITICAL EMPHASIS IS NOT FOCUS, and it must survive a still frame: it is a
     property of the model, true wherever the pointer is, so it cannot be
     carried by an animation the export and reduced motion both drop. */
  check(
    "criticality is painted, not animated — it survives a still export",
    RULES.some(
      ([selector, body]) =>
        selector.includes('[data-critical="1"]') && /stroke:|fill:/.test(body),
    ),
    "a critical chain visible only while something animates is invisible in the PNG, the SVG and under reduced motion",
  );
}

/* ----------------------------------------------------------------------- */
console.log("the axis sweep says 'time', not 'today'");

{
  const sweepRules = RULES.filter(([selector]) =>
    selector.includes("af-gantt-axis-sweep"),
  );
  check(
    `the axis sweep is styled at all (${sweepRules.length} rules)`,
    sweepRules.length >= 2,
    "a resting rule and an animated one are both expected — with neither, the rest of this section passes vacuously",
  );

  /* THE ONE ASSERTION THIS SECTION EXISTS FOR. arch-lab draws no today marker
     anywhere, deliberately: a share link carries its document but not the day
     it was minted, so a playhead would say something different — and wrong —
     to every reader after the first. A sweep that descends into the plot IS a
     playhead whatever the stylesheet calls it, and the difference between the
     two is one number in the component. So this reads the geometry rather than
     the intent: both ends must sit on the axis rule's own y, which is the same
     expression `.af-gantt-rule` uses. */
  /* `layout.plotTop`, not `GANTT.axisHeight`. The plot's top became a layout
     figure when the plan gained a heading: something can sit above the axis
     now, so a constant could no longer say where the axis is. The invariant
     this asserts is unchanged — both ends pinned to the axis rule's own y —
     only the expression that names that y. */
  const sweepElement =
    /className="af-gantt-axis-sweep"[\s\S]{0,400}?\/>/.exec(diagram)?.[0] ?? "";
  check(
    "the sweep is pinned to the axis rule's y at BOTH ends, never a full-height playhead",
    /y1=\{layout\.plotTop - 8\}/.test(sweepElement) &&
      /y2=\{layout\.plotTop - 8\}/.test(sweepElement),
    "a mark travelling down the bars reads as a date, and a shared diagram has no date to be right about",
  );

  /* It must ride its OWN line, for the reason the connector current does: the
     axis rule is the continuous mark a reader scans to find the ticks, and a
     travelling dash laid over it would break exactly that continuity. */
  const dashedRule = RULES.filter(
    ([selector, body]) =>
      /\.af-gantt-rule\s*$|\.af-gantt-rule[,\s{]/.test(selector) &&
      /stroke-dasharray/.test(body),
  );
  check(
    "no rule dashes .af-gantt-rule — the sweep rides its own line",
    dashedRule.length === 0,
    `${dashedRule.map(([s]) => s).join(" | ")} — dashing the axis rule breaks the continuous mark a reader scans for ticks`,
  );

  const animated = sweepRules.filter(([, body]) => /animation:/.test(body));
  /* THE SAME GATE AS THE OTHER TWO AMBIENTS, which is a change: this sweep
     used to be exempt from `[data-idle="1"]` because the gate opened 3.2s
     after load and the exemption was the only way anyone would see it. The
     settle refunded that cost, and a canvas where one ambient keeps running
     while two stand down is the lone-motion defect in miniature. Asserted
     rather than described, so the exemption cannot creep back. */
  check(
    "the sweep loops, and shares the ambient gate with the hatch and the current",
    animated.length > 0 &&
      animated.every(
        ([selector, body]) =>
          selector.includes('[data-af-idle="on"]') &&
          selector.includes('[data-idle="1"]') &&
          /\binfinite\b/.test(body),
      ),
    "ambient motion yields to the reader — one rule for all three, or the reader has to learn an exception they cannot see",
  );

  /* And its RESTING state is complete outside the media query — the sweep is
     hidden by a zero-length dash rather than `opacity: 0`, because the resting
     rules are what a reduced-motion reader, the crawlable example pages and
     the exporter all get, and the group above forbids any other opacity:0 out
     there. */
  const unguarded = withoutComments.slice(0, withoutComments.indexOf(QUERY));
  check(
    "the sweep's resting state is declared outside the media query, and hides it without opacity",
    /\.af-gantt-axis-sweep\s*\{[^}]*stroke-dasharray:\s*0\s/.test(unguarded),
    "a resting sweep with no dash rule would paint a solid bar across the axis wherever motion is off",
  );
}

/* ----------------------------------------------------------------------- */
console.log("the bar hatch loops without a seam");

{
  const hatchRules = RULES.filter(([selector]) =>
    /af-gantt-hatch/.test(selector),
  );
  check(
    `the hatch is styled at all (${hatchRules.length} rules)`,
    hatchRules.length >= 3,
    "the overlay, the stripe and the march are all expected — with none of them the rest of this section passes vacuously",
  );

  /* ONE PATTERN, DEFINED ONCE AND REFERENCED BY ID. A definition per bar would
     multiply the id, and duplicate ids in one document resolve to whichever
     came first — which happens to look correct here and would hide the fault
     until something else depended on the id being unique. */
  const patternIds = [
    ...diagram.matchAll(/<pattern[\s\S]{0,200}?id="([^"]+)"/g),
  ].map((match) => match[1]);
  check(
    `the hatch pattern is defined exactly once (${patternIds.join(", ") || "none"})`,
    patternIds.length === 1 &&
      new RegExp(`fill="url\\(#${patternIds[0]}\\)"`).test(diagram),
    "one <pattern> per canvas, referenced by every bar — a definition per bar multiplies the id",
  );
  check(
    "the pattern is anchored to the diagram's coordinates, not to each bar's box",
    /<pattern[\s\S]{0,200}?patternUnits="userSpaceOnUse"/.test(diagram),
    "objectBoundingBox units would rescale the tile per bar, so a long bar and a short one would carry different-sized stripes",
  );

  /* THE ANIMATION TARGETS A GROUP INSIDE THE PATTERN. That is the only
     mechanism here a stylesheet can drive, and therefore the only one the
     media query and the idle toggle can hold still: `patternTransform` is an
     SVG attribute rather than a CSS property, and SMIL obeys neither gate. */
  const marched = hatchRules.filter(([, body]) => /animation:/.test(body));
  check(
    "the march animates a <g> INSIDE the pattern, which is what a stylesheet can gate",
    marched.length === 1 &&
      /<pattern[\s\S]{0,400}?<g\s+className="af-gantt-hatch-march"/.test(
        diagram,
      ),
    "patternTransform is not a CSS property and SMIL cannot be held still by prefers-reduced-motion — neither can opt out twice",
  );
  check(
    "nothing animates patternTransform or reaches for SMIL",
    !/patternTransform/.test(withoutComments) &&
      !/patternTransform/.test(diagramCode) &&
      !/<animate[A-Za-z]*[\s>]/.test(diagramCode),
    "both are ungateable here; see this file's header",
  );

  /* THE TRAVEL IS EXACTLY ONE TILE. Anything else and the frame at 100%
     differs from the frame at 0%, which the reader sees as a jump every
     single cycle. The tile is stamped by the component from `GANTT.hatchTile`,
     so pinning the keyframe to that custom property pins it to the layout. */
  const marchKeyframes =
    /@keyframes af-gantt-hatch-march\s*\{[\s\S]*?\n\}/.exec(
      withoutComments,
    )?.[0] ?? "";
  check(
    "the march translates by EXACTLY one tile, taken from the tile the component stamps",
    /translateX\(0\)/.test(marchKeyframes) &&
      /translateX\(calc\(var\(--gantt-hatch-tile\) \* 1px\)\)/.test(
        marchKeyframes,
      ) &&
      /"--gantt-hatch-tile":\s*GANTT\.hatchTile/.test(diagram),
    "a translate that is not one tile leaves frame 100% different from frame 0%, and the loop jumps every cycle",
  );

  /* THE NOTATION SURVIVES THE TEXTURE. The bar's fill and border are the whole
     of the reporting state; the hatch is an overlay that must neither dash
     them nor recolour them, and must stay light enough that the four states
     are still four states underneath it. */
  /* `af-gantt-breathe` DOES animate this selector, and legitimately — it moves
     opacity and nothing else, which is the sanctioned focus treatment. What
     may never happen is the fill being DASHED or REPAINTED: a dash pattern
     over it, or a `fill: url(#...)` handing it to the pattern, would replace
     the colour that carries planned/active/done/at-risk with the texture. */
  const touchedFill = RULES.filter(
    ([selector, body]) =>
      /\.af-gantt-bar-fill\s*$|\.af-gantt-bar-fill[,\s{]/.test(selector) &&
      /stroke-dasharray|fill:\s*url\(/.test(body),
  );
  check(
    "no rule dashes .af-gantt-bar-fill or hands it the pattern — the hatch is an overlay, not a treatment of the fill",
    touchedFill.length === 0,
    `${touchedFill.map(([s]) => s).join(" | ")} — the fill and border ARE the reporting state`,
  );
  check(
    "the component never paints the fill rect with the pattern either",
    !/className="af-gantt-bar-fill"[\s\S]{0,300}?fill="url\(/.test(diagram),
    "swapping the state colour for the texture would delete the reporting state outright",
  );
  check(
    "the hatch is a separate overlay rect, emitted beside the fill",
    /className="af-gantt-hatch-overlay"/.test(diagram) &&
      /className="af-gantt-bar-fill"/.test(diagram),
    "a pattern applied to the fill itself would replace the colour that carries the state",
  );
  check(
    "the stripe takes its colour from a token, never a literal",
    hatchRules.some(([, body]) => /stroke:\s*var\(--[a-z-]+\)/.test(body)) &&
      !hatchRules.some(([, body]) => /stroke:\s*(#|rgb|hsl)/.test(body)),
    "a hard-coded stripe colour is right in one theme and wrong in the other five",
  );

  /* THE WASH, computed rather than asserted by eye. Stripe area over tile area
     for a 45-degree hatch is `stroke / (tile / sqrt(2))`; times the opacity,
     that is the fraction of each bar's colour the texture replaces. The four
     state fills sit as close as 0.040 dE in `check:gantt-palette`, so a
     wash of a few percent compresses that by a few percent — a ceiling of 6%
     keeps the texture a texture. */
  const opacity = Number(
    /--gantt-hatch-opacity:\s*([\d.]+)/.exec(css)?.[1] ?? Number.NaN,
  );
  const coverage = GANTT.hatchStroke / (GANTT.hatchTile / Math.SQRT2);
  const wash = coverage * opacity;
  check(
    `the texture washes only ${(wash * 100).toFixed(1)}% of each bar's fill, so the four states stay four states`,
    wash > 0 && wash <= 0.06,
    `${(wash * 100).toFixed(1)}% — the fill IS the reporting state, and a heavy texture flattens planned, active, done and at-risk toward one another`,
  );
  check(
    `the exporter's still hatch matches the screen's (${opacity})`,
    new RegExp(`HATCH_OPACITY = ${opacity}\\b`).test(exportSvg) &&
      /hatchTilePaths\(\)/.test(exportSvg),
    "CSS cannot be imported, so this pair is genuinely duplicated — an export with a heavier texture shows the states less separated than the app does",
  );

  /* THE CAP KEEPS ITS CONTRAST. It is the only per-bar signal of criticality
     and it just cleared a contrast fix, so the overlay must be painted BEFORE
     it in document order — SVG paints in document order, so earlier is
     underneath. */
  check(
    "the hatch is painted under the critical cap, not over it",
    diagram.indexOf('className="af-gantt-hatch-overlay"') <
      diagram.indexOf('className="af-gantt-cap"'),
    "a translucent texture over the cap lowers the contrast of the one per-bar criticality signal",
  );

  /* MILESTONES ARE NOT SPANS. The overlay must sit in the bar branch, which is
     the same branch the duration label sits in and the opposite of the
     diamond's. */
  const milestoneBranch =
    /item\.milestone \? \([\s\S]*?\) : \(/.exec(diagram)?.[0] ?? "";
  check(
    "a milestone gets no hatch — a diamond is an instant, and has no span to texture",
    milestoneBranch.length > 0 &&
      !milestoneBranch.includes("af-gantt-hatch-overlay"),
    "a texture saying 'a span is running' on a thing with no span says something untrue",
  );

  /* ONE PATTERN MEANS ONE ANIMATION, so there is nothing to stagger and the
     negative-delay rule has nothing to protect. Asserted as an ABSENCE, so a
     delay added later has to come with a reason. */
  check(
    "the march carries no animation-delay — one shared pattern is one animation, with nothing to stagger",
    marched.every(([, body]) => !/animation-delay:/.test(body)),
    "every bar is a window onto the same tile, so a delay could not stagger them even if one were wanted",
  );

  const unguardedCss = withoutComments.slice(0, withoutComments.indexOf(QUERY));
  check(
    "the hatch's resting state is complete outside the media query",
    /\.af-gantt-hatch-line\s*\{[^}]*stroke:[^}]*\}/.test(unguardedCss) &&
      !/opacity:\s*0\s*;/.test(
        /\.af-gantt-hatch-line\s*\{[^}]*\}/.exec(unguardedCss)?.[0] ?? "",
      ),
    "the still hatch is what reduced motion, a no-JS reader, the example pages and the SVG export all get",
  );
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);
