---
paths:
  - "src/features/archtext/**"
  - "src/features/mermaid/**"
  - "src/features/mcp/**"
  - "src/app/view/**"
  - "src/app/demo/**"
  - "scripts/**/*.mjs"
---

# Adding a New Diagram Type

A new notation is the largest change this codebase accepts. Two have been added
since 1.0.0 — flowcharts and use-case diagrams — and both touched the same
places in the same order. Follow that order. It is not a preference: each step
depends on the one before it, and the ones people skip are the last two, which
are the reason anybody finds the diagram at all.

## Do this first: write the checklist down

Before any code, copy the checklist at the bottom of this file into the pull
request description and tick items as they land.

This is not ceremony. The order below has been skipped twice, both times by an
agent that had READ this file — once by building the parser before the view
page and shipping a grammar nothing could draw, once by stopping after step 2
and calling it a checkpoint while the user could see nothing. Reading a rule
and holding it across a long build are different things, and a list in the PR
is the only part that survives a context window. **If a step is genuinely not
done, the box stays unticked and the PR says so** — an unticked box is a
smaller failure than a step silently dropped.

**The bar to clear before you start:** a new notation must answer a question the
existing four cannot. Each kind's one-line job lives in
`src/features/playground/lib/kind-copy.ts` — write yours before you write any
code. If you cannot state the question it answers in one line without overlapping
an existing kind, the diagram does not need to exist.

Neither of the last two additions changed an existing document. Hold that line:
every `.alab` file, share link and route that worked before must work unchanged,
and the new grammar must be **refused by name** by the old parsers rather than
half-parsed.

## 1. The view page first, and Mermaid before anything else

Start at `/view`, not at the parser. The view page is where a reader meets the
diagram, and building it first stops you shipping a grammar nothing can draw.

**This is the most-skipped step in the file, and skipping it is seductive**
because the parser is the part with the clearest specification. Build the
canvas against a HAND-BUILT model object first — twenty lines, no parser — and
only then write the grammar that produces it. If you find yourself with a
byte-perfect round trip and nothing on screen, you have already made the
mistake.

**Check Mermaid support before you design the grammar.** This is the step that
constrains everything after it, which is why it comes first:

- Does Mermaid have this notation? If it does, the `.alab` grammar should be
  convertible to and from it, and `src/features/mermaid/lib/` gets a
  `<kind>.ts`, `<kind>-mapping.ts` and `<kind>-emit.ts` — the same trio every
  existing kind has.
- Decide explicitly whether conversion is **two-way** (C4 and sequence) or a
  **one-way lossy import** (flowchart, use case). Say which in the tool
  description and in the changelog. A lossy import that presents as lossless is
  a bug people only find after they lose work.
- **Anything Mermaid can express that arch-lab cannot must be refused by name,
  never silently approximated.** Flowchart import refuses unsupported shapes by
  name; do the same.
- If Mermaid has no equivalent, say so in the PR and skip the converter — but
  do not invent a Mermaid dialect.

Then build, in this order:

- `src/features/archtext/lib/<kind>/` — `keywords.ts`, `schema.ts`, `parse.ts`,
  `serialize.ts`. Register the header word in
  `src/features/archtext/lib/sequence/detect.ts`, whose regexes are anchored to
  the whole line on purpose: a confidently wrong kind routes text to the wrong
  parser, and that error message misleads worse than no answer.
- `src/features/<kind>/` — the feature, following the shape both new kinds
  already use: `components/`, `input/`, `lib/`, `export/`, `share/`, `service/`,
  `styles/`, and an `index.ts` barrel. Nothing outside imports past that barrel.
- Routes: `src/app/view/<short>/` and `src/app/view/<kind>/`. **Mint links
  against the short path.** Share links carry the model inside the URL and a
  shorter route leaves more characters for the payload — that is why sequence
  links use `/view/seq`.
- `pnpm check:roundtrip` and a new `check:<kind>` are not optional. Open a file,
  change nothing, save: the bytes must be identical.

## 2. The canvas must be beautiful, and connectors must be animated

Presentation is the product (`purpose.md`). A new notation that renders
correctly and looks worse than the other four has lowered the whole product, and
that is a defect, not a follow-up.

