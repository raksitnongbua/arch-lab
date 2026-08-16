---
paths:
  - "src/**/*.{ts,tsx}"
  - "src/**/*.css"
  - "scripts/**/*.mjs"
---

# DRY Rules

## Before writing a helper, look for it

- Search `src/lib/`, `src/components/ui/`, and `src/types/` before adding any utility, constant, or component. Most "small helper" additions already exist there.
- Known homes: `cn` (`lib/utils`), `slugify` (`lib/slug`), `describeError` (`lib/errors`), `sourceLineAt` (`lib/source-text`), `CHAR_WIDTH_RATIO` (`lib/text-metrics`), `rasterise` + `GIF_SMOOTHNESS` (`lib/gif`), `LEVEL_LABEL` / `LEVEL_META_BY_LEVEL` / `SUPPORTED_MAJOR_VERSION` (`lib/constants`), `CopyButton` / `CaretQuote` (`components/ui`).
- Grep for the BODY, not the name. The same function has appeared under five names (`fileStem`, `downloadStem`, `slugForTitle`, `deriveFileName`, `slugify`); searching for `slugify` would have found one of them.

## Where shared code goes

- Code used by two or more features goes in `src/lib/` or `src/components/ui/`. Never deep-import another feature's internals — a feature is consumed through its `index.ts` barrel (`README.md`, "Project structure").
- Code used inside one feature stays in that feature, next to what uses it.
- Do not add a new cross-feature deep import to work around this. The repo already carries ~86 of them; that is debt, not a pattern to follow.

## One name per concept

- If two functions have the same body, they get one definition and one name. Differences that are only a default value become a parameter (`slugify(text, fallback)`).
- Never give one identifier two meanings in neighbouring modules. `PNG_SCALE` was a number in one feature and a `Record` in another; `DEFAULT_TIMESTAMP` named two different instants.
- If two same-named functions must stay separate because the algorithms genuinely differ, RENAME so the signatures cannot be confused (`wrapText` vs `wrapTextClamped`). Do not merge them.

## Values that exist in exactly one place

- Never hand-type a value a constant already holds. Interpolate it: `` `max ${MAX_SOURCE_CHARS.toLocaleString("en-US")} characters` ``, not `"max 256,000 characters"`. This matters most in agent- and user-facing prose, which is a contract.
- A number duplicated between TypeScript and CSS (or between two stylesheets) must be pinned by a `check:*` script. Precedent: `check:sequence-motion` asserts the stylesheet's fallback equals `SEQUENCE_DURATIONS`, and `check:viewer-motion` / `check:syntax-docs` do the same for their pairs.
- Derive lookups rather than retyping them: `LEVEL_LABEL` is built from `C4_LEVEL_META`, so the label on a breadcrumb cannot drift from the label on the landing page.
- Prefer a total `Record` over `array.find(...)?.x ?? fallback` when the key type guarantees a hit.

## What NOT to deduplicate

Reject superficial resemblance. These are deliberate and must stay separate:

- `viewer/export/render-svg.ts` vs `sequence/export/render-svg.ts` — different strategies (render-from-model vs clone-live-DOM), argued in the file headers.
- `editor/lib/canvas-constants.ts` vs `viewer/lib/canvas-constants.ts` — different zoom clamps, each justified.
- The three `motion.ts` files — a deliberate `editor → viewer → sequence` import layering.
- Per-route Next.js `metadata` blocks — the framework's declarative surface.

Before extracting, state what the two copies would have to do differently in future. If the answer is "diverge", leave them and note why.

## Signals you are looking at real duplication

- A comment apologising for a copy ("the format is the shared thing", "same treatment in …"). Delete the comment by making the sharing real.
- A comment claiming a value is shared when no import exists.
- Copy-paste fingerprints: identical bodies with a renamed parameter, or the same magic number repeated across files.
- An extracted helper being re-implemented one import away from where it already lives.

## After deduplicating

- Run `pnpm lint` and remove imports that became unused.
- Run the `check:*` scripts covering the touched surfaces, not just `pnpm build`.
- Note any behaviour change the unification causes (unifying `slugify` changed `"Café"` from `caf` to `cafe` on four code paths).
