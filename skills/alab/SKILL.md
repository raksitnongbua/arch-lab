---
name: alab
description: Write and edit arch-lab .alab architecture files (C4 diagrams and sequence diagrams). Use whenever creating or modifying a .alab file — the format has significant indentation and order-free attributes, so writing it from memory produces plausible, invalid files.
---

# The .alab format

This is the complete `.alab` grammar, generated from the same source the
arch-lab MCP server serves and verified against the real parser on every
build.

**Read the relevant section before writing `.alab`, not after.** The format
has significant indentation and order-free attributes; both are easy to guess
wrong in ways that look right.

**You do not need a server to write these files.** `.alab` is plain text —
use your own file tools. What this skill gives you is the grammar. What it
cannot give you is the parser's verdict on a file you have written: for that,
either connect the [arch-lab MCP server](https://arch-lab.dev/mcp) and call
`validate_model`, or paste the file into the validator at https://arch-lab.dev/validate.

## Contents

- [Overview](#overview)
- [A complete example](#a-complete-example)
- [Indentation & comments](#indentation-comments)
- [Header lines](#header-lines)
- [Diagrams](#diagrams)
- [Frames (C4 boundaries)](#frames-c4-boundaries)
- [Nodes](#nodes)
- [Edges](#edges)
- [Paths (authored walks)](#paths-authored-walks)
- [Unknown & forward-compatible fields (`!` lines)](#unknown-forward-compatible-fields-lines)
- [Sequence diagrams (a second document kind)](#sequence-diagrams-a-second-document-kind)
- [What errors look like](#what-errors-look-like)

## Overview

`.alab` is the arch-lab text format: a readable, Mermaid-like form of
the same C4 model `.archlab.json` stores. The two are **lossless** in
both directions — text → model → text is byte-identical, and so is
JSON → text → JSON, including unknown forward-compatible fields in
their original key positions.

Facts worth knowing before writing any:

- Line-structured with **significant indentation, spaces only, never tabs**.
- Exactly three depths: `0` header lines and `@level` diagram headers,
  `2` diagram body, `4` node/edge continuations.
- Blank lines are ignored. `//` starts a full-line comment — comments are
  the ONE thing a round trip does not preserve.
- Four C4 levels: `@context`, `@container`, `@component`, `@code`.
- Attributes on a node or edge line may appear in **any order**.
- Anything omittable has a deterministic default applied identically by
  the parser and the serializer (layered auto-layout from the diagram's
  own relationships, per-type sizes, sentinel timestamps), so terse files
  still round-trip exactly.

Validate anything you write with the `validate_model` tool — it runs the
real parser and reports the line, column and offending source line.

**There is a second document kind.** Everything in the sections below,
unless a section says otherwise, describes the C4 model grammar opened by
`archlab 1.0`. A SEQUENCE diagram — participants and messages over time —
is opened by `archlab 1.0 sequence`, has its own grammar and its own
tools (`validate_sequence`, `format_sequence`). See the sequence section.

## A complete example

A whole small model, so the shape is clear before the details.
Geometry is omitted throughout — omitted positions are laid out
top-down from the relationships, so this file is still lossless.

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

## Indentation & comments

| Indent | What lives there |
| --- | --- |
| 0 | header lines, `@level` diagram headers |
| 2 | diagram body: `desc`, `view`, `!`, node lines, edge lines |
| 4 | node/edge continuations: `desc`, `!` |

```
// Full-line comments start with // — at any indentation, even line 1.
archlab 1.0
title "Layout rules"

// Blank lines are ignored. Comments are text-only sugar: they are the one
// thing a round trip does not preserve.
@context ctx-root "Layout rules"
  api:system "API"
    desc "Indent 4: a continuation of the node line above."
```

## Header lines

Header lines sit at indent 0 before the first diagram. `archlab
<version>` must be the first content line; `title` is required.

| Syntax | Maps to | Notes |
| --- | --- | --- |
| `archlab <version>` | `version` | Required; must be the first content line of the file. |
| `schema "<url>"` | `$schema` | Optional JSON-schema URL. |
| `title "<text>"` | `metadata.title` | Required — a file without a title is refused. Keep it to 120 characters: longer still parses, but the checkers raise a review note, since the title becomes the export filename too. |
| `description "<text>"` | `metadata.description` | Optional. |
| `owner "<text>"` | `metadata.owner` | Optional. |
| `direction tb\|lr` | `direction` | Optional; the default layout direction for every diagram that does not set its own. Omitted means `tb` — top-down, as every document laid out before this line existed. `lr` runs layers along the long axis and folds a long flow into bands, so a deep chain lands near the shape of a screen instead of a column. Only affects nodes whose position the text omits. |
| `tags #a #b` | `metadata.tags` | At least one tag; quote odd names: #"needs review". |
| `created <timestamp>` | `metadata.createdAt` | Defaults to the fixed sentinel 1970-01-01T00:00:00Z when omitted. |
| `updated <timestamp>` | `metadata.updatedAt` | Same default sentinel as created. |
| `reviewed <timestamp>` | `metadata.lastReviewedAt` | Optional. |
| `tagcolor <tag> "<colour>"` | `metadata.tagColors` | One line per tag; repeat for more tags. |
| `customicon <slug> "<name>" "<svg>"` | `metadata.customIcons` | One line per icon; the SVG is a JSON string, so quotes escape. |
| `generator "<name>" "<version>"` | `metadata.generator` | Optional tool fingerprint. |
| `root <diagram-id>` | `rootDiagramId` | May be omitted when exactly one parentless @context diagram exists — it is then the root. |

Every header line at once:

```
archlab 1.0
schema "https://arch-lab.dev/schema/v1/diagram.schema.json"
title "ShopFlow Platform"
description "Customer-facing commerce platform."
owner "Platform Team"
tags #commerce #payments
created 2026-07-01T00:00:00Z
updated 2026-07-27T00:00:00Z
reviewed 2026-07-20T00:00:00Z
tagcolor payments "#e11d48"
customicon warehouse "Warehouse" "<svg viewBox=\"0 0 24 24\"/>"
generator "arch-lab" "0.1.0"
root ctx-root

@context ctx-root "ShopFlow Platform"
  customer:person "Customer"
```

## Diagrams

`@context | @container | @component | @code <id> ["Title"]
[owner=<node>] [in=<diagram>] [direction=tb|lr]`.

- The title may be omitted when it equals the owner node's name.
- `owner=<node>` is `ownerNodeId`; `in=<diagram>` is `parentDiagramId`.
- `direction=tb|lr` sets THIS diagram's layout direction, overriding the
  file's `direction` header line. Absent means the file's; a file that
  says nothing lays out `tb`, exactly as every document did before the
  field existed. It only moves nodes whose position the text OMITS — a
  hand-written `(x,y)` is honoured whichever way the layout runs.
  `lr` runs the layers along the long axis and FOLDS a long flow into
  bands, which is what keeps a deep chain from being drawn as a column
  three screens tall; a diagram already wider than it is deep is left
  top-down even under `lr`, because turning that sideways would make a
  column of it the other way. `validate_model` raises a review note
  naming the diagrams this would help, with both measured shapes.
- `in=` may be omitted when it equals the diagram containing the owner
  node; `in=null` forces a parentless diagram that still has an owner.
- Body lines at indent 2: `desc "…"` and `view <zoom> <x> <y>`.

```
archlab 1.0
title "ShopFlow Platform"

@context ctx-root "ShopFlow Platform"
  shop:system "ShopFlow Platform" >cnt-shop

@container cnt-shop "ShopFlow — Containers" owner=shop in=ctx-root
  desc "Deployable units inside the platform boundary."
  view 0.75 -120 64
  web:container "Web App"
```

## Frames (C4 boundaries)

A frame is C4's labelled grouping drawn BEHIND a set of elements —
"Internal", an AWS region, a trust boundary. One line each, at diagram
body depth, before the nodes:

```
frame internal "Internal"
frame storage "Data Layer" in=internal
```

Two rules do most of the work:

- A frame owns **no behaviour and no relationships**. It is never an
  endpoint of an edge; writing one as a source or target is an error.
- Membership lives on the NODE, as `in=<frame>`, and names the
  **innermost** frame only. A frame's own nesting is recorded once, on
  the frame's `in=`, so the two can never disagree.

A frame carries **no geometry**. Its rectangle is derived from the
bounding box of its members plus padding, so it cannot drift out of step
when an element moves — and a frame with no members has no rectangle and
is simply not drawn. An empty frame is still legal and still round-trips:
emptying one while editing is not a destructive act.

Frame ids are unique **within their diagram**, not file-wide, and a
frame may only nest inside another frame of the same diagram. Cycles are
rejected.

```
archlab 1.0
title "ShopFlow Platform"

@context ctx-root "ShopFlow Platform"
  shop:system "ShopFlow Platform" >cnt-shop

@container cnt-shop "ShopFlow — Containers" owner=shop
  frame internal "Internal"
  frame storage "Data Layer" in=internal
  web:container "Web App" in=internal
  orders:container "Orders Service" [Go 1.22] in=internal
  orders-db:database "Orders DB" [PostgreSQL 16] in=storage
  ext-pay:external "Payment Provider"

  web -> orders : "Submits the order"
  orders -> orders-db : "Reads and writes orders"
  orders -> ext-pay : "Authorises payment"
```

## Nodes

One line per node: `<id>:<type> "Name"` followed by attributes in any
order. Node types are checked against the diagram's level at parse
time.

| Keyword | JSON `type` | Legal at levels |
| --- | --- | --- |
| `person` | `person` | @context, @container |
| `system` | `softwareSystem` | @context |
| `external` | `externalSystem` | @context, @container, @component |
| `container` | `container` | @container |
| `database` | `database` | @container, @component |
| `queue` | `queue` | @container, @component |
| `component` | `component` | @component |
| `code` | `codeElement` | @code |

Attributes (canonical order shown):

| Attribute | Maps to | Notes |
| --- | --- | --- |
| `@slug` | `icon` | Icon slug. No marker: the model carries no iconSource. |
| `@slug! / @slug~` | `icon + iconSource` | "!" = explicit, "~" = inferred iconSource. |
| `[technology]` | `technology` | Free text up to "]". Quote when it contains one: ["odd ] tech"]. |
| `#tag / #"weird tag"` | `tags` | Repeat for more tags. |
| `>diagram-id` | `childDiagramId` | Drill-down to a child diagram declared in the same file. |
| `>null` | `childDiagramId: null` | An explicit null in the model (distinct from the key being absent). |
| `>>"file"` | `childRef` | Reference to another model file; mutually exclusive with >child. |
| `^diagram/node` | `externalRef` | Boundary placeholder for a node that lives in another diagram. The name is omitted here because it is derived from the referenced node; give one ("Shop (boundary)") only to override it locally. |
| `in=<frame>` | `frameId` | Puts the node inside a frame declared on the same diagram. Name the INNERMOST frame; nesting is recorded on the frame itself. |
| `pin / pin=false` | `pinned` | Bare pin means pinned: true. |
| `(x,y wxh)` | `position + size` | Omit it and the node gets a deterministic grid position and per-type default size. |
| `desc "…" (indent 4)` | `description` | A continuation line under the node, indented four spaces. |

A node line carrying everything:

```
archlab 1.0
title "Orders"

@context ctx-root "Orders"
  shop:system "Shop" >cnt-shop

@container cnt-shop owner=shop
  orders:container "Orders Service" @golang! [Go 1.22] #critical-path >cmp-orders pin (656,616 176x88)
    desc "Order lifecycle: create, pay, cancel, fulfil."

@component cmp-orders owner=orders
  api:component "HTTP API"
```

Icon slugs are a fixed vocabulary, and an unknown one never errors —
the node silently falls back to its type's generic icon — so never
guess a slug. Over MCP, `list_icons` searches the vocabulary by name,
slug or alias; an icon it lacks can be supplied by the document itself
with a `customicon` header line (see the header section).

## Edges

`<source> <arrow> <target>` plus attributes. Both endpoints must be
nodes of the SAME diagram.

| Arrow | Direction | Style |
| --- | --- | --- |
| `->` | forward | solid (no style key) |
| `<->` | bidirectional | solid (no style key) |
| `--` | none | solid (no style key) |
| `..>` | forward | dashed |
| `<..>` | bidirectional | dashed |
| `..` | none | dashed |

| Attribute | Maps to | Notes |
| --- | --- | --- |
| `: "label"` | `label` | The relationship's label. |
| `[technology]` | `technology` | Same quoting rule as on nodes. |
| `#tag` | `tags` | Repeat for more tags. |
| `~edge-id` | `realizes` | Traceability to the parent-level edge this one realizes. |
| `id=<edge-id>` | `id` | Omitted when the id is the conventional e-<source>-<target>. |
| `style=solid` | `style: "solid"` | Carries the rare explicit "style": "solid" — a plain solid arrow writes no style key at all. |
| `via (x,y) (x,y)` | `waypoints` | One or more routing points. |
| `! key : json (indent 4)` | `unknown fields` | Forward-compatible fields — see the ! lines section. |

```
archlab 1.0
title "Orders"

@context ctx-root "Orders"
  cust:person "Customer"
  shop:system "Shop" >cnt-shop

  cust -> shop : "Places orders" [HTTPS]

@container cnt-shop owner=shop
  web:container "Web App"
  db:database "Orders DB"

  web -> db : "Reads and writes orders" [SQL/TCP (pgx)] #system-of-record ~e-cust-shop id=e-ord-db via (640,700) (600,760)
```

## Paths (authored walks)

A path is an ordered walk through ONE diagram that a reader steps
through beat by beat. It is a pure overlay: the viewer dims everything
off the walk and lights the current beat, and nothing about the model
changes. Paths are written last in a diagram, after the edges:

```
path send "Send email path"
  beat "Callers reach the service only through the gateway"
    caller -> gateway -> service
  beat "Requests are queued and consumed"
    service -> queue -> consumer
    consumer -> provider ~e-consumer-provider
```

The shape, exactly:

- `path <id> "Title"` at diagram body depth (indent 2). Ids are
  unique within their diagram.
- `beat "One sentence"` at indent 4. At least one per path. The
  sentence is the caption the reader is shown; there is no second
  prose slot, because a beat with words and no elements would be a
  caption card floating over the drawing.
- Chain lines at indent 6, at least one per beat: `a -> b -> c`. A
  beat may carry several, and its elements are the union of them, so a
  branching step is one beat, not two.

**The arrow orders the telling, not the traffic.** Only `->` is legal
in a chain, and a hop matches every relationship joining its pair in
EITHER direction — a request and its response point opposite ways, and
a walk has to be able to go against an arrow. Where two relationships
join one pair the hop lights both; append `~<edge-id>` to the line to
pin its last hop to one of them.

Every id a beat names must exist on the same diagram, and every hop
must be joined by a relationship that is actually written down. Both
are parse errors rather than silent omissions: a walk that lights the
wrong thing is worse than one that refuses to load.

Paths keep the order they were written in — it is the order the reader
walks and the order the menu offers — so they are never sorted by id
the way frames, nodes and edges are.

## Unknown & forward-compatible fields (`!` lines)

Any field the grammar has no sugar for — an unknown key from a newer
minor version, or a known optional key carrying an unexpected shape —
becomes a `!` escape line, valid at every scope. Both the JSON value
and the key's position (via the `after` anchor) survive a round trip.

```
archlab 1.0
title "Forward compatible"
! meta.x-review after updatedAt : {"cycle":30}
! x-pipeline : {"stage":"prod"}

@context ctx-root "Forward compatible"
  ! x-diagram-flag : true
  api:system "API"
    ! x-node-meta after name : [1,2]
```

Bare path segments match `[A-Za-z0-9_-]+`; anything else is
JSON-quoted. Ids, tags and icons follow the same rule everywhere
(`"weird id":person …`).

## Sequence diagrams (a second document kind)

`.alab` describes TWO kinds of document, and the first line decides
which. Everything above is the C4 model grammar, opened by
`archlab 1.0`. A sequence diagram — participants and messages over
time — is opened by **`archlab 1.0 sequence`** and read by a different
parser. The two never mix: a C4 model has no messages, a sequence
document has no `@context`/`@container` levels, and feeding one to the
other's tool fails on line 1. Validate these with the
`validate_sequence` tool, not `validate_model`.

The body lives under a single `@sequence` block: participants first,
then the flow, in order.

```
archlab 1.0 sequence
title "Checkout"

@sequence
  autonumber
  cust:actor "Customer" @person
  web "Storefront" @nextjs [Next.js]
  api:participant "Order API" @golang [Go]

  cust -> web : "Clicks Place order"
  web ->+ api : "POST /orders" [HTTPS]
  api ..>- web : "201 Created"
```

Facts that are easy to get wrong:

- The label is introduced by **` : `** — `a -> b : "Label"`. A message
  without it does not parse.
- **An arrow is two independent choices**, not one name: a LINE STYLE
  (solid or dotted) and a HEAD STYLE (none, arrowhead, cross, open, or
  a head at each end). Ten arrows, one token each, and each converts
  to and from its Mermaid equivalent losslessly in both directions.
  The line says which way the step runs — `solid` is a call outward, `dotted` is a return or a callback — and the head says what happens when it arrives:

| Arrow | Line | Head | The head means | Mermaid |
| --- | --- | --- | --- | --- |
| `--` | solid | none | no direction claimed | `->` |
| `->` | solid | arrow | the sender waits on it | `->>` |
| `x>` | solid | cross | lost — it never arrives | `-x` |
| `~>` | solid | open | fire and forget | `-)` |
| `<->` | solid | bidirectional | both ways at once | `<<->>` |
| `..` | dotted | none | no direction claimed | `-->` |
| `..>` | dotted | arrow | the sender waits on it | `-->>` |
| `..x>` | dotted | cross | lost — it never arrives | `--x` |
| `..~>` | dotted | open | fire and forget | `--)` |
| `<..>` | dotted | bidirectional | both ways at once | `<<-->>` |

- **Activation rides the arrow**, not a separate line: `->+` opens the
  receiver's bar, `..>-` closes the sender's. So a call-and-return pair
  is `web ->+ api` … `api ..>- web`.
- A participant's kind is optional — `web "Storefront"` is a
  participant; `cust:actor "Customer"` draws the stick figure. Only
  `actor` and `participant` exist.
- `[Technology]` works on participants and on messages, same as C4.
- **A message takes a `desc "…"` continuation**, indented two spaces
  under it, exactly like a participant's. The label is the TITLE drawn
  on the arrow and should stay short; the `desc` holds the endpoint,
  payload or caveat, and the viewer shows it when the message is
  clicked. Prefer `"Call login API"` + a `desc` naming
  `POST /api/v1/basic/verify` over one long label. Notes take no
  `desc` — a note is already its own text.
- **A `desc` is a JSON string, so `\n` gives it several lines**, and the
  viewer renders it as a monospace block that keeps them. Write a
  request as method+path, then the body, then one line per status code
  — not as a paragraph. The escape keeps the source one physical line,
  so the file stays canonical. It can hold a whole runnable `curl`:
  escape `"` as `\"` and `\` as `\\`, or just JSON-stringify the
  command and paste the result. Budget: 500 characters.
- `autonumber` on its own line numbers every message.
- A message from a participant to itself draws a self-loop.

```
archlab 1.0 sequence
title "Message kinds"

@sequence
  web "Storefront"
  api:participant "Order API"
  queue:participant "Events" [Kafka]

  web -> api : "Call login API" [HTTPS]
    desc "POST /api/v1/basic/verify\nbody { email, password }\n200 → { token } (15 min)\n401 → bad credentials"
  api -> api : "Validates the cart"
  api ~> queue : "order.created" [Avro]
  queue ..> api : "ack"
  api x> queue : "stale.event (dropped)"
  api <-> queue : "Health handshake"
  queue ..~> api : "replay.offer"
  web -- api : "Shares a session cookie"
  note right api : "Retries are idempotent"
  note over api queue : "Both sides are at-least-once"
```

A `desc` carrying a complete request — this is what the escaping looks
like in practice, and it round-trips byte for byte:

```
archlab 1.0 sequence
title "Order intake"

@sequence
  web "Storefront" [Next.js]
  api:participant "Order API" [Go]

  web ->+ api : "Place the order" [HTTPS]
    desc "curl https://api.shopflow.dev/v1/orders \\\n  --request POST \\\n  --header 'Content-Type: application/json' \\\n  --header 'Authorization: Bearer $SHOPFLOW_TOKEN' \\\n  --data '{\n    \"cart_id\": \"cart_8f21c3\",\n    \"address_id\": 4102,\n    \"coupon\": null\n  }'\n\n201 → { order_id }   409 → the cart changed under us"
  api ..>- web : "201 Created"
```

**Choosing between a `desc` and a `note`.** They are not
interchangeable, and picking wrong is the main way a valid document
renders badly:

- `desc` — belongs to ONE message, hidden until a reader clicks that
  message, and **never measured**, so any amount of detail costs no
  width. Use it for the endpoint, the payload, the status codes, the
  header names: everything true of that one step.
- `note` — always visible, wraps to a box, and costs VERTICAL space in
  the flow. Use it for what is true across several steps: an ordering
  hazard, a trap in the API, an invariant. A long note is fine — notes
  wrap — so write one note, not three.

**Keep labels shorter than their arrow.** Column gaps are capped, so a
label much wider than its own arrow is drawn OVER the neighbouring
lifelines. `validate_sequence` reports how many labels do this and
which are worst; the fix is always the same — verb phrase on the wire,
detail in the `desc`.

**Fragments nest by INDENTATION and there is no `end` keyword** — this
is the single biggest difference from Mermaid, whose `end` lines have
no equivalent here. `alt`/`else`, `par`/`and`, `critical`/`option`,
`opt`, `loop` and `break` open a block; what belongs to it is what is
indented under it.

```
archlab 1.0 sequence
title "Branching"

@sequence
  web "Storefront"
  api:participant "Order API"
  pay:participant "Payments"

  alt "card accepted"
    api ->+ pay : "Create charge" [REST]
    pay ..>- api : "charge.succeeded"
    par "receipt"
      api ~> web : "Emails the receipt"
    and "audit"
      api -> api : "Writes audit row"
  else "card declined"
    api ..> web : "402 Payment Required"
  opt "first purchase"
    web -> web : "Shows onboarding tips"
```

**Grouping without control flow.** `box` brackets a contiguous run of
lifelines and takes its members as the participant lines nested INSIDE
it; `rect` highlights a run of steps. Both take an optional
`tint=#rrggbb` (or `rgb(…)`, or a common colour name — all normalised
to one spelling). Neither changes what happens; both survive a Mermaid
import unchanged.

```
archlab 1.0 sequence
title "Grouped and highlighted"

@sequence
  box "Front of house" tint=#bfdfff
    cust:actor "Customer"
    web "Storefront"
  box "Payments" tint=#ffe4e1
    pay:participant "Payments"
    ledger:participant "Ledger"

  cust -> web : "Places the order"
  rect tint=#bfdfff
    web -> pay : "Create charge" [REST]
    pay -> ledger : "Post entry"
  critical "Capture the funds"
    pay ..> web : "charge.succeeded"
  option "gateway timeout"
    pay ..> web : "retry scheduled"
  break "card declined"
    pay ..> web : "402 Payment Required"
```

Mermaid `sequenceDiagram` code can be imported instead of authored —
pass it to `validate_sequence` or `format_sequence` and it is detected
automatically. That import is ONE-WAY and lossy; the response names
what was dropped.

## What errors look like

A parse is all-or-nothing and every failure is located:
`line <n>, column <n>: <message>`. Real examples, with the parser's
exact output:

**A node type the format does not know**

```
archlab 1.0
title "Broken"

@context ctx-root "Broken"
  api:blob "API"
```

→ `line 5, column 7: "blob" is not a node type — expected person, system, external, container, database, queue, component or code`

**A node type that is real, but illegal at this level**

```
archlab 1.0
title "Broken"

@context ctx-root "Broken"
  db:database "Orders DB"
```

→ `line 5, column 6: "database" is not valid at level "context" — valid types here: person, system, external`

**Indentation that is not 0, 2 or 4 spaces**

```
archlab 1.0
title "Broken"

@context ctx-root "Broken"
   api:person "API"
```

→ `line 5, column 4: inconsistent indentation of 3 spaces — expected 0 (header or "@" diagram), 2 (diagram body), 4 (node/edge continuation or "beat") or 6 (a beat's chain line)`

**An edge whose endpoint is not a node in this diagram**

```
archlab 1.0
title "Broken"

@context ctx-root "Broken"
  cust:person "Customer"

  cust -> ghost : "Uses"
```

→ `line 7, column 11: the target "ghost" does not resolve to a node in this diagram`

**A trailing comment — comments must be full lines**

```
archlab 1.0
title "Broken" // not allowed here
```

→ `line 2, column 16: unexpected text after the "title" line`

**A string that is never closed**

```
archlab 1.0
title "Broken"

@context ctx-root "Broken
```

→ `line 4, column 19: the string for the diagram title opened here is never closed — expected a closing '"'`

**A file without a title**

```
archlab 1.0

@context ctx-root "Untitled"
```

→ `line 1, column 1: the file has no title — add a line like: title "My System"`

---

*Generated from arch-lab's syntax reference — do not edit by hand.*
*Regenerate with `pnpm build:skill`.*
