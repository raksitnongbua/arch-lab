# `src/features/editor` — the C4 canvas

The interactive editor. `/editor` renders `EditorShell` (the only export of
`index.ts`), which mounts the header strip, palette rail, React Flow canvas,
inspector rail, and every overlay the sprint needs.

## Canvas library: React Flow

**Decided:** the canvas is `@xyflow/react` v12. Pan/zoom,
selection, box-select and connection dragging are React Flow; snapping,
alignment guides and all model logic are ours. Styled exclusively with the
semantic tokens in `src/app/globals.css` (`--canvas`, `--canvas-grid`,
`--node`, `--node-foreground`, `--node-border`, `--edge`, `--selection`) —
never hardcode a colour.

## The two frozen files

**`components/canvas.tsx` and `components/editor-shell.tsx` are FINAL this
sprint. Nobody edits them after Batch 1.** Every React Flow
event handler later tickets need is already wired (`onConnect`,
`onConnectEnd`, `onDrop`/`onDragOver`, `onNodeDoubleClick`,
`onNodeContextMenu`, `onNodesChange`, `onEdgesChange`, `onSelectionChange`,
`onMoveEnd`, drag lifecycle), each delegating to a store action or to the
canvas interaction store (below). Also frozen after Batch 1:
`lib/canvas-constants.ts`, `lib/motion.ts`, and all `src/components/ui/**`
primitives (`button`, `card`, `badge`, `input`, `textarea`, `select`,
`dialog`, `tooltip`, `toast`).

## Mount points

Every slot is a **props-free** component that reads its state itself, so a
later ticket replaces its file's body without touching the shell or canvas.

`editor-shell.tsx` mounts the chrome — palette, breadcrumb, inspector panel,
file actions, dirty indicator, recovery prompt — and owns the rail widths.
`canvas.tsx` mounts what lives inside React Flow: the alignment guides, the
quick-add menu, the level transition, the node context menu, the delete
confirmation, and the node and edge types.

Those two lists used to be tables of stubs against the track that would fill
them. Every one is filled, and the tracks were sprint bookkeeping in a document
this repo no longer carries, so the mount points are named here and the files
speak for themselves.

The **type** exports in `nodes/c4-node.tsx` (`C4NodeData`, `C4FlowNode`,
`C4NodeComponentProps`) and `edges/c4-edge.tsx` (`C4EdgeData`, `C4FlowEdge`,
`C4EdgeComponentProps`) are frozen contracts —
`use-canvas-nodes.ts` and `canvas.tsx` compile against them.

## Canvas interaction store

`canvas.tsx` exports `useCanvasInteraction` (plus `setPendingConnect` /
`setContextMenu`). Because the canvas is frozen, transient gestures later
tickets react to are published there instead of via props:

- `pendingConnect` — an edge drag released over empty canvas (source node id,
  flow + screen positions). Consumed by the quick-add menu; clear it
  when the menu closes.
- `contextMenu` — a right-clicked node (id + screen position). Consumed by
  the node context menu; clear it when the menu closes.

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

`hooks/use-keyboard-shortcuts.ts` is the registry. Each
ticket registers bindings from its own hook file; duplicate ids throw in dev.
Bindings are suppressed centrally while focus is in `input`, `textarea`,
`select` or `[contenteditable]`. Batch 1 claims: `mod+z`, `mod+shift+z`,
`mod+a`, `Escape`, `shift+1` (fit view), `shift+0` (reset zoom), arrow keys
(nudge 8px, `shift+` 1px). Claimed elsewhere: `mod+ArrowDown`/`mod+ArrowUp`, `Delete`/`Backspace`, `F2`/`Enter`, `mod+s`/`mod+o`, `mod+c`/`mod+v`.

### Copy / paste (`mod+c` / `mod+v`)

`hooks/use-clipboard-shortcuts.ts` + `lib/clipboard.ts`. The clipboard is
**in-memory**, not `navigator.clipboard`: a C4 payload is a graph, and paste
must stay synchronous so it lands as exactly one history entry.

