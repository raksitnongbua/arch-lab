#!/usr/bin/env node
/**
 * Lifecycle motion check: the stylesheet and the component that feeds it.
 *
 * Mirrors `scripts/timeline-motion-check.mjs` group for group, plus one group
 * that canvas does not need and this one does — this canvas HAS connectors,
 * so `new-diagram-type.md`'s connector rule is not satisfied vacuously here
 * and the travelling mark on a returning branch has to justify itself by
 * geometry rather than by prose.
 *
 * The single most valuable assertion here is (1). CSS FAILS SILENTLY — a
 * selector that matches nothing is not an error, it is a rule that never runs.
 * THE DEFECT THAT BOUGHT IT: the ER canvas built a class list as
 * `` `af-er-edge af-er-${state}${dashed ? " af-er-edge-dashed" : ""}` ``, the
 * leading space was lost, and a dashed connector rendered
 * `af-er-noneaf-er-edge-dashed` — one nonsense class instead of two. Every
 * dashed-line rule stopped applying and nothing reported it.
 *
 * What it proves:
 *
 *   1. Every `af-lc-*` class the stylesheet targets is actually EMITTED by
 *      `lifecycle-diagram.tsx`, and every class list in that component is an
 *      ARRAY JOINED WITH A SPACE — never a concatenation, where a lost space
 *      merges two classes into one. The reverse direction (an emitted class
 *      with no rule) is deliberately NOT asserted: a class with no rule is a
 *      legitimate hook, and failing on those punishes correct code.
 *
 *   2. MOTION IS OPT-OUT TWICE. Every `animation` sits inside
 *      `prefers-reduced-motion: no-preference` — a first-paint animation
 *      cannot be suppressed by JavaScript, so the media query is the only
 *      thing that can hold the reveal still — and every INFINITE animation is
 *      gated on `[data-af-idle="on"]`.
 *
 *      THIS CANVAS GATES ITS FOCUS MOTION TOO, which is stricter than the
 *      timeline's and stricter than `src/lib/idle-motion.ts` requires. The
 *      travelling dash is the reason: it is an infinite animation on a
 *      CONNECTOR, which is the class of motion this repo has the worst
 *      history with. So the assertion here is that EVERY infinite animation
 *      carries the gate, with no focus exemption — and that is asserted
 *      rather than assumed, because relaxing it later would be a one-word
 *      edit in a selector.
 *
 *      TWO THINGS ARE ASSERTED ABOUT THAT GATE THAT ER'S CHECK DOES NOT:
 *        - THE SPELLING IS `data-af-idle`, never `data-idle-motion`. ER's
 *          stylesheet gates on the latter, NOTHING IN THE APP STAMPS IT, and
 *          ER's ambient pulse has therefore never been switchable. Its own
 *          check passes because it only counts that such a rule EXISTS.
 *        - SOMETHING ACTUALLY STAMPS IT, checked against the component, so a
 *          rule gating on an attribute nobody writes fails here rather than
 *          shipping as a dead switch.
 *
 *   3. THE RESTING STATE IS A COMPLETE DIAGRAM. Nothing outside the media
 *      query sets `opacity: 0` on a row — a no-JS, reduced-motion reader must
 *      see the whole lifecycle, not an empty spine waiting for an animation
 *      that will never play. This is also what the crawlable example pages
 *      and the SVG export ship. The unreachable fade is exempt BY VALUE
 *      rather than by selector: it is `0.42`, not `0`, so the assertion does
 *      not have to know about it.
 *
 *   4. THE REVEAL FITS ITS BUDGET, computed FROM THE STYLESHEET'S OWN CUSTOM
 *      PROPERTIES rather than from numbers typed here, so retuning a property
 *      changes what this check enforces instead of drifting from it. Worst
 *      case must stay under 1.5s — the budget every other canvas is held to —
 *      and `LIFECYCLE_SETTLE_MS` must be at or above it, or the ambient
 *      starts on top of the entrance. THE BUDGET IS TWO-STAGE here where the
 *      timeline's is one: the returns draw AFTER the spine, so the worst case
 *      includes that delay.
 *
 *   5. NO `filter` ANYWHERE. A percentage filter region is in
 *      `objectBoundingBox` units, and both the spine and every segment of a
 *      rejoin path are axis-aligned lines — a zero-extent box in one axis —
 *      so the region collapses and the browser paints somewhere else
 *      entirely. That shipped on the ER canvas and cost three commits, every
 *      one of them adjusting a stroke, because no stroke was drawing it.
 *
 *   6. THE STAGGER CAP AND THE UNREACHABLE FADE AGREE ACROSS THE TS/CSS
 *      BOUNDARY. `--lc-row-cap` must equal `LIFECYCLE.waveCap`, and the
 *      stylesheet's `[data-reachable="0"]` opacity must equal the SVG
 *      exporter's `UNREACHABLE_OPACITY`. CSS cannot import TypeScript, so
 *      both pairs are genuinely duplicated and have to be pinned — the
 *      `check:sequence-motion` precedent. A drifting cap makes the budget in
 *      group 4 wrong without anything failing, and a drifting fade means an
 *      exported file disagrees with the screen about how stranded a state is.
 *
 *   7. THE SWEEP IS NOT A PLAYHEAD, and this group is the one the timeline's
 *      version of it inherits. arch-lab draws no today line anywhere: a share
 *      link carries its document but not the day it was minted. Here it would
 *      be worse still — a playhead on a lifecycle claims to say where THIS
 *      subject currently is, which no lifecycle document records. So the
 *      sweep's confinement to the spine's own x is asserted FROM THE
 *      COMPONENT'S GEOMETRY rather than from the stylesheet's prose about it.
 *
 *   8. THE CONNECTOR MOTION SAYS SOMETHING, which is this canvas's own group
 *      and the one the timeline has no equivalent of. `new-diagram-type.md`
 *      replaced "every connector is animated" with "would removing this
 *      motion lose information?", so a travelling mark here has to be
 *      measurable as directional rather than decorative:
 *        - it runs ONLY on a lit returning path, never at rest, so it is not
 *          a second ambient competing with the sweep;
 *        - the path is drawn FROM the exit TO the spine, so the dash travels
 *          the way the subject travels — a path written backwards would
 *          animate the opposite claim, and nothing but this assertion would
 *          notice;
 *        - it rides the path rather than a second line, which is the
 *          OPPOSITE of the sweep's rule and is allowed for a stated reason: a
 *          return is one journey, not a continuous reference mark.
 *
 * Exits non-zero on any failure. Run with: pnpm check:lifecycle-motion
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

const { LIFECYCLE, layoutLifecycle } = await load(
  "src/features/lifecycle/lib/layout.ts",
);
const { SWEEP_HEAD_MAX, SWEEP_HEAD_SHARE, sweepHead } = await load(
  "src/lib/sweep-head.ts",
);
const { parseLifecycleText } = await load("src/features/archtext/index.ts");
const { LIFECYCLE_EXAMPLE } = await load(
  "src/features/lifecycle/input/example.ts",
);
const { listLifecycleExampleIds, loadLifecycleExample } = await load(
  "src/features/lifecycle/service/example-service.ts",
);
const { VIEW_STARTER_TEXT } = await load(
  "src/features/playground/input/parse.ts",
);

/* EVERY SPINE THIS REPO CAN PRODUCE A LENGTH FOR, plus the smallest document
   the grammar accepts. The bundled ones come from the REGISTRY so a third
   example is covered the day it lands; the two-state document is written out
   because no registry will hold the minimum on purpose, and the minimum is
   where a flat head stops fitting. */
