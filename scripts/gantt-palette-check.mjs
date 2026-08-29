#!/usr/bin/env node
/**
 * The gantt's STATE palette is complete, legible and DISTINCT — measured
 * per state × theme, not eyeballed.
 *
 * WHY THIS KIND OWES A PALETTE CHECK AND ER DOES NOT. `new-diagram-type.md`
 * says the check is owed by a kind that ASSIGNS COLOUR BY TYPE, and refused by
 * a kind that paints from the shared node tokens — "a vacuous check is worse
 * than no check: it reports coverage it does not have". A gantt assigns
 * colour by `GanttItemState`, a closed vocabulary of four values, each with
 * its own fill and its own border. That is a palette, in the same sense the
 * flowchart's six shapes are, so this script is the flowchart's
 * (`check:flowchart-palette`) applied to four states.
 *
 * IT READS THE PAIRS OUT OF THE STYLESHEET, never from a list typed here.
 * `codebase.md`: a check written from a hand-listed set of names "cannot
 * notice the thing it has never heard of" — three checks in this repo passed
 * for exactly that reason while the feature under them was broken. So the
 * state → (fill, border) table is parsed from `gantt-motion.css`'s own
 * rules and then reconciled against the REAL `ITEM_STATES` from the grammar's
 * keyword table, loaded through type stripping. A fifth state added to the
 * vocabulary with no rule fails here; a rule for a state the grammar cannot
 * spell fails here too.
 *
 * What it proves, per theme, for every one of the themes `THEMES` declares:
 *
 *   1. EVERY STATE RESOLVES. A dangling or renamed token is an invalid paint,
 *      and an SVG `fill` that does not resolve falls back — usually to black.
 *      A whole band of the plan rendering black in one theme is the failure
 *      this catches.
 *   2. EVERY PAIR IS LEGIBLE. Thresholds are WCAG 2.1 and are the same ones
 *      the C4 role tokens clear in `check:themes` and the flowchart shapes
 *      clear in `check:flowchart-palette`: non-text contrast ≥3:1 (SC 1.4.11)
 *      for a border against its own fill and against the canvas, and ≥4.5:1
 *      (SC 1.4.3) for text. The BAR CARRIES NO TEXT — the name is in the rail
 *      and the duration sits past the bar's right edge — so the text pairs
 *      measured here are the ones actually drawn: the rail name and the
 *      duration label against the CANVAS. Measuring a label against the fill
 *      would be asserting the legibility of text nothing draws.
 *   3. THE CRITICAL CAP IS VISIBLE ON EVERY STATE'S BAR. The cap is the only
 *      per-bar signal of criticality — the alternative, recolouring the
 *      border, was rejected because the border already carries the state, and
 *      two meanings on one property is how a reader stops being able to read
 *      either. A cap that vanishes into the fill leaves the bar saying
 *      nothing about the critical path.
 *   4. THE FOUR STATES STAY FOUR COLOURS. Distance is OKLab ΔE (Ottosson; a
 *      just-noticeable difference is ≈0.002), with the floors
 *      `check:flowchart-palette` already uses. "Not equal" alone would bless
 *      two ambers one bit apart, and the shipped complaint that check answers
 *      — six terminators rendering monotone — is the same failure a
 *      state palette can have.
 *
 * Exits non-zero on any failure. Run with: pnpm check:gantt-palette
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { contrast, flatten, oklchDeltaE, parseOklch } from "./lib/oklch.mjs";
import { registerTsResolution } from "./lib/resolve-ts.mjs";
import { resolveToken, tokensOf } from "./lib/theme-css.mjs";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const load = registerTsResolution(ROOT);
const read = (relative) => readFileSync(path.join(ROOT, relative), "utf8");

const { ITEM_STATES, STATE_IS_DEFAULT } = await load(
  "src/features/archtext/lib/gantt/keywords.ts",
);

const CSS = read("src/app/globals.css");
const CONSTANTS = read("src/lib/constants.ts");
const MOTION = read("src/features/gantt/styles/gantt-motion.css");

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
  if (detail !== undefined) console.error(`    ${detail}`);
};

const THEMES = [
  ...(/export const THEMES = \[([^\]]*)\]/.exec(CONSTANTS)?.[1] ?? "").matchAll(
    /"([a-z-]+)"/g,
  ),
].map((match) => match[1]);

/* ----------------------------------------------------------------------- */
/* The state → token table, READ OUT OF THE STYLESHEET                      */
/* ----------------------------------------------------------------------- */

console.log("the palette the canvas actually paints");

/** `fill: var(--x); stroke: var(--y);` out of one rule body. */
function pairOf(body) {
  const fill = /fill:\s*var\((--[a-z0-9-]+)\)/.exec(body);
  const border = /stroke:\s*var\((--[a-z0-9-]+)\)/.exec(body);
  return fill === null || border === null
    ? null
    : { fill: fill[1], border: border[1] };
}

