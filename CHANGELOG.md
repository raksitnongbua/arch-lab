# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **A third bundled gantt, an agile sprint** — `/live/gantt/search-sprint`, and
  on the examples index. The two plans already bundled are migrations, where the
  work sets the length; a sprint fixes the length first, so its ceremonies sit on
  a cadence instead of falling out of a dependency, three of its stories run side
  by side out of planning, and the only chain with no float is the story blocked on
  another team that finishes four days after the review. Deleting its `starts`
  line turns it into a reusable sprint template on a relative axis.
- **Gantt charts now convert to Mermaid as well as from it.** The playground's
  format toggle rewrites a plan as Mermaid `gantt`, and a pane holding Mermaid
  downloads under a `.mmd` name. One plan cannot make the trip and says so
  instead of guessing: a chart with no `starts` date has no calendar to anchor
  to, Mermaid's gantt axis is always a calendar, and the toggle is disabled with
  that sentence rather than inventing a date. What no export carries is the
  computed critical path — Mermaid has nowhere to record a derived chain, and a
  hand-typed `crit` tag would read as a claim rather than as the arithmetic.

### Changed

- **On the `blueprint` theme, timelines, gantt charts and lifecycles now sit on
  a faint wash of the sheet's own ruling colour**, so the document separates
  from the drafting grid instead of dissolving into it — that theme frames the
  diagram area in a border deliberately quieter than its ruling, which left the
  frame unable to say where the drawing lived. Exported SVG, PNG and GIF carry
  the same wash. The other eight themes are unchanged, and their exported files
  are byte-for-byte what they were.

- **Mermaid's `crit` tag now imports as the `at-risk` state**, and `at-risk`
  exports as `crit`. Previously `crit` was read and thrown away. Both spellings
  are an author saying a bar is in trouble, so a chart that arrives marked up
  keeps its markings. `crit` on a task already marked `done` keeps the `done`
  and drops the `crit`, since a finished task is no longer at risk.
- **A Mermaid gantt carrying `accTitle` or `accDescr` now imports.** Those lines
  previously stopped the import with an error about a task row that was never
  written; they are dropped as page metadata, as they already were for
  timelines. Mermaid's `weekday` setting is now refused by name alongside
  `axisFormat` and `tickInterval`, rather than falling through to a vaguer
  error.
- **The playground's "what conversion drops" note told ER, gantt and timeline
  authors what a use-case export drops.** Every notation added after the use
  case inherited the wrong two paragraphs. Each kind now states its own.

### Fixed

- **The playground offered to convert a lifecycle to Mermaid, and the button
  did nothing.** Pressing it left the text unchanged and the toggle snapped
  back, while screen readers were told the conversion had succeeded. Mermaid
  has no lifecycle notation, so that half of the toggle is now disabled and
  says why, as it already did for a data dictionary.

- **Immersive mode did not cover the screen for a sequence, flowchart or use
  case.** The diagram stayed at pane size with the site header above it, so
  "fill the screen" filled nothing — the pane it shares with the diagram's new
  ground could not position itself.
- **A Gantt plan touched the edge of its own surface.** The section headings and
  the axis caption sit at the drawing's origin, and the plan's panel was drawn
  at exactly those bounds — so "SHAPE IT" ran into the border, on screen and in
  every exported SVG and PNG. The panel now holds the plan with air on every
  side. The sheet is the same size it was, so a downloaded plan is framed as it
  always was, only no longer trimmed to its own text.
- **The playground's "Sample diagrams" menu was missing the lifecycle.** The
  list of kinds was written out by hand and the ninth notation was never added
  to it, so there was no way to start a lifecycle document from `/live`. The
  menu is now derived from the one running order of the notations, and leaving a
  notation out of that order no longer compiles.

### Changed

- **Each row of the "Sample diagrams" menu now carries its own notation's mark**,
  in that notation's colour — the same marks the examples index uses. All nine
  rows previously showed one generic file icon, in a list whose only job is
  telling nine things apart. The menu also scrolls instead of running off the
  top of the viewport.
- **Gantt charts, timelines and lifecycles now show the document's title.** The
  title and description are drawn on the canvas, above the diagram, and travel
  into exported SVGs and PNGs — an exported plan or timeline with no title
  belongs to nothing. The other five notations that carry a heading already did
  this; these three were the gap.
- **Timelines and lifecycles are drawn on their own sheet**, the same `--node`
  panel the Gantt and the data dictionary use, on screen and in exported files
  alike. All three notations that sit on the well's ruled ground now read as
  documents on a surface rather than ink on the wall. Exported file dimensions
  are unchanged.
- **The examples index now shows the diagrams.** Every showcased document on
  `/demo` carries a preview drawn from its own layout — the real boxes, arrows,
  diamonds, lifelines and spines, at the real proportions, with the labels
  dropped because none of them would be legible at that size. The page used to
  describe nine notations entirely in counts.
- **`/demo` is a two-up card grid instead of nine stacked lists**, which roughly
  halves the scroll. Each card is clickable end to end and opens the playground.
  Read-only pages are no longer linked per card — each section now lists every
  one of its examples as a read-only page, under the grid.
- **The kind bar on `/demo` no longer wraps.** With nine notations it had become
  several lines of sticky chrome parked over the page, and a jump could land a
  heading underneath it; it is one scrolling line at every width.

- **The canvas ground is now two layers, and one of them adapts to the zoom.**
  A **rule** — the grid or dot field — belongs to the drawing: it pans and zooms
  with it, and it now _subdivides_. There is a ladder of pitches, each five
  times the last, and only the levels that land at a comfortable on-screen size
  are drawn, fading in and out at the edges. Zoom in and a finer grid appears;
  zoom out and the finest fades while a coarser one takes over, so the ground
  never becomes a grey wash at 10% or four lines on a page at 400%. A
  **material** — paper fibre, e-ink particles, a glass sheen — is the sheet, and
  is fixed: it does not zoom, and it does not pan.
- **`paper`, `eink` and `glass` now have a real ground texture.** `paper` gets
  laid fibre, `eink` a field of discrete particles, `glass` a single diagonal
  sheen. All three are fractal grain rather than a printed lattice, so there is
  no pattern for the eye to lock onto.
- **The dot field is back where it belongs, and gone where it does not.**
  `light`, `pastel`, `dark`, `midnight` and `glass` show dots; `blueprint` shows
  its minor/major ruling; `paper` and `eink` show their material and no dots,
  because a dot grid on fibre is two grounds competing; `contrast` shows
  nothing at all, as before.
- The ground is quieter. Both strengths were lowered.
- **The ground fills the pane in every notation.** It used to stop at the
  drawing's edge on the eight non-C4 canvases, so a wide pane was half ruled and
  half bare and switching notation changed whether the paper reached the edges.
  A sheet does not stop where the drawing stops.
- **A Gantt plan is now drawn on its own surface.** It is the one notation whose
  own marks are a lattice — time ticks and section rules — and two lattices on
  one canvas beat against each other. The surface is the same `--node` panel the
  data dictionary has always used for its table.
- **The home page's hero card and MCP illustration now paint the real canvas
  ground** rather than a hand-typed grid of their own, so the picture of the
  product and the product agree.
- **Exports carry the ground.** An SVG or PNG downloaded from `blueprint` now
  arrives with its ruling and one from `paper` with its grain, in all nine
  notations. An exported file has no zoom, so the grid is drawn at the single
  pitch the document's own scale selects.

### Added

- **An `eink` theme — a ninth palette, with no colour in it at all.** Every
  token is a grey, so a diagram survives a photocopier, an e-reader, a
  monochrome projector, and a reader who cannot use hue. It is a light theme,
  because an e-ink panel reflects rather than emits.

  **The roles are told apart by texture, not by shade.** Everywhere else, a
  person, a database and a queue are three hues. Here they are three tile
  patterns — stippled, ruled horizontally, back-slanted — drawn in one ink, so
  the marker survives being printed, faxed or photographed. Shade still carries
  the ordering, from the near-white of an external system down to the darkest
  fill on a flowchart's terminator, but nothing depends on it.

  **The textures are in the exported SVG and PNG too.** Unlike the canvas grid,
  which stays on screen because it is background, a role texture is the
  drawing: without it the download would be a diagram whose roles are one
  colour. The Gantt is the one place two textures meet — its bars already carry
  a diagonal hatch meaning "this span has a duration" — so no state a Gantt can
  paint rules on that diagonal.

  The eight existing themes are untouched, on screen and in their exports.