Copy snapshots the selected nodes plus only the edges _internal_ to that
selection — an edge with one endpoint outside it cannot be rewired, since a
`C4Edge` must join two nodes in the same diagram. Paste calls
`store.pasteNodes`, which regenerates ids file-wide (so a payload can be
pasted repeatedly, and into a _different_ diagram of a compatible level) and
throws `InvalidNodeTypeError` when a type is illegal at the target level.

A paste is a **flat clone**: `childDiagramId`, `childRef` and `externalRef`
are dropped rather than copied, so two nodes never own one subtree.

## Node corner markers

Each marker owns one corner of the node frame so they never collide:

| Corner       | Marker                   | Condition                       |
| ------------ | ------------------------ | ------------------------------- |
| top-left     | unknown-icon warning dot | icon slug did not resolve       |
| top-right    | child-count badge        | child diagram has **> 0** nodes |
| bottom-left  | `↑ <level>` ref chip     | node carries an `externalRef`   |
| bottom-right | relate grip              | any node, not mid-rename        |

The child badge is gated on the child _count_, never on `childDiagramId`
merely existing — a badge reading `0` advertises nothing to open. An empty
child diagram stays reachable via `mod+ArrowDown`.

The ref chip (`components/nodes/ref-badge.tsx`, shared with the viewer)
distinguishes a node's **role** (a reference borrowed from another layer) from
its **type** (`externalSystem`, which renders dashed with an external-link
icon). Those are independent: a `person` can be a reference, and an
`externalSystem` can be first-class. Before the chip, both collapsed into a
bare `opacity-60` — indistinguishable from a drag ghost.

## Duplicate (`lib/duplicate.ts`)

Four affordances, one code path, so they cannot drift:

| Entry point             | Duplicates                                              |
| ----------------------- | ------------------------------------------------------- |
| right-click → Duplicate | node under the **cursor** (right-click does not select) |
| inspector button        | the current selection                                   |
| `mod+c` / `mod+v`       | the current selection, into any compatible diagram      |

All three call `store.pasteNodes`, so duplicate inherits paste's correctness
rules for free — and duplicate never writes to the clipboard, so duplicating
does not clobber what the user copied.

Duplicate has no on-canvas control: the node's one corner grip is spent on
_relate_, which needs to be spatial (drag to where the new element goes).
Duplicate needs no aim, so panel and menu entries serve it.

## Relate grip (`components/nodes/relate-grip.tsx`)

The node's bottom-right control. Drag it and release where the new element
should go — a ghost previews the spot; click it and the element lands to the
right. Either way, release routes through `setPendingConnect`, the same seam
`canvas.tsx` fills from `onConnectEnd`, so the quick-add menu decides the type
and creates the node+edge pair. One creation path, one set of level rules.

Not a duplicate of the connection handles: handles join two things that already
exist, this grip is the "…and it talks to a NEW thing" path.

**Placeholders get the grip too.** Read-only governs _identity_ — no rename,
retype or duplicate — but drawing a relationship FROM a boundary element is the
whole reason it is in the diagram (`userRef -> accounts` in a container view).
Handles were already available on placeholders; withholding the grip only made
the two disagree.

The drag is hand-rolled because React Flow drags _existing_ nodes and the
target does not exist until release. `nodrag` is what stops the parent node
being dragged instead — `stopPropagation` alone is not enough.

**Why a grip and not `Alt`+drag** (for either action): every modifier is already
claimed. `Alt` suspends grid snapping, `Shift` is
`multiSelectionKeyCode`, `Cmd`/`Ctrl` is `zoomActivationKeyCode`, `Space` is
`panActivationKeyCode`.

## Placement (`lib/placement.ts`)

`findFreePosition` steps down-right until a node's box clears every neighbour
with a grid-unit gutter. Programmatic creation only (palette, `^ref` placement);
a drop or connector release already expressed an intent and is left alone.

The previous rule rejected only an _exact_ position collision, so the second
item added at the viewport centre landed 16px off the first — overlapping enough
to read as one smudged node. Real intersection testing is what makes "add"
repeatable.

