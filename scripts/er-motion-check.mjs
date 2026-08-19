#!/usr/bin/env node
/**
 * ER motion check: the stylesheet and the component that feeds it.
 *
 * The single most valuable assertion here is (1). CSS FAILS SILENTLY — a
 * selector that matches nothing is not an error, it is just a rule that never
 * runs. THE DEFECT THIS EXISTS FOR: the canvas built its class list as
 * `` `af-er-edge af-er-${state}${dashed ? " af-er-edge-dashed" : ""}` `` and
 * the leading space was lost, so a dashed connector rendered
 * `af-er-noneaf-er-edge-dashed` — one nonsense class instead of two. Every
 * dashed-line rule in the stylesheet stopped applying and NOTHING reported
 * it: the page rendered, the build passed, `check:er-layout` passed, and the
 * only symptom was a line that quietly failed to march.
 *
 * What it proves:
 *
 *   1. Every `af-er-*` class the stylesheet targets is actually emitted by
 *      the component, and the dashed-connector class in particular is emitted
 *      as its own joined entry rather than concatenated onto another. The
 *      reverse direction is deliberately not asserted — see the note beside
 *      it for why a class with no rule is legitimate.
 *   2. Motion is OPT-OUT TWICE. Every `animation` in the file sits inside
 *      `prefers-reduced-motion: no-preference`, and every ambient (infinite)
 *      animation has a `[data-idle-motion="off"]` rule that stops it. A
 *      first-paint animation cannot be suppressed by JavaScript, so the media
 *      query is the only thing that can hold the reveal still.
 *   3. The resting state is a COMPLETE diagram. Nothing outside the media
 *      query sets `opacity: 0` on an entity or an edge — a no-JS,
 *      reduced-motion reader must see the whole thing, not an empty canvas
 *      waiting for an animation that will never play.
 *   4. The reveal fits its budget. Worst case is the capped entity stagger
 *      plus the rise plus the last edge's delay and draw, computed from the
 *      stylesheet's own custom properties, and it must stay under 1.5s —
 *      the same budget `check:usecase-motion` holds its canvas to.
 *   5. The pulse is drawn as a SEPARATE path, never as a dash on the base
 *      line. A solid line means identifying and a dashed one means it is
 *      not, so animating the base line's dasharray would change what the
 *      diagram says about identity.
 *
 * Exits non-zero on any failure. Run with: pnpm check:er-motion
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

const css = read("src/features/er/styles/er-motion.css");
const diagram = read("src/features/er/components/er-diagram.tsx");

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

/* ----------------------------------------------------------------------- */
console.log("classes (the stylesheet and the component must agree)");

