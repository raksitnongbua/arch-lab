# The arch-lab MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server at
`/api/mcp`, so an AI agent can read, check and convert `.alab` models. Also
documents itself at `/mcp`.

**Status: beta.** `MCP_STATUS_LABEL` and `MCP_BETA_NOTICE` in `catalog.ts` are
the single source of that claim — the navbar pill, the `/mcp` page callout and
the server's `initialize` instructions all read them, so the marker cannot be
true in one place and stale in another. The endpoint URL and the `.alab` format
are stable; tool names, arguments and response wording are not yet. Promoting
out of beta is an edit to those two constants (and deleting the check that
asserts the label).

## What it is for — and what it is not

An agent already has file tools, and `.alab` is a text format precisely so it
can edit one directly. This server exists for the two things it cannot do
alone:

1. **Know the grammar exactly** — `get_syntax_reference`, generated from
   parser-verified examples.
2. **Get the real parser's verdict** — `validate_model`, with line, column and
   the offending source line.

There is deliberately **no mutation API** (`add_node`, `set_edge`, …). That
would duplicate the grammar in a second place and drift from it. The agent
writes text; the server judges it.

## Two entry points

| Import                   | Contains                                       | Safe in a client bundle       |
| ------------------------ | ---------------------------------------------- | ----------------------------- |
| `@/features/mcp`         | `registerArchLabMcp`, limits, origin           | **No** — pulls in the MCP SDK |
| `@/features/mcp/catalog` | tool/resource/prompt metadata, connect recipes | Yes — pure data               |

Only `src/app/api/mcp/route.ts` imports the first. The `/mcp` page imports the
second (plus `components/mcp-guide` directly, for the same reason).

## Layout

```
catalog.ts                  # tool names + prose — ONE source of truth
index.ts                    # server surface (SDK)
server.ts                   # the only SDK-aware module: catalogue -> registration
content/syntax-sections.ts  # the grammar, generated from syntax-docs snippets
lib/limits.ts               # MAX_SOURCE_CHARS — the whole abuse story
lib/origin.ts               # which origin share links point at
lib/read.ts                 # the single door: text -> model, via checkSource
lib/render.ts               # result envelopes + compiler-style error quoting
tools/*.ts                  # plain functions: args -> text. No SDK types.
components/                 # the /mcp page UI (client-safe)
```

## Design decisions, and why

**One reader, never a second grammar.** Every tool funnels through
`lib/read.ts` → `checkSource` → the same `parseArchText` /
`deserializeModel` / `parseMermaidC4` the editor and viewer use. So "the MCP
server accepted it" means "a saved file, a share link and the two-pane editor
accept it too". Nothing here can drift from the app.

**Tools return text, not SDK types.** `tools/*.ts` are plain functions with no
protocol dependency, which is what lets `scripts/mcp-check.mjs` exercise all of
them without booting a server.

**Stateless.** No sessions, no Redis, SSE disabled. Every call is a pure
function of its arguments, which is what makes serverless deployment correct
rather than merely convenient.

**Unauthenticated.** The endpoint stores nothing and holds no secrets. The one
real abuse surface is a pathological payload reaching the recursive `.alab`
parser, which `MAX_SOURCE_CHARS` caps before parsing starts.

**Share links reuse the viewer's codec.** `create_share_link` calls the same
`encodeShareFragment` the Share button uses, so the model travels in the URL
fragment and is never uploaded — not even to this server, on open.

**The syntax reference is generated, never written.** Every example in
`content/syntax-sections.ts` comes from
`src/features/syntax-docs/content/snippets.ts`, which
`pnpm check:syntax-docs` pushes through the real parser. A reference with a
broken example is worse than none, especially for a caller that will believe
it.

## Deep imports, on purpose

`lib/read.ts` imports `@/features/validate/lib/check` rather than the
`validate` barrel, and `tools/examples.ts` imports
`@/features/viewer/service/model-service` rather than the `viewer` barrel. Both
barrels re-export React components; going through them would drag the
`Validator` and the whole canvas into the server graph for no reason. Same
precedent as `syntax-docs/components/code-block.tsx` importing
`@/features/viewer/share/codec` directly.

## Checks

`pnpm check:mcp` asserts:

- the tools `server.ts` registers and the tools `catalog.ts` documents match
  **exactly, both directions** — this is what keeps the `/mcp` page honest;
- every tool works over real input (valid `.alab`, a deliberately broken file,
  Mermaid C4, the bundled models);
- failures carry the parser's own line and column;
- a share link decodes back to the model that went into it;
- every generated syntax section renders, and its complete examples parse.

## Adding a tool

1. Write it in `tools/` as a function returning `McpTextResult`.
2. Add its entry to `MCP_TOOLS` in `catalog.ts` (name, title, description,
   args). The description is read by a model deciding whether to call it —
   write it for that audience.
3. Register it in `server.ts`, spreading `config(name)` and passing
   `inputSchema` **inline** (passing the schema through a helper widens it to
   `ZodRawShape` and every handler argument infers as `unknown`).
4. Add a case to `scripts/mcp-check.mjs`.

Step 2 is not optional: `check:mcp` fails on an unregistered or undocumented
tool, and the `/mcp` page renders from the catalogue.