- **Layout is derived, not gridded.** Every kind here solves geometry from the
  relationships — ranks for flowcharts, actors outside the boundary for use
  cases — and falls back to a grid never. A new kind gets its own `lib/layout.ts`
  and its own `check:<kind>-layout`.
- **Labels never sit on a line, edges never cross a node they do not touch.**
  Orthogonal routing where the notation implies it. Loops return beside the
  column they leave rather than through it.
- **Line connectors are always animated.** This is a standing rule, not a
  per-diagram choice. Every kind has an entrance that traces the diagram in its
  own logic — rank by rank for flowcharts, message by message for sequence — an
  ambient pulse that retraces it at rest, and a gradient current along a
  selected path. A static new kind beside four animated ones reads as unfinished.
- **Motion is opt-out twice.** Everything above must hold still for
  `prefers-reduced-motion` **and** the app-wide idle-motion toggle, and the
  resting state is what a no-JS reader gets. Pin it with
  `check:<kind>-motion`.
- **Colours are complete in every theme or they are broken.** A palette with six
  distinct shapes must be six distinct shapes in all six themes, contrast
  measured. `check:themes` and a `check:<kind>-palette` prove it. A
  half-populated palette ships a choice that makes the diagram look broken.

  **A `check:<kind>-palette` is only owed by a kind that HAS a palette** — one
  that assigns colour by type, like the flowchart's six shapes or C4's five
  roles. ER and the data dictionary paint from the shared node tokens and have
  no per-type colour to complete, so demanding the check of them would only
  produce a script asserting that nothing exists. A vacuous check is worse than
  no check: it reports coverage it does not have.
- SVG and PNG export, GIF export of the trace, and share links, matching what
  the other kinds offer. Anything you leave out is a gap a user will find.
- **Answer whether the canvas can be EDITED, in the capability grid.** Two of
  the six notations can be, and the other four refuse for reasons that are
  written down rather than left blank — so a new kind owes an answer either way.
  `CANVAS_EDIT_OFFERS` is a total table over the document kinds, so it will not
  compile until yours has one. Read
  [`canvas-editing.md`](canvas-editing.md) before you write it: it is the
  difference between a drag that becomes text and a drag that springs back with
  no explanation, and it carries the four bugs that bought its rules — a lock
  rendered in the wrong branch for a whole release, a re-emit that ate the
  author's comments, a toggle that deleted a hand-written default, and a page
  claiming C4 was the only editable canvas long after it was not.

## 3. Update MCP for the new capability

The MCP surface is one of the two things a drawing tool cannot do. A notation an
agent cannot author is half-shipped.

- `src/features/mcp/tools/<kind>.ts` — at minimum `validate_<kind>` and
  `format_<kind>`, following the existing pair. Validate reports **the defects a
  parse cannot see**: unguarded decisions, unreachable steps, actors that can do
  nothing, `include` cycles. A validator that only reports syntax errors adds
  nothing over the parser.
- `src/features/mcp/catalog.ts` — the tool entries, their descriptions, and the
  section that groups them. Descriptions are agent-facing contracts: name the
  header line, name the Mermaid dialect accepted, and say whether import is
  lossy.
- `create_share_link` must accept the new kind.
- `skills/alab/SKILL.md` is **generated**. Run `pnpm build:skill`, then
  `pnpm check:skill`. Never hand-edit it, and never run bare `pnpm format` — it
  rewrites that file and breaks the check.
- `pnpm check:mcp`.

MCP and `.alab` are marked beta in-product, which is the one place the format
guarantees relax — but a break there still needs an explicit changelog entry.

## 4. Home page, syntax reference, demo

Three surfaces, all of which have been forgotten at least once:

- **Home page** (`src/app/page.tsx`) — the section naming the notations is
  driven by a table in that file; the new kind gets a row, one line saying what
  it is for, and a link to a worked example in the playground. The hero cycles
  through the kinds as real miniatures of their own notation, so the new kind
  needs a miniature in `src/features/marketing/hero-diagram.tsx` — not a
  placeholder box.
