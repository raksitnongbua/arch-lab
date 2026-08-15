# arch-lab

A **local-first workspace for architecture documentation**: C4 model diagrams
and UML-style sequence diagrams, written as plain text you own. No account, no
upload — a document is a file, and git is the collaboration layer.

## What works today

| Area                                  | State                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **C4 viewer**                         | Read-only, with drill-down from Context to Code. SVG/PNG export, or every diagram as one `.zip`. |
| **C4 editor**                         | Nodes, relationships, drill-down, grouping boundaries. Gated by `EDITOR_ENABLED`.                |
| **Sequence diagrams**                 | View and author. Click a message, participant or fragment to spotlight its flow.                 |
| **Playground** (`/view`)              | One pane that takes any supported text, detects the kind, and renders it.                        |
| **`.alab` ⇄ JSON**                    | Lossless both ways.                                                                              |
| **Mermaid import**                    | C4 and `sequenceDiagram`, one-way and lossy — the app states what each drops.                    |
| **MCP server** (`/api/mcp`)           | Beta. Read-only tools for agents.                                                                |
| **Data dictionary, network diagrams** | Planned. Not built.                                                                              |

## Routes

| Route                        | What it is                                                                                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                          | Landing page, written for someone who has not seen this before: what it is, the two things it does that a drawing tool does not (present, and be written by an agent), and how to start. The hero CTA opens `/view/sequence` seeded with a worked flow.                 |
| `/demo`                      | Example index, sectioned by document kind: C4 models and sequence diagrams, each card's numbers counted from the parsed document rather than hand-written.                                                                                                              |
| `/view/[modelId]`            | Read-only viewer for a registered model (`/view/shopflow`, `/view/order-shop`). Invalid JSON is reported with the validator's JSON-path messages instead of a blank canvas.                                                                                             |
| `/view`                      | **The playground.** One pane that takes any supported text — C4 `.alab`, sequence `.alab`, arch-lab JSON, Mermaid C4 or a Mermaid `sequenceDiagram` — detects it and renders the matching diagram. Also where any `/view#m=…` share link lands.                         |
| `/view/c4`                   | The same playground, seeded with a C4 example. Kept as its own route so existing `#m=…` share links, the sitemap and the OG image keep working.                                                                                                                         |
| `/view/seq`                  | The sequence playground, and **the route every sequence share link is minted against** — the short path spends fewer URL characters so more are left for the payload. `/view/sequence` forwards here with the fragment intact, for links made before the alias existed. |
| `/view/sequence/[exampleId]` | A registered example sequence document, read-only (`/view/sequence/checkout`, `/view/sequence/password-reset`). Statically generated from the example registry.                                                                                                         |
| `/syntax`                    | The `.alab` syntax reference — every construct with working examples; each snippet on the page is verified against the real parser by `pnpm check:syntax-docs`.                                                                                                         |
| `/validate`                  | The model checker: paste `.alab`, arch-lab JSON or Mermaid C4 and get a located verdict from the real parsers, plus C4 review notes on a valid model (the rules live in `features/validate/lib/advisories.ts`, each citing its source).                                 |
| `/mcp`                       | How to connect an AI agent (**beta**). Every tool it documents is read from the same catalogue the server registers from, so the page cannot describe a server that does not exist.                                                                                     |
| `/api/mcp`                   | The MCP server itself (**beta**; Streamable HTTP, stateless, unauthenticated, read-only). See `src/features/mcp/README.md`.                                                                                                                                             |
| `/editor`                    | The canvas editor: palette, inspector, drill-down, and grouping boundaries. Gated by `EDITOR_ENABLED`.                                                                                                                                                                  |

## The two model formats

`.alab` is the text format this tool defines — human-readable, diff-friendly,
and lossless in both directions against `.archlab.json`, the same model as
JSON. Both carry C4 models and sequence diagrams.

The grammar is not documented here on purpose: [`/syntax`](src/app/syntax)
renders it with every example verified against the real parser by
`pnpm check:syntax-docs`, so it cannot drift. `skills/alab/SKILL.md` is
generated from the same source.

Mermaid `C4Context`/`C4Container`/`C4Component` and `sequenceDiagram` are
imported and exported; each direction is lossy in its own way and says so.

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

