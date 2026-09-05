---
status: shipped in #119
---

# Implementation plan: Paths — authored walks through a C4 diagram

Implements the approved design. The design is decided; this plan does not
revisit it. Where the design is silent on something the code forces a choice
about, the choice is marked **DECIDED**. Where the design looks wrong on a
point that matters for building it, it is in **Concerns** at the end — and
planned as written anyway.

Ten stages. Every stage boundary is green:
`pnpm typecheck && pnpm lint && pnpm test` passes, plus the `check:*` scripts
that stage touches, and nothing half-built is user-visible. There is no CI
(`deploy.md`), so each stage's proving command is run by hand.

## Facts established by reading the code

These constrain the plan and are cited by stage.

1. **`.alab` allows exactly three indents.** `parse.ts:475` fails any indent
   other than 0, 2 or 4. The design's beat chains sit at indent 6. This is the
   single largest grammar change and it is invisible in the design.
2. **That error string is a pinned fixture.** `syntax-docs/content/snippets.ts:1256`
   asserts the message verbatim, and `check:syntax-docs` runs it through the
   real parser. `scripts/archtext-check.mjs:696`, `flowchart-check.mjs:477` and
   `usecase-check.mjs:528` each match on the substring `"inconsistent
   indentation of 3 spaces"` (substring only — those three survive).
3. **Edges are strictly binary.** `parseEdgeLine` reads one source, one arrow,
   one target. There is no chain parser to reuse; a beat chain is new code.
4. **`check:canvas-edit` counts keydown listeners.** `canvas-edit-check.mjs:1013`
   asserts *exactly two* `window.addEventListener("keydown"` in
   `viewer-canvas.tsx`. A third one fails the check.
5. **The serializer never rewrites the header.** `serialize.ts:169` is
   ``lines.push(`archlab ${version}`)`` with `version` taken from the document.
   `parse.ts` refuses only `major > SUPPORTED_MAJOR_VERSION`. The design's "no
   header bump" is correct; the code agrees.
6. **`splitUnknowns` is the forward-tolerance machine.** A diagram key not in
   `DIAGRAM_KEYS` is emitted as a `!` line and read back into `unknowns`.
   Adding `paths` to the known set changes what a `!paths` line means.
7. **`FIT_PADDING`'s comments are already stale.** `bottom: "80px"` cites "the
   hint pill", deleted in `fbe767e`; `top: "72px"` cites "level chips", deleted
   with the level strip.
8. **`check:shortcuts` scans `src/features/editor` only.** Viewer key bindings
   are out of its scope; no catalog entry is owed.

---

## Stage 1 — Types, validator, glossary, the `aria-label` rename

**Goal.** The model can hold a path and the file validator accepts one, with
nothing yet able to produce or read it.

**Size: S.**

**Files edited**

- `src/types/c4.ts` — add `C4Chain`, `C4Beat`, `C4Path`; add
  `C4Diagram.paths?: C4Path[]` **after `edges`**.
- `src/features/editor/io/validate.ts` — `validateArchLabFile` gains a `paths`
  section, placed after the `edges` section (`validate.ts:486`), following the
  `frames` section's shape (`validate.ts:269`) exactly.
- `src/features/editor/io/serialize.ts` — the `diagram` key spec (`:99`) gains
  `"paths"` last in `order`; three new specs `path`, `beat`, `chain`.
- `src/features/archtext/lib/schema.ts` — `DIAGRAM_KEYS` gains `"paths"` last.
- `src/features/archtext/lib/parse.ts` — `DIAGRAM_KEYS_SET` (`:1119`) gains
  `"paths"`.
- `CONTEXT.md` — new `## Reading` section after `## Canvas editing`, carrying
  the three entries from the design verbatim (**Path**, **Beat**, **Player**,
  each with its `_Avoid_` line).
- `src/features/viewer/components/viewer-toolbar.tsx` — `aria-label="Diagram
  path"` → `aria-label="Diagram trail"`.

**Symbols touched.** `C4Diagram`, `validateArchLabFile`, `KEY_SPECS.diagram`,
`DIAGRAM_KEYS`, `DIAGRAM_KEYS_SET`, `ViewerToolbar`.

**DECIDED — the model shape.**

```ts
interface C4Chain { nodes: string[]; edgeId?: string }
interface C4Beat  { caption: string; chains: C4Chain[] }
interface C4Path  { id: string; title: string; beats: C4Beat[] }
```

`edgeId` binds the **last** hop of its chain line, and there is at most one per
line. The design says the `~id` anchor "binds the immediately preceding hop"
without saying what a three-node chain with an anchor means; one anchor per
line, on the final hop, is the reading that matches the design's own example
and round-trips as one token. An author needing two anchors writes two chain
lines, which the design already allows.

**DECIDED — `paths` is NOT sorted by id.** `serialize.ts`'s diagram spec has
`sortById: ["frames","nodes","edges"]`; `paths` must stay out of it. Author
order is meaning here — the menu lists paths in the order they were written —
and sorting would silently reorder a reader's menu on every JSON save.