const STATE_TOKENS = new Map();
{
  /* The DEFAULT state is spelled by the bare `.af-gantt-bar-fill` rule, not by a
     `[data-state]` selector — the same asymmetry the grammar has, where the
     default state is the one absent from the text. Reading it from the bare
     rule is what keeps `planned` in this check rather than silently exempt. */
  const base = /\.af-gantt-bar-fill\s*\{([^}]*)\}/.exec(MOTION);
  const basePair = base === null ? null : pairOf(base[1]);
  if (basePair !== null) STATE_TOKENS.set(STATE_IS_DEFAULT, basePair);

  for (const match of MOTION.matchAll(
    /\.af-gantt-row\[data-state="([a-z-]+)"\]\s*\.af-gantt-bar-fill\s*\{([^}]*)\}/g,
  )) {
    const pair = pairOf(match[2]);
    if (pair !== null) STATE_TOKENS.set(match[1], pair);
  }
}

check(
  `every state in the grammar's closed vocabulary has a fill and a border (${ITEM_STATES.length} states)`,
  ITEM_STATES.every((state) => STATE_TOKENS.has(state)),
  `missing a rule: ${ITEM_STATES.filter((state) => !STATE_TOKENS.has(state)).join(", ")} — a state with no rule draws in the default colour and reports a status it does not have`,
);
check(
  "the stylesheet paints no state the grammar cannot spell",
  [...STATE_TOKENS.keys()].every((state) => ITEM_STATES.includes(state)),
  `${[...STATE_TOKENS.keys()].filter((s) => !ITEM_STATES.includes(s)).join(", ")} — a rule for a value no document can carry is a rule that never runs`,
);
check(
  `the four states take four DIFFERENT token pairs`,
  new Set([...STATE_TOKENS.values()].map((pair) => pair.fill)).size ===
    STATE_TOKENS.size,
  `${[...STATE_TOKENS.entries()].map(([s, p]) => `${s}:${p.fill}`).join(", ")} — two states on one token is one state with two names`,
);
check(
  `the themes are read from THEMES, all ${THEMES.length} of them`,
  THEMES.length >= 6,
  `got ${THEMES.join(", ")}`,
);

const baseline = tokensOf(CSS, "light");
if (baseline === null) {
  console.error("could not parse the :root block of globals.css");
  process.exit(1);
}

/* ----------------------------------------------------------------------- */
/* 1 + 2 + 3: resolution and legibility, per theme                          */
/* ----------------------------------------------------------------------- */

/* WCAG 2.1: SC 1.4.3 text ≥4.5:1, SC 1.4.11 non-text ≥3:1. The same bars the
   role tokens clear in check:themes and the flowchart shapes in
   check:flowchart-palette — a state colour is not held to a lower standard
   than the role colours it is drawn beside. */
const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;

console.log(
  `\nevery state × theme pair resolves and clears its minimums (${ITEM_STATES.length} states × ${THEMES.length} themes)`,
);

/** { theme -> { state -> {fill, border} } }, for the distinctness pass. */
const resolved = new Map();

/**
 * Which token paints the critical cap, READ FROM THE STYLESHEET rather than
 * named here.
 *
 * It was `--primary` until `pastel` needed its own value: the cap is drawn on
 * top of a state fill and must clear 3:1 against all four, where `--primary`
 * elsewhere is only measured against a background. Hardcoding the token here
 * would have made this check keep measuring `--primary` while the canvas drew
 * `--gantt-critical` — passing while reporting coverage it did not have, which is
 * exactly the failure `codebase.md` names: "a hardcoded list cannot notice the
 * thing it has never heard of".
 */
