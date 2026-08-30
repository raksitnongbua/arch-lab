# Two-way Mermaid for `gantt`

Branch: `feat/gantt-mermaid`. Decision already taken upstream: gantt is new,
has no users, and its grammar/model/layout may change; it becomes two-way
(import AND emit) like timeline, ER, C4, sequence, flowchart and use case.
This document decides HOW. No source code changes accompany it.

The two arguments the codebase currently makes for import-only —
`src/types/gantt.ts` (`GanttItemState` doc), `src/features/mermaid/lib/gantt-mapping.ts`
(file header) and their many echoes — are to be REWRITTEN, not deleted. The
replacement arguments are in §1, §2 and §6 below, and every file that carries
an echo is listed in §6.

---

## 1. Design call: `at-risk`

**Chosen: `at-risk` ⇄ Mermaid `crit`, both directions.**

The state table becomes a bijection over the closed vocabulary:

| arch-lab state | Mermaid tag | direction |
| -------------- | ----------- | --------- |
| `planned` (absent) | no tag | both, absence ⇄ absence |
| `active` | `active` | both |
| `done` | `done` | both |
| `at-risk` | `crit` | both |

The insight that makes this honest rather than a pun: **Mermaid's `crit` is a
hand-typed decoration, and arch-lab already has a hand-typed alarm — it is
called `at-risk`.** The thing arch-lab refuses to let an author type is the
*computed* critical path, and that refusal survives untouched (§2): the float
pass still owns criticality, and neither language ever serializes it. What
`crit` carries across the boundary is the author's own claim "this bar is in
trouble / must not slip", which is exactly the register of `at-risk`. Red in
Mermaid, amber here; both louder than `active`, neither silent.

Combination rules on import (Mermaid lets tags stack; arch-lab has ONE state
field):

- bare `crit` → `at-risk`.
- `crit, active` → `at-risk`. Not a refusal: `at-risk` already MEANS "in
  flight and in trouble", so `active` adds nothing rather than contradicting.
