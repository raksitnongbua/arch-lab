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

import { existsSync, statSync } from "node:fs";
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
const { layoutSequence, SEQ } = await import(
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

if (failures > 0) {
  console.error(`\n${failures} of ${assertions} assertion(s) FAILED`);
  process.exit(1);
}
console.log(`\nAll ${assertions} sequence-layout assertions passed.`);