**Tests.** A diagram with a well-formed `paths` array validates; a `paths` that
is not an array, a path with an empty `id`, a beat with an empty `caption`, and
a chain with fewer than two node ids each produce a `FileValidationError`
naming the JSON path (`diagrams[0].paths[0].beats[1].chains[0]`).

**Proof.** `pnpm typecheck && pnpm lint && pnpm test`, plus
`pnpm check:archtext && pnpm check:roundtrip` — these must still pass with
`paths` merely *known* and never emitted.

**Comment discipline.** `C4Path`'s doc comment carries the two decisions above
(author order is meaning; the anchor binds the last hop) and the reason paths
are diagram-scoped. `C4Diagram.paths`'s comment states "**Author order, never
sorted**" so nobody adds it to `sortById` later.

**Risk.** Low, with one sharp edge: adding `"paths"` to `DIAGRAM_KEYS_SET`
turns a literal `!paths : […]` line from a preserved unknown into a parse
error. See Compatibility.

---

## Stage 2 — Grammar, part 1: parsing

**Goal.** `parseArchText` reads `path`/`beat`/chain lines into the Stage 1
model and rejects every ugly case with the design's error text.

**Size: L. This is one of the two stages most likely to overrun.**

**Files edited**

- `src/features/archtext/lib/parse.ts` — the indentation gate, the main loop's
  state, `parseBodyLine`, a new `parsePathLine` / `parseBeatLine` /
  `parseChainLine`, and the cross-check block inside `resolve()`.
- `src/features/syntax-docs/content/snippets.ts` — the indentation error
  fixture at `:1256` must be updated **in this commit** or `check:syntax-docs`
  fails.
- `src/features/archtext/lib/parse.test.ts` — new `describe("paths")`.

**DECIDED — indent 6 is legal, and only inside a path.** The allowed set
becomes `{0, 2, 4, 6}`. The refusal message becomes:

> `inconsistent indentation of 3 spaces — expected 0 (header or "@" diagram), 2 (diagram body), 4 (node/edge continuation or "beat") or 6 (a beat's chain line)`

An indent-6 line with no open beat above it fails with its own sentence:
`this line is indented like a beat's chain, but no "beat" line is open above
it`. Rejected alternative: putting chains at indent 4 beside `beat` — indent 4
already means "continuation of the node or edge line above", and a bare
`a -> b` there is exactly the shape `parseContinuation` would have to
disambiguate by guessing.

**DECIDED — the loop's state.** The main loop gains `currentPath: PendingPath |
null` and `currentBeat: PendingBeat | null` beside the existing `member`.
Transitions:

- indent 0 → all three cleared (matches today's `current = null; member = null`).
- indent 2 → `currentPath`/`currentBeat` cleared, then `parseBodyLine` runs; a
  `path` line sets `currentPath` and leaves `member` null.
- indent 4 → if `currentPath !== null`, the line **must** be `beat` (anything
  else fails naming the word); otherwise it is a continuation, unchanged.
- indent 6 → requires `currentBeat !== null`.

**DECIDED — only `->` is legal in a chain.** Any other arrow token fails
naming it: `"<->" is not allowed in a beat — a beat's chain uses "->" only,
and the arrow orders the telling rather than asserting direction`. This is what
makes a mis-indented `<->` edge line fail syntactically as well as
semantically.

**Where each rule is enforced.** Shape errors (duplicate path id, empty title,
zero beats, chainless beat, one-node chain, bad arrow, malformed `~`) fail at
the line, in the parse routines. Reference errors (unknown node id, no
relationship joins the pair, `~id` does not join its hop) fail in `resolve()`,
in the same block as the frame cross-check (`parse.ts:2153`) and for the same
stated reason: every node and edge of the diagram is known there.

**Error texts, verbatim from the design.**

```
beat names 'kong' — no element with that id in this diagram
no relationship joins 'email-svc' and 'r2' in this diagram
a path needs at least one beat
a beat must name at least one relationship
```

Plus, in the same register, for the cases the design rules on without quoting:

```
duplicate path id "send" — already declared on line 12; path ids must be unique within a diagram
~e-notify-sendgrid does not join 'email-webhook' and 'slack-ref' — an edge anchor must name a relationship between the two elements of its hop
```

**Tests — red first.** `parse.test.ts` gains a `PATHS` fixture built from
`notify.alab`'s real ids. Every one of the ugly cases gets an `it` that
`expect(() => parseArchText(bad)).toThrow(ArchTextParseError)` **and** asserts
the message contains the offending id. These are written and **watched to
fail** before the parser branches exist — a check which cannot fail proves
nothing. The fixtures that must be seen red: unknown node id, unjoined hop,
mismatched `~id`, duplicate path id, zero-beat path, chainless beat,
single-node chain, non-`->` arrow, indent-6 with no beat open.

Also asserted: a hop matches an edge in **either** orientation
(`email-consumer -> rabbitmq` resolves against `rabbitmq -> email-consumer`),
and a hop between a pair joined by two edges records both (the resolution
itself is Stage 4 — here we only assert the parse succeeds).

**Proof.** `pnpm test` (the new suite red-then-green), then
`pnpm typecheck && pnpm lint && pnpm test && pnpm check:archtext &&
pnpm check:syntax-docs && pnpm check:flowchart && pnpm check:usecase`.
The last three are named explicitly because they match on the indentation
message.

**Risk.** High. The indentation state machine touches the one loop every
notation's C4 parse runs through, and the four-indent rule interacts with
`member.endLine` bookkeeping. Mitigation: the indent gate change lands as its
own commit with the existing suite green before any `path` branch is written.

---

## Stage 3 — Grammar, part 2: serialization and round-trip

**Goal.** A parsed path emits back byte-identically, and a document without
paths emits exactly what it did before.

**Size: M.**

**Files edited**

- `src/features/archtext/lib/serialize.ts` — `emitDiagram` gains a paths block
  after the edges loop; a new `pathBlock(diagramId, path, index)` helper beside
  `frameDeclaration`.
- `src/features/archtext/lib/parse.test.ts` — round-trip assertions.
- `scripts/roundtrip-check.mjs`, `scripts/archtext-check.mjs` — paths fixtures.

**Emission rules.** After the edges, blank-line separated, in stored order.
Captions through `JSON.stringify` (the same quote/escape the frame label and
`desc` already use). Chain tokens joined by `" -> "`, the `~id` anchor appended
with one leading space. A path with no beats is a serializer `invalid(...)`,
not a silent drop — the parser cannot produce one and a hand-built model that
does is a bug worth naming.

**Tests.**

- `parse.test.ts`: `serializeArchText(parseArchText(PATHS_FIXTURE))` equals the
  fixture, byte for byte.
- `roundtrip-check.mjs` / `archtext-check.mjs`: the kitchen-sink text gains a
  two-path, three-beat block including a branching beat (two chain lines), an
  anchored hop, **and a `//` comment line between two paths** — the
  line-patch/`0a9cbf1` lesson the design names.
