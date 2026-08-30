#!/usr/bin/env node
/**
 * Milestone-timeline motion check: the stylesheet and the component that feeds
 * it.
 *
 * Mirrors `scripts/gantt-motion-check.mjs` group for group, minus the groups
 * that canvas needs and this one does not — there is no comet, no hatch and no
 * connector here, and asserting about any of them would be a vacuous check
 * reporting coverage it does not have (`new-diagram-type.md` names that as
 * worse than no check). What replaces them is group 7, which is specific to
 * this notation.
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
 *   1. Every `af-timeline-*` class the stylesheet targets is actually EMITTED
 *      by `timeline-diagram.tsx`, and every class list in that component is an
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
 *      TWO THINGS ARE ASSERTED ABOUT THAT GATE THAT ER'S CHECK DOES NOT:
 *        - THE SPELLING IS `data-af-idle`, never `data-idle-motion`. ER's
 *          stylesheet gates on the latter, NOTHING IN THE APP STAMPS IT, and
 *          ER's ambient pulse has therefore never been switchable. Its own
 *          check passes because it only counts that such a rule EXISTS.
 *        - SOMETHING ACTUALLY STAMPS IT, checked against the component, so a
 *          rule gating on an attribute nobody writes fails here rather than
 *          shipping as a dead switch.
 *
 *      FOCUS MOTION IS EXEMPT FROM THE IDLE GATE, and that is the
 *      preference's own rule: `src/lib/idle-motion.ts` says in as many words
 *      that "motion the reader ASKED for … is not idle motion and is not
 *      gated by this". So the assertion is per-rule.
 *
 *   3. THE RESTING STATE IS A COMPLETE DIAGRAM. Nothing outside the media
 *      query sets `opacity: 0` on an event — a no-JS, reduced-motion reader
 *      must see the whole history, not an empty spine waiting for an
 *      animation that will never play. This is also what the crawlable example
 *      pages and the SVG export ship.
 *
 *   4. THE REVEAL FITS ITS BUDGET, computed FROM THE STYLESHEET'S OWN CUSTOM
 *      PROPERTIES rather than from numbers typed here, so retuning a property
 *      changes what this check enforces instead of drifting from it. Worst
 *      case must stay under 1.5s — the budget every other canvas is held to —
 *      and `TIMELINE_SETTLE_MS` must be at or above it, or the ambient starts
 *      on top of the entrance.
 *
 *   5. NO `filter` ANYWHERE. A percentage filter region is in
 *      `objectBoundingBox` units, and the spine is a vertical line — a
 *      zero-extent box in one axis — so the region collapses and the browser
 *      paints somewhere else entirely. That shipped on the ER canvas and cost
 *      three commits, every one of them adjusting a stroke, because no stroke
 *      was drawing it.
 *
 *   6. THE STAGGER CAP AGREES ACROSS THE TS/CSS BOUNDARY. `--tl-event-cap`
 *      must equal `TIMELINE.waveCap`. CSS cannot import TypeScript, so the
 *      pair is genuinely duplicated and has to be pinned — the
 *      `check:sequence-motion` precedent. A cap that drifts makes the budget
 *      in group 4 wrong without anything failing.
 *
 *   7. THE SWEEP IS NOT A TODAY MARKER, and this is the group specific to
 *      this canvas. arch-lab draws no today line anywhere on purpose: a share
 *      link carries its document but not the day it was minted, so a playhead
 *      would tell every reader after the first something different and wrong.
 *      A mark travelling down a vertical spine is ONE CHANGED COORDINATE from
 *      being exactly that, so its confinement to the spine's own x is asserted
 *      FROM THE COMPONENT'S GEOMETRY rather than from the stylesheet's prose
 *      about it. The same group pins the sweep's travel length to the SOLVED
 *      spine rather than to a number typed into CSS.
 *
 *   8. NO CONNECTOR MOTION IS INVENTED. This canvas has no connectors, so
 *      `new-diagram-type.md`'s connector rule is satisfied vacuously — and its
 *      own remedy applies: do not draw a connector in order to have something
 *      to animate. Asserted as an absence, because the pressure to add one
 *      comes from a rule rather than from a reader.
 *
 * Exits non-zero on any failure. Run with: pnpm check:timeline-motion
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { registerTsResolution } from "./lib/resolve-ts.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

const { TIMELINE, layoutTimeline } = await load(
  "src/features/timeline/lib/layout.ts",
);
const { SWEEP_HEAD_MAX, SWEEP_HEAD_SHARE, sweepHead } = await load(
  "src/lib/sweep-head.ts",
);
const { parseTimelineText } = await load("src/features/archtext/index.ts");
const { TIMELINE_EXAMPLE } = await load(
  "src/features/timeline/input/example.ts",
);
const { listTimelineExampleIds, loadTimelineExample } = await load(
  "src/features/timeline/service/example-service.ts",
);
const { VIEW_STARTER_TEXT } = await load(
  "src/features/playground/input/parse.ts",
);

/* EVERY SPINE THIS REPO CAN PRODUCE A LENGTH FOR, plus the smallest document
   the grammar accepts. The bundled ones are read from the REGISTRY so a third
   example is covered the day it lands; the two-event document is written out
   because no registry will ever hold the minimum on purpose, and the minimum
   is where the defect lived. */