- **Syntax reference** (`/syntax`) — `src/features/syntax-docs/content/snippets.ts`,
  pinned by `pnpm check:syntax-docs`. Also the VS Code grammar
  (`pnpm check:vscode-grammar`) so `.alab` files highlight.
- **Playground** — a starter in the "Start from" row, seeded by query parameter:
  `src/features/playground/lib/seed.ts`, `example-param.ts`, `input/parse.ts`,
  and the one-line job in `kind-copy.ts`. That blurb is shared with `/demo` on
  purpose: two copies would be two answers to "what is this kind for" on one
  site.
- **Demo** (`src/app/demo/page.tsx`) — at least two bundled examples with
  crawlable read-only pages at `/view/<kind>/[exampleId]`. Rows are clickable end
  to end and honour reduced motion.
- **Validate** (`/validate`) must accept the new kind, and its samples are pinned
  by `pnpm check:validate-samples`.

Every user-facing sentence describing what the product draws now names one more
notation. Find them all — the site described itself as a C4-and-sequence tool in
five places long after it drew four kinds.

## 5. SEO and GEO

This is the step that gets skipped, and skipping it means the work is invisible.
See `deploy.md` for why routes are load-bearing.

**SEO:**

- `src/app/sitemap.ts` — every new route. `check:seo` derives its coverage
  expectation from that array, so a route missing here fails the check.
- Route-level `metadata`: a title under ~60 characters, a description under 160,
  and `alternates.canonical`. Alias routes canonical to the page they forward to.
- An OG card. Every share link previews through `/view`, so that card must name
  the new kind — a shared diagram previewing as an advert for C4 is a bug that
  already shipped once. `pnpm check:og-cards`.
- Structured data on the routes that carry it.
- `pnpm check:seo` and `pnpm check:share-capacity` — the second proves every URL
  a link was ever minted against still opens.

**GEO** — the site is quoted by assistants as much as crawled by search:

- `src/app/llms.txt/route.ts` and `llms-full.txt` list the pages and the
  capabilities. Add the kind and its routes.
- AI crawlers do not execute JavaScript. The new kind's description, its example
  pages and its syntax must be in server-rendered HTML, not painted by a client
  component. `check:seo` asserts specific pages stay server-rendered.
- Write for passage-level citation: one self-contained sentence that answers
  "what is a `<kind>` diagram in arch-lab and what is it for", in the same words
  on the home page, `/demo`, `/syntax` and the MCP tool description. An assistant
  quotes one passage, not a page.
- Add the kind to `/faq` if it changes an answer already there — what it exports,
  how it compares to Mermaid, what an agent can do with it.

## Reporting progress

A step is DONE when a user can see it, not when it typechecks. Two rules:

- **Never report a partial build as a checkpoint** unless the user asked for
  one. "The grammar works, nothing draws it yet" is not progress a reader can
  use; it is the middle of step 1.
- **Say which of the five steps are unstarted**, by number, every time you
  report. The failure mode is not lying about what is done — it is going quiet
  about what is not.

## Motion: the standing rules

These come last in the file and are broken first, because each is easy to
argue out of for one diagram kind:

- **Motion on a connector must SAY something.** This rule used to read "every
  connector is animated", absolutely, and it was over-strict — it is the
  clearest case in this file of a rule causing the defect it was meant to
  prevent. Read what it cost, because the shape repeats:

  The ER canvas draws lines along which nothing travels. The absolute rule
  forced a pulse onto them anyway; the pulse then made the focus state
  indistinguishable, so focus got a glow; the glow was implemented as an SVG
  filter; and the filter had a percentage region on a **zero-height bounding
  box**, which the browser painted as two bands across the diagram. Three
  commits went into chasing those bands, and every one of them adjusted a
  stroke — because the rule had made a stroke the obvious suspect. Nothing in
  that chain was asked for by anything except this rule.

  The test is now: **would removing this motion lose information?** A
  flowchart's trace answers "what order does this run in", so it earns its
  entrance. A dictionary has no connectors, so the question does not arise. An
  ER connector's ambient pulse says nothing a static line does not — keep it
  only while it stays cheap and quiet, and drop it the moment it costs a second
  visual language to survive.
