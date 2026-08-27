---
paths:
  - "src/**/*.{ts,tsx}"
  - "src/**/*.css"
  - "scripts/**/*.mjs"
---

# Codebase Rules

Comment style is in [`comments.md`](comments.md); helper reuse and shared-code
placement are in [`dry.md`](dry.md). This file covers everything else.

## Structure

- Features own their code and are consumed through their `index.ts` barrel.
  Never deep-import another feature's internals.
- `src/app` holds routes and route-level metadata only — sitemap, robots,
  `llms.txt`, `/api/mcp`. Logic belongs in a feature.
- `scripts/` is the `check:*` suite. It loads the real library code from `src/`
  through Node's type stripping, so a check exercises what the app ships rather
  than a copy of it. Never reimplement app logic inside a check.

## Two layers of tests

- `pnpm test` is the **unit** layer (vitest, node environment, no DOM): pure
  functions only — grammar, geometry, codecs, helpers. A failure here names the
  function that broke. Tests sit beside the code as `foo.test.ts`.
- The `check:*` scripts are the **integration** layer. A failure there says
  "something moved", which is the right answer to a different question.
- Which layer does a new test belong in? If it can be proved with a pure
  function over data, it is a unit test. If it needs a rendered page, real
  geometry off the DOM, or a route, it belongs behind a `check:*` script — do
  not reach for jsdom to simulate what a check script can measure for real.
- **A component test is not a substitute for either.** The large viewer
  components are covered by the check suite; when one is broken up, the extracted
  pure helpers should arrive with unit tests in the same commit.

## The check suite is the safety net

- There are 49 `check:*` scripts. If you change a **format, converter, layout,
  or route**, one of them almost certainly already has an opinion — find it and
  run it before assuming your change is free.
- Each script's header states what it proves and, usually, which shipped bug
  bought each rule. That header is the documentation; do not paraphrase it
  elsewhere, and update it when the rule changes.
- A new assertion must say **why** it exists and name the failure it prevents.
  Assertions that restate the implementation pass forever and catch nothing.
  Useful ones are relational ("thinner than", "not on top of") or measured.
- Round-trip is a hard invariant: open a file, change nothing, save — the bytes
  must be identical (`check:roundtrip`, `check:archtext`, `check:sequence`).

## Before opening a pull request

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

All of it must pass, plus every `check:*` your change touches. `pnpm lint` has
three known warnings and no errors — a fourth is yours. **Nothing runs these
for you**: there is no CI, so an unrun check is an unchecked change that will
deploy.

## Formatting

- Never run bare `pnpm format`. It rewrites the generated `skills/alab/SKILL.md`
  and breaks `pnpm check:skill`. Format the files you touched:
  `pnpm exec prettier --write <paths>`.
- `pnpm format:check` fails on two files at baseline. That is pre-existing —
  do not "fix" it as a drive-by.

## Tooling

- **pnpm only.** npm and yarn lockfiles are gitignored on purpose. The version
  is pinned by `packageManager`.
- Node ≥ 20.9 to run the app; **≥ 23.6** to run the `check:*` scripts, which
  need built-in type stripping.

## Feature flags and constants

- `CANVAS_EDIT_ENABLED` in `src/lib/constants.ts` gates the editable C4 canvas
  on `/live`, and every CTA and capability claim reads from it so they downgrade
  honestly on their own. If you add a claim about editing, source it from the
  flag rather than hardcoding the present tense. (It replaced `EDITOR_ENABLED`,
  which gated the retired `/editor` route.)
- Budgeted strings stay in budget. `SITE_DESCRIPTION` is the meta description,
  the OG and Twitter description, and the home page's JSON-LD `description` —
  keep it under 160 characters or it is written for nobody.

## Secrets

- `ARCHLAB_SHARE_PRIVATE_KEY` is a signing key and never belongs in the repo.
  `.gitignore` covers dotless `env` variants specifically because
  `node scripts/gen-share-keys.mjs > env` is one missing dot from `.env` and
  `git add -A` would have staged it. Do not weaken those lines.

## Why changes here keep going wrong, and the five habits that prevent it

Written after a run of avoidable defects on one branch. Every one shipped
green: the build passed, the checks passed, and the bug was visible to the
person who opened the page. They share five causes, and each has a cheap
habit that would have caught it.

**1. Writing a helper instead of finding the one that exists.** A second PNG
rasteriser, a second `downloadBlob`, a second `RenderedSvg` type — all written
from scratch next to working versions in `features/viewer/export/download`.
`dry.md` already says to search first; the failure mode is not disagreeing with
that rule, it is *not remembering to apply it while mid-flow*.
→ **Before writing any function, grep the repo for its BODY, not its name.**
Two minutes, every time, no exceptions for "this is obviously new".

**2. Inventing a variant of a component that already has an agreed shape.** An
export menu with three PNG rows and no Copy row, beside four exporters that all
use one sharpness axis and a Copy row. Nothing was broken; it was just
*different*, which a user reads as a bug.
→ **When adding the Nth of something, open the (N-1)th and match it.** Deviate
only where the new case genuinely differs, and say so in a comment.

**3. Verifying by reasoning instead of by measuring.** A hero connector that
started in mid-air, key badges rendered onto the row above, badge runs 9px
wider than their column — all "checked" by reading the code.
→ **If it has coordinates, compute them in a scratch script and assert the
relationship** (inside, left-of, non-overlapping). If a check cannot fail,
break the code deliberately and watch it fail before trusting it.

**4. Two halves of one thing, each self-consistent, that disagree.** This is
the most expensive class here and it caused most of the list: the canvas
stacked badges while the layout measured them in a row; the resolver knew four
registries while six existed; a class list lost a space so CSS matched nothing.
Each half was correct alone.
→ **When two modules must agree, make one derive from the other** — import the
table, read the directory, compute from the shared constant. Where they truly
cannot share (CSS cannot import TS), a `check:*` script must pin the pair, and
that check must be written from the FILESYSTEM or the DATA, never from a
hand-listed set of names. A hardcoded list cannot notice the thing it has never
heard of; three checks in this repo passed for exactly that reason while the
feature under them was broken.

**5. A rule stricter than the product needs will cause defects of its own.**
Two on this branch did. "Every connector is animated", written as an absolute,
forced motion onto a canvas where nothing travels — which forced a glow to
distinguish focus, which was built as an SVG filter, whose region collapsed on a
flat path and painted bands across the diagram. And "focus may light a line with
a colour or a weight" permitted exactly the repaint that had to be removed
twice.
→ **When a rule keeps producing work nobody asked for, suspect the rule.** Both
now state the TEST rather than the verdict — "would removing this lose
information?" instead of "always animate". A rule that says what to CHECK
survives a case its author did not imagine; a rule that says what to DO does
not.

**And one about reporting.** A step is done when a user can see it, not when it
typechecks. Say which parts are unstarted, by name, every time — the failure is
never claiming too much, it is going quiet about what is missing.
