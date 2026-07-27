# `src/features/editor` — the C4 canvas

The interactive editor. `/editor` renders `EditorShell` (the only export of
`index.ts`), which mounts the header strip, palette rail, React Flow canvas,
inspector rail, and every overlay the sprint needs.

## Canvas library: React Flow

**Decided (dev-handoff D1):** the canvas is `@xyflow/react` v12. Pan/zoom,
selection, box-select and connection dragging are React Flow; snapping,
alignment guides and all model logic are ours. Styled exclusively with the
semantic tokens in `src/app/globals.css` (`--canvas`, `--canvas-grid`,
`--node`, `--node-foreground`, `--node-border`, `--edge`, `--selection`) —
never hardcode a colour.

## The two frozen files

**`components/canvas.tsx` and `components/editor-shell.tsx` are FINAL this
sprint (dev-handoff D9). Nobody edits them after Batch 1.** Every React Flow
event handler later tickets need is already wired (`onConnect`,
`onConnectEnd`, `onDrop`/`onDragOver`, `onNodeDoubleClick`,
`onNodeContextMenu`, `onNodesChange`, `onEdgesChange`, `onSelectionChange`,
`onMoveEnd`, drag lifecycle), each delegating to a store action or to the
canvas interaction store (below). Also frozen after Batch 1:
`lib/canvas-constants.ts`, `lib/motion.ts`, and all `src/components/ui/**`
primitives (`button`, `card`, `badge`, `input`, `textarea`, `select`,
`dialog`, `tooltip`, `toast`).

## Mount points (dev-handoff §4.4)

Every slot is a **props-free** component that reads its state itself, so a
later ticket replaces its file's body without touching the shell or canvas.

Mounted by `editor-shell.tsx` (the shell owns rail widths and the header
frame):

| Stub                                       | Filled by |
| ------------------------------------------ | --------- |
| `components/palette.tsx`                   | T2-B      |
| `components/breadcrumb.tsx`                | T2-C      |
| `components/inspector/inspector-panel.tsx` | T2-D      |
| `components/file-actions.tsx`              | T3-A      |
| `components/dirty-indicator.tsx`           | T3-B      |
| `components/recovery-prompt.tsx`           | T3-B      |

Mounted by `canvas.tsx`, inside the React Flow children:

| Stub                                                   | Filled by                        |
| ------------------------------------------------------ | -------------------------------- |
| `components/overlays/alignment-guides.tsx`             | **complete** (T1-B, this sprint) |
| `components/overlays/quick-add-menu.tsx`               | T2-B                             |
| `components/overlays/level-transition.tsx`             | T2-C                             |
| `components/overlays/node-context-menu.tsx`            | T2-C                             |
| `components/overlays/delete-confirm-dialog.tsx`        | T2-D                             |
| `components/nodes/c4-node.tsx` + `nodes/node-types.ts` | T2-A                             |
| `components/edges/c4-edge.tsx` + `edges/edge-types.ts` | T2-A                             |

The **type** exports in `nodes/c4-node.tsx` (`C4NodeData`, `C4FlowNode`,
`C4NodeComponentProps`) and `edges/c4-edge.tsx` (`C4EdgeData`, `C4FlowEdge`,
`C4EdgeComponentProps`) are the frozen §4.2/§4.3 contracts —
`use-canvas-nodes.ts` and `canvas.tsx` compile against them.

## Canvas interaction store

`canvas.tsx` exports `useCanvasInteraction` (plus `setPendingConnect` /
`setContextMenu`). Because the canvas is frozen, transient gestures later
tickets react to are published there instead of via props:

- `pendingConnect` — an edge drag released over empty canvas (source node id,
  flow + screen positions). Consumed by the quick-add menu (T2-B); clear it
  when the menu closes.
- `contextMenu` — a right-clicked node (id + screen position). Consumed by
  the node context menu (T2-C); clear it when the menu closes.

`Escape` and pane clicks clear both centrally.

## Position ownership (integration risk R1)

Nodes/edges are **derived** from the Zustand store by
`hooks/use-canvas-nodes.ts`. During a drag, positions live in the canvas's
local React state only; on drag stop exactly **one** `moveNodes` call commits
absolute final positions — one undo entry per press-to-release drag.
Selection, hover and dimension changes never reach the model (risk R2).

## Snapping and alignment

Dragging quantises to the 8px grid (`GRID_SIZE`); within 6px
(`ALIGNMENT_THRESHOLD`) of a sibling's edge or centre the node snaps and a
1px `--accent` guide renders (via `overlays/alignment-guides.tsx`, in flow
coordinates through `ViewportPortal`). Holding `Alt` suspends both. Guides
appear only for single-node drags; multi-drags keep relative layout via
per-node grid quantisation.

## Keyboard shortcuts

`hooks/use-keyboard-shortcuts.ts` is the registry (dev-handoff §4.5). Each
ticket registers bindings from its own hook file; duplicate ids throw in dev.
Bindings are suppressed centrally while focus is in `input`, `textarea`,
`select` or `[contenteditable]`. Batch 1 claims: `mod+z`, `mod+shift+z`,
`mod+a`, `Escape`, `shift+1` (fit view), `shift+0` (reset zoom), arrow keys
(nudge 8px, `shift+` 1px). Claimed elsewhere: `mod+ArrowDown`/`mod+ArrowUp`
(T2-C), `Delete`/`Backspace` (T2-D), `F2`/`Enter` (T2-A), `mod+s`/`mod+o`
(T3-A).

## Palette drag payload (§4.7)

T2-B's `lib/drag-payload.ts` owns the codec. `canvas.tsx` is Batch-1-final
and must build before that file exists, so it consumes the frozen **wire
format** directly: MIME `application/x-arch-lab-node-type`, JSON
`{ nodeType, level }`, level-mismatch drops rejected. Keep the codec
byte-compatible with that.

## State

`state/**` is owned by T1-A and is the only place model mutations live
(dev-handoff D8). Everything here imports from `../state` (the barrel) and
codes against the §4.1 contract. `lib/fixtures.ts` builds a 150-node
`EditorModel` for the performance acceptance checks.

## Decisions inherited from elsewhere

- **File format** — `docs/product/data-model.md`; **types** —
  `src/types/c4.ts` (including `VALID_NODE_TYPES_BY_LEVEL`).
- **A node's level is not stored on the node** — it is the containing
  diagram's `level`.
- **Theming** — semantic tokens only; a custom theme must be able to retint
  the canvas. Reduced motion flows through `lib/motion.ts` (`duration()`),
  never a per-component media query.
