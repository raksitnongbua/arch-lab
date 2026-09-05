# What This Repository Is For

arch-lab turns plain text into architecture diagrams — C4 models and UML-style
sequence diagrams — rendered live in the browser. A diagram is a file the author
owns; git is the collaboration layer. No account, nothing uploaded.

## The selling point: presentation

Plenty of tools can draw a box and an arrow. **What this project sells is that
the result is beautiful, and that the author can make it theirs.** Judge a
change against that, not against feature count.

- A diagram here is meant to be **presented** — shown in a review, dropped in a
  deck, put on a screen while someone talks through it. Not merely stored and
  reopened.
- When a change trades visual quality for convenience, that is a losing trade
  and the reason must be written down. Presentation is the product.
- "It renders correctly" is the floor, not the goal. Correct and ugly is a bug
  in this codebase.

## What customisation means here

Customisation is a promise the code has already made in several places. Extend
those seams rather than inventing new ones:

- **Themes.** Every theme is complete and contrast-measured. Adding one takes
  five edits, all listed in the `THEMES` comment in `src/lib/constants.ts` —
  that comment is the count, not this line — and `pnpm check:themes` fails on
  each one being forgotten.
- **Icons.** One icon source rendered in two styles, following the theme.
  Product marks are never recoloured — several upstream licences are
  no-derivatives (`README.md`, "Third-party assets").
- **Palette and frames.** Role-coloured nodes and C4 grouping frames are part
  of how a diagram reads, not decoration bolted on afterwards.

A new customisation surface needs a `check:*` script that proves every variant
is complete and legible, in the manner of `check:themes` and
`check:icon-contrast`. A half-populated option is worse than no option: it
ships a choice that makes the diagram look broken.

## The two things a drawing tool cannot do

Keep both working; they are the argument for using this at all.

1. **Present.** Immersive view, motion, share links that carry the model inside
   the link.
2. **Be written by an agent.** The `.alab` text format and the MCP server at
   `/api/mcp`, so a model can author and validate a diagram directly.

## Scope

- Adding a fifth notation is the largest change this repo accepts, and the order
  of the work is fixed. It is written down in
  [`new-diagram-type.md`](new-diagram-type.md); read it before starting one.
- Both document types — C4 and sequence — are stable and in real use as of
  v1.0.0. Treat their formats as things people have files of.
- The MCP surface and `.alab` are marked **beta** in-product. If a change breaks
  either, say so explicitly in the pull request; do not let it pass as routine.