- A pathless `notify.alab` still round-trips byte-identically (this is
  invariant 2 of `check:paths`, asserted here early so a leak is caught in the
  stage that could cause it).

**Proof.** `pnpm test && pnpm check:roundtrip && pnpm check:archtext &&
pnpm check:mermaid && pnpm check:validate-samples`.

**Risk.** Medium. The risk is not the emission but the *blank line*:
`emitDiagram` pushes `""` between nodes and edges only when both are non-empty.
The paths block needs the same conditional or a document whose diagram has
paths but no edges gains a trailing blank line and the round trip fails.

**Comment discipline.** The paths block gets a comment saying *why* it emits
after the edges and in stored order — "a path is a reading of the relationships
above it, and its order is the author's argument" — not a restatement of the
loop.

---

## Stage 4 — `viewer/lib/paths.ts`, pure, unit-tested, before any UI

**Goal.** A pure function turns a `C4Path` plus a `C4Diagram` into, per beat,
the set of node ids and the set of edge ids it lights.

**Size: M.**

**Files created**

- `src/features/viewer/lib/paths.ts`
- `src/features/viewer/lib/paths.test.ts`

**Exports (contract).**

- `resolvePath(diagram: C4Diagram, path: C4Path): ResolvedPath` where
  `ResolvedPath = { beats: ResolvedBeat[]; nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string> }` and
  `ResolvedBeat = { caption: string; nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string> }`. The path-level sets are the unions — that is
  the mid tier.
- `pathsOf(diagram)` — `diagram.paths ?? []`, so no caller writes `?? []`.
- `beatBounds(diagram, beat)` — the model-space `Rect` the camera fits, from
  the same node rects `diagramBounds` reads.

**DECIDED — resolution is total, never throwing.** The parser has already
refused every unresolvable chain, so this function assumes resolvability but
*degrades* rather than throws when an id is missing: a node id with no node
contributes nothing. The viewer renders models that arrive from share links and
from the pane mid-edit, and a throw here would be a blank canvas where a
slightly-wrong overlay is correct behaviour.

**Tests (red first — these are the ugly edges the design names).**

- Either-orientation matching: `b -> a` resolves the edge declared `a -> b`.
- Parallel edges: a pair joined by two edges lights **both** ids.
- `~id` binding: the same pair with an anchor lights **only** the anchored id.
- Branching beat: two chain lines, union of both.
- A three-node chain yields two hops and both hops' edges.
- A beat whose node id is absent from the diagram yields the remaining hops and
  does not throw.
- `beatBounds` of a two-node beat is the union rect of those two nodes and
  nothing else.

**Proof.** `pnpm test`.

**Risk.** Low. This is the stage that pays for itself — every later stage
consumes it and none of them has to think about parallel edges again.

---

## Stage 5 — Viewer state and the three-tier dim

**Goal.** With a path and beat forced in from a test harness, the canvas lights
three tiers correctly, hover stands down, selection wins, and Escape has its
new rung. No control yet.

**Size: L. The second stage most likely to overrun.**

**Files edited**

- `src/features/viewer/components/viewer-canvas.tsx` — new `activePath` state
  (`{ pathId: string; beat: number } | null`), a `pathFocusCss` memo, the
  `hoverFocusCss` guard, the edges memo, the Escape ladder, `FIT_PADDING` use.