const CAP_TOKEN = (() => {
  const rule = /\.af-gantt-cap\s*\{[^}]*?fill:\s*var\(\s*(--[a-z0-9-]+)/i.exec(
    MOTION,
  );
  if (rule === null) {
    throw new Error(
      "gantt-palette-check: could not read the cap's fill token from " +
        ".af-gantt-cap in gantt-motion.css — the rule moved or was renamed, " +
        "and this check must measure whatever the canvas actually paints.",
    );
  }
  return rule[1];
})();

/**
 * The token the RUNNING LIGHT paints, read out of the stylesheet rather than
 * typed here — same discipline as `CAP_TOKEN` above, and for the same reason:
 * a check that names its own colour stops measuring the canvas the moment the
 * canvas is repainted.
 */
const FLOW_TOKEN = (() => {
  const rule =
    /\.af-gantt-flow-glow,\s*\n\.af-gantt-flow-tail,\s*\n\.af-gantt-flow-head \{[^}]*?stroke:\s*var\((--[a-z0-9-]+)\)/.exec(
      MOTION,
    );
  if (rule === null) {
    throw new Error(
      "gantt-palette-check: could not read the running light's stroke " +
        "token from the shared .af-gantt-flow-* rule in gantt-motion.css — " +
        "the rule moved or was renamed, and this check must measure whatever " +
        "the canvas actually paints.",
    );
  }
  return rule[1];
})();

/* The head travels ALONG the line rather than sitting beside it, so "these are
   two colours" has to hold harder here than for two fills side by side: twice
   `PAIR_BORDER_MIN`. The complaint that bought this check was never "the head
   is too dark" — its contrast on the dark canvases measured 6:1 and better —
   it was that the head was within 0.02 lightness of the wire underneath it in
   every theme, so it differed almost purely in chroma, which does not carry on
   a near-black ground. A contrast-only assertion passes that exact failure. */
const FLOW_LINE_MIN = 0.1;

console.log("the running light");

for (const theme of THEMES) {
  const tokens = theme === "light" ? baseline : tokensOf(CSS, theme);
  if (tokens === null) continue;
  const colour = (token) => parseOklch(resolveToken(token, tokens, baseline));
  const canvas = colour("--canvas");
  const flow = colour(FLOW_TOKEN);
  const edge = colour("--edge");
  const crit = colour(CAP_TOKEN);
  if (canvas === null || flow === null || edge === null || crit === null) {
    check(
      `${theme}: the running light resolves`,
      false,
      `${FLOW_TOKEN} did not resolve to an oklch() colour — an unresolved SVG stroke falls back, usually to black`,
    );
    continue;
  }

  /* `flatten` throughout: glass composites its surfaces, so the token alone is
     not what a reader sees. */
  const ground = flatten(canvas, canvas);
  const lit = flatten(flow, canvas);

  const onCanvas = contrast(lit, ground);
  check(
    `${theme}: the light is visible on the canvas it travels over (${onCanvas.toFixed(2)}:1)`,
    onCanvas >= 3,
    `${onCanvas.toFixed(2)}:1 — under the 3:1 non-text minimum every other paint on this canvas clears`,
  );

  /* A connector runs between bars and passes beside them, so the ground under
     the head is not always the canvas. */
  let worstFill = null;
  let worstRatio = Infinity;
  for (const [state, pair] of STATE_TOKENS) {
    const fill = colour(pair.fill);
    if (fill === null) continue;
    const ratio = contrast(lit, flatten(fill, canvas));
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worstFill = state;
    }
  }
  check(
    `${theme}: and on the bars it passes (${worstRatio.toFixed(2)}:1, worst on ${worstFill})`,
    worstRatio >= 3,
    `${worstRatio.toFixed(2)}:1 on ${worstFill} — a head that vanishes as it passes a bar is a light that blinks out mid-run`,
  );

  /* THE ACTUAL COMPLAINT. Distinct from the wire it rides, and from the
     critical colour, or the light says nothing the line does not. */
  const fromEdge = oklchDeltaE(flow.oklch, edge.oklch);
  check(
    `${theme}: distinct from the connector it rides (ΔE ${fromEdge.toFixed(3)})`,
    fromEdge >= FLOW_LINE_MIN,
    `ΔE ${fromEdge.toFixed(3)} < ${FLOW_LINE_MIN} — a head this close to its own line reads as the line, not as something running along it`,
  );
  const fromCrit = oklchDeltaE(flow.oklch, crit.oklch);
  check(
    `${theme}: and from the critical colour (ΔE ${fromCrit.toFixed(3)})`,
    fromCrit >= FLOW_LINE_MIN,
    `ΔE ${fromCrit.toFixed(3)} < ${FLOW_LINE_MIN} — the light would vanish on exactly the connectors it matters most on, since a critical line is painted ${CAP_TOKEN}`,
  );
}

console.log("");

