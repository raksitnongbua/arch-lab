# arch-flow

A **local-first workspace for architecture documentation**. C4 model diagrams
today, with sequence diagrams, a data dictionary, and network diagrams planned.
Everything saves as plain, diff-reviewable JSON you own — no account, no
server, nothing leaves the machine. Git is the collaboration layer.

Product specs live in [`docs/product/`](docs/product/) — `vision.md`,
`user-stories.md`, `data-model.md`, `roadmap.md`, and `dev-handoff.md`. Read
them before making product decisions.

## Status

Be precise about what this repo is right now:

| Area                                                     | State                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Read-only C4 viewer**                                  | Works today. Bundled example models (`shopflow`, `order-shop`) render with drill-down: click a node to zoom from Context down to Code, Escape to step back out. Diagrams export as SVG or PNG (rasterised at 2×).                                                                              |
| **View-mode playground** (`/view/new`)                   | Works today. A two-pane live editor for the two text formats — `.aft` on one side, `.archflow.json` on the other; editing either regenerates the other and re-renders the diagram. Mermaid C4 imports one-way. Copy or download either format. Everything stays in the browser.                |
| **`.aft` ⇄ JSON conversion**                             | Works today, lossless in both directions — see [Model formats](#the-two-model-formats).                                                                                                                                                                                                        |
| **Mermaid C4 import**                                    | Works today, one-way and lossy — see [Mermaid C4 import](#mermaid-c4-import).                                                                                                                                                                                                                  |
| **C4 editor**                                            | Feature-complete in the codebase but **gated off for this release** behind `EDITOR_ENABLED` in [`src/lib/constants.ts`](src/lib/constants.ts). `/editor` renders a coming-soon page and the editor code is excluded from the deployed bundle. See [Enabling the editor](#enabling-the-editor). |
| **Sequence diagrams, data dictionary, network diagrams** | Planned. Not built.                                                                                                                                                                                                                                                                            |

## Routes

| Route             | What it is                                                                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`               | Landing page. The hero CTA and the C4 card link into the demo — the header deliberately carries no primary nav links in this release.                                       |
| `/demo`           | Demo index: one card per bundled example model, each linking into view mode. Card numbers are counted from the parsed models, not hand-written.                             |
| `/view/[modelId]` | Read-only viewer for a registered model (`/view/shopflow`, `/view/order-shop`). Invalid JSON is reported with the validator's JSON-path messages instead of a blank canvas. |
| `/view/new`       | The paste-your-own playground: `.aft` and JSON side by side, live sync, Mermaid import, image export.                                                                       |
| `/syntax`         | The `.aft` syntax reference — every construct with working examples; each snippet on the page is verified against the real parser by `pnpm check:syntax-docs`.              |
| `/editor`         | Coming-soon page while the editor is gated.                                                                                                                                 |

## The two model formats

One model, two views. A model is stored as **`.archflow.json`** (the schema is
specified in [`docs/product/data-model.md`](docs/product/data-model.md)) or
authored as **`.aft`** — a Mermaid-like, human-editable text format. Conversion
between them is **lossless in both directions**: `pnpm check:archtext` proves
byte-identical round trips (text → model → text, and JSON → text → JSON
including unknown forward-compatible fields in their original key positions)
for both bundled example models.

A valid `.aft` file:

```
archflow 1.0
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

## Mermaid C4 import

`/view/new` imports Mermaid C4 source (`C4Context`, `C4Container`,
`C4Component`, `C4Dynamic`, `C4Deployment`) and converts it into both panes.
The conversion is **one-way and lossy**, and the UI says so at the point of
import:

- Enterprise/System boundaries become tags on their members and are **not
  drawn as frames** (the boundary tree is preserved in an `x-mermaid`
  extension field).
- `SystemDb` / `SystemQueue` at Context level lose their database and queue
  styling.
- `C4Dynamic` and `C4Deployment` map to the container level; call ordering and
  deployment topology are not part of arch-flow's model.

Everything else — names, descriptions, technologies, relationships, `<br/>`
decoding, `_Ext` externality, `BiRel` bidirectionality — carries over.
`pnpm check:mermaid` proves the mapping.

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

| Script                   | What it does                                                                                                                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`               | Start the dev server on :3000                                                                                                                                                                                                                                                                   |
| `pnpm build`             | Production build                                                                                                                                                                                                                                                                                |
| `pnpm start`             | Serve the production build (run `build` first)                                                                                                                                                                                                                                                  |
| `pnpm lint`              | ESLint (Next core-web-vitals + TypeScript rules)                                                                                                                                                                                                                                                |
| `pnpm typecheck`         | `tsc --noEmit` against the strict config                                                                                                                                                                                                                                                        |
| `pnpm format`            | Prettier, writing changes in place                                                                                                                                                                                                                                                              |
| `pnpm format:check`      | Prettier in check-only mode, for CI                                                                                                                                                                                                                                                             |
| `pnpm check:roundtrip`   | Proves the persistence guarantee: open a file, change nothing, save — bytes identical. Deserialize → serialize is byte-identical and idempotent on a fixture that carries unknown fields at every level, and each of the schema's 8 load-time hard errors is detected with its JSON path named. |
| `pnpm check:mermaid`     | Proves the Mermaid C4 converter: the reference sample maps with correct types/tags/technology, boundaries survive as tags plus the extension tree, emitted models pass the real validator, parse → serialize → parse is stable, and malformed inputs fail with line/column.                     |
| `pnpm check:archtext`    | Proves `.aft` ⇄ JSON losslessness: text → model → text byte-identical, JSON → text → JSON byte-identical for both bundled example models (unknown fields surviving verbatim and in position), every emitted model validator-clean, malformed inputs failing with line/column.                   |
| `pnpm check:syntax-docs` | Proves the `/syntax` reference page: every `.aft` snippet it displays parses with the real parser, and every deliberately-broken snippet in its errors section fails with exactly the line, column and message the page shows.                                                                  |

The `check:*` scripts load the **real** library code from `src/` (via
Node's TypeScript type stripping and a resolve hook for the `@/*` alias), so
they exercise exactly what the app ships. They are the project's safety net —
run them before touching the formats or converters.

## Project structure

```
arch-flow/
├── docs/product/              Product specs (vision, user stories, data model, roadmap, dev handoff)
├── public/                    Static assets
├── scripts/                   The check:* verification scripts
└── src/
    ├── app/                   App Router: /, /demo, /view/[modelId], /view/new, /editor
    ├── components/
    │   ├── ui/                Generic primitives (button, card, badge, dialog, tooltip, toast, …)
    │   └── layout/            App chrome (header, footer, theme-toggle)
    ├── features/
    │   ├── archtext/          The .aft text format: parser + canonical serializer (see its README)
    │   ├── editor/            The full C4 canvas — built, currently gated (see its README)
    │   ├── marketing/         Landing-page hero diagram
    │   ├── mermaid/           Mermaid C4 ⇄ arch-flow converter (pure, dependency-free)
    │   └── viewer/            Read-only viewer, /view/new playground, SVG/PNG export, model service
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

The editor is built and gated, not vaporware. Two steps bring it back:

1. Flip the flag in [`src/lib/constants.ts`](src/lib/constants.ts):

   ```ts
   export const EDITOR_ENABLED: boolean = true;
   ```

2. Restore the two commented lines at the top of `src/app/editor/page.tsx`
   (while gated, that file deliberately imports nothing from
   `@/features/editor`, which is what keeps the editor UI out of the deployed
   bundle):

   ```ts
   import { EditorShell } from "@/features/editor";
   export default function EditorPage() { return <EditorShell />; }
   ```

Everything else — the header's Editor nav entry, the landing-page CTAs, the
capability copy on the demo index and in view mode — reads the flag and
switches back on its own.

## Known limitations

- **Mermaid import is one-way and lossy.** Boundaries become tags and are not
  drawn as frames; `SystemDb`/`SystemQueue` at Context level lose their
  styling (details above).
- **Default layout is basic.** Text-authored models without explicit
  coordinates get a deterministic grid layout; on dense diagrams it can crowd
  edge labels. Add `(x,y w×h)` geometry in `.aft` when it matters.
- **Sequence diagrams, the data dictionary, and network diagrams are planned,
  not built.** Only C4 exists today.
- **The editor is not in this release** — see above.
