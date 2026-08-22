# arch-lab

**Architecture diagrams as plain text.** C4 models and UML-style sequence
diagrams, written in a small text format, rendered live in the browser. No
account, nothing uploaded — a diagram is a file you own, and git is the
collaboration layer.

Open source under the [MIT licence](LICENSE). Contributions welcome; the
conventions below are worth five minutes before your first pull request,
because a few of them are unusual.

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
| `/editor`                    | Retired: a forwarding alias for `/view`, carrying any `#m=` payload across. The C4 canvas on `/view` is editable in place (gated by `CANVAS_EDIT_ENABLED`).                                                                                                             |

## How the code is arranged

Features own their code and are consumed through their `index.ts` barrel;
`src/lib` and `src/components/ui` hold what two or more features share.

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

## Contributing

### Before you open a pull request

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm check:roundtrip   # ...and every other check:* your change touches
```

All of it must pass. `pnpm lint` has three known warnings and no errors; a
fourth is yours.

### The two conventions that surprise people

**This codebase comments heavily, and deliberately.** A comment here records a
DECISION — what was tried, what broke, what must not be "simplified" back —
not a restatement of the code. If you delete a line that a comment explains,
rewrite the comment in the same commit; a comment describing behaviour that no
longer exists is worse than none. The full rules are in
[`.claude/rules/comments.md`](.claude/rules/comments.md).

**Duplication is checked before it is written.** Search `src/lib` and
`src/components/ui` before adding a helper — several have already been
invented three times under different names. See
[`.claude/rules/dry.md`](.claude/rules/dry.md), which also lists what must
NOT be deduplicated and why.

### The `check:*` scripts

There are 31, and they are the project's safety net rather than a formality.
They load the **real** library code from `src/` through Node's type stripping,
so they exercise what the app ships rather than a copy of it.

Each script's header says what it proves and, usually, which shipped bug
bought each rule — that is the documentation, and a paraphrase here would be a
second copy to keep true. Run one directly with
`node scripts/<name>-check.mjs`.

Worth knowing by name:

| Script                                                | Proves                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `check:roundtrip`, `check:archtext`, `check:sequence` | Open a file, change nothing, save — the bytes are identical           |
| `check:icon-contrast`                                 | Every icon rendered on a light and a dark canvas, and visible on both |
| `check:themes`                                        | Every theme complete, with measured contrast ratios                   |
| `check:share-capacity`                                | Every URL a share link was ever minted against still opens            |
| `check:mcp`                                           | The tools the server registers and the tools `/mcp` documents match   |

If you change a format, a converter, a layout or a route, there is almost
certainly a script that already has an opinion about it.

### Adding to a check script

A new rule should say **why** it exists, ideally naming the failure it
prevents. Assertions that merely restate the implementation pass forever and
catch nothing; the useful ones are relational ("thinner than", "the same
period as", "not on top of") or measured.

### Commits and pull requests

Conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`), scoped
where it helps (`feat(sequence): …`). The body is for the reasoning — what you
tried, what it cost, what you decided against. That is the part reviewers and
future readers need, and it is the part a diff cannot show.

## Third-party assets

Product marks come from [`thesvg`](https://www.npmjs.com/package/thesvg)
(package code MIT). The marks remain the trademarks and property of their
owners, are used nominatively — to label what a container runs — and are
embedded unmodified. Some upstream licences are no-derivatives, which is why
the registry never recolours a mark; where a brand publishes no monochrome
version, one is produced from its own artwork only where the licence clearly
permits it. Per-brand terms are exported by each icon module (`license`,
`url`).

Icons for things with no logo — a database, a queue, a person — come from
[lucide](https://lucide.dev), which also draws the application's interface, so
a diagram and the chrome around it share one visual language.

The home page's interactive dot field is adapted from
[React Bits](https://reactbits.dev)' `DotGrid` (MIT). The physics are upstream's;
the colour, the motion preferences, the frame budget and the event scoping were
reworked to this codebase's rules, and `pnpm check:dot-grid` asserts each of
those so re-pasting the upstream file cannot quietly undo them. Motion is by
[gsap](https://gsap.com) with its InertiaPlugin, under the
[standard licence](https://gsap.com/standard-license).

## Licence

[MIT](LICENSE) © 2026 Raksit Nongbua
