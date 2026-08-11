# arch-lab

A **local-first workspace for architecture documentation**. C4 model diagrams
today, with sequence diagrams, a data dictionary, and network diagrams planned.
Everything saves as plain, diff-reviewable JSON you own — no account, no
server, nothing leaves the machine. Git is the collaboration layer.

Product specs live in [`docs/product/`](docs/product/) — `vision.md`,
`user-stories.md`, `data-model.md`, `roadmap.md`, and `dev-handoff.md`. Read
them before making product decisions.

## Status

Be precise about what this repo is right now:

| Area                                  | State                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Read-only C4 viewer**               | Works today. Bundled example models (`shopflow`, `order-shop`) render with drill-down: click a node to zoom from Context down to Code, Escape to step back out. Connectors carry a marching dash so flow direction reads without hunting for the arrowhead. Export as SVG or PNG (rasterised at 2×), either the view you are on or [every diagram as one `.zip`](#exporting-images). |
| **View-mode playground** (`/view`)    | Works today. A two-pane live editor for the two text formats — `.alab` on one side, `.archlab.json` on the other; editing either regenerates the other and re-renders the diagram. Mermaid C4 imports one-way. Copy or download either format. Everything stays in the browser.                                                                                                      |
| **`.alab` ⇄ JSON conversion**         | Works today, lossless in both directions — see [Model formats](#the-two-model-formats).                                                                                                                                                                                                                                                                                              |
| **Mermaid C4 import**                 | Works today, one-way and lossy — see [Mermaid C4 import](#mermaid-c4-import).                                                                                                                                                                                                                                                                                                        |
| **C4 editor**                         | Works today (`EDITOR_ENABLED` in [`src/lib/constants.ts`](src/lib/constants.ts) is `true`; flip it to `false` and `/editor` degrades to a coming-soon page — see [Enabling the editor](#enabling-the-editor)). Nodes, relationships, drill-down, and [grouping boundaries](#grouping-boundaries).                                                                                    |
| **MCP server** (`/api/mcp`)           | **Beta.** Eight read-only tools, a syntax resource and an authoring prompt, verified end-to-end by `pnpm check:mcp`. Tool names and response wording may still change — see [Use it from an AI agent](#use-it-from-an-ai-agent-mcp--beta).                                                                                                                                           |
| **Sequence diagrams**                 | **View mode works today** (`/view/sequence`): `.alab` sequence text or a pasted Mermaid `sequenceDiagram`, rendered complete with focus-driven animation — click any message, participant, or fragment to spotlight its flow. No editor canvas and no share links for them yet — see [Sequence diagrams](#sequence-diagrams).                                                        |
| **Data dictionary, network diagrams** | Planned. Not built.                                                                                                                                                                                                                                                                                                                                                                  |

## Routes

| Route             | What it is                                                                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`               | Landing page. The hero CTA and the C4 card link into the demo — the header deliberately carries no primary nav links in this release.                                               |
| `/demo`           | Demo index: one card per bundled example model, each linking into view mode. Card numbers are counted from the parsed models, not hand-written.                                     |
| `/view/[modelId]` | Read-only viewer for a registered model (`/view/shopflow`, `/view/order-shop`). Invalid JSON is reported with the validator's JSON-path messages instead of a blank canvas.         |
| `/view`           | Chooser: C4 model or sequence diagram. Also where legacy `/view#m=…` share links land — they forward to `/view/c4` with the fragment intact.                                        |
| `/view/c4`        | The paste-your-own C4 playground: `.alab` and JSON side by side, live sync, Mermaid import, image export.                                                                           |
| `/view/sequence`  | The sequence playground: `.alab` sequence or Mermaid `sequenceDiagram`, the whole flow rendered at once — click a message, participant, or fragment to animate and inspect it.      |
| `/syntax`         | The `.alab` syntax reference — every construct with working examples; each snippet on the page is verified against the real parser by `pnpm check:syntax-docs`.                     |
| `/validate`       | The model checker: paste `.alab`, arch-lab JSON or Mermaid C4 and get a located verdict from the real parsers, plus [C4 review notes](#c4-conformance) on a valid model.            |
| `/mcp`            | How to connect an AI agent (**beta**). Every tool it documents is read from the same catalogue the server registers from, so the page cannot describe a server that does not exist. |
| `/api/mcp`        | The MCP server itself (**beta**; Streamable HTTP, stateless, unauthenticated, read-only). See `src/features/mcp/README.md`.                                                         |
| `/editor`         | The canvas editor: palette, inspector, drill-down, and [grouping boundaries](#grouping-boundaries). Degrades to a coming-soon page when `EDITOR_ENABLED` is off.                    |

## The two model formats

One model, two views. A model is stored as **`.archlab.json`** (the schema is
specified in [`docs/product/data-model.md`](docs/product/data-model.md)) or
authored as **`.alab`** — a Mermaid-like, human-editable text format. Conversion
between them is **lossless in both directions**: `pnpm check:archtext` proves
byte-identical round trips (text → model → text, and JSON → text → JSON
including unknown forward-compatible fields in their original key positions)
for both bundled example models.

A valid `.alab` file:

```
archlab 1.0
title "ShopFlow Platform"

@context ctx-root "ShopFlow Platform"
  customer:person "Customer" #shopper
  shop:system "ShopFlow Platform" @nextjs >cnt-shop
  stripe:external "Stripe"

  customer -> shop : "Places an order" [HTTPS]
  shop <-> stripe : "Authorises payment" [HTTPS/JSON]

@container cnt-shop owner=shop
  web:container "Web App" @nextjs
  db:database "Orders DB" @postgresql
  web -> db : "Reads and writes" [SQL/TCP]
```

`>cnt-shop` is a drill-down link, `@nextjs` an icon, `#shopper` a tag,
`[HTTPS]` a technology. Geometry may be omitted — parser and serializer apply
the same deterministic default layout, so terse files stay lossless. Full
syntax: [`src/features/archtext/README.md`](src/features/archtext/README.md).

### Editing `.alab` in VS Code

Indentation is significant (0/2/4 spaces, never tabs), and an editor that does
not know the extension renders it as plain text. This repo ships a VS Code
extension that highlights the format and pins spaces-only indentation for
`.alab` files, so the one mistake that matters is hard to make:

```sh
ln -s "$PWD/editors/vscode" ~/.vscode/extensions/alab-syntax
```

Reload the window and `.alab` files light up. Details, a `.vsix` route, and
why you should _not_ associate `.alab` with YAML:
[`editors/vscode/README.md`](editors/vscode/README.md).

## Grouping boundaries

A **boundary** is C4's labelled group drawn behind a set of elements —
"Internal", an AWS region, a trust boundary. It owns no behaviour and carries no
relationships, so it is never an endpoint of a connector.

In the editor, boundaries live in two places, split by what you have selected:

- **Wrap a selection.** Select one or more elements and use _Group N nodes in a
  boundary_ in the inspector's action footer. Creating the boundary and moving
  the elements into it is a **single undo entry** — it was one gesture.
- **Manage them.** With nothing selected, the diagram inspector grows a
  **Boundaries** panel: rename in place, nest one inside another, see how many
  elements each holds, and delete. An element's own membership is a **Boundary**
  field on its node inspector.

Deleting a boundary **never deletes anything else**. Its member elements and any
nested boundaries are re-homed one level out, so removing the outer of two
leaves the inner one intact at the top level. That asymmetry with deleting a
node is deliberate: a frame is scenery, and cascading from it would destroy
elements nobody pointed at.

Two rules are enforced in the store rather than the UI, because
[`io/validate.ts`](src/features/editor/io/validate.ts) refuses a file that
breaks them and the editor must never write a document it cannot read back: a
boundary cannot nest inside itself or its own descendants, and a label cannot be
blank. `pnpm check:frames` proves both, plus the undo semantics and the
re-homing.

Boundaries carry no geometry. The rectangle is derived from the bounding box of
the members plus padding ([`frame-layout.ts`](src/features/editor/lib/frame-layout.ts)),
so it cannot drift out of step when an element moves — and an empty boundary has
no rectangle and is simply not drawn.

In `.alab` they are one line each, with membership on the element:

```
@container cnt-shop "ShopFlow — Containers"
  frame f-aws "AWS eu-west-1"
  frame f-private "Private subnet" in=f-aws
  api:container "Order API" [Go 1.22] in=f-private
```

## Exporting images

The **Export** menu in view mode asks two independent questions: how much, and
what format.

- **This view** — the diagram on screen, as one `.svg` or `.png`.
- **All N views** — every diagram in the model, in drill order, as a single
  `.zip` of SVGs or PNGs. Entries are named
  `01-context-shopflow-platform-system-context.svg`; the numeric prefix is what
  keeps `unzip -l` and every file manager showing them in drill order instead of
  alphabetically.

A single archive rather than N downloads because browsers throttle or block
consecutive downloads after the first, and loose files give no sign they belong
together. The ZIP writer is [hand-rolled](src/features/viewer/export/zip.ts),
store-only, no dependency — the same call `render-svg.ts` and `download.ts`
already made for SVG rendering and PNG rasterisation. `pnpm check:export-archive`
parses its output back byte-for-byte and hands it to the system `unzip` as a
second opinion.

Every exported image carries the [key](#c4-conformance), and the theme is
resolved once per export so a multi-diagram archive is never half light and half
dark.

## C4 conformance

Measured against [c4model.com](https://c4model.com/) — where the tool follows
the model, and where it knowingly does not.

**What it enforces.** The four levels (`context → container → component →
code`) with a legality matrix for which element types may appear at each
(`VALID_NODE_TYPES_BY_LEVEL` in [`src/types/c4.ts`](src/types/c4.ts)). A node's
level is never stored on the node — it is the level of the diagram containing
it — so an element cannot claim an altitude its view contradicts.

**Notation.** Every element renders its C4 **classification** — Person,
Software System, Container, Component, Code — in the `[...]` metadata line,
with its technology when set. Note that the classification is not the same as
the silhouette: a Postgres store draws as a teal cylinder but labels itself
`[Container: PostgreSQL 16]`, because "Database" is not one of C4's
abstractions. `C4_ABSTRACTION` maps the eight drawable node types onto the five
classifications; `SHAPE_LABEL` (in
[`viewer/lib/labels.ts`](src/features/viewer/lib/labels.ts)) names the
silhouettes, and the two are reconciled in the exported key and in the node
detail panel.

**Every exported diagram carries a key**, as C4 requires — shapes, colours,
border styles, line styles and arrow heads, each row derived from what the
diagram actually contains rather than from a fixed list. Titles and the level
are stamped above the diagram. Pass `includeLegend: false` to
`renderDiagramSvg` for a diagram going somewhere that already has a shared key.

**Review notes.** `/validate` and the MCP `validate_model` tool report the
checklist items a parser cannot see — a container or component with no
technology, an element with no description, an unlabelled relationship, a
contentless label like "Uses", a bidirectional line where C4 asks for two
one-way ones, a container relationship naming no protocol. They never change
the verdict: a valid model stays valid. Rules and their citations live in
[`validate/lib/advisories.ts`](src/features/validate/lib/advisories.ts) and are
proven by `pnpm check:advisories`.

**Deliberate divergences.**

- **`bidirectional` stays in the model** even though C4 asks for unidirectional
  lines, because Mermaid's `BiRel` has to import losslessly. The advisory
  discourages it; the format still represents it.
- **Eight node types, not five**, because `database` and `queue` earn their own
  silhouette and hue (see the co-occurrence argument in
  [`node-colors.ts`](src/features/editor/lib/node-colors.ts)). They are
  Containers, and now say so.
- **No system landscape, dynamic or deployment diagrams.** `C4Dynamic` and
  `C4Deployment` Mermaid sources import at container level; call ordering and
  deployment topology are not part of the model.

## Sequence diagrams

A second document type, answering the question C4 does not: **what happens when
…?** Participants down the top, ordered messages down the page.

Live at [`/view/sequence`](#routes) — write `.alab` sequence text or paste a
Mermaid `sequenceDiagram` and it is auto-detected. View mode only for now:
there is no editor canvas and no share codec for sequence documents yet.

```
archlab 1.0 sequence
title "Checkout — Place Order"

@sequence
  autonumber
  cust:actor "Customer"
  api:participant "Order API" [Go]
  db:participant "Orders DB" [PostgreSQL]

  cust -> api : "POST /orders" [HTTPS]
  alt "card accepted"
    api ->+ db : "INSERT order" [SQL]
    api ..>- cust : "201 Created"
  else "card declined"
    api ..> cust : "402 Payment Required"
  note over cust api : "Order flow complete"
```

`archlab 1.0 sequence` — the extra header word is what makes the two document
types distinguishable from the first meaningful line, which is what
auto-detection depends on. Arrows are `->` synchronous, `~>` asynchronous,
`..>` reply; `+`/`-` suffixes open and close an activation bar; `loop`, `opt`,
`alt`/`else` and `par`/`and` nest by indentation with no `end` keyword, because
a dedent already says where a fragment stops. Conversion is lossless in both
directions, proven by `pnpm check:sequence`.

**The whole story, then the part you asked about.** The diagram owns the
first screenful and the whole flow FITS it — scaled to your viewport the way
the C4 viewer's fit-view works, with a small zoom pill (fit / 100% / in /
out; scrolling the pane pans once you zoom past fit) for reading fine
detail. The source sits below the fold: scroll the page down to edit the
text. An immersive mode gives the diagram the entire viewport. The diagram
renders complete — a sequence diagram is a record of what happened, so the
record is what you see first. At rest every message line **marches toward its
target** — React Flow's animated-edge technique, a dash travelling along the
line's own stroke rather than a second stroke laid over it, so there is only
ever one line. Each line is also painted **from its sender's lane colour to
its receiver's**, so the direction of traffic is in the colour: you can see
which service a call left and which one it reached. The march can be switched
off from the zoom strip (the choice persists), and `prefers-reduced-motion`
removes it outright, toggle or no toggle — each kind falls back to the
pattern that carries its meaning, solid for calls and dashed for returns. The
rest of the animation budget is spent on **focus**: click a
message (its arrow or its label) and that arrow re-draws itself and holds
emphasised while the rest recedes; a details dock on the right (a bottom
sheet on small screens) names the sender and receiver with their
technologies, the message's kind, step number and the fragment guard path it
sits inside (`alt [card accepted] › par [receipt]`). Click a participant and
its whole message set re-draws in step order — one calm staggered sweep —
with the dock listing each of its messages as a click-to-refocus button.
Click a fragment's kind chip (`alt`, `loop`, `opt`, `par`) to focus every
message in it, or a branch guard like `[card accepted]` to focus just that
case's flow. Click the same thing again and the animation replays. Arrow
keys walk focus through the messages in order; Escape (or empty canvas, or
the dock's close button) clears, then a second Escape exits immersive mode.
Under `prefers-reduced-motion` nothing draws — focus dims and the details
dock appears instantly, which is the same information without the motion.

Each participant is named **twice**, once at the head of its lifeline and
again at the foot, the way hand-drawn sequence diagrams do it: at the bottom
of a long flow you can tell which column is which without scrolling back up.
The footer card is a visual repeat only — it is not a second control and not a
second thing a screen reader announces.

**Mermaid import is lossy, and says so.** Eight arrowheads collapse onto three
kinds, `autonumber` arguments are dropped, and an `activate`/`deactivate` that
does not bracket its adjacent message is dropped. `critical`, `break`, `rect`,
`box`, `create` and `destroy` are refused by name rather than silently ignored.

## Mermaid C4 import

`/view` imports Mermaid C4 source (`C4Context`, `C4Container`,
`C4Component`, `C4Dynamic`, `C4Deployment`) and converts it into both panes.
The conversion is **one-way and lossy**, and the UI says so at the point of
import:

- Enterprise/System boundaries become tags on their members and are **not
  drawn as frames** (the boundary tree is preserved in an `x-mermaid`
  extension field).
- `SystemDb` / `SystemQueue` at Context level lose their database and queue
  styling.
- `C4Dynamic` and `C4Deployment` map to the container level; call ordering and
  deployment topology are not part of arch-lab's model.

Everything else — names, descriptions, technologies, relationships, `<br/>`
decoding, `_Ext` externality, `BiRel` bidirectionality — carries over.
`pnpm check:mermaid` proves the mapping.

## Use it from an AI agent (MCP) — beta

arch-lab hosts a [Model Context Protocol](https://modelcontextprotocol.io)
server, so Claude Code, Claude Desktop, Cursor and anything else speaking the
protocol can work with `.alab` models:

```bash
claude mcp add --transport http arch-lab https://arch-lab-dev.vercel.app/api/mcp
```

Eight read-only tools: `validate_model`, `format_model`, `convert_model`,
`describe_model`, `get_syntax_reference`, `list_example_models`,
`get_example_model`, `create_share_link` — plus the grammar as the resource
`archlab://syntax` and an `author_c4_model` prompt.

The framing matters: an agent already has file tools, and `.alab` is a text
format precisely so it can edit one directly. The server is there for the two
things it cannot do alone — **know the grammar exactly** and **get the real
parser's verdict**. There is deliberately no mutation API; that would duplicate
the grammar in a second place and drift from it.

Nothing is stored. Every tool is a pure function of the text it is sent, and
`create_share_link` encodes the model into a URL _fragment_, which browsers
never transmit — so even a shared link uploads nothing.

**Expiring links.** `create_share_link` takes an optional `ttl_days`, and the
Share button offers the same choice; omit it and links never expire, which stays
the default. There is still no storage: the server signs a SHA-256 _fingerprint_
of the payload together with the expiry, and the browser verifies it — so the
model is never uploaded even for an expiring link, and no per-link record exists
anywhere. Generate the keypair with `pnpm gen:share-keys`.

Be precise about what that buys. A signed expiry cannot be moved by editing the
URL, which is the thing people actually do. It is **not** access control: anyone
holding the link can decode the model and read it for as long as the link lives,
the expiry is checked by the reader's own browser against the reader's own clock,
and the signing endpoint is unauthenticated like everything else here, so a
determined holder can mint a fresh signature. Treat it as "this link goes
stale", never as revocation.

**This integration is in beta.** The endpoint URL and the `.alab` format are
stable, but tool names, arguments and response wording may still change, and
there is no protocol-level versioning yet — so pin nothing to the exact text of
a response. The caveat also travels in the server's `initialize` instructions,
for agents that connect without a human reading this.

Details, per-client setup and the honest limits are on
[`/mcp`](https://arch-lab-dev.vercel.app/mcp); the implementation is
documented in `src/features/mcp/README.md`.

## Getting started

| Tool    | Version                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js | ≥ 20 to run the app; **≥ 23.6** to run the `check:*` scripts (they load the app's TypeScript directly via Node's built-in type stripping). Developed on 24.13.0. |
| pnpm    | **10.27.0** — this project uses pnpm, not npm or yarn.                                                                                                           |

pnpm is pinned via the `packageManager` field in `package.json`, so with
Corepack enabled (`corepack enable`) the right version is used automatically.
Otherwise: `npm i -g pnpm@10.27.0`.

```bash
pnpm install
pnpm dev
```

Then open <http://localhost:3000>.

## Scripts

| Script                        | What it does                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                    | Start the dev server on :3000                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm build`                  | Production build                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm start`                  | Serve the production build (run `build` first)                                                                                                                                                                                                                                                                                                                                                            |
| `pnpm lint`                   | ESLint (Next core-web-vitals + TypeScript rules)                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm typecheck`              | `tsc --noEmit` against the strict config                                                                                                                                                                                                                                                                                                                                                                  |
| `pnpm format`                 | Prettier, writing changes in place                                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm format:check`           | Prettier in check-only mode, for CI                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm check:roundtrip`        | Proves the persistence guarantee: open a file, change nothing, save — bytes identical. Deserialize → serialize is byte-identical and idempotent on a fixture that carries unknown fields at every level, and each of the schema's 8 load-time hard errors is detected with its JSON path named.                                                                                                           |
| `pnpm check:mermaid`          | Proves the Mermaid C4 converter: the reference sample maps with correct types/tags/technology, boundaries survive as tags plus the extension tree, emitted models pass the real validator, parse → serialize → parse is stable, and malformed inputs fail with line/column.                                                                                                                               |
| `pnpm check:archtext`         | Proves `.alab` ⇄ JSON losslessness: text → model → text byte-identical, JSON → text → JSON byte-identical for both bundled example models (unknown fields surviving verbatim and in position), every emitted model validator-clean, malformed inputs failing with line/column.                                                                                                                            |
| `pnpm check:sequence`         | Proves the sequence document format: canonical `.alab` sequence text round-trips byte-identically (fragments nested three deep, unknown fields verbatim and in position), a hand-built model survives text and back structurally, a realistic Mermaid `sequenceDiagram` imports with every supported construct, malformed inputs fail with line/column, and C4 and sequence documents never cross-detect. |
| `pnpm check:sequence-layout`  | Proves the pure sequence layout function: participants keep model order, self-messages get their loop, a note over two participants spans both, activation bars open and close on the right steps, a three-deep fragment nest produces boxes that strictly contain one another, and the footer card row is reserved by the canvas height rather than clipped by it.                                       |
| `pnpm check:sequence-motion`  | Proves the idle march's cross-file arithmetic, which no type can catch: each kind's keyframes advance exactly its own dash period, `MARCH_PERIOD` agrees with the marched dasharrays, both kinds march at one speed, reduced motion parks each kind on its meaningful pattern, no overlay path survives, and the gradient stays a custom property so focus overrides it.                                  |
| `pnpm check:syntax-docs`      | Proves the `/syntax` reference page: every `.alab` snippet it displays parses with the real parser, and every deliberately-broken snippet in its errors section fails with exactly the line, column and message the page shows.                                                                                                                                                                           |
| `pnpm check:validate-samples` | Proves the `/validate` page's sample documents: each one checks out exactly as the page claims it will.                                                                                                                                                                                                                                                                                                   |
| `pnpm check:advisories`       | Proves the [C4 review notes](#c4-conformance): every rule fires on a document that violates it, no rule fires on one that does not, none of them ever changes the verdict, and every rule cites a reason from the C4 model.                                                                                                                                                                               |
| `pnpm check:export-archive`   | Proves the multi-diagram export: the hand-rolled ZIP writer emits an archive that parses back byte-for-byte with valid CRC-32s (and that the system `unzip` accepts, when one is installed), drill order survives, and archive names stay unique.                                                                                                                                                         |
| `pnpm check:frames`           | Proves boundary editing: creating one around a selection is a single undo entry, refused input leaves the model untouched, nesting cycles are impossible, deleting a boundary re-homes rather than cascades, and the file the editor would save passes the real validator.                                                                                                                                |
| `pnpm check:mcp`              | Proves the MCP server without booting a protocol: the tools it registers and the tools `/mcp` documents match exactly both ways, every tool works over real input, failures carry the parser's line and column, and a generated share link decodes back to the model that went into it.                                                                                                                   |
| `pnpm check:vscode-grammar`   | Proves the VS Code grammar in `editors/vscode` has not drifted from the parser: every node type, arrow and header keyword is present, then a sample — parsed by the real parser first — is tokenized with `vscode-textmate`, the engine VS Code itself runs, asserting the scope at each offset.                                                                                                          |

The `check:*` scripts load the **real** library code from `src/` (via
Node's TypeScript type stripping and a resolve hook for the `@/*` alias), so
they exercise exactly what the app ships. They are the project's safety net —
run them before touching the formats or converters.

## Project structure

```
arch-lab/
├── docs/product/              Product specs (vision, user stories, data model, roadmap, dev handoff)
├── editors/vscode/            VS Code extension: .alab grammar and indentation rules
├── public/                    Static assets
├── scripts/                   The check:* verification scripts
└── src/
    ├── app/                   App Router: /, /demo, /view/[modelId], /view, /syntax, /validate, /mcp, /api/mcp, /editor
    ├── components/
    │   ├── ui/                Generic primitives (button, card, badge, dialog, tooltip, toast, …)
    │   └── layout/            App chrome (header, footer, theme-toggle)
    ├── features/
    │   ├── archtext/          The .alab text format: parser + canonical serializer (see its README)
    │   ├── editor/            The full C4 canvas — built, currently gated (see its README)
    │   ├── marketing/         Landing-page hero diagram
    │   ├── mcp/               The MCP server behind /api/mcp, plus the /mcp page (see its README)
    │   ├── mermaid/           Mermaid C4 ⇄ arch-lab converter (pure, dependency-free)
    │   └── viewer/            Read-only viewer, /view playground, SVG/PNG export, model service
    ├── lib/                   cn() helper, constants (EDITOR_ENABLED, THEMES, C4 level copy)
    └── types/                 C4 model types — mirrors docs/product/data-model.md
```

Each feature is consumed only through its `index.ts` barrel; nothing outside a
feature imports its internals. The saved-file shape has exactly one definition
(`src/types/`); extend it rather than declaring a parallel one.

## Theming

Dark is the default and the intent, not a reflection of the OS. Light is one
click away in the header.

- Semantic tokens (`--background`, `--card`, `--primary`, plus canvas tokens
  like `--canvas`, `--node`, `--edge`, `--selection`) are defined once per
  theme in [`src/app/globals.css`](src/app/globals.css) — `:root` holds light,
  `.dark` holds dark. An `@theme inline` block maps them into Tailwind
  utilities; `@custom-variant dark` points `dark:` at a `.dark` class that
  next-themes stamps on `<html>` before first paint.
- **Adding a theme is one CSS block plus one array entry**: copy the `.dark`
  block in `globals.css` (the file marks the spot with an `EXTENSION POINT`
  comment), rename the selector, change the values, and add the name to
  `THEMES` in [`src/lib/constants.ts`](src/lib/constants.ts). No Tailwind
  change, no component change.

## Enabling the editor

The editor is **on** — `EDITOR_ENABLED` in
[`src/lib/constants.ts`](src/lib/constants.ts) is `true`, and
`src/app/editor/page.tsx` renders `<EditorShell />`.

Turning it back off is two steps, in this order:

1. Flip the flag:

   ```ts
   export const EDITOR_ENABLED: boolean = false;
   ```

2. Drop the `EditorShell` import and render from `src/app/editor/page.tsx`,
   replacing them with the coming-soon page and its metadata. This step is not
   optional: while gated, that route must import **nothing** from
   `@/features/editor`, because that import is what pulls the editor UI into the
   deployed bundle. A conditional render would leave the code shipping while the
   flag claimed otherwise. The file's own comment says the same.

Everything else — the header's Editor nav entry, the landing-page CTAs, the
capability copy on the demo index and in view mode — reads the flag and switches
on its own.

## Known limitations

- **Mermaid import is one-way and lossy.** Boundaries become tags and are not
  drawn as frames; `SystemDb`/`SystemQueue` at Context level lose their
  styling (details above).
- **Default layout is basic.** Text-authored models without explicit
  coordinates get a deterministic grid layout; on dense diagrams it can crowd
  edge labels. Add `(x,y w×h)` geometry in `.alab` when it matters.
- **Sequence diagrams, the data dictionary, and network diagrams are planned,
  not built.** Only C4 exists today.
- **The editor is not in this release** — see above.
