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
const viewer = read("src/features/er/components/er-viewer.tsx");

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
      /* The pulse AND its halo are hidden at rest by design — they are the
         travelling mark, not part of the resting diagram. */
      unguarded.replace(/\.af-er-edge-pulse[\s\S]{0,40}?\{[^}]*\}/g, ""),
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

  /* THE COMET'S GEOMETRY, and the defect that bought every line of it. The
     three bands were first given the flowchart's own dash lengths — tail 0.6,
     i.e. SIXTY PER CENT of the connector. That reads as a wash there because
     the flowchart blurs its tail to nothing; these bands cannot be blurred (a
     straight connector's bounding box is zero-height, the scar recorded beside
     `defs` in er-diagram.tsx), so the same number painted a crisp violet tube
     down the whole line and shipped as "the highlight is ugly".

     Three relations are asserted, and none of them restates the CSS:
       - a band is a PULSE, not a belt: under a quarter of the path;
       - every band shares one period, or the trio drifts apart and wraps
         visibly;
       - each keyframe travels exactly its own band's period. That pair is
         held by hand in two places — a dasharray and a keyframe — and CSS
         cannot derive one from the other, which is precisely when this repo
         owes a check. */
  {
    const PERIOD = 3;
    const bands = [
      ["af-er-edge-halo", "af-er-pulse-halo"],
      ["af-er-edge-glow", "af-er-pulse-glow"],
      ["af-er-edge-pulse", "af-er-pulse"],
    ];
    for (const [band, keyframe] of bands) {
      const block = [
        ...css.matchAll(new RegExp(`\\.${band}\\s*\\{([^}]*)\\}`, "g")),
      ]
        .map((match) => match[1])
        .find((body) => /stroke-dasharray/.test(body));
      const dash =
        block && /stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/.exec(block);
      const frames = new RegExp(
        `@keyframes ${keyframe}\\s*\\{[^@]*?from\\s*\\{[^}]*stroke-dashoffset:\\s*([\\d.]+)[^}]*\\}[^@]*?to\\s*\\{[^}]*stroke-dashoffset:\\s*-([\\d.]+)`,
      ).exec(css);
      const lit = dash ? Number(dash[1]) : NaN;
      const gap = dash ? Number(dash[2]) : NaN;
      check(
        `${band} is a pulse, not a belt (lit ${lit} of the path)`,
        lit > 0 && lit <= 0.25,
        `a band covering ${Math.round(lit * 100)}% of a connector reads as a second line painted over it, which is what shipped`,
      );
      check(
        `${band} shares the ${PERIOD}-path-length period`,
        Math.abs(lit + gap - PERIOD) < 1e-9,
        `${lit} + ${gap} = ${lit + gap} — bands on different periods drift apart and the wrap becomes visible`,
      );
      check(
        `${keyframe} travels exactly one period, from its own dash length`,
        frames !== null &&
          Math.abs(Number(frames[1]) - lit) < 1e-9 &&
          Math.abs(Number(frames[2]) - gap) < 1e-9,
        frames === null
          ? `no from/to pair found for ${keyframe}`
          : `keyframe ${frames[1]} → -${frames[2]} against dasharray ${lit} ${gap} — the two are held by hand and must agree`,
      );
    }
  }

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
      /\.af-er-edge-pulse[\s\S]{0,40}?\{[^}]*stroke-dasharray/.test(css),
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
  /* SCOPED TO THE BASE LINE, and the narrowing is the point. The rule this
     defends is that a SOLID line means identifying and a dashed one means it is
     not, so a dasharray on `.af-er-edge-line` would have focus silently change
     what the diagram SAYS. The first version forbade a dasharray anywhere under
     `.af-er-lit`, which is not that rule: it also forbade the band paths from
     dashing, and the bands ARE dashes — that is the whole mechanism of a
     travelling mark. It blocked the focused comet from running continuously
     and reported it as a notation change. Name what is forbidden, not
     everything that mentions the word — the same correction the paint
     assertion above already carries. */
  const litRules = [...css.matchAll(/([^{}]*\.af-er-lit[^{]*)\{([^}]*)\}/g)]
    .filter(([, selector]) => /\.af-er-edge-line/.test(selector))
    .map((match) => match[2])
    .join("\n");
  /* FOCUS ADDS NO PAINT AT ALL NOW, not merely no dasharray. The lit line
     used to take `--primary` and thicken to 2px, which is a second border
     appearing where one already was. The signal is MOTION — the lit lines
     animate while everything else dims — so the canvas must not vary a
     stroke, a width or a fill on the lit state. */
  check(
    "the canvas paints nothing differently on the lit state",
    /* Scoped to PAINT attributes. A first version matched any `state === "lit"`
       and flagged the click handler's own toggle, which is behaviour rather
       than paint — the assertion has to name what it forbids, not everything
       that mentions the word. */
    !/(stroke|strokeWidth|fill|opacity)=\{[^}]*state === "lit"/.test(diagram),
    "a lit-state paint expression is a border by another name — the signal is the animation",
  );
  /* THE STROKE-CHANGE HUNT, in the STYLESHEET this time. The component's lit
     state was cleaned first and the CSS `:hover` rule was missed — and hover
     was the one people actually saw, because a pointer resting anywhere near a
     connector triggers it. So both layers are asserted now. */
  check(
    "hovering a connector does not restyle the line it is over",
    !/\.af-er-edge\[role="button"\]:hover \.af-er-edge-line\s*\{[^}]*stroke-width/.test(
      css,
    ),
    "a hover that thickens the stroke is a border by another name — light the pulse instead",
  );
  check(
    "hover feedback rides the pulse, which is the animated mark",
    /:hover \.af-er-edge-pulse/.test(css),
    "the 18px hit strip is invisible; something must say it is there",
  );
  check(
    "reduced motion still gets a hover tell, since it has no pulse to light",
    /prefers-reduced-motion: reduce[\s\S]*?:hover \.af-er-edge-line/.test(css),
    "with the pulse suppressed the hit area would give no feedback at all",
  );

  check(
    "focusing a line never dashes the LINE — a solid relationship stays solid",
    !/stroke-dasharray/.test(litRules),
    "a lit rule dashes .af-er-edge-line: focus would turn an identifying relationship into a non-identifying one",
  );

  /* THE AURA, and the two defects that shaped it. It was first one ellipse for
     the whole canvas, re-aimed at whatever was focused: a round blob behind a
     thin bent line rather than a glow along it, AND — because a shared element
     has to move — clearing the focus snapped it to the drawing's centre and
     faded it out from there. Reported as a glow flashing to the middle of the
     screen on every deselect. Both faults are one fault, and the fix is that
     the aura belongs to the connector it lights.

     Asserted as a CONTAINMENT and an ORDER, not as a set of numbers: the aura
     paths must ride the connector's own `d` inside its own group, and they must
     be drawn before the line so light never washes over the notation. */
  {
    const auraLayers = ["far", "mid", "near"];
    /* From `Relationship` to the canvas that mounts it. Bounded by what comes
       AFTER it in the file, not by a helper that happens to precede it — the
       first draft closed the window at `EndGlyph`, which is declared further
       up, so the slice was empty and all three assertions failed on a correct
       component. */
    const relationshipBody = diagram.slice(
      diagram.indexOf("function Relationship("),
      diagram.indexOf("export function ErDiagram("),
    );
    check(
      "the aura is a child of the connector, so a cleared focus never moves it",
      auraLayers.every((layer) =>
        new RegExp(`className="af-er-edge-aura-${layer}" d=\\{d\\}`).test(
          relationshipBody,
        ),
      ),
      "a canvas-level aura has to be re-aimed, and on deselect it fades out from wherever it was last pointed — the middle of the drawing",
    );
    check(
      "the aura is drawn under the line it lights",
      auraLayers.every(
        (layer) =>
          relationshipBody.indexOf(`af-er-edge-aura-${layer}`) <
          relationshipBody.indexOf('className="af-er-edge-line"'),
      ),
      "light painted over the connector washes out the notation underneath it",
    );
    check(
      "the aura rests hidden as an attribute on every layer",
      auraLayers.every((layer) =>
        new RegExp(`af-er-edge-aura-${layer}" d=\\{d\\} opacity="0"`).test(
          relationshipBody,
        ),
      ),
      "a CSS-only resting state glows on every connector before the stylesheet loads",
    );
    /* NO FILTER, EVER, ON A CONNECTOR — the rule `new-diagram-type.md` states
       and the reason the aura is three strokes rather than one blur. Asserted
       over the aura's own rules so a later "just blur it" cannot slip in. */
    check(
      "the aura's softness is geometry, never a filter",
      !/\.af-er-edge-aura-[a-z]+[^{]*\{[^}]*filter:/.test(css) &&
        auraLayers.every((layer) =>
          new RegExp(
            `\\.af-er-edge-aura-${layer}\\s*\\{[^}]*stroke-width`,
          ).test(css),
        ),
      "a percentage filter region on a zero-height bounding box degenerates — draw a wider path",
    );
  }

  /* THE FOCUSED COMET IS CONTINUOUS, which is the difference between "this
     line is animated" and "this is the line you chose". At rest the period is
     3 path lengths and the connector is dark two thirds of the time; under
     focus it is 1, so a mark is always somewhere on the line. Asserted as a
     RELATION — lit period strictly shorter than the resting one, and all three
     bands on the same period — so the numbers can be tuned without rewriting
     this, and a tuning that leaves the focused line mostly dark still fails. */
  {
    const litPeriods = ["halo", "glow", "pulse"].map((band) => {
      const block = [
        ...css.matchAll(
          new RegExp(
            `\\.af-er-lit \\.af-er-edge-${band}\\s*\\{([^}]*)\\}`,
            "g",
          ),
        ),
      ]
        .map((match) => match[1])
        .find((body) => /stroke-dasharray/.test(body));
      const dash =
        block && /stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/.exec(block);
      return dash === null || dash === undefined
        ? null
        : Number(dash[1]) + Number(dash[2]);
    });
    check(
      `the focused comet runs continuously (period ${litPeriods.join("/")} against 3 at rest)`,
      litPeriods.every(
        (period) => period !== null && period > 0 && period <= 1,
      ) && new Set(litPeriods).size === 1,
      `${litPeriods.join("/")} — a focused connector dark most of the cycle shows no mark at all, and three bands on different periods drift apart`,
    );
  }
  /* NO SVG FILTER ON A CONNECTOR, ever. `<filter x="-50%" width="200%">` is
     objectBoundingBox units by default, and a horizontal connector has a
     ZERO-HEIGHT bounding box — the region collapses and the browser paints
     bands across the gap between the boxes, nowhere near the line. That
     shipped, and no amount of stroke-tweaking touched it because no stroke
     was drawing it. The glow is a wider path now. */
  check(
    "no filter is applied to a connector, whose bounding box can be zero-height",
    !/\.af-er-edge[^{]*\{[^}]*filter:\s*url\(/.test(css),
    "a percentage filter region on a flat path degenerates — use a wider path",
  );
  check(
    "the emphasis is a halo path, drawn with the mark it softens",
    /className="af-er-edge-halo"/.test(diagram) &&
      /\.af-er-edge-halo/.test(css),
    "the glow should be geometry, not a filter region",
  );

  /* WHICH BOX IS FOCUSED HAS TO BE VISIBLE ON THE BOX. Dimming the rest says
     which tables are out and never said which one is in, so the focused table
     carries a lift. It must stay a lift: a recoloured outline was tried twice
     and removed twice, because the related boxes took one too and one click
     restyled most of the schema. */
  check(
    "the focused box is lifted by an overlay, never by a restyled border",
    /className="af-er-entity-lift"/.test(diagram) &&
      /\.af-er-focused \.af-er-entity-lift/.test(css) &&
      !/(stroke|strokeWidth)=\{[^}]*state === "focused"/.test(diagram),
    "focus must raise the box, not repaint its notation — see the note above `Entity`",
  );
  check(
    "the lift rests hidden as an attribute, so a canvas with no stylesheet hides it",
    /af-er-entity-lift[\s\S]{0,240}?opacity="0"/.test(diagram),
    "a CSS-only resting state leaves the lift painted on every box before the stylesheet loads",
  );

  /* TWO HALVES THAT MUST AGREE, and the reason this reads across two files.
     The drawing dropped its own backdrop rect — it covered the diagram, not
     the ground around it, so clicking the empty pane cleared nothing and the
     panel read as stuck. The host owns the backdrop now, and nothing but this
     pairs the two: if the rect ever comes back, or the host's handler goes
     away, the canvas silently loses the gesture every canvas tool has. */
  /* Read as an ORDER, not a character window: the pan guard must come first
     and the clear after it, inside the pane's own click handler. A first draft
     matched the two across a fixed number of characters and failed the moment
     the comment between them grew — an assertion that breaks on prose is an
     assertion nobody keeps. */
  const paneClick = viewer.indexOf("consumePanClick()");
  check(
    "exactly one backdrop clears the focus, and it is the host's pane",
    !/fill="transparent"[\s\S]{0,120}?onFocus\(null\)/.test(diagram) &&
      paneClick !== -1 &&
      viewer.lastIndexOf("onClick={", paneClick) !== -1 &&
      viewer.indexOf("setRawFocus(null)", paneClick) !== -1,
    "the pane must clear the focus on a click that hit nothing — a rect inside the SVG cannot, it only covers the drawing",
  );
  check(
    "the pane's backdrop ignores the click a pan ends with",
    paneClick !== -1 &&
      viewer.indexOf("setRawFocus(null)", paneClick) > paneClick,
    "without this, dragging the canvas throws away the focus the reader had set",
  );

  /* THE VIOLET SQUARE, and it was never authored. `globals.css` puts
     `outline-ring/50` on every element, so the BROWSER's own focus indicator
     paints in `--ring` — and clicking an SVG element that carries a `tabindex`
     gives it `:focus` WITHOUT `:focus-visible`, for which Chrome still draws
     `outline: auto`. An outline boxes the BOUNDING BOX, so a click on a
     three-segment orthogonal connector drew a rounded violet rectangle around
     the whole route. Killing the outline on `:focus-visible` alone left it.

     `check:view-input` already holds this rule for five canvases, and could
     not hold it for this one: it discovers a canvas by the `af-*-hit` class on
     its hit target, and this canvas's focusable element is the connector GROUP.
     A check written from a naming convention cannot see the thing that does not
     follow it — so the pair is asserted here, from the two files that carry it. */
  for (const target of ["af-er-edge", "af-er-entity"]) {
    const rules = [
      ...css.matchAll(
        new RegExp(`\\.${target}\\[role="button"\\]:focus\\b(?!-visible)`, "g"),
      ),
    ];
    check(
      `${target} kills the native ring on :focus, not only :focus-visible`,
      rules.length > 0,
      "a CLICK on an SVG element with a tabindex gives it :focus WITHOUT :focus-visible, and the browser paints outline: auto in --ring for that — a rectangle around the bounding box",
    );
  }

  /* FOCUS DRAWS A SHAPE, IT DOES NOT REPAINT. The ring recoloured the
     connector to `--primary` at 2.5 along its whole length, which is the third
     time this canvas has had a focus repaint removed. `globals.css` states the
     alternative beside `.af-uc-ring`: emit a real SVG shape and reveal it. */
  check(
    "the keyboard ring is its own shape, not a repaint of the line",
    /className="af-er-edge-ring"/.test(diagram) &&
      /className="af-er-entity-ring"/.test(diagram) &&
      /\.af-er-edge-ring\s*\{[^}]*stroke:\s*var\(--ring\)/.test(css) &&
      !/:focus-visible[^{]*\.af-er-edge-line\s*\{/.test(css),
    "a :focus-visible rule on .af-er-edge-line repaints the notation — draw the ring as a shape instead",
  );
  check(
    "the ring rests hidden as an attribute, so a canvas with no stylesheet draws none",
    /af-er-edge-ring"[^>]*opacity="0"/.test(diagram) &&
      /af-er-entity-ring[\s\S]{0,240}?opacity="0"/.test(diagram),
    "a CSS-only resting state paints a ring on every connector before the stylesheet loads",
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
