#!/usr/bin/env node
/**
 * Sequence LAYOUT check — proves the pure layout function
 * (`src/features/sequence/lib/layout.ts`) derives correct geometry from a
 * `SequenceLabFile`, using the REAL parser and the real layout code via
 * Node's type stripping + the `@/*` resolve hook (the `registerHooks`
 * pattern of `scripts/sequence-check.mjs`).
 *
 * What it proves, clause by clause:
 *   1. Participants are laid out left-to-right in DECLARATION order — order
 *      is data in a sequence file, and the layout must not re-derive it.
 *   2. Messages are numbered 1..N in document order and descend the page.
 *   3. A self-message keeps both endpoints on its own lifeline and gets the
 *      taller row.
 *   4. A two-participant `over` note spans both lifelines.
 *   5. Fragments contain their contents: every message inside a fragment's
 *      branches lies within the fragment's box, and each divider lies
 *      strictly inside it.
 *   6. A 3-deep fragment nest produces boxes that ACTUALLY nest — each
 *      child strictly inside its parent on all four edges, even when they
 *      span the same lifelines.
 *   7. Activation bars open at the activating message, close at the
 *      deactivating one, and sit on their participant's lifeline.
 *   8. Reveal steps are sane: notes reveal with the preceding message and
 *      fragments with the first message inside them.
 *   9. Fragment identity and step sets: every fragment carries a unique,
 *      document-order `frag-N` id, its RECURSIVE message-step set, and a
 *      per-branch step set — a branch's set is a subset of its fragment's
 *      (strict when the fragment has more than one branch), branch sets
 *      partition the fragment's set, and a nested fragment's set is
 *      contained in its parent's. This is the data the viewer's
 *      focus-a-whole-flow feature runs on.
 *
 * Exits non-zero on any failure. Run with: pnpm check:sequence-layout
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/* ----------------------------------------------------------------------- */
/* Module resolution: `@/*` alias + extensionless relative imports -> .ts   */
/* ----------------------------------------------------------------------- */

registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(path.join(ROOT, "src", resolved.slice(2))).href;
    }
    if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      typeof context.parentURL === "string"
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      const isFile = existsSync(asPath) && statSync(asPath).isFile();
      if (!isFile) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        } else if (existsSync(path.join(asPath, "index.ts"))) {
          resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const { parseSequenceText } = await import(
  pathToFileURL(path.join(ROOT, "src/features/archtext/index.ts")).href
);
const { layoutSequence, SEQ, estimateTextWidth } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/lib/layout.ts")).href
);
const { SEQUENCE_EXAMPLE } = await import(
  pathToFileURL(path.join(ROOT, "src/features/sequence/input/example.ts")).href
);

/* ----------------------------------------------------------------------- */
/* Harness                                                                  */
/* ----------------------------------------------------------------------- */

let failures = 0;
let assertions = 0;