const spineOf = (file) => {
  const laid = layoutTimeline(file);
  return Math.max(1, laid.spineY1 - laid.spineY0);
};
const SPINES = [
  ["seed", spineOf(parseTimelineText(TIMELINE_EXAMPLE))],
  ...listTimelineExampleIds()
    .map((id) => [id, loadTimelineExample(id)])
    .filter(([, example]) => example.status === "ok")
    .map(([id, example]) => [id, spineOf(example.file)]),
  ["starter", spineOf(parseTimelineText(VIEW_STARTER_TEXT.timeline))],
  [
    "the smallest timeline there is",
    spineOf(
      parseTimelineText(
        `archlab 1.0 timeline\ntitle "T"\n\n@timeline\n  period "P"\n    event "A"\n    event "B"\n`,
      ),
    ),
  ],
];
const { IDLE_AFTER_MS, TIMELINE_SETTLE_MS } = await load(
  "src/features/timeline/lib/motion.ts",
);

const css = read("src/features/timeline/styles/timeline-motion.css");
const diagram = read("src/features/timeline/components/timeline-diagram.tsx");
const viewer = read("src/features/timeline/components/timeline-viewer.tsx");
const exportSvg = read("src/features/timeline/export/render-svg.ts");

/* The canvas with its comments stripped. Several assertions below name a
   mechanism in order to FORBID it, and every one of those words also appears
   in the prose beside the code explaining why it was rejected. Scanning the
   raw file would match the explanation and pass with the mistake present —
   the `canvas-edit-check.mjs` precaution. */