- `src/features/viewer/lib/canvas-constants.ts` — `FIT_PADDING` comments.
- `src/features/viewer/components/viewer-shell.tsx` — the ladder documentation
  in the file header.

**The stylesheet.** `pathFocusCss` is a fourth `useMemo` beside `nodeFocusCss`,
`hoverFocusCss` and `multiFocusCss`, mounted in the same `<style>` stack
(`:2754`). It emits **exactly** the constants the canvas already owns:

- off-path nodes `opacity: ${DIM_NODE_OPACITY}`, off-path edges/chips `0.2`
  (the `viewer-edge-base-dimmed` value at `:470`);
- on-path-not-current nodes `${HOVER_DIM_NODE_OPACITY}`, edges/chips
  `${HOVER_DIM_EDGE_OPACITY}`.

It returns `null` when any selection is live — the path stays *active but
suspended*, which is one `if` at the top mirroring `hoverFocusCss`'s guard.

**The current beat's comet.** Not in the stylesheet: the edges memo (`:2250`)
gains a branch so a current-beat edge takes `emphasis: "selected"` and every
other edge takes `"dimmed"` when a path is active and nothing is selected. This
reuses `viewer-edge.tsx`'s existing selected treatment, including its
reduced-motion static-gradient fallback, for free. Current-beat **nodes** get
nothing: no ring, no marching outline (the design's rule, and the
multi-select's recorded argument).

**The `hoverFocusCss` guard.** `activePath !== null` joins
`detail`/`selectedNodeId`/`activeMultiIds`/`selectedFrameId` in the early
return at `:2585`, and the `SELECTION WINS` comment above it is **rewritten**,
not appended to: it currently states a two-way rule and must state the
three-way one — *selection > path > hover* — and say why the path sits in the
middle (entering a path is a commitment the cursor may not take back; two dims
re-aiming one opacity is the flicker the comment already warns about).

**Frames.** `FrameLayer` receives the path's node sets so a frame holds full
presence if any member is in the current beat, hover-tier if any member is on
the path, else dims. Composed through the mechanism the selection dim already
uses for boundary clusters — no new frame dimming system.

**Escape.** The ladder in `viewer-canvas.tsx:1961` gains a rung **between**
the selection clear and the climb:

```ts
if (activePathRef.current !== null) { event.preventDefault(); leavePath(); return; }
```

The shell's header ladder (`viewer-shell.tsx:17-26`) is renumbered to five
rungs. Registration order gives immersive-last for free, as it already does.

**`FIT_PADDING` comments — rewritten, not appended.**

- `bottom: "80px"` — its justification currently names the **deleted hint
  pill**. Rewritten to name the player: the transient path control is
  bottom-center and its declared max height must fit inside this inset, a
  relationship `check:paths` pins (invariant 8).
- `top: "72px"` — currently names the **deleted level chips**. Rewritten to
  name the breadcrumb card and the strips that stack under it (the node
  palette when editable, the Paths pill when the diagram has paths).

**DECIDED — `FIT_PADDING.top` does not change.** The paths pill adds a row to
the top-left column, but the node palette already stacks there and the inset
was not raised for it; raising it now would re-fit every diagram in the
product, including ones with no paths. Follow the precedent; fix the comment.

**Camera.** `fitBeat` reuses `getViewportForBounds` over `beatBounds(...)` with
`FIT_PADDING`, `MIN_ZOOM`, and a max of `Math.min(MAX_ZOOM, 1)` — the design's
"never magnify past legibility". Animated with `duration("fitView")`, which is
0 under reduced motion, so the snap is free.

**Tests.** No unit test can reach a stylesheet; this stage is proved by
`check:paths` in Stage 9 and, in the interim, by hand: enter a path via a
temporary dev-only prop, confirm the three tiers, confirm hover does nothing,
confirm clicking a node takes over and Escape returns the path's light.

**Proof.** `pnpm typecheck && pnpm lint && pnpm test && pnpm check:viewer-motion
&& pnpm check:canvas-edit && pnpm check:canvas-chrome && pnpm check:themes`.

**Risk.** High. Four stylesheets now compose over the same `opacity`, and the
one that is easy to get wrong is the *suspended* state: a path active with a
node selected must produce the selection's dim and **no** path CSS, or the
0.3 and 0.55 rules fight and the diagram flickers exactly as the existing
comment predicts.

---

## Stage 6 — The resting pill and its menu

**Goal.** A diagram with paths shows one pill; choosing a path enters it. Still
no player — entering is proved by the light changing.

**Size: M.**

**Files created**

- `src/features/viewer/components/viewer-paths-pill.tsx`

**Files edited**

- `src/features/viewer/components/viewer-canvas.tsx` — mounted inside the
  existing `Panel position="top-left"` column (`:2893`), under
  `ViewerToolbar`, above the palette.
- `src/features/viewer/index.ts` — barrel export if the shell needs it.

**Shape.** `<button aria-haspopup="menu" aria-expanded={open}>` with accessible
name `Paths (3)`; lucide `Route` icon `size-4`; label `Paths` `text-sm`; count
badge in the breadcrumb's L-badge type (`font-mono text-[10px]
text-muted-foreground/70`). Card skin copied from the breadcrumb card's exact
class list. Menu rows: `Send email path · 2 beats`, accessible name
`Send email path, 2 beats`. While a path is active the pill collapses to
icon-only.

**Tokens only.** `--card`, `--border`, `--muted-foreground`, `--primary`,
`--ring`. Zero hex/`oklch`/`rgb` literals — `check:paths` invariant 5 and
`check:themes` both depend on it.

**Proof.** `pnpm typecheck && pnpm lint && pnpm check:canvas-chrome &&
pnpm check:themes && pnpm check:eink`, plus by hand: `notify.alab` with a path
shows the pill; without paths, nothing new appears anywhere.

**Risk.** Low-medium. The one thing to watch is the top-left column's
`flex-wrap` at narrow widths — the design says the pill wraps under the
breadcrumb, which the column already does.

---

## Stage 7 — The player, the keys, and Play

**Goal.** A path is walkable: caption, counter, dots, prev/next/play/close,
arrows and PageUp/PageDown, autoplay.

**Size: L.**

**Files created**

- `src/features/viewer/components/viewer-path-player.tsx`

**Files edited**

- `src/features/viewer/components/viewer-canvas.tsx` — a `Panel
  position="bottom-center"` mounting the player when a path is active.
- `src/features/viewer/lib/motion.ts` — `PATH_PLAY_BASE_MS = 3200`,
  `PATH_PLAY_MS_PER_CHAR = 45`, `PATH_PLAY_MAX_MS = 9000`, each with a doc
  comment stating the unit and the reading-pace argument.

**DECIDED — the step-key listener lives in the player file, not the canvas.**
`check:canvas-edit` asserts *exactly two* keydown listeners in
`viewer-canvas.tsx` and its failure message names the two. A third would fail
that check and force a knowing edit to an assertion that is protecting a real
rule. The player is only mounted while a path is active, so its listener is
scoped to exactly the state that wants the keys — which is better than a canvas
listener guarded by a null check.

**Key rules.** `→`/`PageDown` next, `←`/`PageUp` previous. Both stand down when
any selection is live (selection wins) and when focus is in a form field — the
same exemption the Escape ladder and the edit keys both make, quoted by
reference rather than re-argued. `→` on the last beat leaves the path.

**Player chrome.** Exactly the design's §5 spec. `role="group"`,
`aria-label="Path: Send email path"`; caption in an `aria-live="polite"` region
announcing `Beat 2 of 2: <caption>`; prev/next carry
`aria-keyshortcuts="ArrowLeft"`/`"ArrowRight"`; close is `Leave path (Escape)`.
Not a modal, not a focus trap — real `<button>`s in the tab order, the tour's
own recorded argument.

**Focus.** Entering moves focus to Next. Beat changes never move focus. Leaving
returns focus to the pill.

**Play.** Dwell = `min(PATH_PLAY_BASE_MS + PATH_PLAY_MS_PER_CHAR *
caption.length, PATH_PLAY_MAX_MS)`. Any manual step pauses. After the last
beat's dwell, leave the path. Under reduced motion Play still runs; only the
fades become cuts.

**Reduced motion.** Every animation-bearing class the player emits appears
under a `@media (prefers-reduced-motion: reduce)` block in the same scoped
stylesheet pattern the canvas uses. **No positive delay on an infinite
animation** — the shipped blink bug, and `check:paths` invariant 7.

**Narrow viewport (< 400 px).** Drop the title and the dots; keep caption
(clamped), counter, `‹ › ×`.

**Proof.** `pnpm typecheck && pnpm lint && pnpm test && pnpm check:canvas-edit
&& pnpm check:canvas-chrome && pnpm check:viewer-motion && pnpm check:themes`,
plus by hand at 375 px, in immersive, and with `prefers-reduced-motion` forced.

**Risk.** High-medium. The autoplay timer and the manual-step pause are the
classic stale-closure pair; the interval must be keyed off the beat index and
cleared on every state change, or a paused player resumes one beat later.

---

## Stage 8 — The `p=` deep link

**Goal.** `#…&p=send.2` opens the diagram already inside that path at that beat.

**Size: S.**

**Files edited**

- `src/features/viewer/share/codec.ts` — `SHARE_PARAM_PATH = "p"`; write it in
  `buildShareFragment` (`:195`) beside `SHARE_PARAM_DIAGRAM`; a
  `pathFromHash(hash): { pathId: string; beat: number } | null` beside
  `diagramIdFromHash` (`:419`); include it in the decode result.
- `src/features/playground/components/view-playground.tsx` — pass it into the
  canvas as the starting path, exactly as `d=` is passed as the starting
  diagram.
- `src/features/viewer/share/codec.test.ts` — new cases.
- `scripts/share-capacity-check.mjs` — the ceiling case.

**DECIDED — fragment, not query.** Unlike `?i=1`, `p=` names content inside the
model, needs no first-byte effect, and belongs beside `d=` which it depends on.
`immersive-param.ts`'s own comment gives the rule that decides this.

**Grammar.** `p=<pathId>` or `p=<pathId>.<beat>`, beat 1-based. An absent,
unknown, or out-of-range value means "no path" — never an error. A link that
names a deleted path must still open the diagram; the payload is the point, the
path is a request. Same contract `immersiveFromParam` states.

**Tests.** `codec.test.ts`: round-trip a fragment carrying `m`, `d` and `p`;
`p=send` yields beat 1; `p=send.2` yields beat 2; `p=send.0`, `p=send.x`,
`p=` and a repeated `p` all yield `null`; a fragment doubled by a forwarder
(`normalizeShareFragment`'s case) still reads `p`.

**Compatibility, asserted.** Every frozen fragment in
`share-capacity-check.mjs` decodes to its exact original text, unchanged — `p`
is additive and `decodeShareFragment` ignores parameters it does not read.

**Proof.** `pnpm test && pnpm check:share-capacity && pnpm check:share-parity
&& pnpm check:share-expiry && pnpm check:share-error-pages`.

**Risk.** Low. The only real hazard is minting: every minting site must keep
minting bare `/live`, which `check:share-capacity` already asserts and this
stage must not weaken.

---

## Stage 9 — `check:paths`, the MCP surface, and the skill

**Goal.** The new customisation surface ships with the `check:*` script
`purpose.md` requires, and an agent can learn the grammar and be told when its
path is bad.

**Size: L.**

**Files created**

- `scripts/paths-check.mjs`

**Files edited**

- `package.json` — `"check:paths": "node scripts/paths-check.mjs"`.
- `src/features/mcp/content/syntax-sections.ts` — a `paths` section id and
  builder, modelled on `frames` (`:225`); `SYNTAX_SECTION_IDS` gains it.
- `src/features/syntax-docs/content/snippets.ts` — the matching `/syntax` page
  section, so the page and the MCP reference say the same thing.
- `src/features/validate/lib/advisories.ts` — two new `AdvisoryRule`s.
- `skills/alab/SKILL.md` — regenerated by `pnpm build:skill`.
- `editors/vscode/syntaxes/alab.tmLanguage.json` — `path` and `beat` as
  `keyword.other`, and the chain line's `->` as an arrow operator.

**`check:paths` invariants, written in `viewer-motion-check.mjs`'s register**
(source-string following, relational assertions, real code through Node type
stripping; each assertion names the failure it prevents):

1. **Grammar fixtures.** A paths document parses to the expected model and
   round-trips byte-identically, including a `//` comment between two paths.
   Each ugly-case fixture fails, and the message contains the offending id.
2. **A pathless document is untouched.** parse → serialize of
   `notify.alab`-minus-paths is byte-identical.
3. **Tier reuse, relationally.** The number in `pathFocusCss`'s off-path node
   rule, read out of `viewer-canvas.tsx`, `===` the `DIM_NODE_OPACITY`
   declaration in the same file; the mid tier `===` `HOVER_DIM_NODE_OPACITY`
   and `HOVER_DIM_EDGE_OPACITY`. Both sides read from source, so tuning one
   fails the check instead of forking a fourth dim.
4. **Rank guard.** `hoverFocusCss`'s early-return condition contains the
   active-path state (string-follow over comment-stripped source).
5. **No new hue.** The pill, menu, player and overlay CSS contain no
   `#`/`oklch(`/`rgb(` literal.
6. **Escape ladder order.** The shell's header ladder text and the canvas's
   registration order both place the path rung between selection-clear and
   climb.
7. **Reduced motion.** Every animation-bearing class the player emits appears
   under a `reduce` block, and no infinite animation carries a positive delay.
8. **Chrome budget.** The player's declared max height ≤ `FIT_PADDING.bottom`,
   **and** the `FIT_PADDING.bottom` comment names the player and no longer
   names the hint pill.
9. **Share capacity.** A maximal `p=` param still mints against bare `/live`;
   the param's ceiling length is asserted.

**Read comment-stripped source** for every code assertion (the
`canvas-chrome-check.mjs:41` warning: a regex matches prose as readily as
syntax, and these comments quote the very selectors being asserted).

**MCP `validate_model` warnings.** Two advisories the parse cannot see:

- `path-revisits-element` — a beat whose chain names the same node twice.
- `path-teleports` — consecutive beats sharing no node, so the walk jumps with
  no visible connection.

Both go through `advise()` and `ADVISORY_RULES` with a `because` written in the
same register as the existing nine. Warnings, never errors: a teleporting path
may be exactly what an author means.

**Proof.** `pnpm check:paths && pnpm check:mcp && pnpm check:syntax-docs &&
pnpm check:advisories && pnpm check:vscode-grammar && pnpm build:skill &&
pnpm check:skill`.

**Formatting.** `pnpm exec prettier --write <the files you touched>` — **never**
bare `pnpm format`, which rewrites the generated `SKILL.md` and breaks
`check:skill`.

**Risk.** Medium-high. Invariant 3 is the one that will fight: reading a number
out of a template literal inside a `useMemo` requires the memo to emit
`${DIM_NODE_OPACITY}` rather than a spelled-out `0.3`, and the check must be
written against that *interpolation* — if the check is written against a
literal it will pass forever and prove nothing.

---

## Stage 10 — Changelog, the worked example, the PR

**Goal.** The feature is documented for someone deciding whether to upgrade,
and `notify.alab` demonstrates it.

**Size: S.**

**Files edited**

- `notify.alab` — two real paths on `@container cnt-notify`, the design's own
  `send` and `webhook` examples, using the real ids
  (`bitkub1-ref`, `kong-in`, `email-svc`, `rabbitmq`, `email-consumer`,
  `sendgrid-ref`, `cf-edge`, `kong-wh`, `email-webhook`, `slack-ref`, anchored
  with the real `~e-notify-slack`).
- `CHANGELOG.md` — under `## [Unreleased]` → `### Added`.

**Changelog entry (draft, one line per the rule, written for users):**

> **A diagram can carry an authored walk through itself.** `path <id> "Title"`
> at diagram level, with `beat "One sentence"` and the chains of elements each
> beat is about, adds a walk a reader steps through with `→`/`←` — or a
> presenter's clicker, which sends PageDown/PageUp. Off-path elements recede,
> the rest of the walk stays legible, and the current beat's connectors carry
> the moving light. A share link can name the path and the beat it opens on
> (`p=send.2`). Additive grammar on a beta surface: no existing document, link
> or route changes, and an older arch-lab refuses a `path` line with a parse
> error rather than misreading it.

Do **not** claim the older parser "names `path`" — see Compatibility.

**Proof.** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, then every
`check:*` this branch touched:
`check:paths`, `check:archtext`, `check:roundtrip`, `check:syntax-docs`,
`check:skill`, `check:share-capacity`, `check:share-parity`,
`check:canvas-edit`, `check:canvas-chrome`, `check:viewer-motion`,
`check:themes`, `check:eink`, `check:mcp`, `check:advisories`,
`check:vscode-grammar`, `check:validate-samples`, `check:flowchart`,
`check:usecase`.

Branch → PR → `main`. Never a direct commit.

**Risk.** Low, except that `notify.alab` is a fixture: confirm which check
scripts read it before editing, and re-run them.

---

## Compatibility

**Verdict: not breaking. Minor bump, `### Added`.**

**An older parser meets a `path` line.** `parseBodyLine` reads `path` as a bare
first token, finds no `:` and no known keyword, and falls through to
`parseEdgeLine`, which fails at the path id with:

> `expected an arrow (->, <->, --, ..>, <..>, ..) — or, for a node, the type must follow the id with no space (id:type)`

This is a loud refusal at the right line — never a silent deformation, which is
what the versioning rule actually protects. **But it does not name `path`**, as
the design asserts it does; it names the *arrow* it wanted. The refusal is by
location, not by name. The changelog wording above is adjusted accordingly. (A
beat's indent-6 chain line would in fact fail *first*, on indentation, if the
parser reached it.)

**A JSON file carrying `paths` read by an older serializer.** `paths` is not in
that build's `DIAGRAM_KEYS`, so `splitUnknowns` emits `!paths : […]` after
`edges` and the old parser reads it back into `unknowns` — preserved verbatim
and in position, exactly the forward tolerance `ArchLabFile`'s index signature
promises and `check:archtext` invariant 3 already proves.

**The one theoretical break, named.** Once `"paths"` is in `DIAGRAM_KEYS_SET`,
an `.alab` document that literally contains `!paths : […]` becomes a **parse
error**: `"paths" has dedicated syntax on the diagram line — it cannot be set
with a "!" line` (`parse.ts:1186`). Such a document can only be produced by an
older serializer from a JSON that already carried `paths`, which cannot exist
before this feature ships. It is unreachable today; it is written down here
because it is the exact shape of break `changelog.md` defines and a reader of
this plan should not have to rediscover it.

**Header version.** No bump, and the code agrees with the design.
`serialize.ts:169` emits `archlab ${version}` from the document and never
rewrites it; `parse.ts` refuses only `major > SUPPORTED_MAJOR_VERSION`
(`src/lib/constants.ts`). Nothing in this feature touches either.

**Share links.** Every existing link still opens. `p` is an additive fragment
parameter; `decodeShareFragment` reads `m` and `d` by name and ignores the
rest. The frozen fixtures in `share-capacity-check.mjs` are the proof, and
Stage 8 does not touch them. Minting stays bare `/live`.

---

## Blast radius

`get_impact_radius_tool` over the four seed files reports 306 additional files
at two hops, which is the barrel graph rather than the real coupling. What
follows is the coupling that matters, each with a verdict.

**Needs a change:**

| Surface | File | Why |
| --- | --- | --- |
| `.alab` parser | `archtext/lib/parse.ts` | the grammar |
| `.alab` serializer | `archtext/lib/serialize.ts` | emission |
| Schema key tables | `archtext/lib/schema.ts` | `DIAGRAM_KEYS` |
| JSON writer | `editor/io/serialize.ts` | key order + three new specs; **not** `sortById` |
| JSON validator | `editor/io/validate.ts` | accept `paths` |
| Model types | `types/c4.ts` | `C4Path`/`C4Beat`/`C4Chain` |
| Viewer canvas | `viewer/components/viewer-canvas.tsx` | tiers, ladder, panels |
| Viewer chrome | `viewer/lib/canvas-constants.ts` | two stale comments |
| Share codec | `viewer/share/codec.ts` | `p=` |
| MCP syntax | `mcp/content/syntax-sections.ts` | grammar section |
| `/syntax` page | `syntax-docs/content/snippets.ts` | grammar section **+ the pinned indentation error string** |
| Advisories | `validate/lib/advisories.ts` | two warnings |
| VS Code grammar | `editors/vscode/syntaxes/alab.tmLanguage.json` | two keywords |
| Skill | `skills/alab/SKILL.md` | regenerated |

**Provably unaffected, and why:**

- **The other eight notations.** Sequence, flowchart, use-case, ER, dictionary,
  gantt, timeline and lifecycle each have their own
  `parse.ts`/`serialize.ts`/`schema.ts` under `archtext/lib/<kind>/` and never
  import the C4 ones. The single shared thing they touch is the indentation
  gate — which is why `check:flowchart` and `check:usecase` are in Stage 2's
  proving command (they match on the indentation message *as a substring*, so
  they survive; `check:syntax-docs` pins it *verbatim*, so it does not).
- **SVG/PNG export.** `viewer/export/render-svg.ts` and `export/frames.ts`
  render from the model's nodes, edges and frames. `paths` is a new optional
  field they never read; a path is a *reading* of a diagram, not part of it, so
  an export deliberately shows the diagram at full strength. No change.
- **Mermaid conversion.** `mermaid/lib/emit.ts` walks nodes and edges;
  `mermaid/lib/toModel.ts` builds them. Mermaid C4 has no equivalent concept,
  so a path is dropped on the way out and never invented on the way in. Lossy
  by design and worth one sentence in the `paths` syntax section.
- **MCP formatters.** `mcp/tools/describe.ts` and `mcp/lib/render.ts` report
  counts and a diagram table. Adding paths to the summary is optional polish,
  **not** planned for v1 — a formatter that grows a column nobody asked for is
  an invented variant.
- **Canvas editing.** `CANVAS_EDIT_OFFERS` is untouched. Paths are not an
  element the four abilities address, so no refusal cell is owed and
  `canvas-editing.md` needs no edit. `playground/input/canvas-edit.ts` patches
  node, edge, frame and diagram-head lines by span; it never sees a path line
  and `parseArchTextWithSpans` records no path spans in v1.
- **The editor store.** `editor/state/model.ts` and `store.ts` pass diagrams
  through structurally; an unread optional field survives.
- **`check:shortcuts`.** Scans `src/features/editor` only.

---

## Effort summary

| Stage | Size |
| --- | --- |
| 1 Types, validator, glossary, `aria-label` | S |
| 2 Grammar: parse | **L** |
| 3 Grammar: serialize + round-trip | M |
| 4 `viewer/lib/paths.ts` | M |
| 5 Viewer state + three-tier dim | **L** |
| 6 Pill + menu | M |
| 7 Player + keys + Play | L |
| 8 Deep link `p=` | S |
| 9 `check:paths` + MCP + skill | L |
| 10 Changelog + `notify.alab` + PR | S |

**Most likely to overrun: Stage 2 and Stage 5.** Stage 2 because the indent-6
extension rewrites the one loop every C4 document goes through and touches a
verbatim-pinned error string in a file nobody would think to open. Stage 5
because four stylesheets now compose over one `opacity` property, and the
suspended state (path active, node selected) is a combination no existing code
has ever had to produce.

---

## Concerns

The design's `~id` anchor gives the `~` sigil a second job in neighbouring
grammar, and `dry.md`'s "one name per concept" is the rule the design itself
invokes three paragraphs earlier to delete `via` from beats. On an edge line
`~e-notify-slack` means *this relationship realizes that parent relationship* —
a traceability claim about the model. On a beat chain it means *this hop is
that relationship* — a disambiguation about the drawing. The design papers this
over by saying `~` reads "the edge whose id is", which is true of both but is
not what either line means; the two readings are a claim and a selection, and
an author who has internalised `~realizes` will read `email-webhook ->
slack-ref ~e-notify-slack` as asserting a realization. That said: the collision
is narrower than `via`'s was (the two forms never appear on the same kind of
line, and the parser can tell them apart with no lookahead), the alternative
sigils are worse (`#` is tags, `@` is icons, `=` is attributes), and the error
text catches the misunderstanding the first time an author writes an anchor
that does not join its hop.

A second and smaller worry: the design's claim that an older parser "fails with
its existing unknown-word error naming `path`". It does not; it fails with
`parseEdgeLine`'s arrow error pointing at the path id, which is still a loud
refusal at the right line but is not a refusal by name, and the changelog
sentence the design specifies would therefore be a promise the code does not
keep. The changelog wording in Stage 10 is adjusted; both points are otherwise
planned exactly as designed.