const spineOf = (file) => {
  const laid = layoutLifecycle(file);
  return Math.max(1, laid.spineY1 - laid.spineY0);
};
const SPINES = [
  ["seed", spineOf(parseLifecycleText(LIFECYCLE_EXAMPLE))],
  ...listLifecycleExampleIds()
    .map((id) => [id, loadLifecycleExample(id)])
    .filter(([, example]) => example.status === "ok")
    .map(([id, example]) => [id, spineOf(example.file)]),
  ["starter", spineOf(parseLifecycleText(VIEW_STARTER_TEXT.lifecycle))],
  [
    "the smallest lifecycle there is",
    spineOf(
      parseLifecycleText(
        `archlab 1.0 lifecycle\ntitle "T"\n\n@lifecycle\n  subject "S"\n  state a "A"\n  state b "B" ends\n`,
      ),
    ),
  ],
];
const { IDLE_AFTER_MS, LIFECYCLE_SETTLE_MS } = await load(
  "src/features/lifecycle/lib/motion.ts",
);

const css = read("src/features/lifecycle/styles/lifecycle-motion.css");
const diagram = read("src/features/lifecycle/components/lifecycle-diagram.tsx");
const viewer = read("src/features/lifecycle/components/lifecycle-viewer.tsx");
const exportSvg = read("src/features/lifecycle/export/render-svg.ts");

/* The canvas with its comments stripped. Several assertions below name a
   mechanism in order to FORBID it, and every one of those words also appears
   in the prose beside the code explaining why it was rejected. Scanning the
   raw file would match the explanation and pass with the mistake present —
   the `canvas-edit-check.mjs` precaution. */
const diagramCode = diagram.replace(/\/\*[\s\S]*?\*\//g, "");
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
const exportCode = exportSvg.replace(/\/\*[\s\S]*?\*\//g, "");

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

/** The body of the rule whose selector is EXACTLY `selector`. Not a regex over
 * the file: a grouped selector list ENDING in the name would otherwise be
 * matched first and its shared body reported. */
const ruleBody = (cssText, selector) => {
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].trim() === selector) return match[2];
  }
  return "";
};

/** Rule blocks as [selector, body], keyframe steps dropped — `from`, `to` and
 * `40%` are selectors to this regex but are not rules, and a keyframe's
 * `opacity: 0` is the point of the animation rather than a resting state. */
