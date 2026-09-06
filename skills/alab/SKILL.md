---
name: alab
description: Write and edit arch-lab .alab architecture files (C4 model, sequence diagram, gantt chart, milestone timeline and lifecycle). Use whenever creating or modifying a .alab file — the format has significant indentation and order-free attributes, so writing it from memory produces plausible, invalid files.
---

# The .alab format

The `.alab` grammar for the C4 model, sequence diagram, gantt chart, milestone timeline and lifecycle,
generated from the same source the arch-lab MCP server serves and verified
against the real parser on every build.

**arch-lab draws 4 more notations this file does not cover** — the
flowchart, use-case diagram, ER diagram and data dictionary. That is deliberate rather than a
gap: their constructs are arrows and named rows, and one worked example teaches
them faster than a grammar would. Ask the MCP server's `get_example_model` for
one, or read a bundled document at https://arch-lab.dev/demo — every one is
parser-verified, which makes it the real reference for its grammar.

**Read the relevant section before writing `.alab`, not after.** The format
has significant indentation and order-free attributes; both are easy to guess
wrong in ways that look right.

**You do not need a server to write these files.** `.alab` is plain text —
use your own file tools. What this skill gives you is the grammar. What it
cannot give you is the parser's verdict on a file you have written: for that,
either connect the [arch-lab MCP server](https://arch-lab.dev/mcp) and call
`validate_model`, or paste the file into the validator at https://arch-lab.dev/validate.

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
real parser and reports the line, column and offending source line. Hand
it a document of another kind and it does not fail: it names the tool
that reads that kind and asks which picture was wanted. **Do not "fix"
line 1 of a document whose header names another kind** — the header names
the notation the rest of the document is written in, and changing it
converts nothing.

**This is not the whole format.** Everything in the sections below,
unless a section says otherwise, describes the C4 model grammar opened
by `archlab 1.0`. Four more notations have a section of their own here,
each opened by its own header word and read by its own parser:
`archlab 1.0 sequence`, `… gantt`, `… timeline` and `… lifecycle`. Each
has its own `validate_<kind>` tool; a document handed to the wrong one
fails on line 1.

arch-lab draws four more notations that this reference does NOT cover —
flowcharts, use-case diagrams, ER schemas and data dictionaries. That is
deliberate rather than a gap: their constructs are arrows and named
rows, and one worked example teaches them faster than a grammar would.
Fetch one with `list_example_models` and `get_example_model` — every
bundled document is parser-verified, which makes it the real reference
for its grammar.

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

## Which reference to open

**Read one row, not the table.** Each file below is the complete grammar
for one notation; you need the row matching the header line you are
writing, and nothing else. Open the errors file only when a parse fails.

| If | Read |
| --- | --- |
| you are writing `archlab 1.0` — systems, containers, components | [`reference/c4.md`](reference/c4.md) |
| you are writing `archlab 1.0 sequence` — participants and messages | [`reference/sequence.md`](reference/sequence.md) |
| you are writing `archlab 1.0 gantt` — durations and dependencies | [`reference/gantt.md`](reference/gantt.md) |
| you are writing `archlab 1.0 timeline` — what happened, and when | [`reference/timeline.md`](reference/timeline.md) |
| you are writing `archlab 1.0 lifecycle` — one thing and its states | [`reference/lifecycle.md`](reference/lifecycle.md) |
| the parser rejected your file and you want to read its message | [`reference/errors.md`](reference/errors.md) |

---

*Generated from arch-lab's syntax reference — do not edit by hand.*
*Regenerate with `pnpm build:skill`.*