- `crit, done` → `done`, and `MERMAID_GANTT_CAVEAT` names the drop: a
  finished task is no longer at risk, so the alarm is stale and the fact
  (finished) outranks the status of work that no longer exists. Refusing was
  considered and rejected — `crit, done` is common real Mermaid ("the risky
  bit, now landed"), and there is a principled winner, unlike `done, active`
  which stays refused because neither word outranks the other.
- `done, active` → refused, unchanged.

Emit writes exactly one tag per state (at-risk → `crit`, never `crit, active`),
so `serializeMermaidGantt(parseMermaidGantt(emitted))` is byte-stable even
though `parse(emit(...))` of hand-written `crit, active` is not — Mermaid text
was never promised byte-stability anywhere in this repo (§4).

**Rejected options and why:**

- *Downgrade to `active`.* The dishonesty `types/gantt.ts` names. Off the
  table by the brief and by the argument that put it in the file.
- *Emit an invented tag Mermaid ignores.* Not actually available: Mermaid
  (and our importer, which follows Mermaid's `getTaskTags`) strips only
  KNOWN tags — an unknown token in the comma list becomes a positional
  field and corrupts the one/two/three-field count. There is no inert slot.
- *Carry it in a `%%` comment.* Round-trips through our own importer, but the
  Mermaid rendering still paints the bar `active`-blue with the alarm hidden
  in a comment a hand-editor deletes first. `crit` puts the alarm IN the
  picture, which is where a status belongs in a product whose product is the
  picture.
- *Drop `at-risk` from the model and let `crit` mean it.* Renaming, not
  simplifying: the amber state, its `--flow-decision` fill and its wording
  ("in flight and in trouble") are already the right in-product spelling.
  Renaming the model value to Mermaid's word would let Mermaid name an
  arch-lab concept, which is backwards — Mermaid is a dialect here, not the
  model.

**Cost, stated:** an exported chart shows at-risk bars in Mermaid's `crit`
red styling with Mermaid's word for it; a Mermaid author's `crit, done` loses
its `crit` on the way in (named in the caveat); and Mermaid's docs gloss
`crit` as "critical", so a reader of the raw Mermaid text sees a near-synonym
rather than the word `at-risk`. All three are visible approximations; none is
a silent downgrade.

## 2. Design call: `crit` / the critical path

**Chosen: the principle "the critical path is COMPUTED, never declared"
stands. No authored `crit` enters the grammar or the model, and the emitter
never writes the float pass's result out as `crit`.** The principle is not
overturned — it is *narrowed and re-argued*, because as written it was doing
two jobs and only one of them was really about the critical path:

1. *Criticality is arithmetic.* Kept in full. `crit` the keyword does not
   join `.alab`; `GanttItem` gains no field; `LaidGanttItem.critical` remains
   the only place the word is decided. A declared path can disagree with the
   arithmetic, and when it does the picture is wrong — nothing in this design
   touches that.
2. *Therefore Mermaid's `crit` is unrepresentable.* This half is REWRITTEN.
   It conflated Mermaid's tag with Mermaid's semantics: the tag is a
   hand-typed decoration, and arch-lab has a hand-typed decoration of the
   same register (`at-risk`, §1). Read as a state, `crit` maps cleanly; read
   as a path claim, it was never going to be honoured by anyone. The import
   stops dropping it and starts keeping what the author actually said.

**Rejected options:**

- *Authored `crit` on `GanttItem`.* Two sources of truth for one red line;
  the exact failure `types/gantt.ts` §4 documents. Also redundant once
  `at-risk` claims the tag.
- *Emit the computed path as `crit`.* Three independent reasons, any one
  sufficient: (a) the emitter would stop being a pure model→text function —
  it would import `layoutGantt`, and the mermaid feature would grow a
  dependency on the gantt feature's scheduling internals for a decoration;
  (b) it writes a derived truth as an authored claim, which goes stale the
  first time anyone edits a duration in the Mermaid file — precisely the
  falsifiable-restatement the current comments warn about, and here they are
  right; (c) it collides with §1 — one tag cannot carry both the state and
  the arithmetic, and the state is the one an author can round-trip.
- *Emit both (state tags plus computed `crit`).* Mermaid tags stack, so it is
  expressible — but `crit` would then mean "at-risk OR computed-critical" and
  the re-import could not tell which, so the round trip breaks on exactly the
  field this design exists to preserve.

**Cost, stated:** a reader of the exported Mermaid never sees arch-lab's
computed critical path — Mermaid has no slot for a derived path, and we do
not fake one. The export caveat says so and points at where the number lives:
`validate_gantt` (which already renders the chain) and the canvas. This is
the same shape of loss as timeline dropping `desc`: metadata *about* the
plan the target language cannot hold, never a claim the plan makes changed
in transit.

---

## 3. Mermaid `gantt` feature table

"Supported" = imports today and will emit. "Add" = new work in this design.
"Refuse" = refused by name, with the reason the error carries — every refusal
below survives this design because its argument never depended on
import-only-ness.

| Mermaid feature | Verdict | Notes |
| --- | --- | --- |
| `gantt` header word | supported | Detection exact, unchanged. Emit writes it. |
| `title` (in-body) | supported | Emit writes the in-body `title` line — gantt has a native title statement, and the importer already prefers it over frontmatter. (Timeline emits frontmatter because that is the flowchart-family convention; gantt follows its own dialect's convention, as C4 does.) `options.title?: boolean` mirrors the other emitters. |
| frontmatter `title` | supported (import) | Read today; emit never writes frontmatter (above). Other frontmatter keys stay dropped. |
| `dateFormat` | supported, `YYYY-MM-DD` only | Others refused, unchanged — dayjs's token language is a dependency's worth of guessing. Emit ALWAYS writes `dateFormat YYYY-MM-DD` (Mermaid needs it to read the dates we emit). |
| `section` | supported | Required before any task (unchanged); duplicates refused (unchanged). Emit writes each `GanttSection`. |
| task id (`id, start, len`) | supported | Emit always writes the three-field form — the id is what `after` names, so an emitted chart is fully referenceable. Ids colliding with a task TAG (`done`, `active`, `crit`, `milestone`) are renamed on emit (`t_` prefix) with `after` references following, because Mermaid strips tags from ANY metadata position and would eat the id (§4). |
| `after x y` | supported | Both directions. Multi-target preserved, order preserved. |
| implicit "starts when previous ends" | supported (import) | Imports as explicit `after` (unchanged). Emit never writes the implicit form — explicit survives reordering. |
| start date | supported | Import: date → `at` offset (unchanged). Emit: `at` (or the implicit day-0 start) → `ganttDateAt(file, at)`. |
| end date instead of duration | supported (import) | Becomes a duration (unchanged). Emit always writes a duration. |
| `milestone` | supported | Emit writes `milestone` tag + `0d` (Mermaid's own convention; the importer already accepts `0d` on a milestone). |
| durations `d`, `w` | supported | `w` = 7 calendar days on import (unchanged). Emit always writes days (`14d`, never `2w`): one canonical spelling keeps second-generation emit byte-stable. |
| durations `h`, `m` (minutes), `s`, `ms` | refuse | Sub-day; rounding is wrong in both directions (unchanged argument in `REFUSED_GANTT_DURATION_UNITS`). |
| durations `M` (month), `y` (year) | refuse | Not a fixed count of calendar days (28–31; 365/366) — converting would invent a number the author never wrote. Today these fall through to the generic "not a duration unit" error; they stay refused, and the error already names `5d` / `2w` as the way out. |
| `until <id>` | refuse | Unchanged: an arch-lab item has a length, not an end tied to another row; resolving it writes a number the next edit to the OTHER task silently falsifies. |
| `crit` | **add (was: dropped)** | Imports as `at-risk` (§1); `crit, done` → `done`, named in the caveat. Emitted for `at-risk`. |
| `active`, `done` | supported | Unchanged both ways. |
| `excludes` / `includes` / `weekend` / `weekdays` | refuse | Unchanged, and the argument is the model's, not the converter's: an arch-lab duration is a count of CALENDAR days. Honouring a working week makes `5d` draw seven days wide; it is a scheduling engine, not a diagram feature. Taking Mermaid as the expressiveness baseline does not oblige arch-lab to adopt a semantics its one scaled axis was designed to refuse — the refusal names the construct and the reason, which is what `new-diagram-type.md` requires. |
| `weekday <day>` (tick-start helper) | refuse (**add the spelling**) | The singular `weekday` keyword is not in today's refusal table (`weekend`/`weekdays` are); it joins the axis-granularity family with the tickInterval reason. |
| `todayMarker` | refuse | Unchanged: a "now" line makes a shared link rot visibly (`purpose.md`). |
| `axisFormat` / `tickInterval` | refuse | Unchanged: axis granularity is derived from the span; an author-set value is a second source of truth that loses. |
| `inclusiveEndDates` | refuse | Unchanged: it moves what every end date means; there is no honest middle. |
| `displayMode` / `topAxis` / `click` | drop (import) | Unchanged: layout and interactivity, owned on arch-lab's own terms. Never emitted. |
| `accTitle` / `accDescr` | **add to dropped** | Today these hit the task-line reader and fail with a misleading ":" error. Timeline drops them as page metadata; gantt joins it. One line in `DROPPED_GANTT_KEYWORDS` — note they take a colon (`accTitle: X`), so the dispatch needs the same tolerance the timeline importer has. |
| `%%` comments | supported (import) | Skipped, unchanged. Emit writes none. |

What Mermaid CANNOT hold, dropped on emit and named by the new
`MERMAID_GANTT_EXPORT_CAVEAT`: an item's `description`, its `#tag`s, the
`.alab` header beyond the title (owner, timestamps), and the computed critical
path / float (§2). Same shape of loss as `MERMAID_TIMELINE_EXPORT_CAVEAT` —
metadata around the plan, never a date, a length, a dependency or a state.

---

## 4. The round-trip contract

Learned from `timeline.test.ts` + `mermaid-check.mjs` §timeline and C4 §4:
byte-identity is promised for `.alab` (check:gantt, untouched) and for
*second-generation Mermaid*; cross-language trips promise MODEL equality up
to named normalisations. Gantt's contract, precisely:

1. **`.alab` round trip — unchanged.** `parse(serialize(file))` lossless,
   `serialize(parse(text))` byte-identical for canonical text. The grammar
   gains nothing and loses nothing in this design, so `check:gantt` does not
   move.
2. **Mermaid → model → Mermaid:**
   `serializeMermaidGantt(parseMermaidGantt(src))` is valid Mermaid, and
   `serializeMermaidGantt(parseMermaidGantt(emitted)) === emitted`
   byte-identical (the C4 second-generation rule). First-generation
   byte-identity is NOT promised: `2w` canonicalises to `14d`, tags reorder
   into canonical position, `crit, active` collapses to `crit`, end-dates
   become durations, implicit starts become explicit `after`.
3. **Model → Mermaid → model:** for a file WITH an origin,
   `parseMermaidGantt(serializeMermaidGantt(file))` equals `file` after
   exactly these named normalisations, and no others:
   - `description` and `tags` are absent on the way back (Mermaid has no
     slot; export caveat names them).
   - an item with neither `at` nor `after` (which the layout schedules at
     day 0) comes back with `at: 0` — the emit must write SOME start, day 0's
     date is the honest one, and the explicit spelling is the same
     normalisation the importer already applies to Mermaid's implicit
     previous-row start.
   - an item id equal to a Mermaid task tag (`done`, `active`, `crit`,
     `milestone`) comes back renamed (`t_done`, …), with every `after`
     reference following. Without the rename the importer — following
     Mermaid's own position-free tag stripping — would eat the id field.
   - `state: "planned"` comes back as absence (the model-level
     normalisation `STATE_IS_DEFAULT` already defines).
   - labels are equal up to the separator substitution below.
4. **The origin-less document: emit REFUSES, by name.** A `GanttLabFile`
   with no `origin` has an axis reading "W1, W2, W3" and Mermaid `gantt` has
   no relative axis — every chart anchors to a real date through
   `dateFormat`. No date is invented. `serializeMermaidGantt` throws a plain
   `Error` (the `serializeMermaidC4` unknown-diagram precedent):
   *"this plan has no `starts` line, so day 0 falls on no date and Mermaid
   `gantt` cannot draw a relative axis — add `starts YYYY-MM-DD` to the
   `.alab` header, or keep `.alab`, which draws W1, W2, W3."*
   Every surface converts the refusal into UI: the share menu's Mermaid row
   and the playground's format toggle are DISABLED for an origin-less gantt
   with that sentence as the title (the exact mechanism the toggle uses today
   for the whole kind). So gantt is two-way for calendar plans and
   refuses-by-name for relative ones — a partial emit stated everywhere it
   can surprise, which is more honest than either a fake date or staying
   one-way for all documents because some cannot travel.
5. **Label substitutions (the timeline trade: visible beats silent).**
   - `:` in an item label splits the row at the first colon, and the dialect
     has no escape → substituted ` - `, via a helper shared with
     `timeline-emit.ts` (§5, DRY).
   - a label whose first word is exactly a gantt statement keyword
     (`section`, `title`, `dateFormat`, or any dropped/refused keyword)
     would re-parse as a statement → emitted with a leading `- `
     (`- section review`), the timeline `EMPTIED_CELL` move: a visible
     placeholder, named in the export caveat, pinned by a test.
   - newlines ⇄ `<br/>` via the existing `text.ts` codec, exact both ways.
   - section labels run to end-of-line in Mermaid and need neither.

---

## 5. File plan

Every file created or edited. Functions and types named. `pnpm` only; gate is
`pnpm typecheck && pnpm lint && pnpm test && pnpm build` + the touched
`check:*` scripts; the 3 known `check:canvas-grid` failures are out of scope.

**Created:**

- `src/features/mermaid/lib/gantt-emit.ts` — the missing third of the trio.
  - `serializeMermaidGantt(file: GanttLabFile, options?: SerializeMermaidGanttOptions): string`
    (`options.title?: boolean`, default true, matching siblings). Pure,
    deterministic, iteration in model order. Throws on `origin === undefined`
    (§4.4).
  - `MERMAID_GANTT_EXPORT_CAVEAT` re-exported from the mapping module.
  - Private: `taskLine(item, file)`, `startField(item, file)` (date via
    `ganttDateAt`, or `after a b`), `emitSafeTaskId(id, used)` (the tag-collision
    rename, §4.3). File header carries the §1/§2 arguments in the register of
    `timeline-emit.ts`'s header, including why the computed path is not
    written.

**Edited:**

- `src/features/mermaid/lib/gantt-mapping.ts`
  - Header REWRITTEN: no longer "the first mapping module with only one
    reader" — it becomes what its siblings are, one table shared by both
    directions so they cannot disagree. The import-only essay is replaced by
    the §1 mapping argument and a pointer to §2's kept principle.
  - `GANTT_STATE_BY_TAG` gains `crit: "at-risk"`; its comment rewritten (the
    "gap is the point" paragraph goes — there is no gap now).
  - New derived inverse `GANTT_TAG_BY_STATE: Readonly<Record<Exclude<GanttItemState, "planned">, string>>`
    built FROM `GANTT_STATE_BY_TAG` (dry.md: one direction derives from the
    other, so import and emit cannot drift).
  - `GANTT_CRIT_TAG` and its "read and dropped" essay DELETED — the tag now
    lives in the state table like its peers. (`GANTT_TASK_TAGS` is already
    derived from the state table + milestone, so it needs no edit.)
  - `REFUSED_GANTT_KEYWORDS` gains `weekday`; `DROPPED_GANTT_KEYWORDS` gains
    `accTitle`/`accDescr` handling (see table); `MERMAID_GANTT_CAVEAT`
    rewritten (no "one-way", no "never writes back"; names `crit` → `at-risk`
    and the `crit, done` drop); new `MERMAID_GANTT_EXPORT_CAVEAT` (names
    `description`, `#tag`s, header-beyond-title, the computed path, the
    label substitutions, and the origin-less refusal).
- `src/features/mermaid/lib/gantt.ts`
  - Header REWRITTEN: "IMPORT ONLY … must not grow one" becomes the two-way
    statement, mirroring `timeline.ts`'s.
  - `tags.delete(GANTT_CRIT_TAG)` and its comment removed; `readState`
    handles the combinations of §1 (`crit`+`active` → `at-risk`,
    `crit`+`done` → `done`, `done`+`active` still refused).
  - `accTitle`/`accDescr` tolerated per the table.
- `src/features/mermaid/lib/text.ts` — extract the separator-substitution
  from `timeline-emit.ts`'s `cellText` into a shared
  `mermaidSeparatorFreeLabel(text, separator, emptied)` (dry.md: grep-the-body
  rule — gantt would otherwise be the second copy); `timeline-emit.ts`
  re-imports it, behaviour identical, `timeline.test.ts` proves it.
- `src/features/mermaid/lib/gantt.test.ts` — a `serializeMermaidGantt`
  describe block in the shape of `timeline.test.ts`'s: round trip
  (§4.2/§4.3), origin-less throw naming `starts`, `at-risk` ⇄ `crit`,
  `crit, done` → `done`, milestone `0d`, `2w` → `14d` canonicalisation, the
  tag-collision id rename with `after` following, colon and
  keyword-leading-label substitution, determinism, `{ title: false }`.
- `src/features/mermaid/index.ts` — export `serializeMermaidGantt`,
  `MERMAID_GANTT_EXPORT_CAVEAT`.
- `src/types/gantt.ts` — rewrite the `GanttItemState` doc ("half the reason
  the converter is import-only" paragraph → the §1 mapping) and structural
  rule 4 (keep "computed, never declared"; add "and never serialized —
  Mermaid's `crit` travels as the authored state `at-risk`, never as this
  arithmetic", §2). No type changes.
- `src/features/archtext/lib/gantt/keywords.ts` — rewrite the closing
  sentence of "WHY THERE IS NO `crit` KEYWORD" (the importer no longer
  "drops" crit; it maps it). Grammar unchanged — no new keyword, no
  serializer change, `check:gantt` untouched.
- `src/features/gantt/input/parse.ts` — header's "TWO READS, ONE WRITE"
  paragraph rewritten to two-and-two with the origin-less carve-out;
  re-export `MERMAID_GANTT_EXPORT_CAVEAT` for the share menu.
- `src/features/gantt/share/share-button.tsx` — a Mermaid row mirroring
  `timeline/share/share-button.tsx` (caveat stated at the moment of copy),
  disabled with the `starts` sentence when `file.origin === undefined`;
  header comment rewritten.
- `src/features/playground/components/view-playground.tsx` — the gantt
  branches at the format toggle (~524–547), the serializer switch (~593–604)
  and the toggle-disable (~1372–1402) become the timeline shape, with the
  disable condition narrowed from "kind is gantt" to "gantt with no origin"
  and the title naming `starts`; the three explanatory comments rewritten.
- `src/features/playground/input/parse.ts` — import `serializeMermaidGantt`;
  comment updates.
- `src/features/mcp/tools/gantt.ts` — header's "TWO READS, ONE WRITE" essay
  rewritten; the two `MERMAID_GANTT_CAVEAT`-on-success notes stay (the import
  still normalises and drops; only the "cannot be undone" clause goes).
  **No new MCP tool and no `to:` argument**: the timeline precedent is that
  Mermaid emit is a client surface (share menu, format toggle) — `convert_model`
  is C4-only for every kind, and `format_<kind>` canonicalises to `.alab` for
  every kind. Gantt gets parity with timeline, not a new MCP capability class;
  extending Mermaid-out to MCP would be a nine-kind decision taken elsewhere.
- `src/features/mcp/catalog.ts` — `GANTT_SOURCE_ARG` ("one-way and lossy, and
  arch-lab never writes `gantt` back" → the two-way sentence + origin
  carve-out); `validate_gantt` / `format_gantt` descriptions; the TIMELINE
  argument's "Unlike `gantt`, this conversion is TWO-WAY" contrast (now
  false) and line ~581's "unlike `gantt` next door"; the gantt section blurb
  (~952, "comes in here and never goes back out"). Then `pnpm build:skill` +
  `pnpm check:skill` (never bare `pnpm format`).
- `src/features/timeline/share/share-button.tsx`,
  `src/features/mermaid/lib/timeline-emit.ts`,
  `src/features/mermaid/lib/timeline-mapping.ts` — each carries a
  "why we emit and the gantt does not" paragraph that becomes false. Rewritten
  to the surviving true contrast: the timeline emits unconditionally; the
  gantt emits calendar plans and refuses relative ones by name.
- `scripts/mermaid-check.mjs` — §6 below. Header item 9 rewritten too.
- `CHANGELOG.md` — §7.

**Not touched:** `src/features/archtext/lib/gantt/{parse,serialize,schema}.ts`
(grammar unchanged), `src/features/gantt/lib/layout.ts` (criticality stays
its), `scripts/gantt-check.mjs` (pins the `.alab` round trip, which does not
move — verify with a run, and grep it for "one-way" prose before assuming).

## 6. What `check:mermaid` must assert instead of "gantt is one-way"

Section 9 of `scripts/mermaid-check.mjs` inverts, into the mirror of the
timeline section (its assertion 1 already says "deleting the emitter is as
silent a change as adding one to the gantt" — that sentence flips sides):

1. **The emit path EXISTS and is reachable**: `gantt-emit.ts` on disk,
   `serializeMermaidGantt` a function on the feature barrel. (Replaces
   today's assertions that the file does not exist and no `serialize*|emit*`
   export matches `/gantt/i`.)
2. **Import → emit → import model equality** on a sample exercising every
   state (including `crit`), `after` multi-targets, `at`, an implicit
   previous-row start, a `2w` duration, an end-date row and a milestone.
3. **Second-generation byte-identity**:
   `serializeMermaidGantt(parseMermaidGantt(emitted)) === emitted` (the C4
   §4 rule).
4. **`.alab` → emit → import** equals the original model up to the §4.3
   normalisations, exercised deliberately: a `desc`/`#tag` item comes back
   without them; an item with no `at`/`after` comes back `at: 0`; an item id
   `done` comes back renamed with its dependents' `after` following.
5. **The origin-less refusal**: emitting a no-`starts` model throws, and the
   message names `starts` — the same walked-refusal discipline the keyword
   table gets.
6. **`at-risk` survives the round trip as `at-risk`** — pinned BY NAME,
   because it was the headline reason for one-way and is now the headline
   claim of two-way; and `crit, done` imports as `done` with the caveat
   naming the drop (replaces today's "`crit` leaves no trace" assertion).
7. **Caveats tell the truth**: `MERMAID_GANTT_CAVEAT` no longer matches
   `/one-way/i` and does name the `crit`→`at-risk` mapping;
   `MERMAID_GANTT_EXPORT_CAVEAT` names `desc`, `tag`, the critical path and
   `starts`.
8. **Unchanged and kept**: the refusal-table walk (now including `weekday`),
   the dropped-keyword walk (now including `accTitle`/`accDescr`), the
   dateFormat/until/sub-day/impossible-date failures, the join with
   `check:gantt` (imported chart → `serializeGanttText` → byte-stable), and
   the whole detection mutual-exclusion block in both directions.
9. The timeline section's contrast prose ("the gantt's neighbour and its
   opposite") is rewritten alongside.

No new `check:*` script is needed: gantt's Mermaid behaviour lives where
every other dialect's does (`check:mermaid` + the vitest unit layer), and
`check:gantt` continues to own the `.alab` bytes. The share-menu/toggle
disable state is component logic of the kind the check suite does not reach
for the other kinds either; its pure predicate (`file.origin === undefined`)
is trivially pinned by the unit test on the emitter's throw.

## 7. Versioning and changelog

Against `.claude/rules/changelog.md`'s breaking tests:

- The `.alab` grammar accepts and emits exactly what it did — **no break**.
- No share key, route or minting site moves — **no break**.
- MCP tool names/arguments unchanged; descriptions rewritten (beta surface,
  and additive in behaviour) — **no break**.
- Mermaid IMPORT behaviour changes: `crit` now imports as `at-risk` (was:
  dropped), `crit, done` as `done`, `accTitle`/`accDescr` now drop (was: a
  confusing error). Documents that parsed still parse; one that used to
  error now parses. Observable, so it EARNS ENTRIES, but it invalidates
  nothing on disk — gantt `.alab` files are untouched and Mermaid text is an
  input format, not a stored one.

**Minor bump.** Entries (reader-side wording, not commit subjects):

- *Added* — Gantt charts now convert TO Mermaid as well as from it: Copy as
  Mermaid in the share menu, the playground's format toggle, and
  `serializeMermaidGantt`. A plan with no `starts` date is refused by name
  (Mermaid has no relative axis) rather than given an invented date.
- *Changed* — Mermaid's `crit` tag now imports as the `at-risk` state (and
  `at-risk` exports as `crit`) instead of being dropped; `crit` on a `done`
  task is dropped with a note, since a finished task is no longer at risk.

---

## Order of work (for the implementing branch)

mapping tables → importer's `readState`/crit changes → emitter + unit tests →
barrel → `mermaid-check.mjs` §9 → UI surfaces (share menu, playground toggle)
→ MCP catalog + `build:skill` → the comment rewrites of §5 (every file listed)
→ changelog. Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build`,
then `pnpm check:mermaid`, `check:gantt`, `check:timeline`, `check:mcp`,
`check:skill`, `check:view-input` (the playground reader is loaded by
`scripts/view-input-check.mjs`). Nothing runs these for you.