## Connection handles

`node-chrome.tsx` keeps the 8px dot but gives it a **24px hit area** via
`after:-inset-2`, and reveals handles on _selection_ as well as hover — they
used to vanish the moment the pointer left the node, which is exactly when you
reach for one. Handles are the only way to start a relationship, so an 8px
hover-only target was the main source of missed connection drags.

`overlays/connect-hint.tsx` shows a hint while a connection is in flight,
subscribed to React Flow's `useConnection` (selecting only `inProgress`, so it
does not re-render per pointer move). Releasing on empty canvas to create a
connected element always worked — nothing said so.

## Authoring `^ref` placeholders

`components/ref-palette-item.tsx` + `selectReferenceableNodes` +
`store.createRefNode`. Before these, **no UI could create an `externalRef`** —
the renderer drew them and the store protected them, but the only way to author
one was hand-writing `^ctx-x/user` in the text pane.

`components/ref-picker-dialog.tsx` + `selectReferenceableNodes` +
`store.createRefNode`. Before these, **no UI could create an `externalRef`** —
the renderer drew them and the store protected them, but the only way to author
one was hand-writing `^ctx-x/user` in the text pane.

One "Reference an element…" button in the palette footer opens a searchable
dialog (type to filter, arrows to rove, Enter to place). It is a dialog and not
a list in the rail because a list grows with the model and a search field does
not — the inline version pushed the type palette off-screen on a busy context
diagram.

Only **ancestor** nodes are offered (a `^ref` draws _this_ diagram's boundary,
so its members are established further out). Three filters: level rules still
apply (a `softwareSystem` is legal at `context` but not `container`), a
placeholder is never itself referenced, and anything already referenced here is
dropped — so the button disappears once everything eligible is placed.

### Placeholders are read-only, not frozen

A placeholder mirrors its original's identity (`REF_MIRRORED_KEYS`) and cannot
be renamed, retyped or duplicated. It **can** be dragged and **can** be a
relationship source, because `position`/`size` are per-diagram presentation and
deliberately not mirrored. Pinning them made every reference land on one spot
with no way to separate them — unusable in the one diagram whose job is layout.

### Staying in sync

`updateNode` calls `syncRefPlaceholders`, so renaming an original reaches every
placeholder in the same undo entry. Render-time resolution was rejected: the
.alab stores the name on the ref line, so "fix it on display" would still write
the stale string to disk.

Retyping validates before mutating. A `person` referenced into a container view
is legal; retyping the original to `softwareSystem` is not, so the edit throws
with the offending diagram named rather than producing a model its own validator
rejects.

Deleting an original cascades to its placeholders (`DeleteCascade.refsByDiagramId`)
and forces a confirmation naming the diagrams that lose them. Before this,
deleting left a dangling ref that `validate.ts` does not catch — it checks the
ref's _shape_, never that the target resolves. The bug survived because
`applyDeleteCascade` was dead code while `deleteNodes` kept an inlined copy;
the store now calls the helper.

## Palette drag payload

`lib/drag-payload.ts` owns the codec. `canvas.tsx` is Batch-1-final
and must build before that file exists, so it consumes the frozen **wire
format** directly: MIME `application/x-arch-lab-node-type`, JSON
`{ nodeType, level }`, level-mismatch drops rejected. Keep the codec
byte-compatible with that.

## State

`state/**` is the only place model mutations live. Everything here imports from `../state` (the barrel) and
codes against the state contract. `lib/fixtures.ts` builds a 150-node
`EditorModel` for the performance acceptance checks.

## Decisions inherited from elsewhere

- **File format** — `io/serialize.ts` and `io/validate.ts`; **types** —
  `src/types/c4.ts` (including `VALID_NODE_TYPES_BY_LEVEL`).
- **A node's level is not stored on the node** — it is the containing
  diagram's `level`.
- **Theming** — semantic tokens only; a custom theme must be able to retint
  the canvas. Reduced motion flows through `lib/motion.ts` (`duration()`),
  never a per-component media query.
