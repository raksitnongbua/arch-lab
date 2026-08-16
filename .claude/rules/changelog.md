# Changelog and Versioning Rules

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/spec/v2.0.0.html). v1.0.0 was tagged
on 16 August 2026 and is the first release — entries before it are covered by
that one entry.

## What earns an entry

Write for someone deciding whether to upgrade or debugging why something moved.

- **Yes:** anything a user can observe — a new capability, a changed format, a
  fix that changes behaviour, a removed or renamed route, a new theme.
- **No:** refactors, comment rewrites, dependency bumps with no visible effect,
  or check-script additions. The commit history already holds those.
- A fix earns an entry when someone could have *noticed the bug*. "Anchored the
  participant name instead of measuring it" is worth an entry; a private helper
  rename is not.

## How to write one

- Say what changed from the reader's side, not which function you edited.
- Group under `Added`, `Changed`, `Fixed`, `Removed` — or, for a release large
  enough that flat lists stop being readable, by capability area, as the 1.0.0
  entry does.
- One line per change. If a change needs a paragraph, it needs a linked pull
  request instead.
- Never restate a commit subject verbatim as an entry. Commit subjects are
  written for reviewers; changelog lines are written for users.

## Breaking changes

A change is breaking if it invalidates something a user already has on disk or
in a link:

- The `.alab` grammar stops accepting a document that used to parse.
- A share link that used to open no longer does — including a share key
  rotation.
- A route that links were minted against is renamed or removed.

Breaking changes are called out explicitly in the entry and bump the **major**
version. Do not fold one into a minor bump because it felt small.

The `.alab` format and the MCP surface are marked beta in-product, which is the
one place this is relaxed — but a break there still needs an entry saying so.

## Releasing

1. Bump `version` in `package.json`. Nothing reads it at runtime; the `0.1.0`
   strings in `scripts/archtext-check.mjs` and `scripts/sequence-check.mjs` are
   fixtures for the `.alab` `generator` header, which is author-written document
   metadata — not sourced from the manifest.
2. Add the `CHANGELOG.md` entry, dated, with a link reference at the bottom.
3. Merge to `main` through a pull request.
4. Tag the **merge commit**, annotated, never a branch commit:
   `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z`.

Keep the tag, the `package.json` version and the changelog entry in step. A tag
with no entry is a release nobody can read.
