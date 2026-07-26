# `src/features/editor` — the future canvas

Nothing real lives here yet. This directory is the reserved home for the
interactive C4 canvas so that, when it lands, it does not leak into
`src/components`.

## Boundary

- `src/components/ui` — generic, feature-agnostic primitives (button, card).
- `src/components/layout` — app chrome (header, footer, theme toggle).
- **`src/features/editor` — everything canvas-specific.** Node renderers, edge
  routing, selection state, keyboard map, palette, properties panel, file I/O.

The editor imports from `@/components/*`, `@/lib/*`, and `@/types`. Nothing
outside this directory should import editor internals; export the public surface
from `index.ts` and keep the rest private.

## Suggested layout when work starts

```
src/features/editor/
├── index.ts                 public surface (currently: EditorPlaceholder)
├── components/              Canvas, NodeCard, EdgeLayer, Palette, PropertiesPanel, Breadcrumb
├── hooks/                   use-selection, use-pan-zoom, use-undo-redo, use-keyboard-map
├── state/                   store + command/undo stack (every edit is a command)
├── io/                      load / save / validate ArchFlowFile, draft recovery
└── layout/                  auto-layout ("Tidy"), edge routing
```

## Decisions already made elsewhere

- **File format** — `docs/product/data-model.md`. Diagrams are stored flat, ids
  are stable slugs, writes are deterministic (sorted arrays, fixed key order,
  omitted optional fields). Do not invent a second shape here.
- **Types** — `src/types/c4.ts` already mirrors that document
  (`C4Level`, `C4Node`, `C4Edge`, `C4Diagram`, `ArchFlowFile`), including the
  `VALID_NODE_TYPES_BY_LEVEL` matrix. Extend those types rather than redeclaring.
- **A node's level is not stored on the node.** It is the `level` of the diagram
  containing it. One source of truth.
- **Theming** — consume the semantic tokens in `src/app/globals.css`. Canvas
  chrome has its own tokens already: `--canvas`, `--canvas-grid`, `--node`,
  `--node-foreground`, `--node-border`, `--edge`, `--selection`. Never hardcode a
  colour; a custom theme (AF-E6-S3) must be able to retint the canvas.

## Deliberately not chosen yet

No diagram/canvas library is installed. Whether the canvas is React Flow, a
hand-rolled SVG layer, or `<canvas>` is an open decision — it drives edge
routing quality (AF-E6-S5) and export fidelity (AF-E8-S1), so it should be made
with those requirements in hand rather than now.