for (const theme of THEMES) {
  const tokens = theme === "light" ? baseline : tokensOf(CSS, theme);
  if (tokens === null) {
    check(`${theme}: has a CSS block`, false, "check:themes owns this case");
    continue;
  }
  const themeColour = (token) =>
    parseOklch(resolveToken(token, tokens, baseline));
  const canvas = themeColour("--canvas");
  const railName = themeColour("--node-foreground");
  const duration = themeColour("--node-meta");
  const primary = themeColour(CAP_TOKEN);
  const milestoneFill = themeColour("--node");
  if (
    canvas === null ||
    railName === null ||
    duration === null ||
    primary === null ||
    milestoneFill === null
  ) {
    check(
      `${theme}: the canvas, text and accent tokens parse`,
      false,
      "cannot measure this theme at all",
    );
    continue;
  }

  const failed = [];
  const expect = (what, got, min) => {
    if (got < min)
      failed.push(`${what} is ${got.toFixed(2)}:1, needs ${min}:1`);
  };
  /* Everything is measured AS SEEN — the theme-check rule: a translucent
     surface is flattened over the canvas before anything is measured on it. */
  const seen = (colour) => flatten(colour, canvas);
  const primarySeen = seen(primary);

  const byState = new Map();
  resolved.set(theme, byState);

  for (const state of ITEM_STATES) {
    const pair = STATE_TOKENS.get(state);
    if (pair === undefined) continue;
    const fill = themeColour(pair.fill);
    const border = themeColour(pair.border);
    if (fill === null || border === null) {
      failed.push(
        `${state}: ${pair.fill}/${pair.border} does not resolve to a colour — the bar would paint the SVG fallback (black)`,
      );
      continue;
    }
    byState.set(state, { fill, border });
    const fillSeen = seen(fill);
    const borderSeen = seen(border);
    /* The border against its own fill: it is what gives the bar an edge, and
       a bar with no edge on a plan of eleven bars is a coloured smear. */
    expect(
      `${state}: border on its fill`,
      contrast(borderSeen, fillSeen),
      NON_TEXT_MIN,
    );
    /* And against the canvas: the outline is what separates the bar from the
       page — the silhouette is the non-colour signal. */
    expect(
      `${state}: border on canvas`,
      contrast(borderSeen, canvas.rgb),
      NON_TEXT_MIN,
    );
    /* 3. The critical cap sits ON the fill; see the header. */
    expect(
      `${state}: critical cap (${CAP_TOKEN}) on its fill`,
      contrast(primarySeen, fillSeen),
      NON_TEXT_MIN,
    );
  }

  /* The two labels a row actually draws, both on the canvas rather than on a
     fill — see the header on why the fill is the wrong background here. */
  expect(
    "the rail name on the canvas",
    contrast(seen(railName), canvas.rgb),
    TEXT_MIN,
  );
  expect(
    "the duration label on the canvas",
    contrast(seen(duration), canvas.rgb),
    TEXT_MIN,
  );
  /* A milestone is a `--node` diamond outlined in `--primary`: it carries no
     state, so it is measured once per theme rather than per state. */
  expect(
    "a milestone's outline on its own fill",
    contrast(primarySeen, seen(milestoneFill)),
    NON_TEXT_MIN,
  );
  expect(
    "a milestone's outline on the canvas",
    contrast(primarySeen, canvas.rgb),
    NON_TEXT_MIN,
  );

  check(
    `${theme}: all ${ITEM_STATES.length} states resolve and clear ${NON_TEXT_MIN}:1 non-text / ${TEXT_MIN}:1 text`,
    failed.length === 0,
    failed.join("; "),
  );
}

/* ----------------------------------------------------------------------- */
/* 4: the four states stay four colours                                     */
/* ----------------------------------------------------------------------- */

/* The floors check:flowchart-palette uses for its shape palette. A state is
   the only thing colour says on a bar — the shape is the same for all four —
   so two states within a JND of each other is a status nobody can read. */
const PAIR_FILL_MIN = 0.02;
const PAIR_BORDER_MIN = 0.05;

console.log("\nstate colours stay distinct (OKLab ΔE, measured)");

for (const [theme, byState] of resolved) {
  if (byState.size !== ITEM_STATES.length) continue; // resolution already failed
  const failed = [];
  let closestFill = Infinity;
  let closestBorder = Infinity;
  for (let i = 0; i < ITEM_STATES.length; i += 1) {
    for (let j = i + 1; j < ITEM_STATES.length; j += 1) {
      const a = byState.get(ITEM_STATES[i]);
      const b = byState.get(ITEM_STATES[j]);
      const dFill = oklchDeltaE(a.fill.oklch, b.fill.oklch);
      const dBorder = oklchDeltaE(a.border.oklch, b.border.oklch);
      closestFill = Math.min(closestFill, dFill);
      closestBorder = Math.min(closestBorder, dBorder);
      if (dFill < PAIR_FILL_MIN) {
        failed.push(
          `${ITEM_STATES[i]}/${ITEM_STATES[j]} fills ΔE ${dFill.toFixed(3)} < ${PAIR_FILL_MIN}`,
        );
      }
      if (dBorder < PAIR_BORDER_MIN) {
        failed.push(
          `${ITEM_STATES[i]}/${ITEM_STATES[j]} borders ΔE ${dBorder.toFixed(3)} < ${PAIR_BORDER_MIN}`,
        );
      }
    }
  }
  check(
    `${theme}: no two states collide (closest fills ΔE ${closestFill.toFixed(3)}, borders ${closestBorder.toFixed(3)})`,
    failed.length === 0,
    failed.join("; "),
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} palette assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} palette assertions passed.`);
