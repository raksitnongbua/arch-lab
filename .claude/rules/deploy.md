# Deploy Rules

Hosted on Vercel. **`main` is production** — a merge to `main` deploys to the
live site. Pull requests get preview URLs.

## The consequence of no CI

There is no `.github/` and no `vercel.json`. Nothing runs the checks on push,
so the pre-merge run described in [`codebase.md`](codebase.md) is the only gate
between a change and production:

```bash
pnpm typecheck && pnpm lint && pnpm build
```

- Never merge to `main` on the assumption something else will catch it. Nothing
  will.
- `pnpm build` is not optional before merge. A type error that `pnpm dev`
  tolerates will fail the production build after the merge, not before it.

## Branching

- Work on a branch, open a pull request, merge to `main`. Every change since #42
  has gone through a PR; keep it that way even for a one-line fix.
- Never commit directly to `main` without saying so explicitly.

## Environment variables

Set in the Vercel project, never in the repo:

| Variable                                | Notes                                                       |
| --------------------------------------- | ----------------------------------------------------------- |
| `ARCHLAB_SHARE_PRIVATE_KEY`             | **Secret.** Signs share links. Never commit, never log.     |
| `NEXT_PUBLIC_ARCHLAB_SHARE_PUBLIC_KEY`  | Public verification half of the pair.                       |
| `NEXT_PUBLIC_ARCHLAB_SHARE_TTL_OPTIONS` | Share expiry choices offered in the UI.                     |
| `ARCHLAB_PUBLIC_ORIGIN`                 | Overrides the origin used to mint links.                    |
| `VERCEL_PROJECT_PRODUCTION_URL`         | Supplied by Vercel; the fallback origin.                    |

- Origin is resolved, never hardcoded. A hardcoded host was already a shipped
  bug (`fix(mcp)`, #9) — do not reintroduce one.
- Rotating the share key pair invalidates every outstanding share link. Treat it
  as a breaking change: it needs a changelog entry.

## What a deploy must not break

- **Existing share links.** `check:share-capacity` proves every URL a link was
  ever minted against still opens. **Every minting site mints bare `/live`** —
  the sequence, flowchart and use-case Share wrappers and the MCP
  `create_share_link` — and `check:share-capacity` asserts each one does, plus
  that none of them mints an alias. The short paths (`/live/seq`, `/live/flow`,
  `/live/uc`, …) are a **legacy compatibility surface**, not a minting target:
  minting against a trampoline would put a client-side bounce on the most
  common arrival and preview it with whatever card the alias happens to carry.
  Do not rename these routes casually.
- **Routes that are load-bearing for SEO.** The whole `/view/*` family exists
  as forwarding trampolines so old `#m=…` links and the OG image keep working
  after the rename to `/live`. They are deliberately **absent from the
  sitemap** and `noindex` with a canonical on `/live` — `check:seo` fails if a
  route that canonicals elsewhere appears in the sitemap.
- `/api/mcp` is stateless, unauthenticated and read-only. Keep it that way, or
  the serverless deployment stops being correct.