- **A `blueprint` theme — an eighth palette.** Deep cyan-navy ground, white
  ink, and a canvas that is properly **ruled**: a fine minor rule, with a
  heavier major line every fifth square. The major rule is stronger than the
  edge of a panel, so a diagram sits on a drafting surface that was ruled
  before anything was drawn on it — every other dark theme dims its grid to
  keep it out of the way, and this one is the inversion. The role colours keep
  their audited hues and are re-mixed for a saturated dark ground, so a C4
  diagram, a flowchart and a Gantt read the same way here as anywhere else.

- The **dark** theme's canvas is lighter. The well a diagram sits in was the
  deepest of any theme — far enough below the page that it read as a hole
  rather than a recess. It is still clearly set into the page, just no longer
  the odd one out. Exported SVG and PNG carry the new ground too, so a
  downloaded file still matches the screen.

- **Every notation now has a grid behind it.** Only the C4 editor ever drew
  one: the other eight notations sat on a bare well in every theme, and so did
  the C4 viewer — the canvas a shared link opens in. All ten canvases now paint
  the same field at the same pitch, and it stays locked to the drawing when you
  pan, scroll or zoom.

- **A theme can now rule that canvas**, with its own minor and major lines,
  instead of the single-strength grid every theme shared. It is opt-in and only
  `blueprint` takes it up: the other themes paint exactly the grid they painted
  before, and the ones that claim to be no material at all — `light`, `dark`,
  `pastel`, and especially the high-contrast theme — are deliberately left
  plain, because a texture behind a drawing competes with it.

  The grid is screen chrome and stays **out of exported SVG and PNG**: a
  diagram dropped into a deck arrives as the drawing.