const diagramCode = diagram.replace(/\/\*[\s\S]*?\*\//g, "");
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

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
  .map((match) => [match[1].trim(), match[2]])
  .filter(
    ([selector]) =>
      !selector.startsWith("@") &&
      !/^(from|to|[\d.]+%(\s*,\s*(from|to|[\d.]+%))*)$/.test(selector),
  );

/** A custom property's value from the canvas root's own block. */
const rootProp = (name) => {
  const body = ruleBody(css, ".af-timeline-canvas");
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
    [...css.matchAll(/\.(af-timeline-[a-z-]+)/g)].map((match) => match[1]),
  );
  const emitted = new Set(
    [...diagram.matchAll(/"(af-timeline-[a-z-]+)"/g)].map((match) => match[1]),
  );

  check(
    `the stylesheet targets classes at all (${targeted.size} found)`,
    targeted.size >= 8,
    "nothing to compare — the rest of this group would pass vacuously",
  );

  const orphans = [...targeted].filter(
    (name) => !emitted.has(name) && name !== "af-timeline-has-focus",
  );
  check(
    "every class the stylesheet targets is emitted by the component",
    orphans.length === 0,
    `${orphans.join(", ")} — a rule that matches nothing is not an error, it is a rule that never runs`,
  );
  check(
    "the focus class is composed rather than written as a literal",
    /af-timeline-has-focus/.test(diagramCode),
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
 * is written `calc(var(--tl-wave, 0) * var(--tl-breathe-step) * -1)`, and a
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
      isInfinite(body) && guarded.includes(selector.split(",")[0].trim()),
  );
  check(
    `the canvas has ambient and focus motion to gate at all (${infinite.length} infinite animations)`,
    infinite.length >= 2,
    "nothing infinite — the rest of this section would pass vacuously",
  );

  const ungated = infinite.filter(
    ([selector]) =>
      !selector.includes('[data-af-idle="on"]') &&
      !selector.includes("af-timeline-has-focus"),
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
    `the ambient sweep is gated on [data-af-idle="on"] (${ambient.length} rule(s))`,
    ambient.length >= 1,
    "nothing ambient is gated — the app-wide idle toggle would do nothing here",
  );
  check(
    "the ambient sweep also yields when the canvas is not at rest",
    ambient.every(([selector]) => selector.includes('[data-idle="1"]')),
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
    .map((match) => [match[1].trim(), match[2]])
    .filter(([selector]) => !selector.startsWith("@"));

  /* `0` EXACTLY, not `0.55`: matching `0` followed by any non-digit reports
     every partial opacity on the canvas — the period rules are drawn at 0.55
     and are not hidden. The decimal point is the whole difference. */
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
     would leave a permanent extra event at the top of the spine. */
  const sweep = ruleBody(css, ".af-timeline-sweep");
  check(
    "the sweep is inert at rest via a zero-length dash, not opacity",
    /stroke-dasharray:\s*0\s/.test(sweep) && !/opacity:\s*0/.test(sweep),
    sweep,
  );
  check(
    "and carries a butt cap, so the zero-length dash paints nothing",
    /stroke-linecap:\s*butt/.test(sweep),
    "a round cap paints a dot at a zero-length dash — a permanent extra event on the spine",
  );

  /* THE STILL EXPORT IS THE RESTING FRAME. The SVG exporter must emit no
     animation and no sweep: a still frame of a travelling mark is a stray
     dash across the file. */
  check(
    "the SVG export emits no animation of any kind",
    !/animate|@keyframes|animation/i.test(
      exportSvg.replace(/\/\*[\s\S]*?\*\//g, ""),
    ),
    "an exported file has no clock; a frozen travelling mark is a stray dash",
  );
  check(
    "and does not emit the sweep line at all",
    !/af-timeline-sweep|sweep/i.test(
      exportSvg.replace(/\/\*[\s\S]*?\*\//g, ""),
    ),
    "an inert path shipped in every exported file",
  );
}

/* ----------------------------------------------------------------------- */
console.log("budget");

{
  const rise = ms("tl-event-rise");
  const beat = ms("tl-event-beat");
  const cap = Number(rootProp("tl-event-cap"));
  const spineDraw = ms("tl-spine-draw");

  check(
    "the reveal timings are readable from the stylesheet's own properties",
    rise !== null && beat !== null && spineDraw !== null && !Number.isNaN(cap),
    `rise=${rise} beat=${beat} cap=${cap} spine=${spineDraw}`,
  );

  /* COMPUTED FROM THE STYLESHEET, never typed here: the last event starts
     after the full capped stagger and takes `rise` to arrive, and the spine
     draws in parallel from zero. The worst case is whichever finishes last. */
  const worst = Math.max(cap * beat + rise, spineDraw);
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
    `TIMELINE_SETTLE_MS (${TIMELINE_SETTLE_MS}ms) is at least the reveal's worst case`,
    TIMELINE_SETTLE_MS >= worst,
    `${TIMELINE_SETTLE_MS} < ${worst} — the sweep would start over an entrance still playing`,
  );
  check(
    "and is well under the idle wait, so a fresh page is at rest quickly",
    TIMELINE_SETTLE_MS < IDLE_AFTER_MS,
    `settle ${TIMELINE_SETTLE_MS}ms vs idle ${IDLE_AFTER_MS}ms — a page nobody has touched is already at rest`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("the notation survives the motion");

{
  /* NO SVG FILTER, ANYWHERE. A percentage filter region is in
     `objectBoundingBox` units and this canvas's spine is a vertical line, so
     the region collapses in x and the paint lands somewhere else. */
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

  /* THE SWEEP RIDES ITS OWN LINE. A dasharray on `.af-timeline-spine` would
     break the continuous mark a reader follows from one event to the next. */
  const spine = ruleBody(css, ".af-timeline-spine");
  check(
    "the spine itself carries no resting dasharray — the sweep rides its own line",
    !/stroke-dasharray/.test(spine),
    spine,
  );
  check(
    "and the component draws the sweep as a separate element",
    /af-timeline-sweep/.test(diagramCode) &&
      /af-timeline-spine/.test(diagramCode),
    "one element cannot be both the mark and the thing the mark travels along",
  );

  /* FOCUS DIMS AND ANIMATES, IT DOES NOT REPAINT. No stroke, fill, width or
     radius may change under `.af-timeline-has-focus` — a focused dot that
     recolours is a new mark appearing where one already was. */
  const focusRules = RULES.filter(([selector]) =>
    selector.includes("af-timeline-has-focus"),
  );
  const repaints = focusRules.filter(([, body]) =>
    /(^|[^-])(fill|stroke|stroke-width|r)\s*:/.test(body),
  );
  check(
    `focus changes only opacity and animation (${focusRules.length} focus rules)`,
    focusRules.length >= 2 && repaints.length === 0,
    repaints.map(([s]) => s).join(" | "),
  );

  /* THE ONE PLACE FOCUS MAY PAINT, and it is the keyboard exception the rules
     name: a keyboard user has no hover to fall back on. */
  check(
    "a keyboard focus ring is declared, which is the one painted focus allowed",
    /:focus-visible/.test(withoutComments),
    "without it a keyboard user cannot tell which event is selected",
  );
}

/* ----------------------------------------------------------------------- */
console.log("the stagger cap agrees across the TS/CSS boundary");

{
  const cssCap = Number(rootProp("tl-event-cap"));
  check(
    `--tl-event-cap (${cssCap}) equals TIMELINE.waveCap (${TIMELINE.waveCap})`,
    cssCap === TIMELINE.waveCap,
    "CSS cannot import TypeScript, so a drifting cap makes the budget above wrong with nothing failing",
  );
  check(
    "the component stamps the wave the stagger reads",
    /--tl-wave/.test(diagramCode),
    "a stylesheet stagger with nothing writing the index runs every element in phase",
  );
}

/* ----------------------------------------------------------------------- */
console.log("the sweep says 'time', not 'today'");

{
  /* ASSERTED FROM THE COMPONENT'S GEOMETRY, not from the stylesheet's prose
     about it. arch-lab draws no today marker anywhere: a share link carries
     its document but not the day it was minted, so a playhead would tell every
     reader after the first something different and wrong. A mark travelling
     down a vertical spine is one changed coordinate away from being one. */
  const sweepTag = /<line\s+className="af-timeline-sweep"[\s\S]*?\/>/.exec(
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
      `${tag.replace(/\s+/g, " ").slice(0, 160)} — a sweep that left the spine's column would be a marker across the events`,
    );
    check(
      "and it spans exactly the spine, not the canvas",
      /y1=\{layout\.spineY0\}/.test(tag) && /y2=\{layout\.spineY1\}/.test(tag),
      "a full-height sweep past the outermost event claims time the document does not contain",
    );
    check(
      /* THE STAMPED VALUE IS DERIVED, asked of the COMPONENT rather than of the
       tag. It used to require the subtraction inside the `<line>` itself,
       which made hoisting it to a named const — the shape the sweep's head cap
       needed — look like a regression. The claim was never "the arithmetic is
       written here"; it is "this number comes from the solved geometry rather
       than from a literal", and that survives the hoist. The lifecycle's twin
       of this assertion was the weaker one and checked only that the property
       was stamped at all; both now ask the same question. */
      "its travel length is stamped from the SOLVED spine, not typed into CSS",
      /--tl-spine-len/.test(tag) &&
        /layout\.spineY1 - layout\.spineY0/.test(diagram),
      "a hardcoded length drifts from the geometry the moment a document changes height",
    );
  }
  check(
    "and the stylesheet reads that property rather than a literal distance",
    /var\(--tl-spine-len\)/.test(withoutComments),
    "the dash maths must be in the same units as the line it rides",
  );
}

/* ----------------------------------------------------------------------- */
console.log("no connector motion is invented");

{
  /* THE CONNECTOR RULE IS SATISFIED VACUOUSLY HERE, exactly as it is for the
     data dictionary, and `new-diagram-type.md` states the remedy the rule
     itself needs: do not draw a connector in order to have something to
     animate. That pressure comes from a rule rather than from a reader, which
     is why it is worth asserting as an absence — the ER canvas grew a pulse,
     then a glow, then a filter, then two bands across the diagram, and every
     step of that chain was asked for by the rule alone. */
  check(
    "the canvas draws no connectors — the connector rule is satisfied by absence",
    !/af-timeline-edge|af-timeline-connector|<path/.test(diagramCode),
    "a connector on this canvas would be a dependency, which is the gantt's subject and the one thing this notation may not grow",
  );
  check(
    "and the stylesheet styles none",
    !/af-timeline-(edge|arrow|flow)/.test(withoutComments),
    "a rule for a connector that does not exist is either dead or a plan to add one",
  );

  /* THE THREE MOTIONS THAT DO EXIST are each named by a keyframe, so a fourth
     added without an argument is visible in a diff of this number. */
  const keyframes = [...withoutComments.matchAll(/@keyframes\s+([\w-]+)/g)].map(
    (match) => match[1],
  );
  check(
    `the canvas declares exactly the four keyframes its three motions need (${keyframes.join(", ")})`,
    keyframes.length === 4,
    "entrance rise, spine draw, sweep and focus breathe — a fifth needs an argument in the stylesheet header",
  );
}

/* ----------------------------------------------------------------------- */
console.log("the sweep's head fits the spine it travels");

/* THE DEFECT: both stylesheets held a flat head and paired it with
   `calc(spine-len - head)` as the gap. On any spine shorter than the head that
   gap is NEGATIVE, and a negative value does not clamp — it invalidates the
   whole `stroke-dasharray`, which is then dropped, and the ambient paints the
   line SOLID and pulses it on and off for ever. A timeline built from the
   smallest document the notation accepts measures well under it.

   MEASURED OVER REAL LAYOUTS, not asserted about the constant. A rule that
   only read `SWEEP_HEAD_MAX < something` would be a restatement; what has to
   be true is that on EVERY document this repo ships, and on the smallest one
   it accepts, the head is shorter than the line — and shorter by enough that
   what travels still reads as a head rather than as the line itself. */
{
  const cssHead = Number(rootProp("tl-sweep-head"));
  check(
    `the stylesheet's declared head is SWEEP_HEAD_MAX (${SWEEP_HEAD_MAX})`,
    cssHead === SWEEP_HEAD_MAX,
    `${cssHead} in CSS, ${SWEEP_HEAD_MAX} in @/lib/sweep-head — CSS cannot import TypeScript, so the pair is pinned here`,
  );
  check(
    "the component stamps the head, so the cap reaches the diagram at all",
    /--tl-sweep-head/.test(diagram) && /sweepHead\(/.test(diagram),
    "the stylesheet default would stand alone again, which is the flat number that shipped",
  );

  const tooLong = [];
  for (const [name, length] of SPINES) {
    const head = sweepHead(length);
    if (head >= length)
      tooLong.push(
        `${name}: head ${head.toFixed(1)} on a spine of ${length.toFixed(1)}`,
      );
    else if (head > length * SWEEP_HEAD_SHARE + 0.001)
      tooLong.push(
        `${name}: head ${head.toFixed(1)} is over ${SWEEP_HEAD_SHARE} of ${length.toFixed(1)}`,
      );
  }
  check(
    `every spine is longer than its own head (${SPINES.length} documents, shortest ${Math.min(...SPINES.map(([, l]) => l)).toFixed(1)})`,
    tooLong.length === 0,
    `${tooLong.join("; ")} — a gap of zero or less invalidates the dasharray and the ambient becomes a solid line`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("the entrance ends, and lets go of what it animated");

/* TWO DEFECTS, ONE CAUSE, AND THE CAUSE IS THAT THE ENTRANCE NEVER FINISHED.
   `data-reveal` was stamped as a literal, so every entrance rule kept matching
   for the life of the page — and every one of them is `forwards`, which means
   the animation goes on contributing its end value from the ANIMATION ORIGIN.
   That origin outranks normal author declarations. Everything follows from it:

     - FOCUS DIMMING COULD NOT WORK. `.af-timeline-canvas.af-timeline-has-focus .af-timeline-event { opacity: 0.24 }`
       is a normal declaration, and the filled entrance holds the same property
       at 1. Nothing ever dimmed. Both this canvas and its neighbour shipped a
       focus state that was inert.
     - THIS CANVAS HAS NO SECOND HALF. The lifecycle also had a
       connector whose `animation` was claimed by two rules at once; the
       timeline draws no returning branch, so only the dead focus dimming
       reached here. The pair search below is kept all the same — it is the
       assertion that would have caught the other one.

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

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);
