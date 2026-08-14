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
| **C4 editor**                         | Works today (`EDITOR_ENABLED` in [`src/lib/constants.ts`](src/lib/constants.ts) is `true`; two edits gate it back off — see [Enabling the editor](#enabling-the-editor)). Nodes, relationships, drill-down, and [grouping boundaries](#grouping-boundaries).                                                                                                                         |
| **MCP server** (`/api/mcp`)           | **Beta.** Ten read-only tools (C4 and sequence documents both), a syntax resource and an authoring prompt, verified end-to-end by `pnpm check:mcp`. Tool names and response wording may still change — see [Use it from an AI agent](#use-it-from-an-ai-agent-mcp--beta).                                                                                                            |
| **Sequence diagrams**                 | **View mode works today** (`/view/sequence`): `.alab` sequence text or a pasted Mermaid `sequenceDiagram`, rendered complete with focus-driven animation — click any message, participant, or fragment to spotlight its flow. No editor canvas and no share links for them yet — see [Sequence diagrams](#sequence-diagrams).                                                        |
| **Data dictionary, network diagrams** | Planned. Not built.                                                                                                                                                                                                                                                                                                                                                                  |

## Routes

| Route                        | What it is                                                                                                                                                                                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                          | Landing page. The hero CTA and the C4 card link into the demo — the header deliberately carries no primary nav links in this release.                                                                                       |
| `/demo`                      | Example index, sectioned by document kind: C4 models and sequence diagrams, each card's numbers counted from the parsed document rather than hand-written.                                                                  |
| `/view/[modelId]`            | Read-only viewer for a registered model (`/view/shopflow`, `/view/order-shop`). Invalid JSON is reported with the validator's JSON-path messages instead of a blank canvas.                                                 |
| `/view`                      | Chooser: C4 model or sequence diagram. Also where legacy `/view#m=…` share links land — they forward to `/view/c4` with the fragment intact.                                                                                |
| `/view/c4`                   | The paste-your-own C4 playground: `.alab` and JSON side by side, live sync, Mermaid import, image export.                                                                                                                   |
| `/view/sequence`             | The sequence playground: `.alab` sequence or Mermaid `sequenceDiagram`, the whole flow rendered at once — click a message, participant, or fragment to animate and inspect it.                                              |
| `/view/sequence/[exampleId]` | A registered example sequence document, read-only (`/view/sequence/checkout`, `/view/sequence/password-reset`). Statically generated from the example registry.                                                             |
| `/syntax`                    | The `.alab` syntax reference — every construct with working examples; each snippet on the page is verified against the real parser by `pnpm check:syntax-docs`.                                                             |
| `/validate`                  | The model checker: paste `.alab`, arch-lab JSON or Mermaid C4 and get a located verdict from the real parsers, plus [C4 review notes](#c4-conformance) on a valid model.                                                    |
| `/convert`                   | Mermaid → `.alab`: paste either dialect on the left and it is **drawn** on the right, live, by the same renderer its playground uses. One toggle switches the pane between the Mermaid you typed and the `.alab` it became. |
| `/mcp`                       | How to connect an AI agent (**beta**). Every tool it documents is read from the same catalogue the server registers from, so the page cannot describe a server that does not exist.                                         |
| `/api/mcp`                   | The MCP server itself (**beta**; Streamable HTTP, stateless, unauthenticated, read-only). See `src/features/mcp/README.md`.                                                                                                 |
| `/editor`                    | The canvas editor: palette, inspector, drill-down, and [grouping boundaries](#grouping-boundaries). Gated off by `EDITOR_ENABLED` into a coming-soon page.                                                                  |

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

## Zooming

All three canvases — the C4 viewer, the C4 editor and the sequence viewer —
wear the **same bottom-left pill**: zoom out, the live percentage (click it for
100%), zoom in, fit to view. The chrome and the step (×1.25 a press) have one
definition in [`components/ui/zoom-pill.tsx`](src/components/ui/zoom-pill.tsx);
the BEHAVIOUR deliberately does not, because the two C4 canvases zoom React
Flow's viewport while the sequence viewer scales its own SVG, and the clamps
differ on purpose (the editor reaches 400%, the viewer 250%, each argued in its
`canvas-constants.ts`).

The `+`/`−` buttons are new to the two C4 canvases. Before them, magnifying a
diagram meant ⌘/ctrl + scroll or a trackpad pinch — a gesture nothing on screen
mentioned, unavailable on a plain mouse wheel, and reachable from the keyboard
only through the editor's shortcut sheet (`?`), which the viewer does not have.
The buttons now carry the gesture in their tooltip, so the control teaches the
shortcut rather than replacing it: `shift+1` fits and `shift+0` resets to 100%
in the editor, exactly as before.

**The readout is a menu**, not a reset button. It used to do exactly one thing
— jump to 100% — which is the least useful thing a percentage can offer; now it
opens `Fit / 50 / 100 / 200 / 400%`, filtered by the canvas's own clamp so it
never offers a level that canvas cannot reach. "Show me this at 200%" is a
destination, not four `+` presses.

**A minimap** sits bottom-right on both C4 canvases. Zoomed past fit, a diagram
loses the thing a diagram is for: you can read a container but no longer see
what it sits inside, and the only way back was Fit — throwing the zoom away to
answer "where am I?". The map answers it without moving the camera, and it is
`pannable`/`zoomable`, so it is also a way to travel. Nodes are drawn in one
token colour rather than per-type hues: at 160px a node is four pixels wide, so
hue is noise and only the shape of the graph reads. Hidden below `sm`, where it
would cover a meaningful share of the canvas it describes.

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

Two families live there. The rules above are **C4 conformance** and cite
c4model.com. The other family is **`.alab` format hygiene**, which holds for any
document kind: today that is a `title` over 120 characters
(`MAX_TITLE_LENGTH`) — still perfectly valid, but the title becomes the export
filename, the demo-gallery card and the name a screen reader reads before the
diagram, so past that length it is a description and there is a `description`
line for that. It is the reason `validate_sequence` reports review notes too: a
sequence diagram has no C4 notation to conform to, but it has a title like
anything else, and the cap applies equally to a title that arrived through the
Mermaid import.

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

  cust -> api : "Place the order" [HTTPS]
    desc "POST /api/v1/orders\nbody { cartId }\n201 → { orderId }\n409 → the cart moved on"
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
`alt`/`else`, `par`/`and`, `critical`/`option` and `break` nest by indentation
with no `end` keyword, because a dedent already says where a fragment stops.
Conversion is lossless in both directions, proven by `pnpm check:sequence`.

**Grouping, and highlighting.** Two constructs say _these belong together_
without saying anything about control flow:

```
@sequence
  box "Our services" tint=#bfdfff
    api:participant "Order API" [Go]
    ledger:participant "Ledger" [PostgreSQL]
  psp:participant "Card Processor" [Stripe]

  rect tint=#bfdfff
    api -> psp : "Authorise the card" [REST]
    psp ..> api : "requires_capture"
```

`box` brackets a run of **lifelines** and takes its members as the participant
lines nested inside it. The nesting is the point, not sugar: a bracket is drawn
as one span from its leftmost member to its rightmost, so a box whose members
are not neighbours has no honest drawing — and nesting makes that state
unspellable rather than merely discouraged. `rect` highlights a run of
**steps** instead, and takes a colour where every other fragment takes a guard.

Both accept `tint=`, in `#rrggbb`, `rgb(…)` or a common colour name. Whichever
you write is normalised to one canonical spelling on the way in
([`lib/tint.ts`](src/lib/tint.ts)) — two documents that mean the same shade are
the same bytes, which is what keeps the round trip byte-identical. A colour the
format does not store is a located error in `.alab` (you typed it; you deserve
to be told) and a silent drop on Mermaid import (it is someone else's document,
and the caveat already covers colour). The colour is painted as a **wash**, not
a fill: it was chosen against Mermaid's light canvas, and an opaque one would
make a dark-theme diagram unreadable.

**The label is a title, not the whole truth.** A message takes a `desc "…"`
continuation — two spaces under it, the same continuation a participant takes —
and only the label is ever drawn on the wire. So `"Call login API"` stays on the
arrow and `POST /api/v1/basic/verify`, the payload and the failure modes live in
the `desc`, which the viewer reveals in its details dock when you click the
message; a message that has one wears a small dot after its label. Nothing in
the `desc` is measured, so detail can never widen a column.

A `desc` is a JSON string, so `\n` gives it **several lines**, and the dock
renders it as a **monospace block** that keeps them — method and path, then the
body, then one line per status code, which is how a request is actually read.
Prose set in the dock's proportional font turned exactly that into one grey
paragraph, which is the reason the row is a code block rather than text. The
escape keeps the source one physical line per `desc`, so canonical text is
unaffected; `pnpm check:sequence` pins that round trip. Mermaid has no
equivalent construct, so an imported `sequenceDiagram` simply has none — one
more reason its import is one-way.

**The whole story, then the part you asked about.** The diagram owns the
first screenful and the whole flow FITS it — scaled to your viewport the way
the C4 viewer's fit-view works, with a small zoom pill (fit / 100% / in /
out; past fit, drag the canvas to pan — or scroll, or use the scrollbars, all
three moving the same pane) for reading fine
detail. A trackpad **pinch** (or ctrl-scroll) zooms the diagram and is
**clamped to the pill's own 10–400% range** — claimed deliberately, because
unhandled it is the browser's page zoom, which scales the nav and the source
pane along with the drawing and past any limit this view believes in. Notes
**wrap** to their box: SVG text does not wrap, so a long note used to draw one
unbroken line through both walls of its box and off the canvas, and the fix is
measured in the layout (`pnpm check:sequence-layout` pins that the widest
wrapped line fits, the box is tall enough, the next row clears it, and no word
is lost). The source sits below the fold: scroll the page down to edit the
text. An immersive mode gives the diagram the entire viewport. The diagram
renders complete — a sequence diagram is a record of what happened, so the
record is what you see first. At rest something travels along every message,
and **which mechanism depends on whether the line's dash already means
something**. Replies are dashed at rest, so their dash marches — React Flow's
animated-edge technique, moving the line's own stroke rather than a second
stroke laid over it. Calls are solid, and stay solid: **the C4 viewer's comet
runs along them** instead — the same blurred glow, soft tail and sharp head,
the same dash maths, just slower, because C4 lights the one edge you selected
while this lights every resting message at once. `pnpm check:sequence-motion`
reads the C4 stylesheet and asserts the bands still match it band for band, and
that the clock stays on the slower side. Giving calls a marching dash was tried
and dropped,
because a dashed sync arrow reads as an async one — the motion was overwriting
the message kind. Each line is also
painted **from its sender's lane colour to its receiver's**, so the direction
of traffic is in the colour: you can see which service a call left and which
one it reached. Idle motion switches off from the zoom strip (the choice
persists), and `prefers-reduced-motion` removes it outright, toggle or no
toggle — each kind parks on the appearance that carries its meaning, solid for
calls and dashed for returns. The
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
keys walk focus through the messages in order; Escape clears, and so does a
click anywhere in the pane that is not on a diagram element — the whole pane is
the backdrop, including the margins a fitted diagram leaves beside itself, so
"click away to get out" works where the empty space actually is. Scrollbar
gutters are excluded, since dragging to pan is not deselecting. The dock's close
button clears too, and a second Escape exits immersive mode.
Under `prefers-reduced-motion` nothing draws — focus dims and the details
dock appears instantly, which is the same information without the motion.

**Collapse a participant's dependencies.** A card whose downstream services
exist only to serve it carries a `−`; click it and those columns fold away,
taking their messages with them, and the diagram compacts. Click the `+2` that
replaces it to bring them back.

A `×` that hid ANY lifeline was tried and removed. It sat on the opposite
corner of the same small card and read as a second, competing version of the
`−` next to it — two controls that both make columns disappear, differing in a
way you had to already know. The dependency fold is the one with a rule behind
it, so it is the one that stayed; discoverability is now the tour's job, not a
second button's.

What did stay is **the way back**: while anything is folded, a bar above the
diagram says how many and NAMES them, with one _Show all_. A count alone still
leaves you guessing what you are missing, and before it there was no trace on
screen at all — fold something, scroll away, come back, and you had a smaller
diagram with no reason to doubt it. In the bundled Checkout flow, folding Order API hides
Payments and Orders DB — and deliberately not the Customer, even though Order
API emails one, because the Customer also clicks in Storefront and a participant
the flow arrives through is never a dependency. The rule and that exact outcome
are pinned by `pnpm check:sequence-collapse`. Folding filters the model rather
than hiding with CSS, so columns, rows, fragment boxes, activation bars and the
text listing all recompute together; one consequence worth knowing is that step
numbers count what is shown, so a collapsed view numbers 1..n with no holes.

Each participant is named **twice**, once at the head of its lifeline and
again at the foot, the way hand-drawn sequence diagrams do it: at the bottom
of a long flow you can tell which column is which without scrolling back up.
The footer card is a visual repeat only — it is not a second control and not a
second thing a screen reader announces.

**Every block Mermaid draws, arch-lab draws.** `loop`, `alt`/`else`,
`opt`, `par`/`and`, `critical`/`option`, `break`, `rect` and `box` all import
as themselves — the model has a kind for each (`SequenceFragmentKind`), and
`box` is a `SequenceBox`. This took two wrong turns first, both instructive:
refusing `rect` by name rejected a whole diagram over a background tint, and
then flattening it silently deleted a grouping the author had drawn on
purpose. A one-way importer may lose detail; it may not quietly change what
the document says.

**What import still loses, and says so.** Eight arrowheads collapse onto three
kinds, `autonumber` arguments are dropped, an `activate`/`deactivate` that does
not bracket its adjacent message is dropped, `create`/`destroy` import the
participant but not the moment its lifeline starts or ends, and a colour that
is not a hex, `rgb(…)` or common colour name is dropped rather than passed
through to the renderer unvalidated. Every one of those is named in the caveat
the playground shows on import.

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

### `/convert` — paste it, see it, take the text

Both playgrounds import Mermaid as a side effect of putting a diagram on
screen, which is the wrong shape for "I have Mermaid, I want the `.alab` my
repo will hold": it makes you pick a playground before you can find out.
[`/convert`](#routes) is that errand named.

**The diagram is half the page**, and it renders live. Someone arriving with
Mermaid wants to know it worked, and a block of unfamiliar syntax is not
evidence of that — a drawing is. It is drawn by the SAME components the
playgrounds use (`ViewerShell`, `SequenceViewer`), not a bespoke preview: a
second renderer would be free to disagree with the one the hand-off link
opens, and "it looked different on the convert page" is a bug nobody could
act on.

**One pane, two faces.** A segmented toggle switches between `Mermaid` — the
editable input — and `.alab`, what it became. Both stay mounted, so glancing
at the other format never costs you the textarea's undo stack or your caret.
The `.alab` face is read-only and copies or downloads instead: editing it
would raise the question of what happens to the Mermaid beside it, and
regenerating Mermaid from a model is exactly what a one-way importer cannot
do. The hand-off link opens the document where it CAN be edited.

Conversion runs through exactly the readers the playgrounds use —
`checkSource` for C4, `parseSequenceInput` for sequence — so the page cannot
disagree with them, and `pnpm check:validate-samples` asserts both one-click
samples convert to `.alab` that parses back.

## Use it from an AI agent (MCP) — beta

arch-lab hosts a [Model Context Protocol](https://modelcontextprotocol.io)
server, so Claude Code, Claude Desktop, Cursor and anything else speaking the
protocol can work with `.alab` models:

```bash
claude mcp add --transport http arch-lab https://arch-lab-dev.vercel.app/api/mcp
```

Ten read-only tools: `validate_model`, `format_model`, `convert_model`,
`describe_model`, `validate_sequence`, `format_sequence`,
`get_syntax_reference`, `list_example_models`, `get_example_model`,
`create_share_link` — plus the grammar as the resource `archlab://syntax` and
an `author_c4_model` prompt.

The two `_sequence` tools are separate from their `_model` cousins rather than
a flag on them, because the two document kinds have nothing in common to
report: a C4 model answers with diagrams, levels and node counts, a sequence
diagram with participants, message kinds and fragment depth. Passing a C4
document to `validate_sequence` says so and names the right tool instead of
failing as a syntax error.

The framing matters: an agent already has file tools, and `.alab` is a text
format precisely so it can edit one directly. The server is there for the two
things it cannot do alone — **know the grammar exactly** and **get the real
parser's verdict**. There is deliberately no mutation API; that would duplicate
the grammar in a second place and drift from it.

Everything the editor and the viewer understand is reachable through it:
`get_syntax_reference` has a **frames** section covering
[grouping boundaries](#grouping-boundaries), `describe_model` reports each
diagram's boundaries and which elements sit in them, and `validate_model`
returns the [C4 review notes](#c4-conformance) alongside its verdict. The
`author_c4_model` prompt tells an agent to act on all three.

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

| Script                         | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | Start the dev server on :3000                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm build`                   | Production build                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm start`                   | Serve the production build (run `build` first)                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `pnpm lint`                    | ESLint (Next core-web-vitals + TypeScript rules)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm typecheck`               | `tsc --noEmit` against the strict config                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pnpm format`                  | Prettier, writing changes in place                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm format:check`            | Prettier in check-only mode, for CI                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `pnpm check:roundtrip`         | Proves the persistence guarantee: open a file, change nothing, save — bytes identical. Deserialize → serialize is byte-identical and idempotent on a fixture that carries unknown fields at every level, and each of the schema's 8 load-time hard errors is detected with its JSON path named.                                                                                                                                                                                                       |
| `pnpm check:mermaid`           | Proves the Mermaid C4 converter: the reference sample maps with correct types/tags/technology, boundaries survive as tags plus the extension tree, emitted models pass the real validator, parse → serialize → parse is stable, and malformed inputs fail with line/column.                                                                                                                                                                                                                           |
| `pnpm check:archtext`          | Proves `.alab` ⇄ JSON losslessness: text → model → text byte-identical, JSON → text → JSON byte-identical for both bundled example models (unknown fields surviving verbatim and in position), every emitted model validator-clean, malformed inputs failing with line/column.                                                                                                                                                                                                                        |
| `pnpm check:sequence`          | Proves the sequence document format: canonical `.alab` sequence text round-trips byte-identically (fragments nested three deep, unknown fields verbatim and in position), a hand-built model survives text and back structurally, a realistic Mermaid `sequenceDiagram` imports with every supported construct, malformed inputs fail with line/column, and C4 and sequence documents never cross-detect.                                                                                             |
| `pnpm check:sequence-layout`   | Proves the pure sequence layout function: participants keep model order, self-messages get their loop, a note over two participants spans both, activation bars open and close on the right steps, a three-deep fragment nest produces boxes that strictly contain one another, and the footer card row is reserved by the canvas height rather than clipped by it.                                                                                                                                   |
| `pnpm check:sequence-collapse` | Proves folding a participant's dependencies: on the real example, collapsing Order API hides exactly Payments and Orders DB — not Storefront, which calls it, and not the Customer, which it emails but which also acts elsewhere. Also that folding is transitive, that a shared service stops the cascade, that the filtered file leaves no message pointing at a hidden participant and no empty fragment, and that it still lays out.                                                             |
| `pnpm check:sequence-motion`   | Proves idle motion's cross-file facts, which no type can catch: the comet's bands still match the C4 viewer's own dasharrays and offsets (read from its stylesheet, so "same as C4" cannot rot) while its clock stays deliberately slower, solid kinds are never given a dasharray (a dashed sync arrow reads as async), the reply's keyframes advance exactly its dash period, the head stays low-duty, and reduced motion removes the comet rather than parking three bright stripes on every line. |
| `pnpm check:syntax-docs`       | Proves the `/syntax` reference page: every `.alab` snippet it displays parses with the real parser — C4 snippets through the C4 parser and sequence snippets through the sequence one, each first confirmed to be DETECTED as that kind — and every deliberately-broken snippet fails with exactly the line, column and message the page shows.                                                                                                                                                       |
| `pnpm check:validate-samples`  | Proves both tool pages' sample documents: each `/validate` sample checks out exactly as the page claims, and each `/convert` sample converts to `.alab` of the promised kind that parses back.                                                                                                                                                                                                                                                                                                        |
| `pnpm check:advisories`        | Proves the [review notes](#c4-conformance): every rule fires on a document that violates it, no rule fires on one that does not, none of them ever changes the verdict, and every rule cites its source — c4model.com for the C4 family, the constant that defines the limit for the format family. The title cap is proven on both document kinds, at the boundary, and in code points rather than UTF-16 units.                                                                                     |
| `pnpm check:export-archive`    | Proves the multi-diagram export: the hand-rolled ZIP writer emits an archive that parses back byte-for-byte with valid CRC-32s (and that the system `unzip` accepts, when one is installed), drill order survives, and archive names stay unique.                                                                                                                                                                                                                                                     |
| `pnpm check:frames`            | Proves boundary editing: creating one around a selection is a single undo entry, refused input leaves the model untouched, nesting cycles are impossible, deleting a boundary re-homes rather than cascades, and the file the editor would save passes the real validator.                                                                                                                                                                                                                            |
| `pnpm check:mcp`               | Proves the MCP server without booting a protocol: the tools it registers and the tools `/mcp` documents match exactly both ways, every tool works over real input, failures carry the parser's line and column, and a generated share link decodes back to the model that went into it.                                                                                                                                                                                                               |
| `pnpm check:vscode-grammar`    | Proves the VS Code grammar in `editors/vscode` has not drifted from the parser: every node type, arrow and header keyword is present, then a sample — parsed by the real parser first — is tokenized with `vscode-textmate`, the engine VS Code itself runs, asserting the scope at each offset.                                                                                                                                                                                                      |

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
    ├── app/                   App Router: /, /demo, /view/[modelId], /view, /syntax, /validate, /convert, /mcp, /api/mcp, /editor
    ├── components/
    │   ├── ui/                Generic primitives (button, card, badge, dialog, tooltip, toast, …)
    │   └── layout/            App chrome (header, footer, theme-toggle)
    ├── features/
    │   ├── archtext/          The .alab text format: parser + canonical serializer (see its README)
    │   ├── convert/          Mermaid -> .alab as its own errand, behind /convert
    │   ├── editor/            The full C4 canvas — built, currently gated (see its README)
    │   ├── marketing/         Landing-page hero diagram
    │   ├── mcp/               The MCP server behind /api/mcp, plus the /mcp page (see its README)
    │   ├── mermaid/           Mermaid C4 ⇄ arch-lab converter (pure, dependency-free)
    │   └── viewer/            Read-only viewer, /view playground, SVG/PNG export, model service
    ├── lib/                   cn() helper, constants (EDITOR_ENABLED, THEMES, C4 level copy), tint normalisation
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

Turning it off is two steps, in this order:

1. Flip the flag:

   ```ts
   export const EDITOR_ENABLED: boolean = false;
   ```

2. Replace the `EditorShell` import and render in `src/app/editor/page.tsx` with
   a coming-soon page and its metadata. The import is the actual gate, which is
   why it is a separate step: while off, that route must import **nothing** from
   `@/features/editor`, because that import is what pulls the canvas, React Flow
   and the editor store into the deployed bundle. A conditional render would
   leave the code shipping while the flag claimed otherwise. The file's own
   comment says the same.

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