| Script           | What it does               |
| ---------------- | -------------------------- |
| `pnpm dev`       | Dev server on :3000        |
| `pnpm build`     | Production build           |
| `pnpm start`     | Serve the production build |
| `pnpm lint`      | ESLint                     |
| `pnpm typecheck` | `tsc --noEmit`, strict     |
| `pnpm format`    | Prettier, writing in place |
| `pnpm check:*`   | 31 scripts — see below     |

### The `check:*` scripts

There are **31**, and they are the project's safety net — run them before
touching a format, a converter or a layout. They load the **real** library code
from `src/` through Node's type stripping, so they exercise what the app ships
rather than a copy of it.

Each script's own header comment says what it proves and, usually, which
shipped bug bought each rule. That is the documentation; a paraphrase here
would be a second copy to keep true. `node scripts/<name>-check.mjs` runs one
directly.

A few are worth knowing by name:

- `check:roundtrip`, `check:archtext`, `check:sequence` — the persistence
  guarantee: open a file, change nothing, save, and the bytes are identical.
- `check:icon-contrast` — renders every icon on a light and a dark canvas and
  fails any that cannot be seen. Needs `librsvg`; skips with a note without it.
- `check:themes` — every theme complete, and its contrast ratios measured.
- `check:mcp` — the registered tools and the tools `/mcp` documents match, both
  ways.

## Project structure

Features own their code and are consumed through their `index.ts` barrel;
`src/lib` and `src/components/ui` hold what two or more features share. The
conventions that matter are in [`.claude/rules/`](.claude/rules) — `comments.md`
(this codebase comments unusually heavily, and deliberately) and `dry.md`.

```
src/
  app/          App Router: routes, sitemap, robots, llms.txt, /api/mcp
  features/     archtext · editor · mcp · mermaid · playground · sequence
                syntax-docs · validate · viewer · marketing
  components/   ui/ primitives, layout/ chrome, share/ hand-offs
  lib/          cross-feature helpers and constants
scripts/        the check:* suite
skills/alab/    SKILL.md, generated by pnpm build:skill
editors/vscode/ the .alab grammar
```

## Themes

Four: `light`, `dark` (the default), `midnight` (true black) and `contrast`.
Adding one is a list entry, a CSS block and a picker label — the extension
point in [`globals.css`](src/app/globals.css) spells it out, and
`pnpm check:themes` fails if a step is missed or a palette is illegible.

## Enabling the editor

`EDITOR_ENABLED` in [`src/lib/constants.ts`](src/lib/constants.ts) is `true`.
Turning it off means flipping the flag **and** replacing the `EditorShell`
import in `src/app/editor/page.tsx` — that import is the real gate, because it
is what pulls React Flow and the editor store into the bundle. A conditional
render would ship the code while the flag claimed otherwise. Everything else
reads the flag.

## Known limitations

- **Mermaid import is one-way and lossy.** Boundaries become tags rather than
  frames; some Context-level shapes lose their styling.
- **Default layout is basic.** Text without explicit coordinates gets a
  deterministic grid; dense diagrams can crowd edge labels. Add `(x,y w×h)`
  when it matters.
- **The data dictionary and network diagrams are planned**, not built.

## Third-party assets

Icons come from two places and nowhere else. Product marks are from
[`thesvg`](https://www.npmjs.com/package/thesvg) (package code MIT); the marks
themselves remain the trademarks and property of their owners and are used
nominatively — to label what a container runs — and embedded unmodified. Some
upstream licences are no-derivatives, which is why the registry never
recolours a mark; where a brand publishes no monochrome version one is
produced from its own artwork, but only where the licence clearly permits a
derivative. Per-brand terms are exported by each icon module (`license`,
`url`) and recorded in the [thesvg repository](https://github.com/glincker/thesvg).

Icons for things with no logo — a database, a queue, a person, an API — are
from [lucide](https://lucide.dev), which also draws the application's own
interface, so a diagram and the chrome around it share one visual language.

Diagrams can be drawn with icons in one ink or in brand colours: a reader
preference, not a document property, toggled beside the zoom control. Four
marks stay coloured in mono mode because their licences permit neither an
adopted nor a derived monochrome version. `pnpm check:icon-contrast` renders
every icon on a light and a dark canvas and fails if any cannot be seen.
