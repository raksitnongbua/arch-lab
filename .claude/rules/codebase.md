---
paths:
  - "src/**/*.{ts,tsx}"
  - "src/**/*.css"
  - "scripts/**/*.mjs"
---

# Codebase Rules

Comment style is in [`comments.md`](comments.md); helper reuse and shared-code
placement are in [`dry.md`](dry.md). This file covers everything else.

## Structure

- Features own their code and are consumed through their `index.ts` barrel.
  Never deep-import another feature's internals.
- `src/app` holds routes and route-level metadata only — sitemap, robots,
  `llms.txt`, `/api/mcp`. Logic belongs in a feature.
- `scripts/` is the `check:*` suite. It loads the real library code from `src/`
  through Node's type stripping, so a check exercises what the app ships rather
  than a copy of it. Never reimplement app logic inside a check.

## The check suite is the safety net

- There are 32 `check:*` scripts. If you change a **format, converter, layout,
  or route**, one of them almost certainly already has an opinion — find it and
  run it before assuming your change is free.
- Each script's header states what it proves and, usually, which shipped bug
  bought each rule. That header is the documentation; do not paraphrase it
  elsewhere, and update it when the rule changes.
- A new assertion must say **why** it exists and name the failure it prevents.
  Assertions that restate the implementation pass forever and catch nothing.
  Useful ones are relational ("thinner than", "not on top of") or measured.
- Round-trip is a hard invariant: open a file, change nothing, save — the bytes
  must be identical (`check:roundtrip`, `check:archtext`, `check:sequence`).

## Before opening a pull request

```bash
pnpm typecheck && pnpm lint && pnpm build
```

All of it must pass, plus every `check:*` your change touches. `pnpm lint` has
three known warnings and no errors — a fourth is yours. **Nothing runs these
for you**: there is no CI, so an unrun check is an unchecked change that will
deploy.

## Formatting

- Never run bare `pnpm format`. It rewrites the generated `skills/alab/SKILL.md`
  and breaks `pnpm check:skill`. Format the files you touched:
  `pnpm exec prettier --write <paths>`.
- `pnpm format:check` fails on two files at baseline. That is pre-existing —
  do not "fix" it as a drive-by.

## Tooling

- **pnpm only.** npm and yarn lockfiles are gitignored on purpose. The version
  is pinned by `packageManager`.
- Node ≥ 20.9 to run the app; **≥ 23.6** to run the `check:*` scripts, which
  need built-in type stripping.

## Feature flags and constants

- `EDITOR_ENABLED` in `src/lib/constants.ts` gates the editor, and every CTA and
  capability claim reads from it so they downgrade honestly on their own. If you
  add a claim about the editor, source it from the flag rather than hardcoding
  the present tense.
- Budgeted strings stay in budget. `SITE_DESCRIPTION` is the meta description,
  the OG and Twitter description, and the home page's JSON-LD `description` —
  keep it under 160 characters or it is written for nobody.

## Secrets

- `ARCHLAB_SHARE_PRIVATE_KEY` is a signing key and never belongs in the repo.
  `.gitignore` covers dotless `env` variants specifically because
  `node scripts/gen-share-keys.mjs > env` is one missing dot from `.env` and
  `git add -A` would have staged it. Do not weaken those lines.
