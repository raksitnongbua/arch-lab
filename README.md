# arch-flow

An interactive **C4-model architecture editor**. Draw your system on a canvas
(draw.io-style direct manipulation), drill from **Context → Container →
Component → Code**, and save the whole model as one plain JSON file you can diff,
review, and commit.

Local-first: no account, no server, nothing leaves the machine. Git is the
collaboration layer.

> **Status: foundation only.** This repository currently contains the app shell —
> scaffold, theming system, landing page, and the folder structure the editor
> will slot into. The canvas itself is not implemented. See
> [`src/features/editor/README.md`](src/features/editor/README.md).

Product specs live in [`docs/product/`](docs/product/) — read
`vision.md`, `user-stories.md`, and `data-model.md` before making product
decisions.

---

## Prerequisites

| Tool    | Version                                               |
| ------- | ----------------------------------------------------- |
| Node.js | **≥ 20** (developed on 24.13.0)                       |
| pnpm    | **10.27.0** — this project uses pnpm, not npm or yarn |

pnpm is pinned via the `packageManager` field in `package.json`. If you have
Corepack enabled, the right version is used automatically:

```bash
corepack enable
```

Otherwise: `npm i -g pnpm@10.27.0`.

## Getting started

```bash
pnpm install
pnpm run dev
```

Then open <http://localhost:3000>.

## Scripts

| Script                  | What it does                                     |
| ----------------------- | ------------------------------------------------ |
| `pnpm run dev`          | Start the dev server on :3000                    |
| `pnpm run build`        | Production build                                 |
| `pnpm run start`        | Serve the production build (run `build` first)   |
| `pnpm run lint`         | ESLint (Next core-web-vitals + TypeScript rules) |
| `pnpm run typecheck`    | `tsc --noEmit` against the strict config         |
| `pnpm run format`       | Prettier, writing changes in place               |
| `pnpm run format:check` | Prettier in check-only mode, for CI              |

Before pushing: `pnpm run lint && pnpm run typecheck && pnpm run build`.

## Stack

- **Next.js 16** (App Router) with React 19
- **TypeScript** in strict mode, path alias `@/*` → `src/*`
- **Tailwind CSS v4** — CSS-first config, no `tailwind.config.js`
- **next-themes** for theme switching
- **lucide-react** icons, `clsx` + `tailwind-merge` for the `cn` helper
- **ESLint** (flat config) + **Prettier** with `prettier-plugin-tailwindcss`

No diagram/canvas library is installed yet — that choice is deliberately
deferred until edge-routing and export requirements are on the table.

---

## Theming

Dark is the **default and the intent**, not a reflection of the OS. Light is one
click away in the header.

### How it works

1. **Tokens live in CSS.** [`src/app/globals.css`](src/app/globals.css) defines
   semantic custom properties — `--background`, `--foreground`, `--card`,
   `--muted`, `--border`, `--primary`, `--accent`, `--destructive`, `--ring`, and
   friends — once per theme: `:root` holds light, `.dark` holds dark. Names
   follow the **shadcn/ui convention**, so `pnpm dlx shadcn@latest add button`
   drops components in with no restyling.
2. **Tailwind reads those tokens.** An `@theme inline` block maps each property
   into a Tailwind namespace, which is what makes `bg-background`,
   `text-muted-foreground`, `border-border`, `ring-ring` and `rounded-lg` work.
3. **`dark:` follows a class, not the media query.** `@custom-variant dark
(&:is(.dark *))` points the variant at a `.dark` class on `<html>`.
4. **next-themes owns that class.**
   [`src/app/providers.tsx`](src/app/providers.tsx) configures
   `attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`,
   `disableTransitionOnChange`.
5. **No flash, no hydration warning.** next-themes injects a small blocking
   script that stamps the class before first paint, `globals.css` paints
   `<html>` with `--background` immediately, and `<html>` carries
   `suppressHydrationWarning` because that one element legitimately differs
   between server and client.
6. **The toggle is accessible.**
   [`src/components/layout/theme-toggle.tsx`](src/components/layout/theme-toggle.tsx)
   keeps both sun and moon in the DOM and cross-fades them, so the button box
   never changes size (no layout shift). Before mount it renders inert with a
   neutral `aria-label`, since the resolved theme is not knowable server-side.

Canvas-specific tokens (`--canvas`, `--canvas-grid`, `--node`,
`--node-foreground`, `--node-border`, `--edge`, `--selection`) already exist so
the future editor never hardcodes a colour, and a user-defined palette
(AF-E6-S3) can retint it.

### Adding a theme

Adding a third theme is one CSS block plus one array entry:

1. In `globals.css`, copy the `.dark` block, rename the selector (e.g.
   `.midnight`), and change the values. Redefine the **full** token set for a
   dark-family theme — anything omitted falls back to the light `:root` value.
   The file marks this spot with an `EXTENSION POINT` comment.
2. Add the name to `THEMES` in [`src/lib/constants.ts`](src/lib/constants.ts).
   The provider and the toggle both read that list.

No Tailwind change, no component change.

---

## Folder map

```
arch-flow/
├── docs/product/              Product specs (vision, user stories, data model, roadmap)
├── public/                    Static assets
└── src/
    ├── app/                   App Router: routes, root layout, global CSS
    │   ├── layout.tsx         <html>, fonts, providers, header/footer, skip link
    │   ├── providers.tsx      next-themes ThemeProvider (client)
    │   ├── globals.css        Theme tokens + Tailwind mapping — the whole theme system
    │   ├── page.tsx           Landing page
    │   └── editor/page.tsx    Placeholder editor route
    ├── components/
    │   ├── ui/                Generic primitives (button, card, badge)
    │   └── layout/            App chrome (header, footer, theme-toggle)
    ├── features/
    │   └── editor/            Reserved home for the C4 canvas — read its README
    ├── lib/
    │   ├── utils.ts           cn() class merger
    │   └── constants.ts       App name/description, THEMES, C4 level copy
    └── types/
        └── c4.ts              C4Level, C4Node, C4Edge, C4Diagram, ArchFlowFile
```

### Where things belong

- `components/ui` — feature-agnostic primitives. No editor knowledge.
- `components/layout` — app chrome shared across routes.
- `features/editor` — everything canvas-specific, exported through its
  `index.ts`. Nothing outside imports its internals.
- `types/c4.ts` — mirrors `docs/product/data-model.md`. The saved-file shape has
  exactly one definition; extend it rather than declaring a parallel one.