- **Focus dims and animates. It does not repaint.** This was looser and wrong
  too: it used to permit "a glow, a colour or a weight", and colour and weight
  were both added and then removed, twice, because a focused line that
  recolours is a new border appearing where one already was. Dim what is
  unrelated, animate what is lit, and change no stroke, fill, width or
  arrowhead in either direction. Keyboard `:focus-visible` is the one
  exception, because a keyboard user has no hover to fall back on.
- **Never apply an SVG `filter` to a connector.** A percentage filter region is
  `objectBoundingBox` units, and a horizontal or vertical line has a
  zero-extent box in one axis — the region collapses and the paint lands
  somewhere else entirely. If a soft edge is wanted, draw a wider path. Pinned
  by `check:er-motion`; it belongs in any new kind's motion check.
- **Stagger with NEGATIVE animation delays.** A positive delay on an infinite
  animation is invisible until an ancestor class changes; then the animation
  restarts and replays its silent head, and the reader sees every connector
  blink off and back on. This shipped.
- **A class list is an array joined with a space**, never concatenated. A lost
  leading space merges two classes into one nonsense class, every rule
  targeting it silently stops applying, and nothing reports it — CSS selectors
  that match nothing are not errors. This shipped too.

## Finally

Run the whole gate — `pnpm typecheck && pnpm lint && pnpm build` — plus every
`check:*` above. There is no CI; nothing runs them for you.

Tick every box in the checklist below, or say in the PR which are unticked and
why.

Write the changelog entry grouped by capability, not as a flat list, in the
manner of the flowchart and use-case entries: what it draws, what it converts,
how it lays out, how it moves, what it exports. State explicitly that no existing
document, link or route changed — or, if one did, that it is a breaking change
and bump the major version.

## The checklist

Copy this into the pull request. Each line is a place the last two additions
touched; an unticked box is a decision, not an oversight.

**1. View and format**

- [ ] `/view?d=<kind>` renders a real canvas
- [ ] `/view/<short>` alias route
- [ ] `src/features/archtext/lib/<kind>/` — keywords, schema, parse, serialize
- [ ] header word registered in `sequence/detect.ts`
- [ ] `src/features/mermaid/lib/<kind>{,-mapping,-emit}.ts`, two-way or a named
      lossy import
- [ ] `check:<kind>` — byte-identical round trip, forward tolerance, refusals,
      no cross-parsing with the other grammars

**2. Canvas**

- [ ] derived layout (never a grid) + `check:<kind>-layout`
- [ ] connectors animated; focus that does not restyle the notation
- [ ] `check:<kind>-motion` — opt out twice, reveal budget, every styled class
      actually emitted
- [ ] complete in every theme, and `check:<kind>-palette` **if the kind assigns
      colour by type** (see step 2 — not every kind has a palette)
- [ ] SVG/PNG export, GIF where there is a trace, share button
- [ ] a `CANVAS_EDIT_OFFERS` cell per ability — offered, or refused with a
      reason and a `ground` ([`canvas-editing.md`](canvas-editing.md)); a lock
      and a heading sentence if any is offered

**3. MCP**

- [ ] `validate_<kind>` / `format_<kind>` reporting defects a parse cannot see
- [ ] catalogue entries and a section in `catalog.ts`
- [ ] `create_share_link` accepts the kind
- [ ] `pnpm build:skill` + `check:skill`, `check:mcp`

**4. Site**

- [ ] home page notation card
- [ ] home page HERO miniature (`hero-diagram.tsx` + the cycle in
      `globals.css` + `check:hero`)
- [ ] `/syntax` snippets + `check:syntax-docs`, VS Code grammar
- [ ] playground starter, seed, `?d=` value, `kind-copy.ts` blurb
- [ ] `/demo` section, example registry, `/view/<kind>/[exampleId]` pages
- [ ] `/validate` accepts it + `check:validate-samples`
- [ ] every "four kinds" sentence on the site now says five

**5. SEO and GEO**

- [ ] sitemap: alias route and every example page
- [ ] route metadata: title < 60, description < 160, canonical
- [ ] OG card names the kind + `check:og-cards`
- [ ] `llms.txt` and `llms-full.txt`
- [ ] the kind's one-sentence description is in server-rendered HTML
- [ ] `/faq` updated if it changes an answer already there
