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
  ever minted against still opens. Sequence links are minted against `/view/seq`
  specifically, because the short path leaves more characters for the payload.
  Do not rename these routes casually.
- **Routes that are load-bearing for SEO.** `/view/c4` exists as its own route
  so old `#m=…` links, the sitemap and the OG image keep working.
- `/api/mcp` is stateless, unauthenticated and read-only. Keep it that way, or
  the serverless deployment stops being correct.
