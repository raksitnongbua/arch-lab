# arch-lab (`.alab`) syntax — VS Code

Syntax highlighting and indentation rules for the arch-lab text format. Without
it VS Code sees an unknown extension and renders `.alab` as plain text, which is
a real hazard for a format with significant indentation.

## What it gives you

- **Highlighting** for every construct in the grammar: header keywords,
  `@context`/`@container`/`@component`/`@code` diagram headers, node types,
  `@icon` slugs, `[technology]`, `#tags`, all six arrow forms, drill-down
  (`>`), child refs (`>>`), boundary refs (`^`), geometry, and `!` escape
  lines.
- **Indentation that cannot go wrong.** The parser accepts spaces only, so the
  extension pins `insertSpaces: true`, `tabSize: 2` and
  `detectIndentation: false` for `.alab` files. Indent guides and
  `renderWhitespace: "boundary"` are on, so the 0/2/4 structure is visible.
- **Tabs shown as errors.** Any tab indentation is scoped
  `invalid.illegal.tab-indentation.alab` and renders as an error, catching the
  mistake before you save rather than at parse time.
- `//` line comments, with `Cmd+/` wired up.

## Install

**From this repo**, symlink it into your extensions folder and reload VS Code:

```sh
ln -s "$PWD/editors/vscode" ~/.vscode/extensions/alab-syntax
```

**As a `.vsix`**, if you'd rather install a package:

```sh
npx @vscode/vsce package --out alab-syntax.vsix   # run inside editors/vscode
code --install-extension alab-syntax.vsix
```

## Do not associate `.alab` with YAML

A common workaround is `"files.associations": { "*.alab": "yaml" }`. It is worse
than plain text: YAML treats `#` as a comment, so `.alab` tags like
`#critical-path` gray out as comments, while real `//` comments color as
content — wrong in both directions.

## Keeping the grammar honest

The grammar is a second, hand-written copy of the token set that
`src/features/archtext/lib/keywords.ts` owns, so it can silently drift from the
parser. `pnpm check:vscode-grammar` guards it: it imports those tables, asserts
every node type, arrow and header keyword is present, then tokenizes a sample
with `vscode-textmate` — the engine VS Code itself uses — and asserts the scope
at specific offsets. The sample is parsed by the real `parseArchText` first, so
an expectation can never be written against syntax the parser would reject.

Add a keyword to the format and that check fails until the grammar catches up.
