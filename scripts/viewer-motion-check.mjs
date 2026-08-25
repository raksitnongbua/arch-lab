#!/usr/bin/env node
/**
 * C4 connector-motion check — the rules that keep a moving connector from
 * lying about what kind of relationship it is.
 *
 * BOTH OF THESE SHIPPED BROKEN, reported as "animation of c4 is broken, line
 * overlapped between animation and stable line", and neither was visible in a
 * diff because every individual value looked reasonable on its own:
 *
 *   1. THE OVERLAY WAS THE SAME WIDTH AS THE LINE IT RIDES. Base and drift
 *      were both `stroke-width: 1.5`, so each dash did not highlight the
 *      connector — it REPLACED it over its own length, and the round caps
 *      pushed half a stroke past that at both ends. A solid relationship came
 *      out as alternating patches of two colours: a broken line. The comment
 *      above the rule claimed the drift was "thinner than the base stroke",
 *      which is how the intent survived while the code stopped meeting it.
 *
 *   2. AN ASYNC EDGE WORE TWO DASH RHYTHMS AT ONCE. The base's `6 4` in user
 *      units and the overlay's `5 9` in pathLength-normalised units share no
 *      common period and never line up, so the travelling dashes landed half
 *      in the static gaps and half on the static dashes.
 *
 * Both fixes are RELATIONAL — "thinner than", "the same period as", "not on
 * top of" — so they are asserted as relations here rather than as the literal
 * numbers, which would pass just as happily after someone tunes one side.
 *
 * Run with: pnpm check:viewer-motion
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const canvas = read("src/features/viewer/components/viewer-canvas.tsx");
const edge = read("src/features/viewer/components/viewer-edge.tsx");
const constants = read("src/features/viewer/lib/canvas-constants.ts");
const frames = read("src/features/viewer/export/frames.ts");
const exportSvg = read("src/features/viewer/export/render-svg.ts");
const globals = read("src/app/globals.css");

let assertions = 0;
let failures = 0;
function check(label, run) {
  assertions += 1;
  try {
    run();
    console.log(`  ✓ ${label}`);
  } catch (error) {
    failures += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    ${error instanceof Error ? error.message : error}`);
  }
}

/** `stroke-width` inside the first rule whose selector text contains `sel`. */
function widthIn(source, sel) {
  const rule = source.match(
    new RegExp(
      `${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    ),
  );
  if (rule === null) return null;
  const width = rule[1].match(/stroke-width:\s*([\d.]+)/);
  return width === null ? null : Number(width[1]);
}

/* ---- 1. the resting overlay must not blot out the line it rides --------- */

check("every resting band is a SINGLE travelling one, not a repeat", () => {
  // This is the fix for the reported bug, stated structurally. A repeating
  // pattern (dash + gap summing to less than the path) touches the whole line
  // at once; a band whose gap fills the remaining path is on the wire in one
  // place at a time, so the stroke underneath is never in question.
  const bands = [
    ...canvas.matchAll(
      /^\.viewer-canvas \.viewer-edge-rest-(glow|tail|head) \{([^}]*)\}/gm,
    ),
  ];
  assert.equal(bands.length, 3, `found ${bands.length} rest bands, want 3`);
  for (const [, name, body] of bands) {
    const dash = body.match(/stroke-dasharray:\s*([\d.]+)\s+([\d.]+)/);
    assert.ok(dash, `${name} has no dasharray`);
    const lit = Number(dash[1]);
    const gap = Number(dash[2]);
    assert.equal(
      lit + gap,
      100,
      `${name} must span the whole normalised path (pathLength=100), or the ` +
        `pattern repeats along the connector and covers it`,
    );
  }
});

check("the visible bands are no wider than the stroke they ride", () => {
  const base = widthIn(canvas, ".viewer-canvas .viewer-edge-base");
  assert.ok(base !== null, "the base stroke-width is missing");
  for (const name of ["tail", "head"]) {
    const width = widthIn(canvas, `.viewer-canvas .viewer-edge-rest-${name}`);
    assert.ok(width !== null, `${name} has no stroke-width`);
    assert.ok(
      width <= base,
      `${name} at ${width} is wider than the base ${base} — a band wider ` +
        `than its line reads as a break in the line`,
    );
  }
  // The halo is the one exception: it is wide ON PURPOSE and blurred, so it
  // never presents an edge that could be mistaken for the connector's own.
  const glow = canvas.match(/\.viewer-edge-rest-glow \{([^}]*)\}/);
  assert.ok(glow, "the glow band is missing");
  assert.match(glow[1], /filter: blur\(/, "a wide band must be blurred");
  const opacity = Number(glow[1].match(/opacity:\s*([\d.]+)/)?.[1] ?? 1);
  assert.ok(opacity < 0.25, `glow opacity ${opacity} is too solid for a halo`);
});

check(
  "the bands share one leading edge — each starts at its own lit length",
  () => {
    // Three bands whose keyframes did not agree would read as three lights
    // chasing each other rather than one comet with a trail.
    for (const name of ["glow", "tail", "head"]) {
      const rule = canvas.match(
        new RegExp(`\\.viewer-edge-rest-${name} \\{([^}]*)\\}`),
      );
      const lit = Number(rule[1].match(/stroke-dasharray:\s*([\d.]+)/)[1]);
      const frames_ = canvas.match(
        new RegExp(`@keyframes viewer-edge-rest-${name} \\{([\\s\\S]*?)\\n\\}`),
      );
      assert.ok(frames_, `${name} has no keyframes`);
      const from = Number(
        frames_[1].match(/from \{ stroke-dashoffset: (-?[\d.]+)/)[1],
      );
      const to = Number(
        frames_[1].match(/to \{ stroke-dashoffset: (-?[\d.]+)/)[1],
      );
      assert.equal(from, lit, `${name} must start at its lit length ${lit}`);
      assert.equal(
        to,
        lit - 100,
        `${name} must travel exactly one whole path, ending at ${lit - 100}`,
      );
    }
  },
);

check("resting motion stays subordinate to selection", () => {
  // If the resting comet matched the selected one, selecting an edge would
  // stop meaning anything.
  const motion = read("src/features/viewer/lib/motion.ts");
  const rest = Number(motion.match(/edgeRest: (\d+)/)[1]);
  const flow = Number(motion.match(/edgeFlow: (\d+)/)[1]);
  assert.ok(
    rest > flow * 2,
    `rest ${rest}ms must be far slower than ${flow}ms`,
  );
  const restHead = widthIn(canvas, ".viewer-canvas .viewer-edge-rest-head");
  const flowHead = widthIn(canvas, ".viewer-canvas .viewer-edge-flow-head");
  assert.ok(
    restHead < flowHead,
    `rest head ${restHead} must be thinner than the selected head ${flowHead}`,
  );
});

check("the stagger is derived from the edge id, never its index", () => {
  // An index-based delay re-staggers every connector whenever one is added.
  assert.match(edge, /function restPhaseMs\(edgeId: string/);
  assert.match(edge, /animationDelay: `-\$\{restDelayMs\}ms`/);
  assert.match(edge, /restPhaseMs\(id, VIEWER_DURATIONS\.edgeRest\)/);
});

check("the drift paints with the shared token, not a second spelling", () => {
  assert.match(
    canvas,
    /\.viewer-canvas \.viewer-edge-rest-tail \{[^}]*stroke: var\(--edge-drift\)/s,
  );
  assert.match(globals, /--edge-drift:/);
});

check("--edge-drift is defined in EVERY theme, or that theme loses it", () => {
  /* Counted against THEMES rather than a literal. This asserted "exactly 2"
     and broke the moment a third theme arrived — a check that has to be
     edited whenever the thing it guards grows teaches people to edit it
     without reading it. A token missing from one theme is still the bug; the
     number of themes never was. */
  const themes = [
    ...(
      /export const THEMES = \[([^\]]*)\]/.exec(
        read("src/lib/constants.ts"),
      )?.[1] ?? ""
    ).matchAll(/"([a-z-]+)"/g),
  ].length;
  const occurrences = globals.match(/--edge-drift:/g) ?? [];
  assert.equal(
    occurrences.length,
    themes,
    `found ${occurrences.length} definitions for ${themes} themes`,
  );
});

/* ---- 2. one dash rhythm per connector ------------------------------------ */

check("a dashed edge gets the march, never the comet", () => {
  assert.match(edge, /const isDashed = data\?\.edge\.style === "dashed"/);
  assert.match(edge, /const showRestingDash = restingMotion && !isDashed/);
  assert.match(edge, /const showDashMarch = restingMotion && isDashed/);
});

check("the async dash is one shared constant, not three copies", () => {
  assert.match(constants, /export const EDGE_BASE_DASH_ON = 6/);
  assert.match(constants, /export const EDGE_BASE_DASH_OFF = 4/);
  // The edge draws it and the export re-emits it — both from the constant.
  assert.match(edge, /strokeDasharray: isDashed \? EDGE_BASE_DASH : undefined/);
  assert.match(exportSvg, /stroke-dasharray="\$\{EDGE_BASE_DASH\}"/);
  // Scoped to CONNECTORS. A boundary <rect> is also drawn `6 4`, and that is
  // a dashed receding box — a different thing that means something else and
  // must not be coupled to the relationship dash by a shared constant.
  const edgeEmit = exportSvg.match(/`<path class="af-export-edge"[^`]*`/);
  assert.ok(edgeEmit, "the exported edge path is not emitted where expected");
  assert.doesNotMatch(
    edgeEmit[0],
    /stroke-dasharray="[\d\s]+"/,
    "a hand-written copy of the async dash is back on the connector",
  );
});

