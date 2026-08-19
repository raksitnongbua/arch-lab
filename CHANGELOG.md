# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Two new document types. Neither changes an existing document: every `.alab`
file, share link and route that worked before works unchanged, and the new
grammars are refused by the old parsers with a message naming the right one.

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

[1.0.1]: https://github.com/raksitnongbua/arch-lab/releases/tag/v1.0.1
[1.0.0]: https://github.com/raksitnongbua/arch-lab/releases/tag/v1.0.0
