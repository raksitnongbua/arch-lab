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

### Added — everywhere

- `validate_flowchart`, `format_flowchart`, `validate_usecase` and
  `format_usecase` on the MCP server, each reporting the defects a parse cannot
  see — unguarded decisions, unreachable steps, actors that can do nothing,
  `include` cycles. `create_share_link` now accepts all four document kinds.
- Bundled examples of both kinds on `/demo`, with crawlable read-only pages.
- `Flowchart` and `Use case` starters in the playground's "Start from" row.
- A home page section naming each of the four notations, every one linking to a
  worked example in the playground.

### Changed

- The dark theme — the default — is a dark grey (`#22242a`) rather than a
  near-black with a violet cast. The canvas, node fills, borders and edges were
  re-solved around the new ground, so every measured contrast pair still clears
  its minimum, and the social card matches the page a click lands on. Brand
  colour is unchanged.
- The home page's hero cycles through all four document kinds instead of two,
  each drawn as a real miniature of its own notation.
- The site described itself as a C4-and-sequence tool everywhere it is quoted —
  page titles, meta descriptions, the social card, `/llms.txt` and the
  structured data. All of them now name all four kinds, so a search result and
  an assistant's answer list what the product actually draws.

### Removed

- The home page's "A diagram you can talk through" section. Presentation is
  still the selling point; the hero above it now animates four real diagrams and
  the headline already said it, so the section argued a settled point across
  half a screen while the page never once said in prose which kinds it draws.
  That sentence is what took its place.

### Fixed

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