check("the march steps exactly one period, or the loop seams", () => {
  const period = 6 + 4;
  const block = canvas.match(
    /@keyframes viewer-edge-dash-march \{([\s\S]*?)\n\}/,
  );
  assert.ok(block, "the march keyframes are missing");
  assert.match(block[1], /from \{ stroke-dashoffset: 0; \}/);
  assert.ok(
    block[1].includes("to { stroke-dashoffset: -${EDGE_BASE_DASH_PERIOD}; }"),
    `the step must be the constant, not a literal ${period}: ${block[1].trim()}`,
  );
});

/* ---- 3. the gate, and what reduced motion does with each --------------- */

check("the march is gated on the same attribute as the drift", () => {
  assert.match(
    canvas,
    /\[data-af-idle="on"\] \.viewer-canvas \.viewer-edge-base-marching \{\s*animation: viewer-edge-dash-march/s,
  );
});

check("reduced motion PARKS the march but REMOVES the overlay", () => {
  // Different treatments on purpose: a still dashed line is a meaningful
  // resting frame, a still overlay is a stray dash pattern that changes what
  // the connector says.
  const reduced = canvas.slice(canvas.indexOf("prefers-reduced-motion"));
  assert.match(
    reduced,
    /\.viewer-edge-base-marching[^}]*\{[^}]*animation: none;[^}]*stroke-dashoffset: 0;/s,
  );
  assert.match(reduced, /\.viewer-edge-rest[^{]*\{\s*display: none;/s);
});

/* ---- 4. the GIF must not turn a solid relationship dashed ---------------- */

check(
  "the animated export overlays solid edges instead of dashing them",
  () => {
    // Stamping the drift pattern onto the connector made every synchronous call
    // render as an asynchronous one — a GIF that misreports the architecture.
    assert.match(frames, /document_\.createElementNS\(SVG_NS, "path"\)/);
    assert.match(frames, /anchor\.after\(path_\)/);
    assert.doesNotMatch(
      frames,
      /edge\.setAttribute\("stroke-dasharray"/,
      "the exporter is writing a dash pattern onto the connector itself again",
    );
  },
);

check("the overlay is inserted AFTER the edge — SVG has no z-index", () => {
  assert.doesNotMatch(frames, /\.before\(path_\)/);
  assert.match(frames, /anchor\.after\(path_\)/);
  // …and the bands go on halo-first, head-last, for the same reason.
  const bands = frames.match(/const REST_BANDS = \[([\s\S]*?)\] as const;/);
  assert.ok(bands, "REST_BANDS is not declared");
  const widths = [...bands[1].matchAll(/width: ([\d.]+)/g)].map((m) =>
    Number(m[1]),
  );
  assert.equal(widths.length, 3, "want three bands");
  assert.ok(widths[0] > widths[2] || widths[0] >= widths[1], "halo goes first");
});

check("a dashed edge marches its own dash in the export too", () => {
  assert.match(frames, /getAttribute\("data-style"\) === "dashed"/);
  assert.match(frames, /const period = dashPeriodOf\(edge\)/);
  assert.match(
    exportSvg,
    /data-style="\$\{edge\.style === "dashed" \? "dashed" : "solid"\}"/,
  );
});

check("the exported bands mirror the canvas's, value for value", () => {
  // The GIF and the page are two renderers of one look; the moment their band
  // tables disagree the loop stops being a record of what the reader saw.
  const bands = frames.match(/const REST_BANDS = \[([\s\S]*?)\] as const;/);
  assert.ok(bands, "REST_BANDS is not declared");
  const exported = [
    ...bands[1].matchAll(/lit: ([\d.]+), width: ([\d.]+)/g),
  ].map((m) => `${m[1]}/${m[2]}`);
  const onScreen = ["glow", "tail", "head"].map((name) => {
    const rule = canvas.match(
      new RegExp(`\\.viewer-edge-rest-${name} \\{([^}]*)\\}`),
    );
    const lit = rule[1].match(/stroke-dasharray:\s*([\d.]+)/)[1];
    const width = rule[1].match(/stroke-width:\s*([\d.]+)/)[1];
    return `${lit}/${width}`;
  });
  assert.deepEqual(exported, onScreen);
});

check("the export paints the drift with the canvas's resolved token", () => {
  assert.match(frames, /driftColor/);
  assert.match(frames, /primaryColor/);
  const theme = read("src/features/viewer/export/theme.ts");
  assert.match(theme, /edgeDrift/);
  assert.match(theme, /primary: "--primary"/);
  const button = read("src/features/viewer/export/export-button.tsx");
  assert.match(button, /theme\.edgeDrift/);
  assert.match(button, /theme\.primary/);
});

/* ----------------------------------------------------------------------- */
/* Panning survives an editable canvas                                      */
/* ----------------------------------------------------------------------- */

check(
  "each canvas keeps its own pan gesture — key on one, mode on the other",
  () => {
    /* This used to pin the viewer's `panActivationKeyCode` to the editor's
     Space: the held key was the editable viewer's only bare-hand pan. It was
     reported broken three times — a held key depends on keyboard state and
     focus, and never existed on touch — so the viewer moved to an explicit
     Select/Pan MODE TOGGLE, and what is worth pinning flipped with it:

       - the EDITOR keeps its own Space pan untouched (its README spends a
         paragraph teaching it, which is why relate is a grip and not
         Alt+drag). This half is what stops "remove the Space machinery from
         the viewer" from quietly reaching into the editor;
       - the VIEWER must NOT re-declare a pan key beside the toggle. A key
         and a mode gating one gesture is two gates that can disagree — the
         exact shape that produced the three reports. In Pan mode the marquee
         handlers are not attached at all, so React Flow's own `panOnDrag`
         does the panning with no key involved (`check:canvas-edit` pins the
         detachment). */
    const editorCanvas = read("src/features/editor/components/canvas.tsx");
    assert.match(
      editorCanvas,
      /panActivationKeyCode="Space"/,
      "the editor canvas no longer declares its Space pan — only the VIEWER " +
        "moved to a mode toggle; the editor's gesture must not change",
    );
    /* Matched as a PROP USE (`name=`), not the bare word: the comment above
     the viewer's pan props rightly names `panActivationKeyCode` while
     explaining why it is gone, and an assertion failing on the explanation
     would punish the file for documenting itself. */
    assert.doesNotMatch(
      canvas,
      /panActivationKeyCode=/,
      "the viewer re-declared a pan key beside the Select/Pan toggle — two " +
        "gates for one gesture is the key-state plumbing that broke three times",
    );
    /* Empty-pane drag is the other half, and it is the half `selectionOnDrag`
     takes away: the editor pays for its marquee with `panOnDrag={[1, 2]}`,
     middle and right button only. The viewer keeps the plain form, so a
     left-drag on empty canvas still pans wherever the marquee is not
     attached — every read-only canvas, and Pan mode on the editable one. */
    assert.match(
      canvas,
      /^\s*panOnDrag$/m,
      "the viewer canvas must keep bare panOnDrag, so empty-canvas drag pans",
    );
    /* ANCHORED TO A PROP ON ITS OWN LINE, not the bare word — the comment above
     the props in `viewer-canvas.tsx` names `selectionOnDrag` while explaining
     why it must not be added, and a bare match failed on that sentence. Same
     correction the `localStorage` assertion below already carries: match the
     USE, not the mention, or the check punishes the file for documenting
     itself. */
    assert.doesNotMatch(
      canvas,
      /^\s*selectionOnDrag$/m,
      "selectionOnDrag would claim left-drag on the pane and remove the pan gesture",
    );
    /* And the pill has to SAY so, in BOTH branches. The gesture existing while
     nothing announces it is how the wheel-zoom confusion this same file
     documents happened — a reader tries drag, sees a lasso, and concludes
     the canvas cannot pan. The editable branch must name the toggle (the pan
     a reader who knew drag-to-pan has to be told where to find); the
     read-only branch must still teach plain drag-to-pan.

     Matched against the SENTENCE, with the JSX space expressions and line
     breaks collapsed away first. Prettier owns where that paragraph wraps —
     wrapping the flow in one more provider was enough to move the break and
     fail this assertion while every word a reader sees stayed put. An
     assertion about copy must not be an assertion about indentation. */
    const hintProse = canvas.replace(/\{" "\}/g, " ").replace(/\s+/g, " ");
    assert.match(
      hintProse,
      /Select \/ Pan<\/span> toggle makes a drag pan/,
      "the editable hint no longer says where the pan went — a reader who knew " +
        "drag-to-pan concludes panning broke",
    );
    assert.match(
      hintProse,
      /drag<\/span> to pan/,
      "the read-only hint must still teach drag-to-pan — it is the gesture " +
        "every shared link opens with",
    );
  },
);

/* ----------------------------------------------------------------------- */
/* The playground's rail fold is decided by the SERVER                      */
/* ----------------------------------------------------------------------- */

check(
  "the rail fold is read from a cookie on the server, not after paint",
  () => {
    /* The client-only versions of this all flashed, and one of them looked
     correct: `next/script` with `strategy="beforeInteractive"` does not emit
     an executable inline tag, it pushes into `self.__next_s` for Next's
     runtime to run after first paint. The only arrangement with nothing to
     correct is the server rendering the right markup, so these assertions
     guard that shape rather than any particular implementation of a fallback. */
    const fold = read("src/features/playground/lib/source-fold.ts");
    assert.match(fold, /SOURCE_FOLD_COOKIE/, "the preference is not a cookie");
    /* USE, not the word — the comment explaining why localStorage was wrong is
     the most valuable line in that file and must not trip its own check. */
    assert.doesNotMatch(
      fold,
      /localStorage\s*\.\s*(?:get|set)Item/,
      "localStorage is invisible to the server, which is what caused the flash",
    );
    /* ONE route mounts the playground now — `/live/c4` and `/live/seq` are
       forwarding aliases, and a trampoline has no rail to fold. */
    for (const route of ["src/app/live/page.tsx"]) {
      const source = read(route);
      assert.match(
        source,
        /initialSourceCollapsed=\{isCollapsedCookie\(/,
        `${route} does not pass the stored fold into the playground`,
      );
    }
    /* The hook moved to `use-preference.ts` when the canvas lock became a
       second preference of the same shape: the server-snapshot rule is now
       decided in ONE place for both, which is a stronger thing to pin than
       either wrapper. */
    assert.match(
      read("src/features/playground/lib/use-preference.ts"),
      /\(\) => initial/,
      "the server snapshot must be what the server rendered, or hydration corrects it visibly",
    );
  },
);

/* ----------------------------------------------------------------------- */
/* The fold settles NOTHING after first paint, and stays reachable          */
/* ----------------------------------------------------------------------- */

/*
 * These are motion assertions even though nothing here moves, and that is the
 * point: the drawing is PANE-FITTED — `fit` scales by
 * `min(paneW/vbW, paneH/vbH)` — so a rail that slides, grows or is corrected
 * into place after paint narrows the canvas pane and re-fits the whole diagram
 * at a different scale. That reflow jump is a bug this repo has already fixed
 * once in `sequence-viewer.tsx`, and the rail fold now DEFAULTS to folded
 * (`playground/lib/source-fold.ts`), so the arrangement it decides is the one
 * every first-time reader sees.
 *
 * The second half is the price of that default: folded, the toggle is the only
 * thing on screen saying the diagram is written as text — one of the two things
 * a drawing tool cannot do (`purpose.md`) — so it must be reachable and legible
 * wherever the fold applies.
 */

/** A named region of `split-workbench.tsx`, so a rename fails loudly here
 *  rather than silently handing an assertion an empty string to pass on. */
function workbenchRegion(source, from, to) {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `\`${from}\` is gone from split-workbench.tsx`);
  const end = to === null ? source.length : source.indexOf(to, start);
  assert.notEqual(end, -1, `\`${to}\` is gone from split-workbench.tsx`);
  return source.slice(start, end);
}

const TOGGLE_DECL = "export function SourceRailToggle";
const workbench = read("src/components/ui/split-workbench.tsx");

/** Every class string a `guard &&` clause contributes to a `cn(…)` call. */
function guardedClasses(region, guard) {
  const matches = [
    ...region.matchAll(new RegExp(`${guard} &&\\s*"([^"]*)"`, "g")),
  ];
  assert.notEqual(
    matches.length,
    0,
    `nothing in the layout is guarded by \`${guard} &&\` any more`,
  );
  return matches.map(([, classes]) => classes);
}

check(
  "the fold hides the rail only where a toggle exists to bring it back",
  () => {
    const layout = workbenchRegion(
      workbench,
      "export function SplitWorkbench",
      TOGGLE_DECL,
    );
    /* BELOW `lg` THE PANES STACK and no toggle is rendered, so an unprefixed
       hide would leave a phone reader an editor whose only way back is a wider
       window. That is not hypothetical: the fold is remembered across visits,
       so a reader who folded it on a laptop carried the cookie to their phone.
       The two halves have to agree — the widths the fold applies at, and the
       widths the toggle exists at. */
    for (const classes of guardedClasses(layout, "collapsed")) {
      for (const token of classes.split(/\s+/).filter(Boolean)) {
        assert.match(
          token,
          /^lg:/,
          `the fold applies "${token}" below lg, where there is no toggle to undo it`,
        );
      }
    }
    const toggle = workbenchRegion(workbench, TOGGLE_DECL, null);
    assert.match(
      toggle,
      /"hidden lg:inline-flex"/,
      "the toggle is no longer lg-only — the fold and its control must cover the same widths",
    );
  },
);

check("immersive hides the rail at every width, not only at lg", () => {
  const layout = workbenchRegion(
    workbench,
    "export function SplitWorkbench",
    TOGGLE_DECL,
  );
  /* The asymmetry with the fold above is deliberate and is why these are two
     props. Immersive covers the viewport with a fixed canvas, so a rail merely
     left behind it is an editor a keyboard can tab into and nobody can see;
     `hidden` is what takes the textarea out of the tab order. */
  assert.ok(
    guardedClasses(layout, "immersive").some((classes) =>
      classes.split(/\s+/).includes("hidden"),
    ),
    "immersive no longer hides the rail unprefixed — below lg it would sit in the tab order behind a fullscreen canvas",
  );
});

check("the workbench animates colour and nothing else", () => {
  const layout = workbenchRegion(
    workbench,
    "export function SplitWorkbench",
    TOGGLE_DECL,
  );
  /* A transitioned or animated pane is a canvas whose width is still arriving
     after first paint, which re-fits the diagram at a second scale in front of
     the reader. The divider's `transition-colors` is fine — a colour costs no
     layout. Measured over the LAYOUT only, so the toggle's own button
     transition (shared with every other button) is not caught by it. */
  for (const [token] of layout.matchAll(/transition-[\w[\]-]+/g)) {
    assert.equal(
      token,
      "transition-colors",
      `${token} animates something other than colour in the workbench — the canvas pane's size must be final at first paint`,
    );
  }
  assert.doesNotMatch(
    layout,
    /\banimate-/,
    "an animation appeared on a workbench pane — the diagram would re-fit as it played",
  );
});

check("the fold removes the rail rather than sizing it to nothing", () => {
  const layout = workbenchRegion(
    workbench,
    "export function SplitWorkbench",
    TOGGLE_DECL,
  );
  /* A zero-width rail looks identical and is not: the textarea stays in the tab
     order, so a keyboard reader tabs into an editor they cannot see, and
     `SplitWorkbench`'s header records that `hidden` is what makes the folded
     state real for a keyboard. */
  assert.ok(
    guardedClasses(layout, "collapsed").every((classes) =>
      classes.split(/\s+/).includes("lg:hidden"),
    ),
    "the fold is expressed as something other than `display: none` — a rail sized to zero is still focusable",
  );
});

check("the folded face keeps its label at every width it appears at", () => {
  const toggle = workbenchRegion(workbench, TOGGLE_DECL, null);
  /* `hidden xl:inline` used to wrap this label, so between `lg` and `xl` —
     every 13" laptop — the only signpost to the text format was one 16px panel
     glyph. With the rail folded by default that glyph is the whole invitation,
     and `source-fold.ts` says in as many words that the default is only
     defensible while this holds. */
  assert.doesNotMatch(
    toggle,
    /className="[^"]*\bhidden [a-z]+:inline\b/,
    "the toggle's label is responsively hidden again — the folded rail's only signpost becomes an icon",
  );
  assert.match(
    toggle,
    /collapsed \? "Edit the text"/,
    "the folded face stopped naming the action it performs",
  );
});

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} viewer-motion assertions passed.`);