const RULES = [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((match) => [match[1].trim().replace(/\s+/g, " "), match[2]])
  .filter(
    ([selector]) =>
      !selector.startsWith("@") &&
      !/^(from|to|[\d.]+%(\s*,\s*(from|to|[\d.]+%))*)$/.test(selector),
  );

/** A custom property's value from the canvas root's own block. */
const rootProp = (name) => {
  const body = ruleBody(css, ".af-lc-canvas");
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(body);
  return match === null ? null : match[1].trim();
};

/** A duration custom property in milliseconds. */
const ms = (name) => {
  const raw = rootProp(name);
  if (raw === null) return null;
  const match = /^([\d.]+)(ms|s)$/.exec(raw);
  if (match === null) return null;
  return match[2] === "s" ? Number(match[1]) * 1000 : Number(match[1]);
};

/* ----------------------------------------------------------------------- */
console.log("classes (the stylesheet and the component must agree)");

{
  const targeted = new Set(
    [...css.matchAll(/\.(af-lc-[a-z-]+)/g)].map((match) => match[1]),
  );
  const emitted = new Set(
    [...diagram.matchAll(/"(af-lc-[a-z-]+)"/g)].map((match) => match[1]),
  );

  check(
    `the stylesheet targets classes at all (${targeted.size} found)`,
    targeted.size >= 12,
    "nothing to compare — the rest of this group would pass vacuously",
  );

  const orphans = [...targeted].filter(
    (name) => !emitted.has(name) && name !== "af-lc-has-focus",
  );
  check(
    "every class the stylesheet targets is emitted by the component",
    orphans.length === 0,
    `${orphans.join(", ")} — a rule that matches nothing is not an error, it is a rule that never runs`,
  );
  check(
    "the focus class is composed rather than written as a literal",
    /af-lc-has-focus/.test(diagramCode),
    "the stylesheet's focus rules would match nothing",
  );

  /* THE LOST SPACE. Every class list must be an ARRAY JOINED WITH A SPACE.
     Template concatenation is what merged two ER classes into one nonsense
     class, and nothing reported it because a selector that matches nothing is
     not an error. */
  const concatenated = [
    ...diagramCode.matchAll(/className=\{`([^`]*)`\}/g),
  ].filter((match) => /\$\{[^}]*\}[a-zA-Z-]/.test(match[1]));
  check(
    "no class list is built by concatenating a template hole onto a name",
    concatenated.length === 0,
    concatenated.map((match) => match[1]).join(" | "),
  );
  check(
    "the composed class list is an array joined with a space",
    /\.filter\(Boolean\)\s*\n?\s*\.join\(" "\)/.test(diagramCode),
    "an array joined with a space is what makes a missing entry drop out rather than merge",
  );
}

/* ----------------------------------------------------------------------- */
console.log("opt out twice");

const QUERY = "@media (prefers-reduced-motion: no-preference)";

const isInfinite = (body) =>
  /animation:[^;]*\binfinite\b/.test(body) ||
  /animation-iteration-count:\s*infinite/.test(body);

/**
 * Whether a rule body's `animation-delay` carries a real minus sign.
 *
 * THE HYPHENS IN THE IDENTIFIERS HAVE TO GO FIRST. Every staggered delay here
 * is written `calc(var(--lc-wave, 0) * var(--lc-breathe-step) * -1)`, and a
 * bare `.includes("-")` is satisfied by the `--` in the custom property names
 * alone — which made the gantt check's own version of this assertion vacuous
 * for a release. Strip every `--name` before looking for the operator.
 */
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
      isInfinite(body) &&
      guarded.includes(selector.split(",")[0].trim().split(" ")[0]),
  );
  check(
    `the canvas has ambient and focus motion to gate at all (${infinite.length} infinite animations)`,
    infinite.length >= 3,
    "fewer than the sweep, the breathe and the travelling dash — the rest of this section would pass vacuously",
  );

  /* NO FOCUS EXEMPTION HERE, unlike the timeline's check. This canvas puts an
     infinite animation on a CONNECTOR, so every infinite rule answers the
     app-wide toggle — see the stylesheet header on why that is stricter than
     `idle-motion.ts` requires, and what it costs. */
  const ungated = infinite.filter(
    ([selector]) => !selector.includes('[data-af-idle="on"]'),
  );
  check(
    'every infinite animation is gated on [data-af-idle="on"], focus motion included',
    ungated.length === 0,
    `${ungated.map(([s]) => s).join(" | ")} — infinite motion no toggle can stop`,
  );

  const ambient = infinite.filter(([selector]) =>
    selector.includes('[data-idle="1"]'),
  );
  check(
    `the ambient sweep also yields when the canvas is not at rest (${ambient.length} rule(s))`,
    ambient.length >= 1,
    "an ambient that runs while the reader is moving competes with them",
  );

  check(
    "the gate is spelled data-af-idle, NOT data-idle-motion (ER's dead spelling)",
    !/data-idle-motion/.test(withoutComments),
    "data-idle-motion is stamped by nothing in this app — a gate on it is a switch wired to nothing",
  );
  check(
    "the canvas actually stamps the attributes the gates read",
    /data-af-idle=\{/.test(diagram) && /data-idle=\{/.test(diagram),
    "the stylesheet gates on [data-af-idle] and [data-idle]; if the component does not write them the sweep never runs — or never stops",
  );
  check(
    "and the viewer supplies both from the shared preference and its own rest state",
    /idleMotionState/.test(viewer) && /atRest/.test(viewer),
    "a stamped attribute with nothing deciding it is a constant, not a gate",
  );

  const positive = infinite.filter(
    ([, body]) => delayIsNegative(body) === false,
  );
  check(
    "every staggered infinite animation uses a NEGATIVE delay, so a restart is invisible",
    positive.length === 0,
    `${positive.map(([s]) => s).join(" | ")} — a positive delay blinks the mark off and on at each focus change`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("the resting state is a complete diagram");

{
  const unguarded = css.slice(0, css.indexOf(QUERY));
  const restingRules = [...unguarded.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => [match[1].trim().replace(/\s+/g, " "), match[2]])
    .filter(([selector]) => !selector.startsWith("@"));

  /* `0` EXACTLY, not `0.42`: matching `0` followed by any non-digit reports
     every partial opacity on the canvas — an unreachable row is drawn at 0.42
     and is not hidden. The decimal point is the whole difference, and it is
     what lets the unreachable fade be exempt by VALUE rather than by an
     exception this assertion would have to carry. */
  const hidden = restingRules.filter(
    ([selector, body]) =>
      /opacity:\s*0\s*(;|$)/m.test(body) && !selector.includes("has-focus"),
  );
  check(
    "nothing outside the media query hides an element with opacity: 0",
    hidden.length === 0,
    `${hidden.map(([s]) => s).join(" | ")} — a no-JS or reduced-motion reader would get a blank spine`,
  );

  /* THE SWEEP'S OWN RESTING STATE, which is the one element that must be
     invisible at rest and must NOT use opacity to get there: an `opacity: 0`
     here would be indistinguishable from the entrance's, and the assertion
     above would have to make an exception for it. A zero-length dash is the
     mechanism, and a BUTT cap is what stops it painting a dot — a round cap
     would leave a permanent extra state at the top of the spine. */
  const sweep = ruleBody(css, ".af-lc-sweep");
  check(
    "the sweep is inert at rest via a zero-length dash, not opacity",
    /stroke-dasharray:\s*0\s/.test(sweep) && !/opacity:\s*0/.test(sweep),
    sweep,
  );
  check(
    "and carries a butt cap, so the zero-length dash paints nothing",
    /stroke-linecap:\s*butt/.test(sweep),
    "a round cap paints a dot at a zero-length dash — a permanent extra state on the spine",
  );

  /* THE STILL EXPORT IS THE RESTING FRAME. The SVG exporter must emit no
     animation and no sweep: a still frame of a travelling mark is a stray dash
     across the file. */
  check(
    "the SVG export emits no animation of any kind",
    !/animate|@keyframes|animation/i.test(exportCode),
    "an exported file has no clock; a frozen travelling mark is a stray dash",
  );
  check(
    "and does not emit the sweep line at all",
    !/af-lc-sweep|sweep/i.test(exportCode),
    "an inert path shipped in every exported file",
  );
  /* BUT IT DOES EMIT THE UNREACHABLE FADE, which is the one non-motion
     difference between the screen and the file: an unreachable state is a fact
     about the DOCUMENT, so a file that dropped the fade would say the subject
     can get somewhere it cannot. */
  check(
    "but it does emit the unreachable fade — that is the document, not the canvas",
    /reachable/.test(exportCode) && /opacity=/.test(exportCode),
    "an exported file at full strength claims the subject can reach a stranded state",
  );
}

/* ----------------------------------------------------------------------- */
console.log("budget");

{
  const rise = ms("lc-row-rise");
  const beat = ms("lc-row-beat");
  const cap = Number(rootProp("lc-row-cap"));
  const spineDraw = ms("lc-spine-draw");
  const returnDraw = ms("lc-return-draw");

  check(
    "the reveal timings are readable from the stylesheet's own properties",
    rise !== null &&
      beat !== null &&
      spineDraw !== null &&
      returnDraw !== null &&
      !Number.isNaN(cap),
    `rise=${rise} beat=${beat} cap=${cap} spine=${spineDraw} return=${returnDraw}`,
  );

  /* COMPUTED FROM THE STYLESHEET, never typed here. TWO STAGES, unlike the
     timeline's one: the last row starts after the full capped stagger and
     takes `rise` to arrive, the spine draws from zero, and the returns draw
     AFTER the spine — so the worst case is whichever of the three finishes
     last. The return leg is the one a reader would forget to count, which is
     why it is spelled out rather than folded in. */
  const worst = Math.max(cap * beat + rise, spineDraw, spineDraw + returnDraw);
  check(
    `the reveal's worst case is under 1.5s (${worst}ms, computed from the stylesheet)`,
    worst < 1500,
    `${worst}ms — a reader waiting on an entrance has stopped reading`,
  );

  /* THE SETTLE IS THE ENTRANCE, and the gantt canvas shipped this wrong in
     both directions: armed with the idle wait it left the ambient dead for
     three seconds after the entrance, and armed with zero it would start the
     sweep over a spine still drawing itself. */
  check(
    `LIFECYCLE_SETTLE_MS (${LIFECYCLE_SETTLE_MS}ms) is at least the reveal's worst case`,
    LIFECYCLE_SETTLE_MS >= worst,
    `${LIFECYCLE_SETTLE_MS} < ${worst} — the sweep would start over an entrance still playing`,
  );
  check(
    "and is well under the idle wait, so a fresh page is at rest quickly",
    LIFECYCLE_SETTLE_MS < IDLE_AFTER_MS,
    `settle ${LIFECYCLE_SETTLE_MS}ms vs idle ${IDLE_AFTER_MS}ms — a page nobody has touched is already at rest`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("the notation survives the motion");

{
  /* NO SVG FILTER, ANYWHERE. A percentage filter region is in
     `objectBoundingBox` units and every line on this canvas — the spine and
     all four legs of a return — is axis-aligned, so the region collapses in
     one axis and the paint lands somewhere else. */
  check(
    "no rule applies an SVG filter",
    !/\bfilter\s*:/.test(withoutComments),
    "a percentage filter region collapses on an axis-aligned line — that shipped on ER and cost three commits",
  );
  check(
    "and the component declares none either",
    !/\bfilter=/.test(diagramCode),
    "the same collapse, one layer up",
  );

  /* THE SWEEP RIDES ITS OWN LINE. A dasharray on `.af-lc-spine` would break
     the continuous mark a reader follows from one state to the next. */
  const spine = ruleBody(css, ".af-lc-spine");
  check(
    "the spine itself carries no resting dasharray — the sweep rides its own line",
    !/stroke-dasharray/.test(spine),
    spine,
  );
  check(
    "and the component draws the sweep as a separate element",
    /af-lc-sweep/.test(diagramCode) && /af-lc-spine/.test(diagramCode),
    "one element cannot be both the mark and the thing the mark travels along",
  );

  /* FOCUS DIMS AND ANIMATES, IT DOES NOT REPAINT. No stroke, fill, width or
     radius may change under `.af-lc-has-focus` — a focused dot that recolours
     is a new mark appearing where one already was. `stroke-dasharray` is the
     one exception and it is a real one: the travelling dash IS the animation,
     and a dash pattern is not a repaint of the line's colour or weight. */
  const focusRules = RULES.filter(([selector]) =>
    selector.includes("af-lc-has-focus"),
  );
  const repaints = focusRules.filter(([, body]) =>
    /(^|[^-])(fill|stroke|stroke-width|r)\s*:/.test(body),
  );
  check(
    `focus changes only opacity, dash and animation (${focusRules.length} focus rules)`,
    focusRules.length >= 3 && repaints.length === 0,
    repaints.map(([s]) => s).join(" | "),
  );

  /* THE ONE PLACE FOCUS MAY PAINT, and it is the keyboard exception the rules
     name: a keyboard user has no hover to fall back on. */
  check(
    "a keyboard focus ring is declared, which is the one painted focus allowed",
    /:focus-visible/.test(withoutComments),
    "without it a keyboard user cannot tell which state is selected",
  );
}

/* ----------------------------------------------------------------------- */
console.log("the TS/CSS pairs agree");

{
  const cssCap = Number(rootProp("lc-row-cap"));
  check(
    `--lc-row-cap (${cssCap}) equals LIFECYCLE.waveCap (${LIFECYCLE.waveCap})`,
    cssCap === LIFECYCLE.waveCap,
    "CSS cannot import TypeScript, so a drifting cap makes the budget above wrong with nothing failing",
  );
  check(
    "the component stamps the wave the stagger reads",
    /--lc-wave/.test(diagramCode),
    "a stylesheet stagger with nothing writing the index runs every element in phase",
  );

  /* THE SECOND PAIR, and it is the one that would go wrong silently: the
     stylesheet fades an unreachable row and the SVG exporter fades it again
     with its own constant, because a file inherits no stylesheet. Two numbers
     for one fact is exactly the "two halves of one thing" shape
     `codebase.md` names as this repo's most expensive failure class. */
  const fadeRule = RULES.find(([selector]) =>
    selector.includes('[data-reachable="0"]'),
  );
  const cssFade = Number(
    /opacity:\s*([\d.]+)/.exec(fadeRule?.[1] ?? "")?.[1] ?? NaN,
  );
  const tsFade = Number(
    /UNREACHABLE_OPACITY = ([\d.]+)/.exec(exportSvg)?.[1] ?? NaN,
  );
  check(
    `the unreachable fade agrees: CSS ${cssFade} = exporter ${tsFade}`,
    !Number.isNaN(cssFade) && cssFade === tsFade,
    "an exported file and the screen would disagree about how stranded a state is",
  );
}

/* ----------------------------------------------------------------------- */
console.log("the sweep says 'time', not 'where this one is now'");

{
  /* ASSERTED FROM THE COMPONENT'S GEOMETRY, not from the stylesheet's prose
     about it. arch-lab draws no today marker anywhere; on this canvas a
     playhead would be worse than elsewhere, because it would claim to say
     where THIS subject currently is — which no lifecycle document records. */
  const sweepTag = /<line\s+className="af-lc-sweep"[\s\S]*?\/>/.exec(
    diagramCode,
  );
  check(
    "the component draws the sweep as one line element",
    sweepTag !== null,
    "the geometry assertions below have nothing to read",
  );
  if (sweepTag !== null) {
    const tag = sweepTag[0];
    check(
      "both of the sweep's ends sit on the spine's own x",
      /x1=\{layout\.spineX\}/.test(tag) && /x2=\{layout\.spineX\}/.test(tag),
      `${tag.replace(/\s+/g, " ").slice(0, 160)} — a sweep that left the spine's column would be a marker across the states`,
    );
    check(
      "and it spans exactly the spine, not the canvas",
      /y1=\{layout\.spineY0\}/.test(tag) && /y2=\{layout\.spineY1\}/.test(tag),
      "a full-height sweep past the outermost state claims a passage the document does not contain",
    );
    check(
      /* THE STAMPED VALUE IS DERIVED, asked of the COMPONENT rather than of the
       tag. It used to require the subtraction inside the `<line>` itself,
       which made hoisting it to a named const — the shape the sweep's head cap
       needed — look like a regression. The claim was never "the arithmetic is
       written here"; it is "this number comes from the solved geometry rather
       than from a literal", and that survives the hoist. The timeline's twin
       of this assertion was the weaker one and checked only that the property
       was stamped at all; both now ask the same question. */
      "its travel length is stamped from the SOLVED spine, not typed into CSS",
      /--lc-spine-len/.test(tag) &&
        /layout\.spineY1 - layout\.spineY0/.test(diagram),
      "a hardcoded length drifts from the geometry the moment a document changes height",
    );
  }
  check(
    "and the stylesheet reads that property rather than a literal distance",
    /var\(--lc-spine-len\)/.test(withoutComments),
    "the dash maths must be in the same units as the line it rides",
  );
}

/* ----------------------------------------------------------------------- */
console.log("the connector motion says something (it is not decoration)");

{
  /* THE RULE'S OWN TEST, applied: would removing this motion lose
     information? The travelling dash answers "which way does the subject go
     along this line", which an 8-unit arrowhead at the far end of a
     four-segment path states weakly. These assertions pin the three things
     that make that true rather than the prose that claims it. */
  const travel = RULES.find(
    ([selector]) =>
      selector.includes("af-lc-return") && selector.includes("data-lit"),
  );
  check(
    "the travelling dash exists and runs only on a LIT return",
    travel !== undefined,
    "either there is no connector motion, or it is not scoped to focus — an unlit travelling dash is a second ambient",
  );
  if (travel !== undefined) {
    check(
      "and it is not also gated on at-rest — it answers a gesture, not idleness",
      !travel[0].includes('[data-idle="1"]'),
      "a focus motion that waits for the canvas to go quiet never plays: focusing IS an interaction",
    );
    check(
      "its dash pattern is a fixed length, so a long return and a short one travel alike",
      /--lc-travel-dash/.test(travel[1]) && /--lc-travel-gap/.test(travel[1]),
      "a dash expressed as a fraction of the path makes a long return look slower",
    );
  }

  /* THE DIRECTION, WHICH IS THE WHOLE POINT. `stroke-dashoffset` moves the
     dashes along the path's own direction, and the component writes every
     return FROM the exit TO the spine — so a path written the other way round
     would animate the subject arriving at the departure, which is the
     opposite claim. Nothing but this assertion would notice. */
  const points = /const points: \[number, number\]\[\] = \[([\s\S]*?)\];/.exec(
    diagramCode,
  );
  check(
    "the return path's points are listed in one place, so the direction is readable",
    points !== null,
    "the direction assertion below has nothing to read",
  );
  if (points !== null) {
    const body = points[1];
    const firstPoint = body.slice(0, body.indexOf("]") + 1);
    const lastStart = body.lastIndexOf("[");
    const lastPoint = body.slice(lastStart);
    check(
      "the path starts at the EXIT's dot and ends at the SPINE",
      /branchDotX/.test(firstPoint) &&
        /exit\.dotY/.test(firstPoint) &&
        /spineX/.test(lastPoint),
      `first ${firstPoint.replace(/\s+/g, " ")}, last ${lastPoint.replace(/\s+/g, " ")} — reversed, the dash would animate the opposite claim`,
    );
  }

  /* IT RIDES THE PATH ITSELF, which is the OPPOSITE of the sweep's rule, so
     the exception is asserted rather than left to look like an oversight: a
     return is one journey, not a continuous reference mark a reader is
     following, so a dash on it breaks nothing. */
  check(
    "the travelling dash rides the return path itself, not a second line",
    !/af-lc-return-sweep|af-lc-return-flow/.test(withoutComments) &&
      !/af-lc-return-sweep/.test(diagramCode),
    "a second overlaid line here would be two marks for one journey",
  );

  /* AND THE ARROWHEAD IS STILL THERE, which is what a reader who has turned
     motion off is left with. The dash is the better answer; the arrowhead is
     the answer that always works. */
  check(
    "a static arrowhead is drawn too, so direction survives reduced motion",
    /af-lc-arrow/.test(diagramCode),
    "with motion off there would be nothing at all saying which way a return goes",
  );

  /* THE MOTIONS THAT EXIST are each named by a keyframe, so one added without
     an argument is visible in a diff of this number. SIX FOR FOUR MOTIONS, not
     six motions: `af-lc-arrive` is the second half of motion 2, and it exists
     because the arrowhead is FILLED and a dashoffset cannot draw it. */
  const keyframes = [...withoutComments.matchAll(/@keyframes\s+([\w-]+)/g)].map(
    (match) => match[1],
  );
  check(
    `the canvas declares exactly the six keyframes its four motions need (${keyframes.join(", ")})`,
    keyframes.length === 6,
    "entrance rise, draw (shared by the spine and the returns), the arrowhead's arrival, the spine's wash, march (shared by a terminal branch's drift and the focus dash) and focus breathe — a seventh needs an argument in the stylesheet header",
  );

  /* THE ARROWHEAD DOES NOT ARRIVE BEFORE ITS LINE. It shipped doing exactly
     that: nothing sequenced it, so it appeared with its row and pointed into
     the spine for the ~500ms the path spent drawing towards it. Asserted as
     "it is delayed at all and it is hidden first", both of which the rule must
     carry — a fade with no delay would be the same defect 300ms slower. */
  const arrow = ruleBody(css, '.af-lc-canvas[data-reveal="1"] .af-lc-arrow');
  check(
    "the return's arrowhead is hidden until its path has been drawn to it",
    /opacity:\s*0\s*;/.test(arrow) &&
      /animation-delay:\s*calc\(/.test(arrow) &&
      /--lc-return-draw/.test(arrow),
    `${arrow || "no rule at all"} — an arrowhead with nothing attached to it is the one thing this canvas's single arrowhead must not look like`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("a returning branch is a broken line, and it travels");

/* WHAT THE DEFECT WAS. The march used to ride the SPINE, and before that the
   spine carried a lit head sized against its own length: `head` and
   `calc(spine-len - head)`. On a diagram shorter than the head that gap is
   NEGATIVE, and a negative value does not clamp — it invalidates the whole
   `stroke-dasharray`, which is dropped, and the line paints solid. The spine
   washes again now and `@/lib/sweep-head` caps its head, which is measured
   below; the march moved to the RETURNING branches — `exit … rejoins` — where
   it repeats a pattern of TWO CONSTANTS and cannot express that bug at all. It
   spent one commit on the terminal branches instead, which was the wrong half:
   a dash says "this continues somewhere", and a terminal exit means the
   opposite.

   THAT IS A PROPERTY WORTH PINNING rather than trusting: a later hand reaching
   for `--lc-spine-len` to make a branch's dashes "fit" would be walking back
   into it. */
{
  const march = RULES.find(
    ([selector]) =>
      selector.includes(".af-lc-return") && selector.includes("data-idle"),
  )?.[1];
  check(
    "a returning branch marches a repeating pattern, not a head sized to a line",
    march !== undefined && !/--lc-spine-len/.test(march),
    `${march ?? "no rule at all"} — sizing a repeating dash against a line reintroduces the negative gap that paints it solid`,
  );

  /* THE DRIFT STAYS THE QUIETER OF THE TWO MARCHES. They are one keyframe now,
     which is what makes this worth asserting: the focus dash means "the subject
     comes back HERE", and it can only mean that while the thing running unasked
     is visibly sparser and slower. */
  const length = (name) => Number.parseFloat(rootProp(name));
  const returnDash = length("lc-return-dash");
  const returnGap = length("lc-return-gap");
  const travelDash = length("lc-travel-dash");
  const travelGap = length("lc-travel-gap");
  const returnDuty = returnDash / (returnDash + returnGap);
  const travelDuty = travelDash / (travelDash + travelGap);
  const returnSpeed = (returnDash + returnGap) / ms("lc-return-drift");
  const travelSpeed = (travelDash + travelGap) / ms("lc-travel");
  check(
    `a resting return is sparser than the same path under focus (${(returnDuty * 100).toFixed(0)}% against ${(travelDuty * 100).toFixed(0)}%)`,
    returnDuty < travelDuty,
    "two marches at the same density are one mark, and lighting a branch then says nothing",
  );
  check(
    `and slower (${returnSpeed.toFixed(3)} against ${travelSpeed.toFixed(3)} units/ms)`,
    returnSpeed < travelSpeed,
    "a mark that runs unasked and keeps pace with the one a reader asked for competes with it",
  );

  /* AND BOTH ARE FAST ENOUGH TO BE SEEN. The ordering above was satisfiable all
     the way down and was once satisfied at 8.6 units per second, against a
     motion-detection threshold of roughly 3–7. `codebase.md` names the shape: a
     rule that says what to DO survives no case its author did not imagine. The
     floor is what makes the ordering safe. */
  const PERCEPTIBLE = 15 / 1000;
  const tooSlow = [
    ["a resting return's drift", returnSpeed],
    ["the focus dash", travelSpeed],
  ].filter(([, speed]) => speed < PERCEPTIBLE);
  check(
    `both marches are perceptibly moving (${(returnSpeed * 1000).toFixed(1)} and ${(travelSpeed * 1000).toFixed(1)} units/s, floor ${PERCEPTIBLE * 1000})`,
    tooSlow.length === 0,
    `${tooSlow.map(([name, speed]) => `${name} at ${(speed * 1000).toFixed(1)}`).join(", ")} — at that rate a pattern reads as a static dashed line`,
  );

  /* THE SPINE WASHES, AND ITS HEAD FITS. Same shape as the timeline's, same
     hazard: a flat head longer than the spine is a negative gap. */
  const cssHead = Number(rootProp("lc-sweep-head"));
  check(
    `the stylesheet's declared head is SWEEP_HEAD_MAX (${SWEEP_HEAD_MAX})`,
    cssHead === SWEEP_HEAD_MAX,
    `${cssHead} in CSS, ${SWEEP_HEAD_MAX} in @/lib/sweep-head — CSS cannot import TypeScript, so the pair is pinned here`,
  );
  check(
    "the component stamps the head, so the cap reaches the diagram at all",
    /--lc-sweep-head/.test(diagram) && /sweepHead\(/.test(diagram),
    "the stylesheet default would stand alone again, which is the flat number that shipped",
  );
  const tooLong = SPINES.filter(([, spineLength]) => {
    const head = sweepHead(spineLength);
    return head >= spineLength || head > spineLength * SWEEP_HEAD_SHARE + 0.001;
  });
  check(
    `every spine is longer than its own head (${SPINES.length} documents, shortest ${Math.min(...SPINES.map(([, l]) => l)).toFixed(1)})`,
    tooLong.length === 0,
    `${tooLong.map(([name, l]) => `${name}: head ${sweepHead(l).toFixed(1)} on a spine of ${l.toFixed(1)}`).join("; ")} — a gap of zero or less invalidates the dasharray and the wash becomes a solid line`,
  );

  /* NO KEYFRAME ANIMATES A LENGTH TO A UNITLESS `calc()`. This is the guard
     that caught a dashed line which rendered and never moved, and it was
     deleted by accident one commit later when this section was rewritten around
     the wash — the unused imports it left behind are the only reason that was
     noticed. Restored, and worth the second telling:

     `af-lc-march` animates `stroke-dashoffset` to a calc over two lengths. With
     those unitless the calc has type `<number>`, and SVG's bare-number
     allowance covers a literal TOKEN rather than a calc RESULT — so the
     declaration is invalid where a `<length>` is wanted and the browser drops
     it. `stroke-dasharray` accepts `<number>` outright, so the dashes render and
     simply sit there. Nothing errors, nothing logs, and every other assertion
     in this file passes.

     SWEPT OVER EVERY CANVAS, because the hazard is the shape and not the file.
     The timeline animates to a plain `var()` and the gantt, ER and sequence to
     literals; this is the only keyframe in the repo that does arithmetic, which
     is why it is the only one that was ever inert. */
  {
    const LENGTHS = /stroke-dash(offset|array)/;
    const dead = [];
    for (const feature of readdirSync(path.join(ROOT, "src/features"))) {
      const sheet = path.join(
        ROOT,
        `src/features/${feature}/styles/${feature}-motion.css`,
      );
      if (!existsSync(sheet)) continue;
      const text = readFileSync(sheet, "utf8").replace(
        /\/\*[\s\S]*?\*\//g,
        " ",
      );
      for (const block of text.matchAll(
        /@keyframes\s+([\w-]+)\s*\{([\s\S]*?\n\})/g,
      )) {
        for (const line of block[2].split("\n")) {
          if (!LENGTHS.test(line) || !/calc\(/.test(line)) continue;
          if (/\d(px|em|rem|%)/.test(line)) continue;
          const cited = [...line.matchAll(/var\((--[\w-]+)\)/g)].map(
            (match) => match[1],
          );
          /* THE `var()` CHAIN IS FOLLOWED TO ITS LITERAL. One level was not
             enough: `--lc-march-dash` is declared as `var(--lc-return-dash)`, so
             a check stopping at the first hop saw an alias rather than a
             number and called the real defect clean. */
          const literal = (name, depth = 0) => {
            if (depth > 6) return null;
            const declared = new RegExp(`${name}:\\s*([^;]+);`).exec(text);
            if (declared === null) return null;
            const value = declared[1].trim();
            const alias = /^var\((--[\w-]+)\)$/.exec(value);
            return alias === null ? value : literal(alias[1], depth + 1);
          };
          const unitless = cited.filter((name) => {
            const value = literal(name);
            return value !== null && /^[\d.]+$/.test(value);
          });
          if (cited.length === 0 || unitless.length > 0) {
            dead.push(
              `${feature}/@keyframes ${block[1]}: ${line.trim()}${unitless.length > 0 ? ` (${unitless.join(", ")} unitless)` : ""}`,
            );
          }
        }
      }
    }
    check(
      "no keyframe animates a dash length to a unitless calc()",
      dead.length === 0,
      `${dead.join("; ")} — calc() over numbers has type <number>, the declaration is invalid where a <length> is wanted, and the browser drops it silently: the dashes render and never move`,
    );
  }

  /* A RETURN IS A BROKEN LINE AT REST — declared outside the media query, so a
     reader with motion off and a downloaded file both keep it. This is a
     distinction; only its travel is an animation. */
  const resting = ruleBody(css, ".af-lc-return");
  check(
    "a returning branch is dashed even when nothing is moving",
    /stroke-dasharray:/.test(resting),
    `${resting || "no rule at all"} — with motion off the only thing separating a way BACK from a way OUT is the shape of the route, followed corner by corner`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("the entrance ends, and lets go of what it animated");

/* TWO DEFECTS, ONE CAUSE, AND THE CAUSE IS THAT THE ENTRANCE NEVER FINISHED.
   `data-reveal` was stamped as a literal, so every entrance rule kept matching
   for the life of the page — and every one of them is `forwards`, which means
   the animation goes on contributing its end value from the ANIMATION ORIGIN.
   That origin outranks normal author declarations. Everything follows from it:

     - FOCUS DIMMING COULD NOT WORK. `.af-lc-canvas.af-lc-has-focus .af-lc-row { opacity: 0.24 }`
       is a normal declaration, and the filled entrance holds the same property
       at 1. Nothing ever dimmed. Both this canvas and its neighbour shipped a
       focus state that was inert.
     - A LIT BRANCH VANISHED FOR 420ms. `.af-lc-return` had
       `animation` declared by BOTH the entrance and the focus rule. Focus is
       the more specific, so hovering swapped `af-lc-draw` for `af-lc-march`;
       leaving focus swapped it back, and a re-added animation is a NEW one — it
       replayed `animation-delay: var(--lc-spine-draw)` from the start. During
       that delay a `forwards` animation contributes nothing, so the base values
       stood: `stroke-dasharray: var(--lc-path-len)` against
       `stroke-dashoffset: var(--lc-path-len)`. An odd dash count is doubled, so
       that is one full period of offset — the whole path sitting in the gap.
       Invisible, for 420ms, every time the pointer left a branch. Measured on
       the starter: 1039.3 units in both properties.

   The fix is that the entrance is a PHASE and it ends: the viewer drops
   `data-reveal` once it has played, at the settle it already computes, and the
   handover is seamless because every filled end value equals the resting
   declaration underneath it. These two assertions say so — the first that the
   phase ends at all, the second that nothing is fighting over an `animation`
   while one is still running. */
{
  /* TWO HALVES, AND THE SECOND IS THE ONE THAT BITES. The first draft of this
     asserted only that the word "revealed" appeared in the viewer, and a break
     that renamed the state to `revealedAlways` and deleted the line that turns
     it off SAILED THROUGH — the assertion passed on exactly the defect it was
     written for. Binding the prop to an expression and actually turning it off
     are different claims and both have to be made. */
  check(
    "the entrance prop is bound to state, not stamped as a literal",
    /reveal=\{/.test(viewer),
    "a bare `reveal` keeps every `forwards` entrance rule matching for the life of the page",
  );
  check(
    "and that state is turned off once the entrance has played",
    /setRevealed\(false\)/.test(viewer),
    "state that is never lowered is a literal with extra steps, and an animation's fill outranks any focus declaration for the same property",
  );

  /* NO TWO RULES THAT CAN BOTH MATCH MAY DECLARE `animation`. Changing which
     animation applies restarts it, and a restarted one-shot replays its delay
     with no backwards fill — which is how a lit branch vanished. A PAIR SEARCH
     over the real rules, not a note about the one that broke. */
  const animated = RULES.filter(([, body]) => /\banimation:/.test(body));
  const target = (selector) => {
    const parts = selector.split(/\s+/).filter(Boolean);
    return parts[parts.length - 1].replace(/[:[].*$/, "");
  };
  const contested = [];
  for (const [aSel] of animated) {
    for (const [bSel] of animated) {
      if (aSel === bSel) continue;
      if (target(aSel) !== target(bSel)) continue;
      const reveal = /data-reveal="1"/.test(aSel);
      const focus = /has-focus/.test(bSel) && !/:not\(\[data-reveal/.test(bSel);
      if (reveal && focus)
        contested.push(`${target(aSel)}: ${aSel} vs ${bSel}`);
    }
  }
  check(
    "no element is handed two animations that can apply at once",
    contested.length === 0,
    `${contested.join(" | ")} — whichever wins RESTARTS, and a one-shot restarting replays its delay with the line hidden`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("the ambient survives a selection");

/* IT USED TO YIELD TO FOCUS, and that was correct while focus arrived on
   HOVER: a pointer resting on a row held it for a second, and pausing the
   ambient underneath was a moment. Selecting is a CLICK now, and a click PINS
   until it is clicked again or Escape is pressed — so the clause turned into
   "the canvas never moves again", and it was reported as looking lifeless.

   ASSERTED AS THE ABSENCE OF THE MECHANISM, like the hover rule in
   `check:view-input`, because restoring the yield is the obvious edit for
   anyone who reads the ambient's original argument without noticing that the
   interaction under it changed. In a diff it reads as a fix.

   THE GANTT IS NOT COVERED BY THIS AND MUST NOT BE. Its ambient and its focus
   current are the same animation on the same connectors at two speeds, so
   running both is one motion arguing with itself rather than two coexisting.
   That canvas keeps its yield, and the difference is a real one rather than an
   oversight — which is why this assertion lives in the two checks it applies
   to instead of being swept across every kind. */
{
  const ambient = RULES.filter(
    ([selector]) => /data-idle="1"/.test(selector) && /sweep/.test(selector),
  );
  check(
    `the ambient rule was found (${ambient.length})`,
    ambient.length === 1,
    "the selector moved, so the assertion below is measuring nothing",
  );
  check(
    "the ambient keeps running while a row is selected",
    ambient.every(([selector]) => !/:not\([^)]*has-focus/.test(selector)),
    `${ambient.map(([s]) => s).join(" | ")} — a pinned selection would stop the canvas moving for as long as it is held`,
  );
}

/* ----------------------------------------------------------------------- */
console.log(
  "reading does not stop the ambient, and the entrance keeps the pattern",
);

/* SCROLLING IS READING. The pane stirred the idle timer on `onPointerMove` and
   `onWheel` as well as on a press, so every wheel tick killed the ambient for
   three seconds — and scrolling is exactly how a reader looks at MORE of a
   diagram, which is when the ambient is most worth having. Reported as the
   animation dying on scroll.

   THE POINTER ONE WAS STALE RATHER THAN WRONG. It was put there when HOVERING
   selected a row: pausing while the reader picked one out made sense. Selecting
   takes a click now, so a pointer crossing the pane changes nothing at all and
   pausing for it buys nothing. A handler that outlives its reason is invisible
   in a diff — nothing about it looks wrong — so it is pinned here instead.

   ASSERTED AS THE ABSENCE OF THE MECHANISM, like the hover rule in
   `check:view-input`: re-adding `onPointerMove` is the obvious way to make a
   canvas "feel responsive", and it would read as an improvement. */
{
  const stirred = [...viewer.matchAll(/(on\w+)=\{stir\}/g)].map((m) => m[1]);
  check(
    `the idle timer is stirred by ${stirred.join(" and ") || "nothing"}`,
    stirred.length > 0 &&
      stirred.every(
        (handler) => handler === "onPointerDown" || handler === "onKeyDown",
      ),
    `${stirred.join(", ")} — a wheel or a pointer crossing the pane is a reader LOOKING, and stopping the ambient for it means it is off whenever anyone is using the diagram`,
  );

  /* AND THE ENTRANCE ARRIVES AS WHAT IT STAYS. Drawing a return means one dash
     the length of the path with its offset animated to zero — and that dash
     OVERRIDES the resting pattern, so the line came in solid and snapped to
     dashed the instant the entrance ended. What arrives has to be what stays,
     or the entrance is showing the reader a different mark. */
  const revealReturn = RULES.find(
    ([selector]) =>
      selector.includes(".af-lc-return") &&
      selector.includes('data-reveal="1"'),
  )?.[1];
  check(
    "the entrance does not override a return's dash pattern",
    revealReturn !== undefined && !/stroke-dasharray/.test(revealReturn),
    `${revealReturn ?? "no rule at all"} — a full-length dash paints the line solid while it arrives, and it changes shape when the entrance lets go`,
  );
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);
