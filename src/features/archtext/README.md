# arch-lab text format (`.alab`)

A Mermaid-like, human-editable text format that is a **lossless,
bidirectional** representation of the arch-lab JSON model. Text and JSON are
two views of one model: edit either, get the identical diagram, nothing
dropped.

- `parseArchText(source): ArchLabFile` — throws `ArchTextParseError`
  (`line <n>, column <n>: …`) on malformed input; all-or-nothing.
- `serializeArchText(file): string` — deterministic and canonical; the same
  model always yields byte-identical text.
- File extension: **`.alab`**.

Round-trip guarantees (proved by `scripts/archtext-check.mjs`):

- canonical text → model → text is **byte-identical**;
- JSON → text → JSON (via the editor's `io/deserialize.ts` /
  `io/serialize.ts`) is **byte-identical**, including unknown
  forward-compatible fields in their original key positions.

## Structure

Line-structured with significant indentation (spaces only):

| Indent | Meaning                                                                |
| ------ | ---------------------------------------------------------------------- |
| 0      | header lines, `@level` diagram headers                                 |
| 2      | diagram body: `desc`, `view`, `!`, frame lines, node lines, edge lines |
| 4      | node/edge continuations: `desc`, `!`                                   |

Blank lines are ignored; `//` starts a full-line comment (comments are the
one thing not preserved by a round trip — they are text-only sugar, not
model data).

## Header

```
archlab 1.0                                   // file version, must be line 1
schema "https://arch-lab.dev/schema/v1/diagram.schema.json"
title "ShopFlow Platform"                      // metadata.title (required)
description "Customer-facing commerce platform."
owner "Platform Team"
tags #commerce #payments                       // metadata.tags
created 2026-07-01T00:00:00Z                   // metadata.createdAt
updated 2026-07-27T00:00:00Z                   // metadata.updatedAt
reviewed 2026-07-20T00:00:00Z                  // metadata.lastReviewedAt
tagcolor payments "#e11d48"                    // metadata.tagColors, one per line
customicon warehouse "Warehouse" "<svg viewBox=\"0 0 24 24\"/>"
generator "arch-lab" "0.1.0"
root d-ctx-root                                // rootDiagramId (see defaults)
```

`created`/`updated` default to the fixed sentinel `1970-01-01T00:00:00Z`
when omitted. The `root` line may be omitted when exactly one parentless
`@context` diagram exists — it is then the root.

## Diagrams

```
@container d-cnt-shopflow "ShopFlow — Containers" owner=shopflow-platform in=d-ctx-root
  desc "Deployable units inside the platform boundary."
  view 0.75 -120 64                            // viewport: zoom x y
```

- `@context | @container | @component | @code` — the C4 level.
- The title may be omitted when it equals the owner node's name.
- `owner=<node>` — `ownerNodeId`; `in=<diagram>` — `parentDiagramId`.
  `in=` may be omitted when it equals the diagram containing the owner node;
  `in=null` forces a parent-less diagram that has an owner.

## Nodes

```
  orders-service:container "Orders Service" @golang! [Go 1.22] #critical-path >d-cmp-orders pin (656,616 176x88)
    desc "Order lifecycle: create, pay, cancel, fulfil."
```

One line per node: `<id>:<type> "Name"` then attributes in any order
(canonical order shown).

The name may be omitted on a node carrying `^diagram/node`, where it is derived
from the node being referenced — the same rule the diagram title follows when it
equals its owner node's name:

```
  userRef:person ^d-ctx-root/user (40,40 176x88)
  userRef:person "Local override" ^d-ctx-root/user (40,40 176x88)
```

Both forms are valid. The writer omits the name exactly when it equals the
referenced node's, so a round-trip stays byte-identical either way, and an
explicitly different name is kept — a reference is a pointer, not a rename.
Resolution follows placeholder chains; a reference that does not resolve, or
whose chain is circular, is an error naming the line. Omitting the name on a node
with **no** `^ref` is always an error.

In the JSON model the name is always present: optional in the text, derived into
the model, so every consumer reads `node.name` unconditionally.

| Attribute                           | Field                                     |
| ----------------------------------- | ----------------------------------------- |
| `@slug` / `@slug!` / `@slug~`       | `icon` (+ `iconSource` explicit/inferred) |
| `[Go 1.22]` or `["weird ] tech"]`   | `technology`                              |
| `#tag` or `#"weird tag"`            | `tags`                                    |
| `>d-cmp-orders` / `>null`           | `childDiagramId` (drill-down)             |
| `>>"./billing.archlab.json"`        | `childRef`                                |
| `^d-cnt-shopflow/session-cache`     | `externalRef` (boundary placeholder)      |
| `in=internal`                       | `frameId` (the frame this node sits in)   |
| `pin` / `pin=false`                 | `pinned`                                  |
| `(x,y w×h)` e.g. `(656,616 176x88)` | `position` + `size`                       |
| `desc "…"` continuation             | `description`                             |