- **Lifecycles — a ninth notation.** `archlab 1.0 lifecycle` draws one named
  thing moving: what it went through, and where it can end up. States are dots
  on a spine in the order they were written; branches leave that track to the
  side and either stop or come back.

  **It overlaps the flowchart, and that was accepted rather than argued away.**
  The rule this project holds a new notation to is that it must answer a
  question the existing ones cannot, and this one does not: every picture it
  draws is a flowchart a flowchart could draw, and the flowchart could draw
  more of them. It ships because it was asked for explicitly and reaffirmed
  after the overlap was shown. What is genuinely different is a
  SUBTRACTION — the grammar cannot express an arbitrary graph — and what that
  buys is presentational: the picture is guaranteed to read as elapsed time
  down one spine, where a flowchart of the same content is laid out by rank
  and says nothing about the order things happened in. The full argument is in
  `src/types/lifecycle.ts`, so the next reader finds the trade recorded rather
  than assuming it was missed. **This is the second and last such waiver**: a
  tenth notation has to clear the bar.

  - **Draws** a vertical spine with a dot per state, its label and note to the
    right, and its departures in their own lane to the left at a smaller size.
    A final state and a terminal branch carry a stop BAR rather than a colour,
    and a returning branch travels in a reserved channel back into the track,
    re-entering in the gap above the state it rejoins — so it crosses no state
    it does not touch. This kind has **no palette**: every distinction it
    draws is structural, so a shape says it in greyscale and in a screenshot,
    and no per-theme colour audit is owed.
  - **Refuses**, by name, everything that would make it an arbitrary graph.
    There is no line between two states at all — the track IS the order they
    are written in — so `to`, `next`, `then`, `goes` and `after` on a state or
    an exit line are refused; a `rejoins` naming a state declared LATER is
    refused as a shortcut along the track; an `exit` inside another `exit` is
    refused, so branch depth is always one; and a second `subject` is refused,
    because a lifecycle follows ONE thing. Each refusal names
    `archlab 1.0 flowchart` and says to write one instead.
  - **Has no Mermaid dialect, and none was invented.** `stateDiagram-v2` is a
    state MACHINE — every transition that could happen, from anywhere to
    anywhere — which is exactly the arbitrary graph this notation exists
    without, and `journey` scores satisfaction against tasks. Importing one
    would mean inventing a main track its author never wrote; exporting one
    would present a subtraction as a superset. So the converter was skipped
    rather than approximated, and every surface that lists dialects says so.
  - **Lays out** from the text, never a grid. Every state's height is the
    greater of its two columns — its own wrapped label and note, and the stack
    of its branches — so a state with three annotated exits is much taller
    than one with none.
  - **Moves** four ways, each answering something a still frame cannot: states
    arrive in track order, each WITH its own departures ("at this point, these
    are the ways out"); the spine draws and then the returns draw along it; a
    wash travels down the spine once the reader has been still, because a line
    of identical dots cannot say which way time runs; and a selected state
    breathes while a lit returning branch gets a travelling dash showing which
    way the subject goes back — the one connector motion here, and the only
    mark on the canvas whose direction is its whole content. All of it holds
    still for reduced motion AND for the app-wide idle toggle, focus motion
    included, which is stricter than any other canvas here.
  - **Exports** SVG and PNG, and shares by link, like every other kind. An
    unreachable state is faded in the exported file as it is on screen — that
    fade is a fact about the document, not a state of the canvas.
  - **Is authorable by an agent.** `validate_lifecycle` and `format_lifecycle`
    join the MCP surface. Validate reports what a parse cannot see: a subject
    that never terminates, states stranded after a state marked `ends`,
    branches with no `when` condition on them, states named as ACTIONS rather
    than conditions — which is a flowchart written in this notation, and the
    only place in the product that will say so — and a document with no
    branches at all, which is a milestone timeline.

  No existing document, share link or route changed. The eight existing
  grammars refuse a lifecycle by name and the lifecycle parser refuses theirs,
  so a file that opened before opens unchanged.

- **Milestone timelines — an eighth notation.** `archlab 1.0 timeline` draws a
  history: what happened when, and which period it happened in. Events are
  points on a spine, grouped into named periods.

  **It overlaps the gantt, and that was accepted rather than argued away.**
  The rule this project holds a new notation to is that it must answer a
  question the existing ones cannot, and this one does not: a gantt made
  entirely of milestones draws the same content, and a list of dated events
  reads nearly as well as prose. It ships because it was asked for
  explicitly. What is genuinely different is a subtraction — no duration, no
  dependency, no participant — and what that buys is presentational: a page of
  long event labels with nothing else competing for the width. The full
  argument is in `src/types/timeline.ts`, so the next reader finds the trade
  recorded rather than assuming it was missed.

  - **Draws** a vertical spine with a dot per event, its label beside it and
    an optional note under that, in bands headed by the period. Vertical
    because the label is the whole element: across the page each one would get
    the gap to its neighbour to be read in, which is about eight characters.
  - **Refuses**, by name, everything that would make it a worse gantt: a
    duration, an `after`, an `at`, a status word and an id. Each refusal names
    `archlab 1.0 gantt` and says to write one instead. Nothing in a timeline
    measures — a period label is a string, never read as a date.
  - **Converts** to and from Mermaid `timeline`, **both ways**, unlike the
    gantt next door: a timeline computes nothing and has no status vocabulary,
    so Mermaid holds everything it says. `<br>` becomes a real newline and a
    continuation row (a line beginning `:`) folds into the period above it.
    Mermaid's `section`, which groups periods one level further up, is
    **refused by name** rather than flattened, and so is a period row listing
    no events. Export drops an event's description and its `#tag`s, which
    Mermaid has nowhere to put.
  - **Lays out** from the text, never a grid. Every event's height is solved
    from its own wrapped label and note, and every period's from its events' —
    so a band with more in it is taller, and the bands' relative sizes say how
    much happened in each.
  - **Moves** three ways, each answering something a still frame cannot:
    events appear in the order they happened, a wash travels down the spine
    once the reader has been still (a line of identical dots cannot say which
    way time runs), and the selected event breathes while the rest dim. All of
    it holds still for reduced motion and for the app-wide idle toggle. There
    are no connectors on this canvas and none were invented to have something
    to animate.
  - **Exports** SVG and PNG, and shares by link, like every other kind.
  - **Is authorable by an agent.** `validate_timeline` and `format_timeline`
    join the MCP surface. Validate reports what a parse cannot see: periods
    written out of sequence — nothing else in the product reads a period label
    at all, so the diagram draws the wrong order confidently — and events
    carrying a duration or a dependency in their label, which is the document
    asking to be a gantt.

  No existing document, share link or route changed. The seven existing
  grammars refuse a timeline by name and the timeline parser refuses theirs, so
  a file that opened before opens unchanged. A file headed
  `archlab 1.0 timeline` from before the gantt was renamed now reaches this
  parser and is refused with a message naming the gantt and the header to
  change it to, rather than a syntax error about its body.

- **Gantt charts — a seventh notation.** `archlab 1.0 gantt` draws a Gantt
  chart: how long each piece takes, and what can't start until it's done. It is
  the only kind here that puts duration on a measured axis — sequence owns
  order and flowchart owns dependency, and neither can say "thirteen days".

  - **Draws** tasks as bars, zero-duration milestones as diamonds, and named
    sections as bands. Four reporting states — planned, in flight, done, at
    risk — coloured from the palette the other kinds already use, so the set is
    complete and contrast-measured in all seven themes on the day it ships.
  - **Schedules.** Durations and `after` dependencies are solved into earliest
    starts, float, and the **critical path** — the chain that decides the end
    date. It is computed, never declared: there is no `crit` keyword, because a
    typed critical path can contradict the arithmetic and then the picture is
    simply wrong.
  - **Converts** from Mermaid `gantt`, **one way only**. `section`, tasks,
    `after`, `:milestone`, `done`/`active` and `dateFormat` all carry over.
    Mermaid's `crit` is **dropped** — theirs is a decoration the author types,
    ours is derived. `excludes`, `weekend`, `todayMarker`, `axisFormat`,
    `tickInterval`, `inclusiveEndDates`, `until`, sub-day durations and
    non-ISO date formats are **refused by name**, never approximated. There is
    no export to Mermaid at all: the at-risk state and the derived critical
    path have no equivalent there, and an emit would discard the first and
    misrepresent the second.
  - **Lays out** from the dependency graph, never a grid. Rows are sorted
    topologically inside their section with declaration order breaking ties, so
    no connector ever points upward, and each dependency picks a routing
    channel that crosses no bar it does not touch.
  - **Moves** three ways, each answering something a still frame cannot: rows
    rise in dependency order, the critical chain retraces itself once the
    reader has been still, and selecting any item runs a current along its
    chain in both directions. All of it holds still for reduced motion and for
    the app-wide idle toggle.
  - **Exports** SVG and PNG, and shares by link, like every other kind.
  - **Reads and writes dates, or neither.** One optional `starts 2026-09-07`
    header line turns the axis from `W1, W2, W3` into calendar dates. Nothing
    else in the document changes, because every position is stored as a day
    offset and only the axis knows what a calendar is. A duration is a count of
    calendar days, not working days.
  - **Is authorable by an agent.** `validate_gantt` and `format_gantt`
    join the MCP surface. Validate reports what a parse cannot see: dependency
    cycles, `after` entries that constrain nothing, sections holding only
    milestones — and the critical path itself, which nobody can read off their
    own text.

  No existing document, share link or route changed. The six existing grammars
  refuse a gantt by name and the gantt parser refuses theirs, so a file
  that opened before opens unchanged.

  The kind was written under the working name `timeline` and is called `gantt`
  everywhere it ships. Renaming a grammar header word is normally a breaking
  change; this one is not, because it happened before the notation was
  released — no `.alab` file, share link or route has ever carried the old
  word — and it leaves `timeline` free for the milestone-style notation that
  will want it.

- The theme picker opens with a **System** row, above the seven palettes. It is
  where a reader starts, it says what it currently resolves to ("Follows your
  system · light right now"), and it is the way back after picking a palette —
  choosing any named theme pins it and stops the system deciding. Only one row
  is ever ticked: while following, the palette in use is named in the System
  row's own hint rather than by a second tick further down the list.

- The theme picker is reachable in immersive mode, in the strip under the
  diagram, on all eight notations. Immersive covers the site header — and with it
  the only theme control — so choosing a lighter ground for a bright room or a
  darker one for a projector meant leaving the mode you had just entered to
  present. It appears only while immersive, since the header carries it
  everywhere else, and its menu opens upward over the diagram. Escape closes
  the menu first and exits immersive on the next press.

- The Share panel offers "Open immersive": the link it mints opens the diagram
  filling the recipient's window with the site chrome hidden, for a diagram
  meant to be presented rather than read alongside its source. Off by default,
  offered for both an edited document and a bundled model, and the recipient
  leaves with Escape or the canvas's own toggle. It rides in the link as
  `?i=1`, so it survives the older `/live/*` and `/view/*` paths and is honoured
  on arrival rather than after a flash of the page around it.

- An element's type can be changed in the details panel on the editable C4
  canvas. The select offers only the types legal at the diagram's level; a
  node still at its old type's default size adopts the new type's default,
  while a hand-sized node and a chosen icon keep exactly what the author set.

- An element's tags can be edited in the same panel. The field owns the plain
  tags; a tag that carries the element's colour stays with the colour control,
  and the form says so rather than hiding it.

- A selected boundary can be removed from its card on the editable C4 canvas.
  Removal takes only the boundary itself: its elements and any nested
  boundaries stay on the canvas and move one level out, in one undo step —
  the same behaviour the editor's boundary delete has always had.

- A selected relationship on the editable C4 canvas can now be edited and
  deleted, not just read. The relationship card grows a pencil — label,
  technology, direction (one-way, bidirectional, undirected) and line style
  (solid or dashed) — and a bin; Delete or Backspace with a connector
  selected removes it too. Edits land as a one-line patch of the source text,
  a delete takes exactly its own line and leaves both endpoints alone, and
  Cmd/Ctrl+Z undoes either. A hand-written `style=solid` survives edits that
  do not touch the style control.

- The element colour control offers any colour, not just the five presets: a
  colour wheel and hex entry sit beside the swatches. A picked colour is
  gently adjusted — hue kept, lightness moved the minimum distance — whenever
  the exact hex would be illegible on any theme, and the form says so beside
  a preview of what will actually be painted. Picking the same colour on a
  second element reuses the first one's `tagcolor` line instead of minting a
  duplicate.

### Removed

- The standing "Inspect the diagram" hint no longer occupies the top-right
  corner of a diagram with nothing selected. It explained that elements and
  connectors are clickable and never changed once read; the corner now stays
  empty until a selection puts a card there.

- The "View mode · read-only" tag beside the model title is gone. It claimed
  read-only whatever the lock was doing, so unlocking a C4 canvas to edit it put
  "Editable" in the strip above the diagram and "read-only" in the strip below
  it at the same time. The strip above the canvas is now the only place the
  state is spelled out.

### Fixed

- A Gantt chart has air around it again. The section headings, the axis caption
  and the section rules all start at the very edge of the drawing, and since the
  well grew a ruled ground — drawn inside the chart rather than on the pane —
  that ground ended exactly where the text began, so the plan read as printed
  past the trim. It is worst on `blueprint`, whose ruling makes the edge
  visible, but it was every theme. The chart now carries the same margin its
  exported file has always had, so a downloaded PNG is framed the way the screen
  frames it. No bar, tick or connector moves.

- The `paper` theme is lighter. Its cream stock read as dark to present on, and
  the ground itself has moved — the page, the diagram well, the panels, the node
  surface, the role fills and the tag band all rise together, so the theme is a
  lighter paper rather than a shallower recess. The hue and warmth are
  unchanged; the well keeps the same house-step recess under the page every
  other theme has. A diagram exported from `paper` carries the lighter stock
  too, and every ink, role fill and Gantt colour measured on it has been
  re-measured.

- The ground behind a diagram no longer changes shade depending on which
  notation is open. Sequence, flowchart and use-case diagrams sat in the
  slightly recessed well the palette defines for them, while ER, data
  dictionary, gantt, timeline and lifecycle diagrams sat on the page's own
  chrome colour — visible in every theme, and most in immersive mode, where the
  ground is the whole screen. The pane now paints that well once for every
  notation, so a tenth cannot arrive on the wrong colour.

- An agent asking arch-lab for an example is shown all nine notations. The MCP
  `list_example_models` and `get_example_model` read only the C4 registry, so
  the nineteen bundled sequence, flowchart, use-case, ER, dictionary, gantt,
  timeline and lifecycle documents were invisible to the surface that cannot
  browse `/demo` to find them. The listing is now grouped by notation, with
  what each kind is for and counts taken from the parsed document, and a fetch
  by id resolves across every registry and says which notation it found.

- The toolbar under a sequence, flowchart, use-case, ER or data-dictionary
  diagram is now built to the same metrics as the one under a C4 diagram. It
  had the pane's top-strip padding instead of the C4 footer's, so the same
  buttons sat in a row 8px shorter with a quarter of the side padding, against a
  different ground — and the Immersive button and the theme dial were borderless
  in a row of bordered ones. Most visible in immersive mode, where Share and
  Export are hidden and that row is the whole toolbar. A reader switches
  notation by typing, so the chrome around the drawing no longer moves when they
  do.

- The theme menu now opens where there is room for it. It was placed above its
  button unconditionally, so on a short window — or with the button low in an
  immersive pane — the list ran past the top edge and the rows past it were
  simply not there, with no scrollbar to say anything was missing. It now
  measures the space on both sides when you open it, keeps its usual side
  whenever a usable amount of the list fits there, and caps its height to the
  room actually available so it scrolls instead of spilling.
- The theme menu no longer gets cut off when it opens from an immersive diagram
  on a short screen. Eight rows opening upward could run past the top of the
  pane, which clips them with no scrollbar to say anything was missing.

- Clicking an element on an editable C4 canvas works again. The change that
  made a bare drag draw a selection box claimed any press that landed
  _inside_ the pane — and React Flow renders every node inside it — so
  pressing a node was cancelled before it could select or drag. The box now
  claims only the background itself.

- Clicking the background of an editable C4 canvas works again. Making a bare
  drag draw the selection box meant the canvas had to cancel the press it
  claimed, and cancelling a press also cancels the two things it quietly did:
  moving focus, and delivering a plain click. A press on the background now
  moves focus to the diagram, and one that never travels is treated as the
  click it is rather than an empty selection box.

### Changed

- The **paper** theme is warm all the way through, not a cream background with
  cool ink. Every connector in every notation was drawn in the blue-grey the
  default light theme uses, so a page that had been given warm stock and
  brown-black text was still wired together in a colour from another palette —
  and at 3.46:1 the line was faint on top of being wrong. The ink is warm and
  darker now (5.29:1), boxes are printed on the sheet instead of floating
  above it as white stickers, the role and shape fills are mixed for cream
  rather than borrowed from the cool page they were mixed for, the corners are
  cut tighter, and the accent — buttons, focus rings, selection, the gantt's
  critical path — is a deep sienna, because violet is the one mark that cannot
  be made on paper.

- The theme follows your system unless you tell it otherwise: **light** on a
  machine set to light, **high contrast** on one set to dark. Before, everyone
  landed on high contrast — so a reader who had told their machine they want
  light surfaces met a near-black page and no reason to suspect a picker
  existed. It is resolved before the first paint, so there is no flash of the
  wrong palette, and it keeps following: change the system setting and the page
  moves with it, with the tab open or on the next visit.

- The site's search result and link preview say what the site is. The title
  read "beautiful C4 and sequence diagram editor" — two notations out of six,
  so a search for a flowchart, a use case, an ER diagram or a data dictionary
  found a title saying arch-lab does not draw one. It now reads "architecture
  diagrams built to be presented", and the social card's headline is
  the home page's own promise ("Architecture diagrams you can present")
  instead of the retired "that survive review". The six notations are still
  named where there is room for them: the home page, the structured data,
  `/llms.txt` and the playground's own description.

- Share, Export and Immersive now sit **under** the diagram on the playground,
  not above it, for all six notations. The diagram gets the top of its pane —
  which is what you came for, and what a phone was spending on a row of
  buttons — and the controls read as its footer. Their menus open upward. The
  Hide button and the canvas-state word stay above the diagram, where they
  were: they are about the pane, not the drawing.

- Immersive mode now hides what it says it hides, on every notation. A C4
  diagram drops the model description — a line that was truncated mid-sentence
  anyway — and the gesture hint over the canvas. A sequence, flowchart,
  use-case, ER or data-dictionary diagram drops the row above the diagram and,
  on a sequence, both rows below it: a sequence diagram embedded in another
  canvas had five bands of chrome around it and now has one. The title, the
  controls, the padlock and the zoom pill all stay.

- The read-only sentence on a locked sequence canvas pointed at a control that
  had moved: it said "press Edit above" long after the lock became a padlock on
  the diagram's top right. It now names the padlock.

- The sequence canvas no longer keeps its help permanently on screen. Two rows
  of prose under the diagram — a paragraph on reading it and a strip of ten
  editing gestures — become one row and one button, **How to read and edit this
  diagram**, opening a panel with both. Nothing was cut: each gesture's full
  instruction is visible text there, where it used to be hover-only, and a
  locked canvas says so in the panel instead of spending a row on it. The
  page's "What you can do on the canvas" summary and the feature tour are
  unchanged.

- The minimap and the zoom controls now share the bottom-right corner of every
  canvas, with the map docked above the controls that drive it. Five canvases
  moved their zoom pill from the bottom left; the ER and data-dictionary
  viewers already sat there. The drag-mode toggle keeps the bottom-left corner
  on its own.

- The minimap is off until asked for. A map button at the left of the zoom pill
  — or **M** — shows and hides it on the two C4 canvases, so a diagram opens
  with nothing on it but the diagram. The choice is not remembered: every visit
  starts clean.

- The canvas lock catches the light while it holds. A soft highlight now rakes
  across the locked padlock every few seconds — a gloss passing over a polished
  surface — so the locked state reads at the edge of vision while you present
  rather than only when you look at it. The sweep crosses in about a third of
  its cycle and the button rests for the remainder, so it glints rather than
  moves constantly, and it appears only while locked: a canvas you are editing
  has no moving chrome at all. It is a sweep rather than a flash, well under
  the rate that would make it a hazard, and reduced motion gets the still lit
  face with no sweep at all.

- The live page's header is one line again, leaving more of the window for
  the diagram. The opening paragraph no longer lists the six notations and
  three formats — the page detects both from whatever you paste — and the two
  separate disclosure links have become one, covering the canvas gestures and
  how the formats relate. The privacy promise is made once rather than twice.

- The live page calls itself one thing. The heading now reads "Diagram
  playground", matching the browser tab, where it used to say "Write your own
  diagram" and give the page a third name alongside its title and its URL.

- The Mermaid conversion caveat for C4 models now also says that an
  undirected or dashed relationship comes back as a plain arrow. The loss is
  not new — the caveat now names it, because the relationship editor refuses
  a Mermaid pane on the strength of it.

- The `/live` intro is a couple of lines again. The gestures it used to list in
  one long sentence now sit in a "What you can do on the canvas" disclosure,
  built from the capability grid itself — so a new gesture reaches the page by
  being added where it is built. How `.alab`, JSON and Mermaid relate moved into
  its own disclosure beside it.
- The canvas lock wears a gradient that reads as sealed when locked and settles
  almost flat while the diagram is editable.

- The canvas padlock answers a press with a short physical gesture — locking
  clicks the closed padlock shut, unlocking springs the open one free — and
  holds still otherwise, including for reduced-motion readers and on first
  arrival at a locked diagram.

- The canvas lock wears keyhole padlocks now — open while the diagram is
  editable, closed while it is locked — on both the C4 and the sequence
  canvas, which share the one control.

- **Dragging on an editable C4 canvas now draws a selection box instead of
  panning; a Select / Pan toggle beside the zoom controls hands the drag back
  to panning.** Drag-to-select is the drawing-tool convention and is what
  makes the lasso reachable without a modifier; the pan is an explicit mode
  rather than a held key, so it works the same whatever has keyboard focus
  and on touch, where there is no key to hold. Select is the default, the
  pane's cursor follows the mode, and the canvas heading names both halves.
  A locked or read-only canvas is unaffected: it shows no toggle and has no
  selection to draw, so dragging simply pans there — which is what every
  shared link opens as.

### Added

- Relationships can be drawn on the editable C4 canvas. Every element grows a
  connect handle at its top right: drag it onto another element to relate the
  two — a preview line says the whole way whether the release relates, warns
  of an already-related pair, or cancels — or click it for a menu of the
  diagram's elements plus the level's node types, so "a new element this one
  talks to" lands as one change: the declaration and the relationship
  together, undone by a single Cmd/Ctrl + Z. Already-related pairs may be
  connected again (the new line draws beside the old one); an element never
  connects to itself, and `^ref` placeholders connect like anything else. The
  Mermaid pane refuses the gesture: Mermaid C4 holds a single diagram and
  gives a relationship no id, so the edit would be lost on the round trip.

- A freshly added child diagram can be entered from the canvas immediately:
  nesting an element now shows its zoom chip while the child is still empty
  (wearing "empty" instead of a count), on the editable canvas only — a
  read-only canvas still hides empty children, which are nothing a reader can
  drill into.

- Several C4 elements can be grouped into a boundary in one action: dragging
  on an editable canvas draws a selection box, and releasing it over two
  or more elements opens a compact card offering the diagram's boundaries,
  "None", and a new boundary you name on the spot. The whole grouping lands as
  one change to your text — each member's line gains its `in=`, plus one
  minted `frame` line for a new boundary — so a single Cmd/Ctrl + Z takes the
  entire boundary back out. A lasso over one element just selects it, and
  `^ref` placeholders group like anything else. The Mermaid pane refuses the
  gesture for the reason it refuses the single-element boundary edit: Mermaid
  C4 has nowhere to keep the membership.
- A boundary itself can now be selected on the canvas and renamed: click its
  border or its label band and a card offers the name, written back as a
  patch of that `frame` line alone. Its members keep their membership — the
  boundary's identity in the text does not change with its label.
- A C4 element can now be put inside a boundary from the canvas: the details
  panel's edit form grows a Boundary select offering the diagram's own frames,
  "None", and a new boundary you name on the spot — written as `in=` on the
  element, with the `frame` line minted above the diagram's nodes when the
  boundary is new. Leaving a boundary never deletes the frame line, so a
  boundary you emptied is still there for the next element.
- A C4 element can be given a child diagram from the canvas — the details
  panel offers "Add container/component/code diagram" wherever the level has
  somewhere deeper to go and the element has no child yet, and the drill-down
  the viewer already offered becomes something you can author. A child nobody
  filled can be removed again from the same panel; one that holds anything
  cannot, and says so.
- The Add strip can mirror an element from a level above into the diagram
  you are looking at, as a read-only `^ref` placeholder — so a container
  diagram can show the person or system it talks to without redeclaring it.
  The strip's Reference menu lists each candidate by name and source level,
  offering only ancestors' elements that are legal at this level and not
  already mirrored here; Escape closes the menu without also clearing the
  canvas selection.
- Adding an element or a reference from the Add strip now brings the newcomer
  into view: the canvas pans to centre on it (an instant cut under reduced
  motion) and selects it, so the details panel is already open for the rename
  the announcement suggests — previously the new element could land entirely
  off screen below a tall diagram.

- The details panel's edit form now also changes a C4 element's icon and its
  colour. The icon is picked from the same searchable picker the editor uses
  and lands in your text as `@slug` (clearing it returns the type's default);
  colour offers the document's own coloured tags plus five built-in colours
  measured for legibility on every theme, written as a `#tag` on the element
  and one shared `tagcolor` header line — so ten amber elements cost the
  header one line, and free-form colours remain available by typing a
  `tagcolor` line in the source pane. When an element already wears a
  coloured tag, picking a new colour replaces that tag on the element (the
  form says so before Apply) instead of silently losing the precedence race;
  the header keeps the old colour for other elements. The Mermaid pane
  refuses these edits because Mermaid C4 has no slot for icons or tag
  colours.
- A new element can be added to a C4 diagram from the canvas: an Add strip
  under the breadcrumb offers exactly the node types the diagram's level
  accepts (a context diagram will not offer `container`), and one press writes
  a single new line into your source text, placed on the canvas just below the
  existing diagram so it never lands on top of anything. The node arrives with
  a placeholder name — rename it with the pencil the details panel already
  has — and Cmd/Ctrl + Z with the diagram focused undoes it. The Mermaid pane
  refuses the gesture because Mermaid C4 carries no geometry, so the placement
  would be lost.
- A C4 node's wording — its name, technology and description — can now be
  edited on the canvas: select an element and the details panel grows a pencil
  that opens the three fields. The edit is written into your source text as a
  patch of the node's own lines, so comments and formatting elsewhere in the
  file are untouched, and Cmd/Ctrl + Z with the diagram focused undoes it. The
  Mermaid pane refuses the gesture because Mermaid C4 cannot hold technology on
  people or systems; renaming keeps the node's id stable, so relationships and
  `^ref` lines keep working.
- The MCP server (beta) can now tell an agent which icons exist: a `list_icons`
  tool serves the same icon vocabulary the browser's picker searches — by name,
  slug or alias, filterable by category — where before an agent had to guess a
  slug and an unknown one silently rendered the generic fallback icon. The
  syntax reference's nodes section now points at it, and at the `customicon`
  header line for icons the registry lacks.

- **Every arrow a sequence diagram can draw — all ten of them.** A sequence
  message used to be one of three kinds; it is now two independent choices, a
  line style and a head style, which is the same model Mermaid's arrow table
  is. The full grid, with the three arrows that already existed spelled exactly
  as before:

  |            | no head | arrowhead | cross  | open   | both ends |
  | ---------- | ------- | --------- | ------ | ------ | --------- |
  | **solid**  | `--`    | `->`      | `x>`   | `~>`   | `<->`     |
  | **dotted** | `..`    | `..>`     | `..x>` | `..~>` | `<..>`    |
  - **Grammar.** Seven new tokens. The no-head and both-ends spellings are
    borrowed verbatim from the C4 grammar, which has written `--`, `..`, `<->`
    and `<..>` for the same four drawings since 1.0; `x>` is the cross both
    Mermaid and PlantUML use for a lost message, and `..` is the dotted prefix
    this grammar already used in `..>`.
  - **Canvas.** Five head shapes, each drawn distinctly: the filled triangle, its
    unfilled twin for an open async head, a cross centred on the endpoint for a
    message that never arrives, a head at each end, and nothing at all for a
    plain line. They paint through the same theme tokens the line does, so they
    follow the theme and escalate with the line on focus. A dotted line dashes
    and a solid one carries the travelling comet — decided by the line style
    now, so all five dotted arrows dash rather than only the reply.
  - **Mermaid conversion is lossless in both directions, for all ten.** Import
    used to collapse eight arrows onto three kinds, discarding both the head
    shape and solid-versus-dotted; export wrote one canonical arrow per kind.
    Both now read one table. `<<->>` and `<<-->>` import for the first time —
    they were handled by neither direction and were not refused by name either,
    so a diagram using one failed with an error about its source participant.
  - **Editing.** The details panel has two menus, Line and Head, each acting the
    moment you pick from it.
  - **Everywhere else.** `/syntax` and the MCP syntax reference carry the arrow
    table, generated from the grammar rather than typed out; `validate_sequence`
    counts messages per axis; the VS Code grammar highlights all ten (`~>` had
    never been highlit at all); and the bundled Payment capture example uses all
    five heads where each one says something the others cannot.

  **Not a breaking change for any file you have**, and every existing document
  round-trips byte-identically — `->`, `~>` and `..>` mean and serialize as
  exactly what they did. It **is** forward-incompatible in one direction: a
  document using one of the seven new tokens will be refused, by name and with
  the full token menu, by any older parser.

### Fixed

- Changing a sequence message's arrow style now takes effect when you pick it.
  The From and To menus beside it already did, so the kind menu looked like a
  control that did nothing; every menu in the details panel acts at once, and
  Apply belongs to the typing. A lifeline's kind had the same defect.

### Fixed

- An old `/view` link no longer shows "Opening the playground…" on the way to
  `/live`. The forward now happens while the page is still being parsed instead
  of waiting for the app to load, so there is nothing to read before the address
  changes.

### Fixed

- On a phone, a rail folded on a wider screen no longer hides the editor with no
  way back. The remembered fold now applies only at the widths that render a
  control to undo it.
- An old `/view` link carrying a query now keeps it. `/view?e=atlas-shop`
  forwarded to `/live` with the example id dropped, so the reader arrived at the
  seed rather than the diagram they asked for; `?e=` and `?d=` now travel with
  the fragment, merged with whatever the alias itself sets.

### Changed

- The canvas lock changed shape and moved. It is now an icon-only padlock at
  the diagram's own top-right corner — open while the canvas is editable,
  closed while it is locked — instead of the labelled pencil/padlock button in
  the strip above the canvas. Hovering it says what pressing will do, the
  strip still names the state in words ("Read-only" / "Editable"), and on the
  C4 canvas the lock now stays reachable in immersive mode, where the old
  strip was covered.

- **The playground opens on the diagram, not on the editor.** `/live` rendered
  the source rail expanded on a first visit, so the page showed a monospace
  editor before it showed anything it draws. The rail now starts folded on a
  desktop window, where the canvas takes the whole width; on a narrow one —
  where the panes stack and no fold control is offered — the canvas comes first
  instead, so a phone no longer opens on a screenful of text with the diagram
  below the fold. Both are decided before the page renders, so nothing moves or
  re-fits after it appears.
- **The rail's control now says what is behind it.** Folded, it reads "Edit the
  text" with a tinted border instead of showing an unlabelled panel icon, and it
  keeps that label at every width the rail exists at. The playground tour's
  source step names it too.
- A reader who had already chosen to keep the rail open keeps it open — only the
  never-set case changed meaning, and the fold is still remembered across
  visits.
- **The playground moved from `/view` to `/live`, and the header entry now
  reads "Live".** The page had not only viewed for two releases — the C4 and
  sequence canvases answer a drag and rewrite your source text under you — so
  a URL and a menu item promising a viewer taught a reader the one thing about
  the page that was no longer true. Everything under the old path moved with
  it: `/live`, `/live/c4`, `/live/seq`, `/live/sequence`, `/live/flow`,
  `/live/uc`, `/live/er`, `/live/dict`, the bundled-model viewer at
  `/live/<model>` and every example page at `/live/<kind>/<example>`. New
  share links, from the Share button and from the MCP `create_share_link`
  alike, are minted against `/live`.

  **Nothing you already hold stops working, and this is not a breaking
  change.** `changelog.md` says a renamed route normally bumps the major
  version, so the reasoning is worth stating rather than asserting: every old
  URL is still served. Each `/view` path is a page that forwards to its `/live`
  equivalent **carrying the query string and the URL fragment with it**, which
  is what makes the difference — a share link's whole document lives in the
  fragment, the fragment never reaches a server, and so a server redirect
  would have delivered `/live` an empty document. Forwarding in the browser
  keeps the payload. A retired path also keeps a preview card, so a `/view#m=…`
  link already pasted in a review still previews as a diagram rather than as
  this product's landing page. What you lose is one client-side hop on an old
  link; what would have been breaking is a 404 or a dropped document, and
  neither happens.

  The retired paths are `noindex` and name `/live` as canonical, so search
  consolidates on the new URL rather than ranking a trampoline against the page
  it forwards to.

- The "Open in the playground" button on `/validate` and the playground links
  on `/syntax` now go straight to `/live` instead of bouncing through a
  seeded alias, so a click costs no redirect.
- The home page hero is 31 words instead of 136. The list of what each notation
  draws moved to the notation cards, which already name all six in their own
  vocabulary, and the full two-ways-to-edit passage moved down to "How you
  actually use it" — still on the page, just no longer between you and the first
  button.

### Fixed

- Turning step numbering off no longer removes an `autonumber false` line you
  wrote yourself, and no longer moves a flag you had written above a comment
  down below it. Pressing the numbering button twice now leaves the file byte
  for byte where it was, from any of the three states the field has.

### Added

- **The sequence canvas is editable.** Click a message or a lifeline and the
  details panel gains a pencil: a message's label, arrow kind, `[technology]`
  and `desc` detail, and a participant's display name, kind and
  `[technology]`, are all editable in place. Applying a change rewrites only
  that element's own lines in your source text — your comments, blank lines,
  spacing and any field you wrote out that canonical form omits at its default
  survive untouched.
- **Add a message with a button and two clicks.** `+` in the canvas strip arms
  the gesture; click the sending lifeline, then the receiving one, and one line
  is inserted after the focused step (or at the end of the flow when nothing is
  focused). A dashed rule shows where it will land, the lifelines are tab
  stops so the mouse is not the only route, and Escape cancels. Exactly one
  line is added and nothing else in the file is renormalised.
- **Move an arrow to different lifelines.** The message editor carries From and
  To menus listing the diagram's own lifelines by name, and changing either one
  moves the arrow straight away. "Repoint on the canvas" is still there beside
  them: it arms a two-click lifeline picker, which is the quicker route at the
  far end of a long flow. Only the message's declaration line changes; its
  `desc` and any `!` lines come back byte-identical.
- **Remove a message or a lifeline.** The details panel gains a Remove control
  for whatever is focused. A message goes with its `desc` and `!` continuation
  lines and nothing else — a note beside it is kept, not deleted with it, and
  later `autonumber` steps renumber as they should. There is no confirmation
  step because Cmd/Ctrl + Z with the diagram focused brings it back.
- **Add a lifeline.** The figure button beside `+` in the canvas strip appends
  a placeholder lifeline at the end of the order, ready to rename in the
  details panel. It lands outside any `box`, and it works on a document that
  declares no lifelines at all.
- Two removals are refused rather than allowed to break your file, and both say
  why: a lifeline that messages or notes still point at names how many (delete
  those first), or that it is the only member of a `box`; and a message
  carrying an activation `+`/`-` says so, because removing or moving one end of
  an unpaired flag changes a bar rows away from where you pressed. Take the
  flag off in the source pane first.
- Every gesture shares the canvas lock and the canvas undo ring with the C4
  canvas: locking the diagram removes the editing controls entirely, and
  Cmd/Ctrl + Z with the diagram focused steps back through canvas edits.
- **Number the steps from the canvas.** The numbered-list icon in the canvas
  strip turns `autonumber` on and off without opening the source pane. Turning
  it on writes one line at the head of the block, past any comment you opened
  it with; turning it off removes that line rather than writing
  `autonumber false`, so switching it on and back off leaves your file exactly
  as it was. An explicit `autonumber false` you typed yourself is replaced when
  you turn numbering on, and does not come back when you turn it off again.
- **Drag a message to move it in time, or a lifeline card to move its column.**
  A sequence diagram has no coordinates, so this is a reorder rather than a
  move: the element you drop takes a neighbour's place in the order, and the
  layout re-solves around it. The dragged element dims, a dashed rule marks the
  row or column it will land in, and the rule only ever appears on a slot the
  edit will accept — so a drop cannot end in a refusal. Dragging bare canvas
  still pans the view, and a drag that moved no longer also selects what it
  moved. Only the two elements that traded places change in your source text;
  a message's `desc` and `!` lines travel with it, byte for byte, and comments,
  blank lines and everything between them stay exactly where you put them.
  Dragging a step down and back up leaves the file unchanged.
- **Reorder from the keyboard, one slot per press.** With a step focused,
  `Alt` + `↑`/`↓` moves it earlier or later; with a lifeline focused,
  `Alt` + `←`/`→` moves its column. This is the precise route — a press is
  counted where a drag is aimed — and it produces byte-identical text to the
  equivalent drag.
- Reordering is refused, with a reason, wherever it would change more than the
  order: across a note (a note is anchored by where it sits, so a message
  crossing it would re-aim your prose), across a fragment (that would change
  which branch the step is inside), past a message carrying an activation
  `+`/`-`, and across a `box` boundary — a box brackets a run of neighbouring
  lifelines, and the sentence names the box. Nothing can be reordered while
  lifelines are folded, because the rows and columns on screen are renumbered
  over what is visible; the affordance disappears rather than misfiring.
- **A mouse guide under the canvas.** While editing is on, a row under the
  diagram carries one compact affordance per gesture — the glyph its real
  control wears, plus two or three words. The full instruction is the item's
  accessible name and its hover text, and the viewer's tour card still reads
  the whole list as prose. It replaces the single long sentence that was there
  before, which was a paragraph doing a toolbar's job.
- **The site now says a diagram is edited two ways.** The home page hero, the
  `/view` page title and description, `/llms.txt`, `/llms-full.txt` and a new
  `/faq` answer all carry one sentence: every notation is edited as source
  text, two of them are also editable on the canvas, a C4 node drags to a
  position while a sequence message or lifeline drags into a new order. It is
  the same wording on all five surfaces, assembled from the table that decides
  which canvas offers what — so it cannot describe a capability the app does
  not have. Until now no page outside the playground mentioned the canvas at
  all, and the two plain-text documents an assistant reads first did not
  contain the word.
- **Each notation card on the home page says how that kind is edited** — "text"
  or "text or canvas" — so the answer to "can I drag this one" is on the page
  that ranks rather than only inside the app.

### Changed

- **The canvas now starts locked, and the lock's button offers "Edit" instead
  of reporting "Locked".** Editable used to be the default, which was right
  when the only canvas gesture was nudging a C4 box; the canvas can now create,
  remove, repoint, rename and reorder, and the common visit is reading a
  diagram somebody sent. A locked canvas shows "Read-only" beside a pencil
  button labelled Edit — one click turns everything on, and the button becomes
  Lock. Not a breaking change: your saved choice is kept, so if you ever
  pressed Editable you still get an editable canvas, and if you pressed Locked
  nothing changes. Only readers who never touched the control see a different
  default, and no file, link or route is affected.
- The share-link notice above the source pane is now one line — "Share link —
  nothing uploaded, nothing stored." — with how a share link carries the
  document folded away behind it, next to a link to the full answer in `/faq`.
  It was a three-sentence card, which is interesting exactly once and was above
  the pane on every visit.
- The guide's caveat now says what dragging actually does, which changed under
  it: dragging an element reorders it, dragging bare canvas pans, and nothing
  here is positioned — a dragged element takes a neighbour's place rather than
  staying where you drop it. `/faq`'s "Why can't I drag my ER diagram?" answer
  says the same, and now distinguishes a sequence diagram (no coordinates, but
  an order) from the four kinds that solve their layout outright.
- A sequence document's "cannot be dragged" message now names the edit it
  _does_ offer instead of being a dead end. A Mermaid `sequenceDiagram` pane
  refuses these edits by name: Mermaid cannot hold a message's `desc` or
  `[technology]`, so the change would be lost on the next round trip — switch
  the pane to `.alab` to edit on the canvas.
- The playground's own description of the canvas now names what you can do to a
  sequence diagram on it — add, edit, repoint, number, remove — rather than only
  that it is editable. The viewer's tour card says the same.
- **The site description names six notations instead of four, and says the
  canvas is editable.** It listed C4, sequence, flowchart and use case — two
  short, from before ER diagrams and data dictionaries shipped, with no room
  inside the 160 characters a search result shows to add them. The count
  replaces the list, which bought the space for the editing claim; the six
  names are still on the home page, in its structured data and in `/llms.txt`.
  The `README`, `/demo`, both social cards and three `/faq` answers said "four
  kinds" for the same reason and now do not.
- The `/view` page is titled "write the text or edit the canvas" rather than
  "write it, see it rendered live", which described a viewer. Its description
  names the two notations you can edit on the canvas.
- The social card for `/` and for `/view` — the card every share link previews
  with — no longer lists four of the six notations. Both name the count and the
  two ways in.
- **An armed insert or repoint now tells you on screen what to click next.** It
  only ever said so to a screen reader, so pressing "Repoint on the canvas"
  looked like a control that closed the editor and did nothing. A prompt now
  appears over the diagram naming the click you owe and that Escape cancels,
  and it is the same sentence the announcement carries. It never appears in an
  exported SVG, PNG or GIF frame.

### Fixed

- **A canvas edit no longer deletes the comments in your `.alab` file.** Since
  the editable canvas shipped, one drag rewrote the whole document from the
  model — and the canonical form the writer emits has no `//` comment lines, so
  every comment in the file was gone on the first gesture. A drag or a Delete
  now patches only the lines it is about, leaving comments, your own blank
  lines and spacing, and any field you wrote out that canonical form omits at
  its default, exactly as you typed them.
- A drag while the source pane holds arch-lab JSON, or text that has not
  parsed yet, still rewrites the whole document — there is no line to patch in
  either case. Nothing is lost in the JSON pane, which has no comments.

## [2.0.0] - 2026-08-23

**This release contains a breaking change and bumps the MAJOR version:
`/editor` no longer serves its own page.** See "Removed" below. The document
formats are untouched — every `.alab` file and every share link that worked
before works unchanged.

Two new document types besides. Neither changes an existing document: every
`.alab` file, share link and route that worked before works unchanged, and the
new grammars are refused by the old parsers with a message naming the right
one.

### Removed — BREAKING

- **`/editor` is retired.** The URL still opens: it is now a client-side
  forwarding alias for `/view` that carries any `#m=` share payload across
  intact, so an `/editor#m=…` link you are holding still shows its diagram.
  What is gone is `/editor` as a page of its own — the palette, the inspector,
  drill-down authoring, `^ref` placeholders, file open/save and drafts are not
  reachable from any route. A route that links were minted against has been
  retired, which is what makes this a major bump rather than a minor one.
  Bookmarks and links keep working; a bookmark to the authoring surface itself
  does not.

### Added — editing on the canvas

Live. It shipped behind a flag, which was turned on in the same release.

- The C4 canvas on `/view` can be edited directly: select an element, drag it to
  move it, nudge it with the arrow keys, or press Delete to remove it along with
  every relationship touching it.
- Every change is written back into the source text as one edit per gesture, so
  a drag shows up in a pull request as one changed line. A node returned to
  where the default layout would have put it leaves no trace in the file at all.
- Undo for canvas changes, with the diagram focused. Typing in the source pane
  keeps your browser's own undo — the two histories are deliberately separate.
- A lock in the canvas strip, remembered per browser, for presenting: it makes
  the diagram read-only so a drag that starts on an element cannot move it.
  Editable is the default.
- **C4 only, and this is a property of the notations rather than a gap.**
  Sequence, flowchart, use-case, ER and data-dictionary diagrams work their
  layout out from the text, so there is no position in those grammars to write a
  drag into. No lock appears on them, and `/faq` answers the question directly.

### Changed

- The playground's heading no longer carries a "live editor" badge, and the
  navbar no longer carries an Editor entry — there is one place to open a
  diagram, not two.
- The viewer's "Edit this diagram" link hands its model to `/view` instead of
  `/editor`, and is hidden on a page whose canvas is already editable.
- `/editor` gained a social card. Links to it previewed as the product's
  landing page rather than as the diagram inside the link.

### Added — flowcharts

- A `flowchart` document type: `archlab 1.0 flowchart`, with terminator, step,
  decision, io and call shapes, guard-labelled branches, loops, and `group`
  clusters. Open one at `/view?d=flow`.
- Mermaid `flowchart` and `graph` import, in all four directions, and Mermaid
  export. Shapes with no arch-lab counterpart are refused by name rather than
  silently approximated.
- Rank-based layout with orthogonal routing: loops return as a hooked arrow
  beside the column they leave, and a label never sits on a line.
- An entrance that traces the flow rank by rank, an ambient pulse that retraces
  it at rest, and GIF export of the trace. Both obey the app-wide idle-motion
  toggle and `prefers-reduced-motion`.
- SVG and PNG export, share links, and six shape colours distinct in every
  theme.

### Added — use-case diagrams

- A `usecase` document type: `archlab 1.0 usecase`, with actors, use cases,
  a system `boundary`, undirected associations, `«include»` / `«extend»`
  dependencies and generalizations. Open one at `/view?d=uc`.
- Mermaid import for the actor/use-case convention — circle actors, stadium use
  cases, a `subgraph` boundary. A document that is really a flowchart keeps its
  flowchart reading.
- Layout that places actors outside the boundary in columns and sizes each
  ellipse so its label fits the curve.
- The grammar refuses what the diagram cannot mean: an actor inside the
  boundary, an actor–actor association, a mixed-kind generalization.

### Added — ER diagrams

- An `er` document type: `archlab 1.0 er`, with entities carrying their columns
  (name, type, and `pk` / `fk` / `uk` key roles), and crow's-foot cardinality at
  both ends of every relationship. Open one at `/view?d=er`.
- **Two-way, total Mermaid conversion** — the only kind with one. Mermaid has a
  real `erDiagram`, so both cardinalities, the solid/dashed line and every
  column with its type, key roles and comment survive in both directions. Only
  metadata is dropped, and a SQL type Mermaid cannot spell is substituted rather
  than emitted verbatim.
- Layout in columns by dependency depth: parents left, the tables that exist
  only because something else does on the right. Cycles are ordinary in a
  schema, so two tables referencing each other simply share a column.
- Click a table to see what it joins, or a relationship to read its cardinality
  in words — "exactly one customer places zero or more orders" — with the
  solid/dashed distinction spelled out. Clicking the canvas clears it.
- `validate_er` and `format_er` on the MCP server, reporting what a parse
  cannot see: foreign-key columns with no relationship line saying what they
  reference, tables with no primary key, tables joined to nothing, self-joins.
- Share links, SVG and PNG export, two bundled examples on `/demo`, and a fifth
  panel in the home page's hero.

### Added — data dictionaries

- A `dict` document type: `archlab 1.0 dict`, with `section` blocks of `field`
  lines carrying a type, the flags `required` / `unique` / `derived` / `pii` /
  `deprecated`, and — the point of the document — what each field MEANS, where
  its value comes from, which values are legal, and an example. Open one at
  `/view?d=dict`.
- It renders as a table, not a diagram: columns sized from their widest cell,
  meanings wrapped rather than truncated, and one shared column grid across
  every section so the document reads as one table with headings in it.
- Mermaid has no dictionary notation, so there is no converter and none was
  invented. The format toggle says so rather than offering an option that
  cannot act.
- `validate_dict` and `format_dict` on the MCP server. Its audit is a COVERAGE
  report rather than a defect list — a dictionary cannot be wrong the way a
  flowchart can, only incomplete — so it leads with how many fields carry a
  description, then names the undescribed and unsourced ones, deprecated fields
  with no replacement named, and every field flagged `pii`.
- Share links, SVG and PNG export, and two bundled examples on `/demo`,
  including an event envelope — no tables, no cardinality — which is the case
  that makes a dictionary a different document from an ER diagram.

### Added — everywhere

- Line numbers on `/validate`'s source pane, which had been left out when
  `/view` and `/syntax` got them — on the one page whose whole output is "line 12,
  column 4".
- The ER and dictionary canvases zoom, and drag to pan, with the same pill,
  the same clamps and the same pinch gesture every other canvas has.
- The home page's hero cycles all six notations.
- Export is one menu across every kind now: Copy PNG, Download PNG and
  Download SVG, with a single sharpness axis, so the two new kinds do not
  export differently from the four older ones.
- A 404 page. It leads with the bundled examples rather than the home page,
  because most 404s here are a link to a diagram id that has been renamed.

- `validate_flowchart`, `format_flowchart`, `validate_usecase` and
  `format_usecase` on the MCP server, each reporting the defects a parse cannot
  see — unguarded decisions, unreachable steps, actors that can do nothing,
  `include` cycles. `create_share_link` now accepts all four document kinds.
- Bundled examples of both kinds on `/demo`, with crawlable read-only pages.
- `Flowchart` and `Use case` starters in the playground's "Start from" row.
- A home page section naming each of the four notations, every one linking to a
  worked example in the playground.
- The hero diagram now appears on phones and tablets, under the headline and
  button rather than beside them. It was desktop-only, so every narrow viewport
  opened on a headline and a button with nothing to look at.
- A second "Open a live diagram" button at the foot of the home page, so the
  page's one action is in reach for a reader who scrolled all the way through.
- An `/faq` page answering the questions the site had nowhere to answer: how
  text diagrams compare to Mermaid, what leaves your browser, everything a
  document exports to, how a share link works with nothing stored, and what an
  agent is allowed to do over MCP. Linked from the footer and the 404, listed in
  `/llms.txt`, and marked up as `FAQPage` so an assistant can quote a single
  answer.

### Changed

- The dark theme — the default — is a dark grey (`#1c1e24`) rather than a
  near-black with a violet cast. The canvas, node fills, borders and edges were
  re-solved around the new ground, so every measured contrast pair still clears
  its minimum, and the social card matches the page a click lands on. Brand
  colour is unchanged.
- **The default theme is now High contrast**, not Dark. It separates by outline
  rather than by fill, so the first thing a visitor sees is the most legible
  arrangement the app draws. Every other theme, Dark included, is one click away
  in the picker.
- The social share image and the phone's browser-chrome colour follow the default
  theme rather than being hand-maintained beside it.
- The navbar's background fades out downward instead of being a flat tint that
  ends at a rule, so the row reads as part of the page rather than a bar sitting
  on it.
- The home page's background is a field of dots that reacts to the pointer —
  dots take the accent colour near the cursor, scatter with inertia under a fast
  sweep, and ripple away from a click. It holds still for anyone who has reduced
  motion set or the idle-motion toggle off, and the resting field is what a
  no-JS reader gets.
- The home page's hero cycles through all four document kinds instead of two,
  each drawn as a real miniature of its own notation.
- The site described itself as a C4-and-sequence tool everywhere it is quoted —
  page titles, meta descriptions, the social card, `/llms.txt` and the
  structured data. All of them now name all four kinds, so a search result and
  an assistant's answer list what the product actually draws.
- The page title leads with what the project is for rather than a feature list:
  "beautiful C4 and sequence diagram editor" in place of "C4, sequence and
  flowchart editor". Still under the ~60 characters a search result shows, and
  all four kinds are still named in the description and the structured data.
- `/mcp` has a social card of its own — the client, the endpoint and three tool
  calls with the verdict each comes back with. Links to the connect guide used
  to preview with the landing page's card, which advertised diagrams to readers
  looking for a server.
- The `/view` card names all four document kinds and no longer draws a C4 stack.
  Every share link previews through this one route, so a shared flowchart or
  use-case diagram was previewing as an advert for C4.
- `/demo` rows are clickable end to end. The whole row opens the example in the
  playground, says so in words, and the read-only page beside it is a padded
  target rather than a line of 12px text.
- `/demo`'s four kind headings are real headings, each with the one line that
  says what the kind is for — the same sentence the playground's starter
  buttons use. Long example descriptions are clamped to two lines so the index
  stays scannable.

### Removed

- The home page's "A diagram you can talk through" section. Presentation is
  still the selling point; the hero above it now animates four real diagrams and
  the headline already said it, so the section argued a settled point across
  half a screen while the page never once said in prose which kinds it draws.
  That sentence is what took its place.

### Fixed

- The home page's MCP section ran off the side of a phone screen — the heading,
  the paragraph and both buttons clipped, not just the install command. The
  command is one unbreakable line and it was widening the whole section instead
  of scrolling inside its own block.
- `/demo` invited a click across the whole row and only the title was a link,
  so clicking an example's description, its counts or the space beside its name
  did nothing.
- `/demo` ignored `prefers-reduced-motion`: its rows slid up under a staggered
  delay for everyone. They now appear at rest for anyone who has asked the OS
  for stillness.
- The home page's use-case miniature drew its system boundary as a near-black
  slab on the Dark theme, so the loudest edge on the card belonged to the one
  shape that is meant to be background. The boundary is now the same soft wash
  the real use-case renderer gives it.
- Non-Latin labels could lose a combining mark when a long word was split to
  wrap. Text now breaks on grapheme clusters, which also fixes Thai labels in
  C4 and sequence diagrams.

## [1.0.1] - 2026-08-16

### Changed

- `/mcp` is now titled and headed "An MCP server for architecture diagrams".
  It previously read "Use arch-lab from your AI agent", which names the page
  only to someone who already knows what arch-lab is — not the reader arriving
  from a search result or from an agent's answer.

### Fixed

- `/editor`'s meta description was 232 characters, 72 past the point a search
  result truncates, so its tail was written for nobody. It is now 141.

## [1.0.0] - 2026-08-16

The first tagged release. Everything below shipped between the initial commit on
26 July 2026 and this tag; there were no earlier releases, so this entry covers
the whole history rather than a diff against a predecessor.

Two document types are stable and in real use — C4 models and UML-style sequence
diagrams — along with the `.alab` text format, the viewer, the editor, share
links, and the MCP server.

### The `.alab` format

- A lossless plain-text format that mirrors the JSON model one-to-one, so a
  diagram round-trips through text without losing information.
- Ref names derivable from the element they point at, rather than restated.
- Two-way conversion with Mermaid C4, and `.alab` as the default format on the
  view route with JSON opt-in.
- A syntax reference page, and a VS Code extension providing grammar and
  highlighting for `.alab` files.

### C4 models

- Canvas rendering with drill-down navigation, an element detail panel, and
  relationships anchored to the facing side of each node.
- C4 notation conformance, grouping frames, and editor boundaries.
- A role-coloured node palette with a lit gradient and one-shot entrance motion.
- Layout derived from the relationships when geometry is omitted, instead of
  falling back to a grid.
- Connector selection that flows a gradient current along the highlighted path.
- An icon registry of hand-authored monochrome marks, served in two styles from
  a single source.

### Sequence diagrams

- A second document type end to end: parser, canvas, validation, and export.
- Detail taken off the wire, wrapped notes, and a title rendered on the canvas
  with a length guide.
- Every Mermaid sequence block drawn for real, with two-way `.alab` ⇄ Mermaid
  conversion.
- A resizable workbench layout, and an immersive mode that enlarges the diagram.

### Editor

- Editor mode with a live editable `.alab` pane beside the canvas.
- Local persistence, draft recovery, open and save as `.alab` or JSON, and JSON
  export.
- Model renaming from the breadcrumb, shortcut discovery, and a full-height
  canvas.
- Usable below the `xl` breakpoint — the text pane no longer breaks the layout.

### Viewer and sharing

- A canvas-first view mode, immersive by default, with camera controls and an
  "Edit this diagram" path back into the editor.
- Share a model by link with the model encoded in the link itself, signed with
  an expiry.
- Honest length tiers on share links, replacing an inherited 2000-character
  refusal that was not real.
- Diagram export as an image, multi-diagram export, and copy to clipboard as
  PNG.
- One playground page, seeded by a query parameter.

### MCP server

- `.alab` served over the Model Context Protocol at `/api/mcp`, documented at
  `/mcp`, and marked beta from a single constant.
- Frame awareness, a derived section list, setup for more clients, and the
  grammar published as a skill.

### Site

- A landing page and navbar written for someone who has not seen the product
  before.
- The `/validate` model checker, reachable from the navbar.
- Search indexability: robots, sitemap, OG image, JSON-LD, and canonicals.
- Six themes — dark-first, plus two light themes, one of them liquid glass —
  behind a picker.

### Fixed

Notable fixes that changed observable behaviour:

- Two runaway render loops in the editor: the canvas change-echo, and
  rubber-band marquee selection.
- A share link that would not open took over the whole page.
- Immersive mode on sequence diagrams hid the diagram it was meant to enlarge.
- The tab icon was unparseable XML, so browsers drew their own globe instead.
- Sequence participant names are anchored rather than measured.
- `background-clip: text` sliced the final glyph of the hero headline.

[2.0.0]: https://github.com/raksitnongbua/arch-lab/releases/tag/v2.0.0
[1.0.1]: https://github.com/raksitnongbua/arch-lab/releases/tag/v1.0.1
[1.0.0]: https://github.com/raksitnongbua/arch-lab/releases/tag/v1.0.0