{
  /* Classes the STYLESHEET targets. */
  const targeted = new Set(
    [...css.matchAll(/\.(af-er-[a-z-]+)/g)].map((match) => match[1]),
  );

  /* Classes the COMPONENT can emit. Two forms: plain string literals in the
     class arrays, and the `af-er-${state}` template whose states are the
     union spelled beside it. */
  const emitted = new Set(
    [...diagram.matchAll(/"(af-er-[a-z-]+)"/g)].map((match) => match[1]),
  );
  for (const state of ["none", "focused", "related", "dimmed", "lit"]) {
    emitted.add(`af-er-${state}`);
  }

  const orphanRules = [...targeted].filter((name) => !emitted.has(name));
  check(
    "every af-er-* class the stylesheet targets is emitted by the canvas",
    orphanRules.length === 0,
    `styled but never rendered: ${orphanRules.join(", ")} — a CSS selector that matches nothing fails silently`,
  );

  /* The reverse direction is NOT asserted wholesale, and the first draft of
     this check was wrong to try. Plenty of emitted classes are hooks with no
     rule of their own — the state classes (`af-er-none`, `af-er-focused`,
     `af-er-related`) exist so a rule CAN target them, `af-er-edge-label` is a
     grouping handle, and `af-er-shadow` is not a class at all but a filter
     id that happens to match the prefix. Failing on those punishes correct
     code. What matters is the direction above (a rule that matches nothing)
     plus the one specific pairing the bug broke: */
  check(
    "the dashed-connector class is emitted as its OWN class, not merged into the state class",
    /"af-er-edge-dashed"/.test(diagram) &&
      /\.filter\(Boolean\)[\s\S]{0,40}\.join\(" "\)/.test(diagram),
    "af-er-edge-dashed must be a separate array entry joined with a space — concatenating it onto `af-er-${state}` is how it was lost",
  );

  /* The exact shape of the bug: a class list built by concatenation where a
     literal must supply its own separating space. Joining is used instead,
     so no `af-er-*` literal may sit directly against a `}` interpolation. */
  check(
    "no class list is built by bare concatenation, where a lost space merges two classes",
    !/\$\{[^}]*\}"?af-er-/.test(diagram) &&
      !/`af-er-[a-z-]*\$\{[^}]*\}af-er-/.test(diagram),
    'build class lists with an array + join(" ") — see this file\'s header',
  );
}

/* ----------------------------------------------------------------------- */
console.log("opt out twice");

{
  const guarded = css.slice(
    css.indexOf("@media (prefers-reduced-motion: no-preference)"),
  );
  const unguarded = css.slice(
    0,
    css.indexOf("@media (prefers-reduced-motion: no-preference)"),
  );
  check(
    "no animation is declared outside the reduced-motion media query",
    !/\banimation(-name)?\s*:/.test(unguarded),
    "a first-paint animation cannot be suppressed by JS — the media query is the only gate",
  );

  const infinite = [...guarded.matchAll(/animation:[^;]*infinite/g)].length;
  const idleOff = [...css.matchAll(/\[data-idle-motion="off"\]/g)].length;
  check(
    `every ambient animation has an idle-motion escape (${infinite} infinite, ${idleOff} escapes)`,
    infinite > 0 && idleOff >= infinite,
    `${infinite} infinite animations but only ${idleOff} [data-idle-motion="off"] rules`,
  );

  check(
    "the resting state is a complete diagram, not an empty canvas",
    !/opacity:\s*0\s*;/.test(
      unguarded.replace(/\.af-er-edge-pulse\s*\{[^}]*\}/g, ""),
    ),
    "something outside the media query hides an entity or an edge",
  );
}

/* ----------------------------------------------------------------------- */
console.log("budget");

{
  const ms = (name) => {
    const match = new RegExp(`--${name}:\\s*(\\d+)ms`).exec(css);
    if (match === null) throw new Error(`no --${name} in the stylesheet`);
    return Number(match[1]);
  };
  const capMatch = /--er-wave-cap,\s*(\d+)/.exec(css);
  const cap = capMatch === null ? 6 : Number(capMatch[1]);

  /* Worst case: the last column's box arrives, then the last edge draws. Ten
     edges is a generous stand-in for a real schema's connector count. */
  const worst =
    cap * ms("er-entity-beat") +
    ms("er-entity-rise") +
    10 * ms("er-edge-beat") +
    ms("er-edge-draw");
  check(
    `the reveal finishes inside 1.5s (worst case ${worst}ms)`,
    worst <= 1500,
    `${worst}ms — a reveal longer than this reads as the page being slow`,
  );

  /* THE BLINK. A POSITIVE delay on an infinite animation is invisible until
     an ancestor class changes — then the animation restarts and replays its
     silent head, so the mark disappears for the length of the delay. That is
     exactly what leaving focus looked like: every connector vanished for
     ~1.3s and came back. A negative delay staggers without ever waiting. */
  /* Scoped to the pulse's OWN rule blocks: a lazy match across the whole
     stylesheet ran past this rule into the entity's, and reported the
     entity's positive delay as the pulse's. */
  const pulseBlocks = [
    ...css.matchAll(/\.af-er-edge-pulse[^{]*\{([^}]*)\}/g),
  ].map((match) => match[1]);
  const pulseDelay = pulseBlocks
    .map((block) => /animation-delay:([^;]+);/.exec(block))
    .find((match) => match !== null);
  check(
    "the ambient pulse staggers with a NEGATIVE delay, so a restart is invisible",
    pulseDelay !== undefined && /-1|:\s*-/.test(pulseDelay[1]),
    pulseDelay === undefined
      ? "the pulse declares no animation-delay at all"
      : `got ${pulseDelay[1].trim()} — a positive delay makes every focus change blink the connectors off and on`,
  );

  check(
    "the focused line travels more slowly than the ambient pulse",
    ms("er-current") > ms("er-pulse"),
    `current ${ms("er-current")}ms vs pulse ${ms("er-pulse")}ms — a focused line is being read, and a fast mark reads as a flicker`,
  );

  check(
    "the ambient pulse is slow enough not to nag (>= 2s per travel)",
    ms("er-pulse") >= 2000,
    `${ms("er-pulse")}ms — fast repeating motion in peripheral vision reads as a distraction`,
  );

  const capInTs = /const WAVE_CAP = (\d+);/.exec(diagram);
  check(
    "the stagger cap is the same number in the stylesheet and the canvas",
    capInTs !== null && Number(capInTs[1]) === cap,
    `canvas says ${capInTs?.[1]}, stylesheet says ${cap} — CSS cannot import, so this pair is held by hand and pinned here`,
  );
}

/* ----------------------------------------------------------------------- */
console.log("the notation survives the motion");

{
  check(
    "the pulse is a separate path, not a dash on the base line",
    /className="af-er-edge-pulse"/.test(diagram) &&
      /\.af-er-edge-pulse\s*\{[^}]*stroke-dasharray/.test(css),
    "the pulse must ride over the line — dashing the base line would make a solid (identifying) relationship read as dashed",
  );
  /* The FOCUS CURRENT is the one sanctioned exception: a reader asked for it
     by clicking, it is temporary, and the panel states the line's kind in
     words while it runs. Scoped out here rather than left to a looser regex,
     so the assertion still bites everywhere else. */
  const withoutFocusCurrent = css.replace(
    /\.af-er-has-focus[^{]*\{[^}]*\}/g,
    "",
  );
  /* FOCUS MUST NOT RESTYLE THE NOTATION. A solid line means identifying; the
     first focus treatment gave the lit line a dasharray, so focusing a solid
     relationship silently redrew it as a non-identifying one for as long as
     it was focused. */
  const litRules = [...css.matchAll(/\.af-er-lit[^{]*\{([^}]*)\}/g)]
    .map((match) => match[1])
    .join("\n");
  check(
    "focusing a line never dashes it — the lit treatment is a glow, not a restyle",
    !/stroke-dasharray/.test(litRules),
    "a lit rule sets stroke-dasharray: focus would turn an identifying relationship into a non-identifying one",
  );
  check(
    "the focused line's emphasis is a glow filter",
    /\.af-er-lit[^{]*\{[^}]*filter:\s*url\(#af-er-glow\)/.test(css) &&
      /id="af-er-glow"/.test(diagram),
    "the lit pulse should use the glow filter defined in the canvas defs",
  );

  check(
    "no rule animates the base line's dasharray outside the focus current",
    !/\.af-er-edge-line\s*\{[^}]*stroke-dasharray:\s*\d+\s+\d+/.test(
      withoutFocusCurrent,
    ),
    "a travelling dash on the base line changes what the line says about identity",
  );
}

/* ----------------------------------------------------------------------- */

console.log("");
if (failures > 0) {
  console.error(`${failures} of ${assertions} assertions failed.`);
  process.exit(1);
}
console.log(`All ${assertions} assertions passed.`);