Node types: `person`, `system` (softwareSystem), `external`
(externalSystem), `container`, `database`, `queue`, `component`, `code`
(codeElement) — checked against `VALID_NODE_TYPES_BY_LEVEL` at parse time.

Geometry may be omitted. The default position comes from a deterministic
layered auto-layout over the diagram's own relationships — sources on top,
each target at least one row below, rows centred under their parents — plus a
per-type default size. Parser and serializer compute it from the same inputs
(sorted node ids + the canonical edge set), so terse files stay lossless and
an agent can write pure structure and still get a readable diagram.

## Frames

A frame is a labelled rectangle drawn _behind_ a group of nodes — the C4
boundary ("Internal", "AWS Region", a trust boundary). Note the name: in this
codebase "boundary" already means an `externalRef` placeholder, a node borrowed
from an ancestor diagram, so the grouping construct is named for what it draws.

```
@container d-cnt-shopflow "ShopFlow — Containers" owner=shopflow-platform
  frame internal "Internal"
  frame storage "Data Layer" in=internal
  orders-service:container "Orders Service" [Go 1.22] in=internal (320,48 176x88)
  orders-db:database "Orders DB" [PostgreSQL 16] in=storage (320,240 176x88)
```

- `frame <id> "Label"` declares one; ids are unique **within the diagram**, not
  file-wide like node ids — a frame is scoped to the canvas it is drawn on, and
  forcing "Internal" to be unique across every diagram would be a rule authors
  trip over for no benefit.
- `in=<frame>` nests one frame in another; `in=null` states top level
  explicitly. Absent, `in=null` and an id are three distinct values and all
  three survive the round trip. Cycles are refused with a line and column.
- Membership is declared on the **node**, as `in=<frame>`, naming the
  _innermost_ frame it sits in. One direction only: a list on the frame as well
  would let the two disagree, and node-side membership is what the Mermaid
  importer already produces (`boundary:<id>` tags), so imported boundaries
  convert without reshaping.
- Frame lines come before node lines, so a reader meets the boundary before its
  members.

Frames carry **no geometry**. The rectangle is derived from the bounding box of
its members plus padding, the same reasoning as omitted node geometry: a stored
rect drifts out of step the moment a member moves, and "the frame is wrong" is
a worse failure than "the frame is auto-sized". A frame with no members has no
rectangle and is not drawn — it is kept rather than dropped, so emptying one
while editing is not destructive.

## Edges

```
  orders-service <-> orders-db : "Reads and writes orders" [SQL/TCP (pgx)] #system-of-record ~e-shopflow-db id=e-ord-db via (640,700) (600,760)
```

- Arrows: `->` forward, `<->` bidirectional, `--` none; dashed variants
  `..>`, `<..>`, `..`. The rare explicit `"style": "solid"` is written as a
  `style=solid` attribute so absent-vs-solid survives.
- `: "label"`, `[technology]`, `#tags`, `~realizes` (traceability to the
  parent-level edge), `id=` (omitted when the id is the conventional
  `e-<source>-<target>`), `via (x,y) (x,y)` (waypoints).
- Endpoints must be nodes of the same diagram (checked with line/column).

## Unknown & forward-compatible fields — `!` lines

Any field the grammar has no sugar for (unknown keys from newer minor
versions, or known optional keys carrying an unexpected shape) is a `!`
escape line, valid at every scope. The JSON value and the key's position
(via the `after` anchor) both survive the round trip:

```
! x-pipeline : {"stage":"prod"}                 // top-level unknown key
! meta.x-review after updatedAt : {"cycle":30}  // metadata unknown key
  ! x-diagram-flag : true                       // diagram scope (indent 2)
  ! viewport.x-lock after zoom : true
    ! x-node-meta after technology : [1,2]      // node scope (indent 4)
    ! position.x-anchor after y : "se"
    ! waypoints.0.x-kind after y : "bend"       // edge waypoint scope
```

Bare path segments match `[A-Za-z0-9_-]+`; anything else is JSON-quoted.
Ids, tags, icons follow the same rule everywhere (`"weird id":person …`).

## Determinism & canonical form

The serializer emits: header lines in fixed order, diagrams in model order,
`desc`/`view`/`!` lines first in each body, nodes before edges with one
blank line between the blocks, node/edge arrays in model order, tags sorted
lexically, numbers exactly as canonical JSON prints them.