function ok(label) {
  assertions += 1;
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  assertions += 1;
  failures += 1;
  console.error(`  ✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
}

function check(label, condition, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

const box = (f) => `[x ${f.x}, y ${f.y}, w ${f.width}, h ${f.height}]`;

/** a strictly inside b, on all four edges. */
function strictlyInside(inner, outer) {
  return (
    inner.x > outer.x &&
    inner.y > outer.y &&
    inner.x + inner.width < outer.x + outer.width &&
    inner.y + inner.height < outer.y + outer.height
  );
}

/* ----------------------------------------------------------------------- */
/* Fixture 1 — the bundled example (every construct in realistic use)       */
/* ----------------------------------------------------------------------- */

console.log("bundled example (participants, steps, notes, activations)");

const file = parseSequenceText(SEQUENCE_EXAMPLE);
const layout = layoutSequence(file);

check(
  "participants are laid out in declaration order, strictly left to right",
  layout.participants.every(
    (p, i, all) =>
      p.id === file.participants[i].id && (i === 0 || p.x > all[i - 1].x),
  ),
  layout.participants.map((p) => `${p.id}@${p.x}`).join(", "),
);
check(
  "adjacent lifelines keep at least the minimum column gap",
  layout.participants.every(
    (p, i, all) => i === 0 || p.x - all[i - 1].x >= SEQ.minColumnGap,
  ),
);
check(
  "every lifeline starts below the header band and ends above the foot",
  layout.lifelineTop > 0 && layout.lifelineBottom < layout.height,
);

/* ---- message click targets never poach a neighbour's ----
 * Each message's target is a line band (y ± hitLineBand) plus a label band
 * (y − hitLabelTop … y − hitLabelBottom) sitting ABOVE the arrow. Two adjacent
 * rows therefore approach each other twice, and if either pair meets, the
 * lower message swallows clicks aimed at the upper one's label — a bug that
 * looks like "clicking the label focuses the wrong message" and is invisible
 * in review. These assert the gutter with the SAME constants the renderer
 * draws with, so enlarging a target fails here first. */
check(
  "a row's line band clears the next row's label band",
  SEQ.hitLineBand + SEQ.hitLabelTop < SEQ.rowMessage,
);
check(
  "the label band sits entirely above its own arrow",
  SEQ.hitLabelBottom > 0 && SEQ.hitLabelTop > SEQ.hitLabelBottom,
);
check(
  "no two adjacent messages have overlapping click targets in the real layout",
  layout.messages.every((m, i, all) => {
    if (i === 0) return true;
    const prev = all[i - 1];
    if (prev.self || m.self) return true; // taller row, different geometry
    const prevLineBottom = prev.y + SEQ.hitLineBand;
    const thisLabelTop = m.y - SEQ.hitLabelTop;
    return prevLineBottom < thisLabelTop;
  }),
);

/* ---- the footer card row ----
 * The participant names repeated at the foot of the flow. These assertions
 * exist because the footer changed the canvas HEIGHT, and a height that does
 * not reserve the row is the failure mode that matters: the cards would render
 * clipped or outside the viewBox, which the fit view would then silently
 * letterbox away. */
check(
  "the footer row sits below the foot of the flow, clear of it",
  layout.footerTop > layout.lifelineBottom,
);
check(
  "the footer gap is exactly the reserved one",
  layout.footerTop - layout.lifelineBottom === SEQ.footerGap,
);
check(
  "the canvas reserves the whole footer row plus the bottom margin",
  layout.height >= layout.footerTop + layout.footerHeight + SEQ.marginBottom,
);
check(
  "no footer card is clipped by the bottom of the canvas",
  layout.footerTop + layout.footerHeight <= layout.height,
);
check(
  "a footer card is the base header height — the actor glyph is not repeated",
  layout.footerHeight === SEQ.headerHeight,
);
check(
  "the actor's header is taller than a footer card (the glyph band is header-only)",
  layout.headerHeight > layout.footerHeight,
);

const messageCount = (function count(items) {
  let n = 0;
  for (const item of items) {
    if (item.step === "message") n += 1;
    else if (item.step === "fragment")
      for (const b of item.branches) n += count(b.items);
  }
  return n;
})(file.items);

check(
  "steps: one per message, numbered 1..N in document order",
  layout.stepCount === messageCount &&
    layout.messages.every((m, i) => m.step === i + 1),
  `stepCount ${layout.stepCount}, messages ${messageCount}`,
);
check(
  "messages descend the page in step order (yByStep is non-decreasing)",
  layout.yByStep.every((y, i, all) => i === 0 || y >= all[i - 1]),
  layout.yByStep.join(", "),
);

const self = layout.messages.find((m) => m.self);
check(
  "the self-message stays on its own lifeline (fromX === toX)",
  self !== undefined && self.fromX === self.toX,
  JSON.stringify(self),
);
{
  // The self row must be taller than a plain row: the next thing on the page
  // clears the loop's full height.
  const index = layout.messages.indexOf(self);
  const nextY =
    index + 1 < layout.messages.length
      ? layout.messages[index + 1].y
      : layout.lifelineBottom;
  check(
    "the self-message row reserves the taller row height",
    self !== undefined && nextY - (self.y - 14) >= SEQ.rowSelf,
    `self y ${self?.y}, next y ${nextY}`,
  );
}

{
  const over = layout.notes.find(
    (n) => n.placement === "over" && n.participants.length === 2,
  );
  const xs = over?.participants.map(
    (id) => layout.participants.find((p) => p.id === id)?.x,
  );
  check(
    "an over-two note spans both participants' lifelines",
    over !== undefined &&
      xs.every((x) => x !== undefined) &&
      over.x < Math.min(...xs) &&
      over.x + over.width > Math.max(...xs),
    JSON.stringify(over),
  );
  const right = layout.notes.find((n) => n.placement === "right");
  const anchorX = layout.participants.find(
    (p) => p.id === right?.participants[0],
  )?.x;
  check(
    "a right-of note sits entirely right of its lifeline",
    right !== undefined && anchorX !== undefined && right.x > anchorX,
    JSON.stringify(right),
  );
}

/* ---- notes WRAP: the box is the truth about the text --------------------
 * The regression this pins: note text used to be one unbroken `<text>`, so a
 * long note drew a single line straight through both walls of its own box and
 * out past the viewBox, whose extents are computed from the box. Three
 * properties together make that unrepresentable — the lines fit, the box is
 * tall enough to hold them, and no word was dropped on the way. */
{
  const est = (text) =>
    Math.ceil(text.length * SEQ.noteFontSize * SEQ.charWidthRatio);
  const long =
    "Never send filter[user_ids] - the spec AUTO-CREATES default settings " +
    "rows for missing users. Never sort by updated_at - the PATCHes below " +
    "would reshuffle the sort key and skip users entirely.";
  const wrapped = layoutSequence(
    parseSequenceText(
      `archlab 1.0 sequence\ntitle "Wrapping"\n\n@sequence\n  a "A"\n  b "B"\n\n  a -> b : "x"\n  note right a : ${JSON.stringify(long)}\n  note over a b : ${JSON.stringify(long)}\n  a -> b : "y"\n`,
    ),
  );
  check(
    "every note's widest wrapped line fits inside its own box",
    wrapped.notes.every(
      (n) => Math.max(...n.lines.map(est)) <= n.width - SEQ.notePadX,
    ),
    wrapped.notes
      .map((n) => `w=${n.width} widest=${Math.max(...n.lines.map(est))}`)
      .join(" | "),
  );
  check(
    "every note's box is tall enough for the lines it holds",
    wrapped.notes.every((n) => n.height >= n.lines.length * SEQ.noteLineHeight),
    wrapped.notes
      .map((n) => `h=${n.height} lines=${n.lines.length}`)
      .join(" | "),
  );
  check(
    "wrapping loses no words",
    wrapped.notes.every(
      (n) => n.lines.join(" ").split(/\s+/).join(" ") === n.text,
    ),
    JSON.stringify(wrapped.notes.map((n) => n.lines)),
  );
  check(
    "a long note wraps to MORE than one line (it is actually wrapping)",
    wrapped.notes.every((n) => n.lines.length > 1),
    wrapped.notes.map((n) => n.lines.length).join(", "),
  );
  const noteRight = wrapped.notes[0];
  const next = wrapped.messages[1];
  check(
    "the row after a wrapped note clears the note's full height",
    noteRight !== undefined &&
      next !== undefined &&
      next.y > noteRight.y + noteRight.height,
    `note ${noteRight?.y}+${noteRight?.height}, next message y ${next?.y}`,
  );
  const viewRight = wrapped.minX + wrapped.width;
  check(
    "every note lies inside the viewBox",
    wrapped.notes.every(
      (n) => n.x >= wrapped.minX && n.x + n.width <= viewRight,
    ),
    `viewBox ${wrapped.minX}..${viewRight}`,
  );
}

/* ---- message labels lie inside the viewBox ------------------------------
 * Column gaps are capped, so an epic label is allowed to OVERLAP its
 * neighbours — it is not allowed to be CLIPPED. The extents loop used to
 * consider only self-message labels, and the ends of a wide centred label
 * fell outside the viewBox. */
{
  const wide = layoutSequence(
    parseSequenceText(
      `archlab 1.0 sequence\ntitle "Wide labels"\n\n@sequence\n  a "A"\n  b "B"\n\n  a -> b : "GET /resources/accounts/settings?page[cursor]=&page[size]=100&filter[crypto_withdrawal.vault.auto_enable_detection]=true"\n  b ..> a : "ok"\n`,
    ),
  );
  const viewRight = wide.minX + wide.width;
  check(
    "a label far wider than its arrow still lies inside the viewBox",
    wide.messages.every((m) => {
      const mid = (m.fromX + m.toX) / 2;
      return (
        mid - m.labelWidth / 2 >= wide.minX &&
        mid + m.labelWidth / 2 <= viewRight
      );
    }),
    wide.messages
      .map(
        (m) =>
          `mid=${Math.round((m.fromX + m.toX) / 2)} w=${Math.round(m.labelWidth)}`,
      )
      .join(" | ") + ` viewBox ${wide.minX}..${viewRight}`,
  );
}

{
  // web ->+ api opens a bar on api at step 2; api ..>- web closes it at step 9.
  const apiX = layout.participants.find((p) => p.id === "api")?.x;
  const bar = layout.activations.find(
    (a) => a.participantId === "api" && a.revealStep === 2,
  );
  const opener = layout.messages.find((m) => m.step === 2);
  const closer = layout.messages.find(
    (m) => m.step === 9 && m.from === "api" && m.kind === "reply",
  );
  check(
    "an activation bar opens at its activating message's y and closes at the deactivating reply",
    bar !== undefined &&
      opener !== undefined &&
      closer !== undefined &&
      bar.y0 === opener.y &&
      bar.y1 === closer.y,
    JSON.stringify({ bar, opener: opener?.y, closer: closer?.y }),
  );
  check(
    "the bar sits on its participant's lifeline",
    bar !== undefined &&
      apiX !== undefined &&
      bar.x < apiX &&
      bar.x + bar.width > apiX,
  );
}

check(
  "every message inside a fragment lies within that fragment's box",
  (function verify(items, enclosing) {
    for (const item of items) {
      if (item.step === "fragment") {
        const laid = layout.fragments.find(
          (f) =>
            f.kind === item.kind &&
            f.label === item.branches[0]?.label &&
            !f.__seen,
        );
        if (laid === undefined) return false;
        laid.__seen = true;
        for (const branch of item.branches) {
          if (!verify(branch.items, [...enclosing, laid])) return false;
        }
      } else if (item.step === "message") {
        const m = layout.messages.find(
          (mm) => mm.label === item.label && !mm.__seen,
        );
        if (m === undefined) return false;
        m.__seen = true;
        for (const f of enclosing) {
          const within =
            m.y > f.y &&
            m.y < f.y + f.height &&
            Math.min(m.fromX, m.toX) >= f.x &&
            Math.max(m.fromX, m.toX) <= f.x + f.width;
          if (!within) {
            console.error(
              `    message "${m.label}" (y ${m.y}) escapes ${f.kind} ${box(f)}`,
            );
            return false;
          }
        }
      }
    }
    return true;
  })(file.items, []),
);

check(
  "every divider lies strictly inside its fragment's box",
  layout.fragments.every((f) =>
    f.dividers.every((d) => d.y > f.y && d.y < f.y + f.height),
  ),
);

{
  const alt = layout.fragments.find((f) => f.kind === "alt");
  const par = layout.fragments.find((f) => f.kind === "par");
  check(
    "the par fragment nests strictly inside the alt that contains it",
    alt !== undefined && par !== undefined && strictlyInside(par, alt),
    `par ${par && box(par)} vs alt ${alt && box(alt)}`,
  );
  check(
    "nesting depth is recorded (alt depth 0, par depth 1)",
    alt?.depth === 0 && par?.depth === 1,
  );
}

{
  const sameSet = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check(
    "fragment ids are unique and in document (pre-order) position",
    layout.fragments.every((f, i) => f.id === `frag-${i}`),
    layout.fragments.map((f) => f.id).join(", "),
  );

  // The bundled example's flows, by hand: the alt spans steps 4–10
  // (branch "card accepted" = 4–9 including the nested par's 7 and 8,
  // branch "card declined" = 10); the par spans 7–8, one step per branch.
  const alt = layout.fragments.find((f) => f.kind === "alt");
  const par = layout.fragments.find((f) => f.kind === "par");
  check(
    "the alt's recursive step set spans both branches, nested par included",
    alt !== undefined &&
      sameSet(alt.steps, [4, 5, 6, 7, 8, 9, 10]) &&
      sameSet(alt.branches[0]?.steps, [4, 5, 6, 7, 8, 9]) &&
      sameSet(alt.branches[1]?.steps, [10]) &&
      alt.branches[0]?.label === "card accepted" &&
      alt.branches[1]?.label === "card declined",
    JSON.stringify({ steps: alt?.steps, branches: alt?.branches }),
  );
  check(
    "the nested par's step set is one step per branch, contained in the alt's",
    par !== undefined &&
      sameSet(par.steps, [7, 8]) &&
      sameSet(par.branches[0]?.steps, [7]) &&
      sameSet(par.branches[1]?.steps, [8]) &&
      par.steps.every((s) => alt.steps.includes(s)),
    JSON.stringify({ steps: par?.steps, branches: par?.branches }),
  );
  check(
    "every fragment: branch sets are subsets (strict when multi-branch) and partition the fragment's set",
    layout.fragments.every((f) => {
      const union = f.branches.flatMap((b) => b.steps).sort((a, b) => a - b);
      return (
        sameSet(union, f.steps) &&
        f.branches.every(
          (b) =>
            b.steps.every((s) => f.steps.includes(s)) &&
            (f.branches.length === 1 || b.steps.length < f.steps.length),
        )
      );
    }),
  );
}

check(
  "notes reveal with the message that precedes them; fragments with the first message inside",
  layout.notes.every(
    (n) => n.revealStep >= 0 && n.revealStep <= layout.stepCount,
  ) &&
    layout.fragments.every(
      (f) =>
        f.revealStep >= 1 &&
        f.revealStep <= layout.stepCount &&
        f.dividers.every((d) => d.revealStep >= f.revealStep),
    ),
);

/* ----------------------------------------------------------------------- */
/* Fixture 2 — a 3-deep nest over the SAME two lifelines                    */
/* ----------------------------------------------------------------------- */

console.log("three-deep nest (the degenerate same-span case)");

const DEEP = `archlab 1.0 sequence
title "Deep"

@sequence
  a "A"
  b "B"

  alt "outer"
    loop "middle"
      opt "inner"
        a -> b : "buried three deep"
    a ~> b : "middle tail"
  else "other"
    b ..> a : "done"
`;

const deepLayout = layoutSequence(parseSequenceText(DEEP));
const [outer, middle, inner] = deepLayout.fragments;

check(
  "three fragments laid out, outermost first (paint order)",
  deepLayout.fragments.length === 3 &&
    outer.kind === "alt" &&
    middle.kind === "loop" &&
    inner.kind === "opt" &&
    outer.depth === 0 &&
    middle.depth === 1 &&
    inner.depth === 2,
  JSON.stringify(deepLayout.fragments.map((f) => [f.kind, f.depth])),
);
check(
  "the boxes ACTUALLY nest: inner ⊂ middle ⊂ outer, strict on all edges",
  strictlyInside(inner, middle) && strictlyInside(middle, outer),
  `inner ${box(inner)}, middle ${box(middle)}, outer ${box(outer)}`,
);
check(
  "all three reveal with step 1 — the one message buried three deep",
  outer.revealStep === 1 && middle.revealStep === 1 && inner.revealStep === 1,
);
check(
  "the else divider reveals with its branch's first message (step 3)",
  outer.dividers.length === 1 && outer.dividers[0].revealStep === 3,
  JSON.stringify(outer.dividers),
);
check(
  "the buried message lies inside all three boxes",
  (() => {
    const m = deepLayout.messages.find((mm) => mm.step === 1);
    return [inner, middle, outer].every(
      (f) =>
        m.y > f.y &&
        m.y < f.y + f.height &&
        Math.min(m.fromX, m.toX) >= f.x &&
        Math.max(m.fromX, m.toX) <= f.x + f.width,
    );
  })(),
);

{
  // Step sets at every level of the 3-deep nest. Document order: step 1 is
  // buried inside opt⊂loop⊂alt-branch-0, step 2 ("middle tail") sits in
  // alt branch 0 AFTER the loop, step 3 ("done") is the else branch.
  const sameSet = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check(
    "three-deep nest reports the right step set at every level",
    sameSet(inner.steps, [1]) &&
      sameSet(middle.steps, [1]) &&
      sameSet(outer.steps, [1, 2, 3]),
    JSON.stringify({
      inner: inner.steps,
      middle: middle.steps,
      outer: outer.steps,
    }),
  );
  check(
    "the alt's branch sets are STRICT subsets of its own set and partition it",
    sameSet(outer.branches[0]?.steps, [1, 2]) &&
      sameSet(outer.branches[1]?.steps, [3]) &&
      outer.branches.every(
        (b) =>
          b.steps.length < outer.steps.length &&
          b.steps.every((s) => outer.steps.includes(s)),
      ),
    JSON.stringify(outer.branches),
  );
  check(
    "single-branch fragments carry their whole set as the one branch's set",
    sameSet(middle.branches[0]?.steps, middle.steps) &&
      sameSet(inner.branches[0]?.steps, inner.steps),
    JSON.stringify({ middle: middle.branches, inner: inner.branches }),
  );
  check(
    "nesting containment: inner ⊆ middle ⊆ outer as STEP SETS too",
    inner.steps.every((s) => middle.steps.includes(s)) &&
      middle.steps.every((s) => outer.steps.includes(s)),
  );
}

/* ----------------------------------------------------------------------- */
/* The heading: the document's title and description, inside the drawing     */
/* ----------------------------------------------------------------------- */

/*
 * The heading is drawn INSIDE the SVG so it travels into every export, which
 * means it is now part of the geometry: it pushes the participant row down, and
 * it is the one block that can widen the canvas. Both are asserted, along with
 * the thing a heading must never do — cross the right edge, which is the defect
 * notes had before they wrapped and which the wrap FLOOR reintroduced one level
 * up until the canvas learned to widen for it.
 */
{
  check(
    "the heading carries the document's title",
    layout.heading.titleLines.join(" ") === file.metadata.title,
    `got ${JSON.stringify(layout.heading.titleLines)}`,
  );

  check(
    "the participant row starts below the heading, not at the top margin",
    layout.headerTop === SEQ.marginTop + layout.heading.height &&
      layout.headerTop > SEQ.marginTop,
    `headerTop ${layout.headerTop}, marginTop ${SEQ.marginTop}, heading ${layout.heading.height}`,
  );

  check(
    "the lifelines still start directly under the card row",
    layout.lifelineTop === layout.headerTop + layout.headerHeight,
    `lifelineTop ${layout.lifelineTop} vs ${layout.headerTop + layout.headerHeight}`,
  );

  check(
    "the heading fits inside the canvas",
    SEQ.marginX + layout.heading.width <= layout.width + layout.minX,
    `text right edge ${SEQ.marginX + layout.heading.width} > canvas right ${layout.width + layout.minX}`,
  );

  /* A NORMAL flow must not pay for the heading in width: it wraps to the column
     span, so the canvas is whatever the flow needed. */
  check(
    "a normal flow is not widened by its heading",
    SEQ.marginX + layout.heading.width <= layout.width - SEQ.marginX,
    `heading ${layout.heading.width} forced the ${layout.width}px canvas`,
  );

  const narrow = layoutSequence(
    parseSequenceText(
      `archlab 1.0 sequence\ntitle "${"Long checkout flow title ".repeat(4).trim()}"\n\n@sequence\n  a "A"\n  b "B"\n  a -> b : "x"\n`,
    ),
  );
  check(
    "a long title WRAPS rather than running out as one line",
    narrow.heading.titleLines.length > 1,
    `got ${narrow.heading.titleLines.length} line(s)`,
  );
  check(
    "a narrow flow with a long title widens the canvas to fit the text",
    SEQ.marginX + narrow.heading.width <= narrow.width + narrow.minX,
    `text right ${SEQ.marginX + narrow.heading.width} > canvas right ${narrow.width + narrow.minX}`,
  );

  const clamped = layoutSequence(
    parseSequenceText(
      `archlab 1.0 sequence\ntitle "T"\ndescription "${"This description runs on and on so the clamp can be observed. ".repeat(6).trim()}"\n\n@sequence\n  a "A"\n  b "B"\n  a -> b : "x"\n`,
    ),
  );
  check(
    `a long description is clamped to ${SEQ.descriptionMaxLines} lines`,
    clamped.heading.descriptionLines.length === SEQ.descriptionMaxLines,
    `got ${clamped.heading.descriptionLines.length}`,
  );
  check(
    "a clamped description ends in an ellipsis, so the clipping is visible",
    clamped.heading.descriptionLines.at(-1)?.endsWith("\u2026") === true,
    `last line: ${JSON.stringify(clamped.heading.descriptionLines.at(-1))}`,
  );

  /*
   * THE RENDERER MUST NOT ANCHOR THE HEADER ROW TO `SEQ.marginTop`.
   *
   * This is a source assertion rather than a geometric one because the bug it
   * guards lives in the renderer, where the layout cannot see it: the card row
   * moved down behind the heading, but the ACTOR GLYPH and the participant HIT
   * REGION were still positioned from the page margin — so the avatar disc drew
   * straight through the title, and a participant's click target sat detached
   * from the card it belonged to. Both were written from `SEQ.marginTop` before
   * a heading existed, when the two were the same number.
   */
  const renderer = readFileSync(
    path.join(ROOT, "src/features/sequence/components/sequence-diagram.tsx"),
    "utf8",
  );
  const columnStart = renderer.indexOf("function ParticipantColumn(");
  const columnBody = renderer
    .slice(columnStart, renderer.indexOf("\nfunction ", columnStart + 1))
    // Comments stripped first: the one above `boxTop` explains that it does NOT
    // use `SEQ.marginTop`, and matching that prose would fail this check for
    // saying the right thing.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  check(
    "the participant column takes every y from the layout's headerTop, never the page margin",
    columnStart !== -1 && !columnBody.includes("SEQ.marginTop"),
    columnStart === -1
      ? "could not find ParticipantColumn"
      : "SEQ.marginTop still anchors something in the card row",
  );
  check(
    "the actor glyph hangs off the header row it belongs to",
    /cy=\{layout\.headerTop \+ \d+\}/.test(columnBody),
    "the avatar disc is not positioned from layout.headerTop",
  );

  /*
   * PAINT ORDER, and a source assertion for the same reason as the two above:
   * SVG has no z-index, so document order IS stacking order, and the layout
   * cannot see it.
   *
   * The fragment chips and guard labels were emitted with their boxes, which
   * are drawn before the lifelines and activation bars. A bar opened at a
   * fragment's left edge then painted straight through the chip: `rect`
   * rendered as "r ct", `opt` as "op". Which labels broke depended on where
   * the author happened to open a bar relative to a fragment, which is why
   * every bundled example rendered cleanly and this shipped.
   *
   * Labels must come AFTER the bars, so they clear the scaffolding they sit
   * on, and BEFORE the notes, so a note or an arrow crossing them still wins:
   * a label is a control, but the diagram is the content.
   */
  const painted = renderer
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const bars = painted.indexOf("layout.activations.map(");
  const chip = painted.indexOf('"af-seq-chip"');
  const notes = painted.indexOf("layout.notes.map(");
  check(
    "fragment labels paint after the activation bars and before the notes",
    bars !== -1 && chip !== -1 && notes !== -1 && bars < chip && chip < notes,
    `activations at ${bars}, chip at ${chip}, notes at ${notes} — SVG has no z-index, so this ordering is the only thing keeping a bar off the chip`,
  );

  const bare = layoutSequence(
    parseSequenceText(
      'archlab 1.0 sequence\ntitle "Short"\n\n@sequence\n  a "A"\n  b "B"\n  a -> b : "x"\n',
    ),
  );
  check(
    "a document with no description reserves no room for one",
    bare.heading.descriptionLines.length === 0 &&
      bare.heading.height < clamped.heading.height,
    `bare ${bare.heading.height} vs clamped ${clamped.heading.height}`,
  );
}

/* ----------------------------------------------------------------------- */
/* Participant icons — measured, not merely drawn                          */
/* ----------------------------------------------------------------------- */

console.log("participant icons");

{
  /* A name LONG ENOUGH to clear `headerMinWidth`, deliberately: at the floor
     both cards measure the same 112 and the icon's contribution is absorbed
     by the clamp, which would make an exact-delta assertion pass or fail on
     the length of a word rather than on the layout. The floor case is
     asserted separately below. */
  const WITH = `archlab 1.0 sequence
title "Iconed"

@sequence
  a "Storefront Web Application" @nextjs
  b "Orders DB"

  a -> b : "x"
`;
  const withIcon = layoutSequence(parseSequenceText(WITH));
  const withoutIcon = layoutSequence(
    parseSequenceText(WITH.replace(" @nextjs", "")),
  );

  const widthOf = (layout, id) =>
    layout.participants.find((p) => p.id === id).headerWidth;

  check(
    "an icon widens its own card by the icon box plus its gutter",
    widthOf(withIcon, "a") - widthOf(withoutIcon, "a") ===
      SEQ.iconSize + SEQ.iconGap,
    `${widthOf(withIcon, "a")} vs ${widthOf(withoutIcon, "a")}`,
  );
  check(
    "a participant without one is not widened",
    widthOf(withIcon, "b") === widthOf(withoutIcon, "b"),
  );
  check(
    "the slug reaches the renderer on the laid participant",
    withIcon.participants.find((p) => p.id === "a").icon === "nextjs" &&
      withIcon.participants.find((p) => p.id === "b").icon === undefined,
  );
  /* The reason the width is measured at all: an icon drawn without being
     measured would either overlap the name or push it past the card. */
  check(
    "the name plus the icon still fits inside the card",
    estimateTextWidth("Storefront Web Application", SEQ.nameFontSize) +
      SEQ.iconSize +
      SEQ.iconGap <=
      widthOf(withIcon, "a"),
  );
  {
    /* At the minimum width the icon costs nothing — there is already slack
       inside the card — and the card must not shrink below the floor to
       "make room" either. */
    const short = layoutSequence(
      parseSequenceText(
        'archlab 1.0 sequence\ntitle "T"\n\n@sequence\n  a "A" @nextjs\n  b "B"\n\n  a -> b : "x"\n',
      ),
    );
    check(
      "a short name keeps the minimum card width, icon or not",
      widthOf(short, "a") === SEQ.headerMinWidth &&
        widthOf(short, "b") === SEQ.headerMinWidth,
      `${widthOf(short, "a")} / ${widthOf(short, "b")}`,
    );
  }
}

/* ----------------------------------------------------------------------- */
/* Participant boxes — the bracket, its span, and the room it reserves      */
/* ----------------------------------------------------------------------- */

console.log("participant boxes");

{
  const BOXED = `archlab 1.0 sequence
title "Boxed"

@sequence
  box "Ours" tint=#bfdfff
    a "A"
    b "B"
  c "C"

  a -> b : "x"
  b -> c : "y"
`;
  const boxed = layoutSequence(parseSequenceText(BOXED));
  const unboxed = layoutSequence(
    parseSequenceText(
      BOXED.replace('  box "Ours" tint=#bfdfff\n', "").replace(/^    /gm, "  "),
    ),
  );

  check("one box in, one box placed", boxed.boxes.length === 1);
  const [box] = boxed.boxes;
  check(
    "the box keeps its label and its normalised tint",
    box.label === "Ours" && box.tint === "#bfdfff",
  );

  const a = boxed.participants.find((p) => p.id === "a");
  const b = boxed.participants.find((p) => p.id === "b");
  const c = boxed.participants.find((p) => p.id === "c");
  check(
    "the bracket spans its members' cards and no further",
    box.x < a.x - a.headerWidth / 2 &&
      box.x + box.width > b.x + b.headerWidth / 2 &&
      box.x + box.width < c.x - c.headerWidth / 2,
    `box ${box.x}..${box.x + box.width}, b ends ${b.x + b.headerWidth / 2}, c starts ${c.x - c.headerWidth / 2}`,
  );
  check(
    "the bracket ENCLOSES the header cards rather than floating above them",
    box.y < boxed.headerTop &&
      box.y + box.height > boxed.headerTop + boxed.headerHeight,
    `box ${box.y}..${box.y + box.height}, header ${boxed.headerTop}..${boxed.headerTop + boxed.headerHeight}`,
  );
  check(
    "the label band pushes the cards down by exactly its own height",
    boxed.headerTop - unboxed.headerTop === SEQ.boxLabelHeight,
    `${boxed.headerTop} vs ${unboxed.headerTop}`,
  );
  check(
    "a document with NO boxes reserves nothing for them",
    unboxed.boxes.length === 0,
  );
  check(
    "the bracket is inside the viewBox — a box on the first column cannot be clipped",
    box.x >= boxed.minX && box.x + box.width <= boxed.minX + boxed.width,
    `box ${box.x}..${box.x + box.width} vs view ${boxed.minX}..${boxed.minX + boxed.width}`,
  );
}

/* ----------------------------------------------------------------------- */

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} sequence-layout assertions passed.`);
