# arch-flow — Sprint Handoff (MVP walking skeleton)

**Audience:** the developers building this round. This is the document you work from.
**Scope:** the 23 **Must** stories in `docs/product/user-stories.md`. Nothing else.
**Source docs:** `user-stories.md` (backlog), `data-model.md` (file format), `roadmap.md` (MVP slice), `src/types/c4.ts` (types, already written).

---

## 1. Sprint goal

At the end of this sprint, an engineer opens `/editor`, drags a `softwareSystem` and two `person` nodes onto a canvas, connects them, names them by double-clicking, fills in description and technology in an inspector, picks a PostgreSQL icon, drills into the system to author its Container level, climbs back out via a breadcrumb, presses `Cmd+S`, picks a location on disk, reloads the tab, reopens the file — and gets byte-identical JSON back. Today `/editor` renders a static placeholder and no model exists in memory. At the end of this sprint the whole vertical loop (canvas → model → hierarchy → file) works end to end on one C4 model, in both themes, with reliable undo.

---

## 2. Settled decisions

**Settled by the orchestrator — do not re-open:**

| # | Decision |
|---|---|
| D1 | **Canvas library: React Flow (`@xyflow/react`).** Pan/zoom, selection, box-select, connection dragging, custom node/edge components. Styled exclusively with the existing CSS tokens (`--canvas`, `--canvas-grid`, `--node`, `--node-border`, `--edge`, `--selection`). |
| D2 | **Persistence: File System Access API with graceful fallback.** `showSaveFilePicker`/`showOpenFilePicker` where available; download-blob + `<input type="file">` where not. Feature-detect at call time, never assume. Resolves OQ-1 with option (b). |
| D3 | **Scope: the 23 Must stories only.** Should/Could/Won't stay in the backlog untouched. |
| D4 | **Level 4 (Code):** one node type `codeElement`, generic box, no drill-down below it, zero special tooling. Resolves OQ-4. |
| D5 | **Double-click drills down when the node has a child diagram, renames when it does not. `F2` and `Enter` always rename.** Resolves OQ-3 toward the C4 mental model, because drill-down is the differentiator. **Flagged usability risk** — validate with 3 engineers before v0.2; if it surprises them, the fallback is "double-click always renames, badge click drills". |

**Decisions I am making now to unblock work.** Every one is revisitable, none may be renegotiated mid-sprint by an individual ticket.

| # | Decision | Rationale |
|---|---|---|
| D6 | **State: one Zustand v5 store.** Model held in memory as `diagrams: Record<string, C4Diagram>`, serialized back to a sorted array on write. | Flat id-keyed map matches the file format's flat storage and gives O(1) lookup. Zustand keeps React Flow's high-frequency updates out of context re-render storms. |
| D7 | **Undo/redo is snapshot-based, not command-inverse.** Each logical action pushes a `structuredClone` of the model onto a 100-deep ring buffer. | Correctness over memory. AF-E1-S7 demands "reverses exactly one logical action" for *every* mutation including cascading deletes and child-diagram creation; hand-written inverses are where undo bugs live. A 500-node model clones in well under a frame. Revisit only if profiling shows >16ms. |
| D8 | **All model mutations live in `state/` and are written in Batch 1**, including commands with no UI yet (`createChildDiagram`, `deleteNodes`, `createEdge`). Batch 2 and 3 treat `state/**` as **read-only** and call it. | This is the single most important anti-collision rule of the sprint. If four Batch-2 tickets each add their own mutation, they all edit the same files and corrupt each other. |
| D9 | **Mount-point stubs are created in Batch 1 and filled in later.** `canvas.tsx` and `editor-shell.tsx` are *finished* in Batch 1 — every overlay and panel they will ever mount exists as a props-free stub component that reads the store itself. Later tickets own and fill their stub. Nobody edits `canvas.tsx` or `editor-shell.tsx` after Batch 1 this sprint. | Props-free, store-reading stubs mean zero coupling and zero shared-file edits. |
| D10 | **All `src/components/ui/**` primitives needed this sprint are created in Batch 1** (`input`, `textarea`, `select`, `dialog`, `tooltip`, `toast`). Read-only for Batch 2/3. | Otherwise the inspector, the icon picker and the quick-add menu all race to create `input.tsx`. |
| D11 | **Only ticket T1-A may touch `package.json` / `pnpm-lock.yaml` in Batch 1.** It installs everything: `@xyflow/react`, `zustand`, `idb-keyval`. No other ticket adds a dependency; if you think you need one, escalate — do not install it. (T3-A owns `package.json` in Batch 3 for a script entry; it is the only Batch-3 ticket allowed to.) | Concurrent lockfile writes are unmergeable. |
| D12 | **OQ-5 — cross-level relationships are illegal.** `edge.source`/`edge.target` must resolve to nodes in the same diagram. Enforced in `createEdge`. | Strict-level is cleaner to validate and render; placeholders (AF-E2-S5, out of scope) are the later escape hatch. |
| D13 | **OQ-6 — the same element is duplicated, never shared by reference.** No shared identity model. | Revisit alongside multi-file split (AF-E5-S7). |
| D14 | **OQ-8 — schema version only.** No in-file model revision or edit changelog. Git is the history. |
| D15 | **OQ-7 — exactly 16 icons this sprint:** the 9 named (golang, nextjs, mongodb, mysql, postgresql, redis, cloudflare, nginx, kong) plus 7 generics (person, database, queue, service, browser, mobile, external). Hand-authored inline SVG, no icon package dependency. | The licence audit is a v0.2 problem at 60–100 icons; at 16 recognisable marks, reproduced unmodified, we accept the risk this round. Do not add a 17th icon "while you're in there". |
| D16 | **No start screen.** `/editor` boots an empty in-memory model: one root `context` diagram, title "Untitled model", `createdAt` = now. Recent files (AF-E5-S5) is Should and out. |
| D17 | **The editor is a client component.** `src/app/editor/page.tsx` renders `<EditorShell />` marked `"use client"`; the canvas renders behind a mounted-guard. No `ssr: false` dynamic import. |
| D18 | **No test framework is installed and none is added this sprint.** Self-verification is the acceptance criteria below plus `pnpm lint` / `pnpm typecheck` / `pnpm build`. The one exception the roadmap demands: T3-A adds a plain Node script `scripts/roundtrip-check.mjs` wired as `pnpm check:roundtrip`, proving open → save is byte-identical on a committed fixture. |
| D19 | **Draft key** for IndexedDB snapshots is `` `${fileHandleName ?? "untitled"}:${model.metadata.createdAt}` ``. Stable across reloads, distinct per document. |
| D20 | **Canvas numbers are constants, not literals**, in `src/features/editor/lib/canvas-constants.ts` (frozen after Batch 1): grid 8px, alignment threshold 6px, zoom clamp 0.1–4.0, min node size 120×64, default node size 176×88, paste/duplicate offset 16px. |

---

## 3. Implementation batches

**The rules that make parallel work safe:**

1. A ticket may only write files in its **OWNS** list. If you believe you must edit a file you do not own, stop and escalate — do not edit it.
2. Ownership transfers **between** batches, never within one. `nodes/c4-node.tsx` is created by T1-B (Batch 1), owned by T2-A (Batch 2), owned by T3-C (Batch 3). That is legal because the batches are sequential.
3. A ticket whose file another same-batch ticket imports must **push that file's skeleton — real exported signatures, stub body — as its first commit**, before implementing. Named per ticket below.
4. `src/types/c4.ts`, `src/lib/constants.ts`, `src/lib/utils.ts`, `src/components/ui/**` (after Batch 1), `docs/**` are read-only for everyone.

---

### Batch 1 — Foundation

Everything in the sprint reads the store and mounts inside the shell. Nothing else can start.
**2 tickets, parallel.** They are split along a hard line: T1-A writes no React component; T1-B writes no state logic. T1-B codes against the store contract in §4, not against T1-A's implementation.

---

#### T1-A · Model store, command surface, undo/redo, level rules

**Stories:** AF-E1-S7, AF-E2-S1

**Scope.** The whole in-memory model and every mutation that will ever be applied to it this sprint, including commands with no UI until Batch 2. Zustand store holding `model`, `activeDiagramId`, `selection`, `viewportByDiagramId`, `isDirty`, and a 100-deep snapshot history. Implements the four-level model: `createNode` rejects a type invalid for the containing diagram's level with a thrown, catchable error naming the valid types; `createChildDiagram` refuses to go below `code` and always creates the level exactly one step deeper. Also installs the sprint's dependencies.

**Files it OWNS**
- `package.json`, `pnpm-lock.yaml` — add `@xyflow/react`, `zustand`, `idb-keyval`. Nothing else.
- `src/features/editor/state/store.ts` — the store, exactly the contract in §4.1.
- `src/features/editor/state/history.ts` — snapshot ring buffer, `transact()`.
- `src/features/editor/state/selectors.ts` — `selectActiveDiagram`, `selectBreadcrumb`, `selectChildCount`, `selectValidNodeTypes`, `selectParallelEdgeGroups`.
- `src/features/editor/state/model.ts` — pure helpers over `EditorModel` (id slug generation and de-collision with `-2` suffix, cascade collection for delete, back-pointer maintenance).
- `src/features/editor/state/errors.ts` — `InvalidNodeTypeError`, `MaxDepthError`, `CrossDiagramEdgeError`.
- `src/features/editor/state/index.ts` — the state barrel; the only path other tickets import from.

**May READ, must NOT modify:** `src/types/c4.ts`, `docs/product/data-model.md`.

**First commit (other tickets are blocked on it):** `state/store.ts` + `state/index.ts` with every export in §4.1 present and typed, bodies throwing `new Error("not implemented")`.

**Acceptance criteria**
- Every mutating action is exactly one history entry. Verified by a scripted sequence in the browser console: 40 mixed mutations, then 40 undos returns `structuredClone`-equal model to the start, then 40 redos returns to the end state.
- History depth ≥100; entry 101 evicts entry 1; history is **not** cleared by `setActiveDiagram`.
- `setActiveDiagram`, `setSelection`, `setViewport`, `beginLabelEdit` create **no** history entry.
- `deleteNodes` removes each node's incident edges and its entire descendant diagram subtree in **one** entry, and returns accurate `{ removedNodes, removedEdges, removedDiagrams }`.
- `createNode({ type: "database", diagramId: <a context diagram> })` throws `InvalidNodeTypeError` whose message lists `person, softwareSystem, externalSystem`. No node is created, no history entry.
- `createEdge` with `source` and `target` in different diagrams throws `CrossDiagramEdgeError`.
- `createChildDiagram` on a `component`-level node creates a `code`-level diagram, sets both pointers (`node.childDiagramId` and child `ownerNodeId`/`parentDiagramId`), and is one history entry. On a `code`-level node it throws `MaxDepthError`.
- `isDirty` is false at boot, true after any mutation, false again after `markSaved`, and **false again if the user undoes back to the last-saved snapshot**.
- Every node `position` written by the store is an integer multiple of 8; every `size` is ≥120×64.

**Definition of done:** `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass. Lockfile committed. A short `src/features/editor/state/README.md` naming the invariants (one entry per action, mutations only here).

---

#### T1-B · Canvas mount, editor shell, mount-point stubs, shared primitives

**Stories:** AF-E1-S1, AF-E1-S3, AF-E1-S4

**Scope.** Replace the `/editor` placeholder with the real shell: header strip, left palette slot, canvas, right inspector slot, breadcrumb slot. Mount React Flow with pan/zoom (`Cmd/Ctrl`+scroll and pinch, pointer-anchored, clamped 10–400%), `Shift+1` fit-to-view ≤300ms, `Shift+0` reset, a clickable zoom indicator; 8px grid snapping and 6px alignment guides with `Alt` to suspend; arrow-key nudge (8px, 1px with `Shift`); click / `Shift`-click / marquee intersection selection, `Cmd+A` current-level-only, `Escape` to clear. Wires **every** React Flow event handler this sprint will need — `onConnect`, `onDrop`/`onDragOver`, `onNodeDoubleClick`, `onNodeContextMenu`, `onNodesChange`, `onEdgesChange` — each delegating to a store action, so no later ticket needs to reopen this file. Creates the shortcut registry, the motion helper, the shared UI primitives, and every mount-point stub.

**Files it OWNS**
- `src/app/editor/page.tsx` — renders `<EditorShell />`.
- `src/features/editor/index.ts` — the feature barrel. Delete the `EditorPlaceholder` export.
- **delete** `src/features/editor/components/editor-placeholder.tsx`.
- `src/features/editor/components/editor-shell.tsx` — **final this sprint.**
- `src/features/editor/components/canvas.tsx` — **final this sprint.**
- `src/features/editor/components/zoom-indicator.tsx`
- `src/features/editor/components/overlays/alignment-guides.tsx` — complete, not a stub.
- **Stubs (signature final, body minimal, ownership transfers in Batch 2/3):**
  `components/palette.tsx`, `components/breadcrumb.tsx`, `components/inspector/inspector-panel.tsx`, `components/file-actions.tsx`, `components/dirty-indicator.tsx`, `components/recovery-prompt.tsx`, `components/overlays/quick-add-menu.tsx`, `components/overlays/level-transition.tsx`, `components/overlays/delete-confirm-dialog.tsx`, `components/overlays/node-context-menu.tsx`, `components/nodes/c4-node.tsx`, `components/nodes/node-types.ts`, `components/edges/c4-edge.tsx`, `components/edges/edge-types.ts`.
  Every stub is **props-free** and reads the store itself (§4.4).
- `src/features/editor/hooks/use-keyboard-shortcuts.ts` — the shortcut registry (§4.5).
- `src/features/editor/hooks/use-canvas-nodes.ts` — store model → React Flow `nodes`/`edges` projection (§4.2/4.3).
- `src/features/editor/lib/canvas-constants.ts` — D20. Frozen after this ticket.
- `src/features/editor/lib/motion.ts` — `prefersReducedMotion()`, `DURATIONS`. Frozen after this ticket.
- `src/components/ui/input.tsx`, `textarea.tsx`, `select.tsx`, `dialog.tsx`, `tooltip.tsx`, `toast.tsx` (exports `toast()` and `<Toaster />`, mounted by the shell). Frozen after this ticket.

**May READ, must NOT modify:** `src/features/editor/state/**` (T1-A's), `src/components/ui/button.tsx|card.tsx|badge.tsx`, `src/app/globals.css`, `src/lib/utils.ts`, `src/types/c4.ts`.

**Depends on:** T1-A's first commit (store skeleton). Code against §4.1; do not read T1-A's bodies.

**Acceptance criteria**
- Two-finger scroll and `Space`+drag pan; the model coordinate under the pointer does not move during a pan.
- `Cmd/Ctrl`+scroll and pinch zoom anchored on the pointer, hard-clamped to 10%–400%. Zoom % is displayed and clicking it resets to 100%.
- `Shift+1` animates to fit all nodes of the current diagram with 48px padding in ≤300ms. `Shift+0` resets to 100% centred on the selection (viewport centre if nothing selected).
- Dragging a node quantises position to 8px; within 6px of another node's edge or centre a 1px `--accent` guide appears and the node snaps; holding `Alt` suspends both. Connected edges re-route continuously **during** the drag, not on release.
- One press-to-release drag = one undo entry regardless of distance, via a single `moveNodes` call on drag stop. Intermediate frames are local, uncommitted state.
- Arrow key moves the selection 8px; `Shift`+arrow 1px; each keypress is its own undo entry.
- Click selects solely; `Shift`-click adds, `Shift`-click on a selected node removes; marquee selects every node **intersecting** it (not only enclosed), and selects an edge only when both endpoints are selected.
- Dragging any member of a multi-selection moves all members, relative positions preserved, as one undo entry.
- `Cmd/Ctrl+A` selects only the active diagram's elements. `Escape` clears.
- Shortcuts are suppressed while focus is inside an `input`, `textarea`, or `[contenteditable]`.
- Canvas background uses `--canvas`, grid dots `--canvas-grid`, selection rectangle `--selection`. No hex or `oklch()` literal appears anywhere in this ticket's files.
- 150-node fixture: continuous pan for 5s and a continuous node drag both hold ≥55fps in Chrome DevTools' frame meter, M-series, no throttling. Commit the fixture generator at `src/features/editor/lib/fixtures.ts`.
- `/editor` renders with no console errors or hydration warnings, in both themes.

**Definition of done:** `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass. Every stub file exists with its final exported signature so Batch 2 can start without touching it. `src/features/editor/README.md` updated: React Flow is chosen, mount points listed, the "canvas.tsx and editor-shell.tsx are final" rule stated.

---

### Batch 2 — The editing surface

Follows Batch 1 because every ticket here either fills a Batch-1 stub or calls a Batch-1 store command. **4 tickets, fully parallel — no two share a file.**

---

#### T2-A · Node & edge presentation: C4 types, icons, icon picker, inline labels

**Stories:** AF-E3-S1, AF-E4-S1, AF-E4-S2, AF-E1-S6

**Scope.** Everything rendered *inside* a node or *on* an edge. Takes over the Batch-1 node/edge stubs and makes them real: per-type visual treatment (stick figure for `person`, cylinder for `database`, pipe for `queue`, muted fill + dashed border for `externalSystem`), the 16-icon inline-SVG library with a slug registry and type defaults, the searchable icon picker, the "has children" corner badge with child count, and inline label editing for both nodes and edges (caret over the name with existing text selected, `Enter` commits, `Escape` reverts, click-away commits, 3-line wrap then ellipsis with full value on hover, empty commit falls back to the previous value). Also owns edge geometry, including the offset curve for parallel A→B edges.

**Files it OWNS**
- `src/features/editor/components/nodes/c4-node.tsx` (taken over from T1-B), `nodes/node-types.ts`, `nodes/node-chrome.tsx`, `nodes/node-shapes.tsx`, `nodes/child-badge.tsx`, `nodes/inline-label.tsx`
- `src/features/editor/components/edges/c4-edge.tsx` (taken over), `edges/edge-types.ts`, `edges/edge-label.tsx`
- `src/features/editor/lib/edge-geometry.ts` — parallel-edge offset, label anchor point.
- `src/features/editor/lib/icons/registry.ts`, `lib/icons/svg/*.tsx` (16 files), `lib/icons/categories.ts`
- `src/features/editor/components/icon-picker.tsx` — exports `IconPicker` per §4.6. **Push this file's skeleton first;** T2-D imports it.

**May READ, must NOT modify:** `state/**`, `lib/canvas-constants.ts`, `lib/motion.ts`, `components/canvas.tsx`, `components/ui/**`, `globals.css`.

**Depends on:** T1-A (store shape, `beginLabelEdit`/`endLabelEdit`), T1-B (node/edge stub signatures, `C4NodeData`/`C4EdgeData`, `ui/input`, `ui/dialog`).

**Acceptance criteria**
- Each of the 8 node types renders a visually distinct treatment; `person` shows the C4 stick-figure motif, `database` a cylinder, `queue` a pipe, `externalSystem` muted fill + dashed border. A screenshot of all 8 side by side is attached to the ticket.
- `type` is read from the model, never inferred from appearance; the component branches on `data.node.type` only.
- All 16 icons render as inline SVG. Network tab shows **zero** requests when a diagram of 150 icon-bearing nodes paints. Icons are referenced by slug; no SVG data or URL is ever written into the model.
- Both themes: every icon legible; monochrome marks follow `currentColor`, brand-coloured marks keep brand colour on a contrast-safe backing shape.
- 150 icon-bearing nodes add <50ms to first paint versus the same fixture with icons disabled. Numbers from `performance.measure`, recorded on the ticket.
- Icon picker opens from the inspector's icon swatch with the current icon highlighted, in <80ms. Typing filters on name, slug and aliases — `pg` and `postgres` both find PostgreSQL. Results grouped by the 6 categories, arrow-key navigable, `Enter` selects. No match shows "use generic <type> icon".
- An unknown icon slug in a loaded file renders the type's generic fallback plus a small warning marker. Never blank, never broken.
- Double-click a node **with no child diagram**, or select it and press `F2`/`Enter`: caret appears over the name with existing text selected. `Enter` commits, `Escape` reverts to the prior value, clicking elsewhere commits. Committing empty restores the previous value.
- Edge labels edit identically and render on a background chip that stays legible over the line. Label + technology overflow truncates; the full text is in a hover tooltip; the line itself is never obscured.
- A node with a child diagram shows a corner badge with the child node count, sourced from `data.childCount`.
- Two distinct A→B edges both render and both stay readable, offset by symmetric curve control points.
- Zero colour literals. Node fill `--node`, text `--node-foreground`, border `--node-border`, edge stroke `--edge`.

**Definition of done:** `pnpm lint`, `pnpm typecheck` pass. `pnpm build` at batch integration.

---

#### T2-B · Creation flows: palette drag-drop and edge connection

**Stories:** AF-E1-S2, AF-E1-S5

**Scope.** The two ways elements come into existence. A left palette listing only the node types valid for the active diagram's level, draggable onto the canvas and double-clickable to create at viewport centre. Edge creation via React Flow connection handles: four handles on hover at edge midpoints, live preview line, valid targets highlighted, arrowhead at the target, label opens in inline edit on creation. Release on empty canvas opens a quick-add menu offering level-valid node types, creating node + edge together as one undo entry; `Escape` creates nothing. Release on the origin node creates nothing and toasts why.

**Files it OWNS**
- `src/features/editor/components/palette.tsx` (taken over from T1-B), `components/palette-item.tsx`
- `src/features/editor/components/overlays/quick-add-menu.tsx` (taken over)
- `src/features/editor/lib/drag-payload.ts` — the `dataTransfer` MIME type and codec used by `canvas.tsx`'s `onDrop`, whose shape is frozen in §4.7.
- `src/features/editor/hooks/use-connect-shortcuts.ts` — registers its own bindings via the registry.

**May READ, must NOT modify:** `state/**`, `components/canvas.tsx`, `components/nodes/**`, `components/edges/**`, `components/ui/**`.

**Depends on:** T1-A (`createNode`, `createEdge`, `transact`), T1-B (`onDrop` wiring, drag payload contract, `toast`).

**Acceptance criteria**
- The palette shows exactly `VALID_NODE_TYPES_BY_LEVEL[activeLevel]`, and changes when you navigate levels. On a `code` diagram it shows only `codeElement`.
- Dragging a palette item onto the canvas creates a node with its top-left at the drop point snapped to 8px, default size 176×88, the type's default icon, and the name in inline edit with the placeholder text selected.
- Releasing outside the canvas bounds creates nothing and shows no error.
- Double-clicking a palette item creates the node at viewport centre, offset so it does not exactly overlap an existing node.
- Node creation is a single undo entry.
- Hovering a node reveals four connection handles at its edge midpoints. Dragging from one shows a live preview edge following the pointer with valid drop targets highlighted.
- Release over another node creates an edge with `direction: "forward"`, arrowhead at the target, label in inline edit.
- Release over empty canvas opens the quick-add menu with level-valid types only; choosing one creates node **and** edge as **one** undo entry. `Escape` closes it and creates nothing.
- Release over the origin node creates nothing and shows a transient toast explaining self-edges are unsupported in MVP.
- A second A→B edge is allowed and both render readably (offset delivered by T2-A per §4.3 — verify it, do not implement it).
- Palette is keyboard-reachable with a visible focus ring; the drag affordance has an accessible name.

**Definition of done:** `pnpm lint`, `pnpm typecheck` pass. `pnpm build` at batch integration.

---

#### T2-C · Hierarchy navigation: drill-down, breadcrumb, animated transitions

**Stories:** AF-E2-S2, AF-E2-S3, AF-E2-S4

**Scope.** Moving between levels. Double-click drills when the node has a child diagram (D5); `Cmd/Ctrl+↓` drills from a selection; a node context menu offers "Drill into" on a leaf, which calls `createChildDiagram` and navigates in. The breadcrumb shows `Name [Level]` per segment, navigates on click restoring that level's last viewport and last selection, collapses middle segments into a `…` menu when too wide, and `Cmd/Ctrl+↑` climbs with a subtle shake at the root. Level transitions scale-and-fade anchored on the drilled node's bounds in 250–400ms ease-out, inverse on the way up ending with the parent node briefly highlighted, instant cut under `prefers-reduced-motion`, and interrupt cleanly under rapid input.

**Files it OWNS**
- `src/features/editor/components/breadcrumb.tsx` (taken over from T1-B), `components/breadcrumb-overflow-menu.tsx`
- `src/features/editor/components/overlays/level-transition.tsx` (taken over)
- `src/features/editor/components/overlays/node-context-menu.tsx` (taken over)
- `src/features/editor/hooks/use-level-navigation.ts` — drill/climb orchestration, registers `Cmd+↓`/`Cmd+↑` via the shortcut registry.

**May READ, must NOT modify:** `state/**` (use `setActiveDiagram`, `createChildDiagram`, `setViewport`, `selectBreadcrumb`), `lib/motion.ts`, `components/canvas.tsx`, `components/nodes/**`.

**Depends on:** T1-A (`createChildDiagram`, `selectBreadcrumb`, per-diagram viewport and last-selection maps), T1-B (`onNodeDoubleClick`/`onNodeContextMenu` wiring, `lib/motion.ts`, overlay stubs).

**Acceptance criteria**
- Double-clicking a node **with** a child diagram navigates into it and adds a breadcrumb segment. Double-clicking a node **without** one falls through to rename (T2-A) — verify both, do not implement rename.
- `Cmd/Ctrl+↓` on a single selected node with children drills; on a leaf it is a no-op.
- Context menu on a leaf offers "Drill into"; choosing it creates an empty child diagram one level deeper and navigates in, as **one** undo entry. Navigation itself is **not** an undo entry.
- A `code`-level node offers no drill affordance in any form.
- Breadcrumb renders the full path as `Internet Banking [Context] › API Gateway [Container] › Auth Handler [Component]`.
- Clicking an ancestor segment navigates there and restores that level's last pan+zoom **and** re-selects and scrolls into view the node that was selected there.
- `Cmd/Ctrl+↑` goes to the parent; at the root it is a no-op with a subtle shake on the breadcrumb.
- At a window width that overflows, middle segments collapse into a `…` menu; root and current stay visible.
- Drill transition: outgoing level scales up and fades out anchored on the drilled node's bounds while the child scales in from those bounds, 250–400ms, ease-out. Climbing plays the inverse and briefly highlights the parent node.
- Under `prefers-reduced-motion: reduce`, transitions are an instant cut with a ≤100ms opacity fade only.
- Six rapid drill/climb actions in under a second leave no ghost layer, no stuck opacity, and the correct final level.
- The transition animates `transform` and `opacity` only. A DevTools performance recording during a transition shows no layout invalidation of the canvas subtree — attach it.

**Definition of done:** `pnpm lint`, `pnpm typecheck` pass. `pnpm build` at batch integration.

---

#### T2-D · Inspector panel and delete-with-consequences

**Stories:** AF-E3-S2, AF-E3-S3, AF-E3-S4

**Scope.** The right-hand inspector, driven by selection. One node selected: editable `name`, `description` (multiline, ≤500 chars, counter), `technology` (free text with autocomplete from the icon registry — typing "post" suggests "PostgreSQL"), `type` (constrained to the level's valid types), `icon` (swatch opening T2-A's `IconPicker`), `tags`. One edge selected: `label`, `technology`, `direction`, `style`. No selection: diagram-level `title` and `description` (read-only `updatedAt`). Field edits commit on blur or after a 300ms debounce as one undo entry per coherent edit. Plus deletion: immediate for a childless node, immediate with a "Removed 1 node and 3 relationships — Undo" toast when it has edges, and a confirmation dialog naming the node and the descendant node/level counts when it owns a child diagram.

**Files it OWNS**
- `src/features/editor/components/inspector/inspector-panel.tsx` (taken over from T1-B), `inspector/node-inspector.tsx`, `inspector/edge-inspector.tsx`, `inspector/diagram-inspector.tsx`, `inspector/technology-input.tsx`, `inspector/tag-input.tsx`
- `src/features/editor/components/overlays/delete-confirm-dialog.tsx` (taken over)
- `src/features/editor/hooks/use-delete-shortcut.ts` — registers `Delete`/`Backspace` via the registry.

**May READ, must NOT modify:** `state/**` (`updateNode`, `updateEdge`, `deleteNodes`, `deleteEdges`), `components/icon-picker.tsx` (**import only** — T2-A owns it; code against §4.6), `components/ui/**`, `lib/icons/registry.ts`.

**Depends on:** T1-A (update/delete commands and their return counts), T1-B (`ui/input`, `ui/textarea`, `ui/select`, `ui/dialog`, `toast`, inspector stub), T2-A (`IconPicker` — import the frozen signature; it exists after T2-A's first commit).

**Acceptance criteria**
- Selecting a node shows all six fields populated from the model; editing any of them updates the canvas on blur or 300ms after the last keystroke.
- One coherent edit = one undo entry. Typing "Orders Service" character by character then blurring yields **one** entry, not fourteen (use `updateNode`'s `coalesceKey`).
- `description` hard-caps at 500 characters with a visible counter.
- `technology` autocomplete suggests from icon names and aliases; "post" offers PostgreSQL. Selecting a suggestion does **not** change an explicitly chosen icon.
- Setting `technology` renders it on the node in C4 convention — smaller, bracketed, e.g. `[Go]` — truncating gracefully. `description` renders on the node when it fits and is always in the hover tooltip. (Rendering lives in T2-A; verify it reacts to your writes.)
- The `type` select offers only types valid at the active level; there is no way through the inspector to produce an invalid type.
- Selecting an edge exposes `label`, `technology`, `direction`, `style`. `bidirectional` renders arrowheads at both ends, `none` renders none, `dashed` renders dashed.
- With nothing selected the panel shows diagram `title`, `description`, and read-only `updatedAt`.
- `Delete`/`Backspace` on a childless, edgeless node removes it immediately, no dialog, undoable.
- On a node with edges but no children: removes immediately with its edges and toasts the exact counts, e.g. "Removed 1 node and 3 relationships", with a working Undo action.
- On a node owning a child diagram: a dialog names the node and states the number of descendant nodes and levels to be removed, and requires explicit confirmation. Cancel changes nothing.
- Deleting either endpoint of an edge deletes the edge in the same undo entry.
- Any delete, however large, reverses in exactly one undo.
- Every field has a visible label or accessible name and a visible focus ring. Typing in the inspector never triggers a canvas shortcut.

**Definition of done:** `pnpm lint`, `pnpm typecheck` pass. `pnpm build` at batch integration.

---

### Batch 3 — Persistence and polish

Follows Batch 2 because byte-identical round-trip can only be proven once the model actually carries icons, types, tags, child diagrams and edge properties — serializing a skeleton model proves nothing. Motion polish follows for the same reason: the surfaces it animates must exist. **3 tickets, parallel.**

---

#### T3-A · Deterministic serialization, save, and open

**Stories:** AF-E5-S1, AF-E5-S2

**Scope.** The file format made real, in both directions, and the File System Access API layer with its fallback (D2). Writing: the determinism rules from `data-model.md` §"Determinism rules" — schema-declared key order, `diagrams`/`nodes`/`edges` sorted by id, `tags` sorted lexically, 2-space indent, LF, trailing newline, optional fields omitted rather than `null`, integral numbers, `updatedAt` written only when the model actually changed, unknown fields from newer minor versions preserved verbatim. Reading: the load-time hard errors, refusing the file with the offending JSON path named. Plus save/open UI in the shell's file-actions slot, drag-and-drop of a `.archflow.json` onto the window, and the unsaved-changes prompt when opening over dirty state.

**Files it OWNS**
- `src/features/editor/io/serialize.ts`, `io/deserialize.ts`, `io/validate.ts`, `io/file-access.ts`, `io/index.ts`
- `src/features/editor/components/file-actions.tsx` (taken over from T1-B)
- `src/features/editor/hooks/use-file-shortcuts.ts` — `Cmd+S`, `Cmd+O` via the registry.
- `src/features/editor/hooks/use-file-drop.ts`
- `scripts/roundtrip-check.mjs`, `src/features/editor/io/__fixtures__/shopflow.archflow.json`
- `package.json` — **only** to add `"check:roundtrip"` to `scripts`. No dependency changes.

**May READ, must NOT modify:** `state/**` (`replaceModel`, `markSaved`, `isDirty`), `docs/product/data-model.md`, `src/types/c4.ts`.

**Depends on:** T1-A (`replaceModel`, `markSaved`, `EditorModel`), T1-B (file-actions stub, `ui/dialog`, `toast`).

**Acceptance criteria**
- `Cmd/Ctrl+S` on a never-saved diagram opens the OS save dialog with a filename derived from the title; a subsequent save writes to the same handle with **no** dialog.
- Where `showSaveFilePicker` is absent, save downloads a blob and open uses `<input type="file">`. Feature-detected at call time; verified in both a Chromium browser and Firefox.
- Output is pretty-printed at 2 spaces with the exact key order of `data-model.md`; `diagrams`, `nodes`, `edges` sorted by `id`; `tags` sorted; unset optional fields absent (no `null`, no `""`); LF endings; single trailing newline; `"zoom": 1` not `1.0`; positions integral.
- `pnpm check:roundtrip` reads the committed fixture, deserializes, re-serializes, and asserts **byte equality**. It exits non-zero on any difference and is green on `main`.
- A no-op save (open, change nothing, save) leaves the file byte-identical, including an untouched `updatedAt`.
- `Cmd/Ctrl+O` and drag-drop of a `.archflow.json` both load all levels, render the Context level fit-to-view, and show the root breadcrumb.
- Opening with unsaved changes prompts save / discard / cancel, and cancel truly cancels.
- Each of the 8 hard errors in `data-model.md` is detected on a deliberately broken fixture and reported with the JSON path, e.g. `diagrams[1].nodes[3].type: "servcie" is not valid at level "container"`. The app does not crash and does not half-load — the previous model stays intact.
- A file whose `version` major exceeds ours is refused read-write with an explanation naming the needed upgrade; it is not silently downgraded and unknown fields are not dropped.
- Save failure (revoked handle — reproduce by revoking permission) shows a blocking error naming the cause and offers "Download a copy". The in-memory model survives.
- 500-node fixture saves in <300ms with no visible main-thread stall; `isDirty` clears and the timestamp updates.
- Unknown fields injected into a fixture at file, diagram, node and edge level survive open → save verbatim and in position.

**Definition of done:** `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm check:roundtrip` all pass.

---

#### T3-B · Unsaved-work guard and crash-safe draft recovery

**Stories:** AF-E5-S3, AF-E5-S4

**Scope.** Not losing work. `beforeunload` confirmation while dirty; a dot marker in the header and a `•` prefix on `document.title`, clearing within 100ms of a successful save. An IndexedDB snapshot at most every 5 seconds while dirty, keyed per D19, never touching the user's file on disk. On boot, if a snapshot exists and is newer than the loaded file, offer "Recover unsaved changes" or "Discard", showing both timestamps. Clear the snapshot on successful save.

**Files it OWNS**
- `src/features/editor/io/drafts.ts` — IndexedDB via `idb-keyval`. Snapshots the store's `EditorModel` directly (JSON of the in-memory model); **it does not import T3-A's serializer** — a draft is not a file and does not need canonical formatting. This is deliberate, so the two tickets share nothing.
- `src/features/editor/hooks/use-autosave-draft.ts`, `hooks/use-unsaved-warning.ts`, `hooks/use-document-title.ts`
- `src/features/editor/components/dirty-indicator.tsx` (taken over from T1-B)
- `src/features/editor/components/recovery-prompt.tsx` (taken over from T1-B)

**May READ, must NOT modify:** `state/**` (`isDirty`, `savedAt`, `replaceModel`), `io/**` (T3-A's — do not import `serialize`), `components/ui/**`.

**Depends on:** T1-A (`isDirty`, `savedAt`, `replaceModel`), T1-B (both stubs, `ui/dialog`), T3-A only at integration (a successful save must clear the draft — wire this through the store's `markSaved`, not by calling T3-A).

**Acceptance criteria**
- With unsaved changes, closing or reloading the tab triggers the browser's leave confirmation. With no unsaved changes, it does not.
- While dirty, the header shows a dot marker and `document.title` is prefixed `•`. Both clear within 100ms of a successful save — measured, not eyeballed.
- Snapshots write at most once per 5 seconds and only while dirty. A 60-second editing session produces ≤12 writes, verified in the Application panel.
- Kill the tab mid-edit (DevTools → close without saving), reopen: the recovery prompt appears showing the snapshot timestamp and the on-disk timestamp. "Recover" restores the snapshot into the store and leaves it dirty; "Discard" loads the on-disk state and deletes the snapshot.
- No snapshot, or a snapshot older than the file: no prompt.
- The draft path **never** writes to the user's file. Verified by editing for a minute with the file open in an external editor and confirming zero changes on disk.
- A successful save deletes the matching snapshot.
- Draft keys are per-document: two different files edited in sequence do not cross-recover.

**Definition of done:** `pnpm lint`, `pnpm typecheck` pass. `pnpm build` at batch integration.

---

#### T3-C · Micro-interaction motion and canvas theme parity

**Stories:** AF-E6-S2, AF-E6-S1

**Scope.** The polish pass that makes the editor feel precise, plus closing out AF-E6-S1 properly — that story's acceptance criteria say "canvas, chrome, **nodes, edges, and icons** all update", which was unverifiable when it was built because none of those existed. Adds: hover elevation and handle reveal within 120ms, create fade+scale 0.96→1.0 over 180ms, delete fade+scale-out over 140ms, edge path draw over 200ms, selection outline in over 100ms, drag ghost at 60% opacity. All collapse to instant under `prefers-reduced-motion`. No handler waits on an animation.

**Files it OWNS**
- `src/features/editor/components/nodes/**` (taken over from T2-A — motion and theme fixes only; do not restructure)
- `src/features/editor/components/edges/**` (taken over from T2-A — same constraint)
- `src/features/editor/styles/canvas-motion.css` (imported by `globals.css`)
- `src/app/globals.css` — **only** to add the `@import` for the above and any missing canvas token. Do not restructure the token blocks.

**May READ, must NOT modify:** `lib/motion.ts` (frozen in Batch 1 — use `DURATIONS`), `components/canvas.tsx`, `state/**`, `components/inspector/**`, `io/**`.

**Depends on:** T2-A (node/edge components exist), T2-C (`lib/motion.ts` usage precedent), T1-B (`lib/motion.ts`).

**Acceptance criteria**
- Node hover raises elevation and reveals connection handles within 120ms.
- A newly created node fades and scales 0.96→1.0 over 180ms; a deleted node fades and scales out over 140ms before unmount.
- A new edge animates its path draw from source to target over 200ms.
- Selection outline animates in over 100ms; a drag ghost renders at 60% opacity.
- All of the above become instant state changes under `prefers-reduced-motion: reduce`, driven by `lib/motion.ts` — not by a duplicate media query in a component.
- No interaction handler awaits an animation: creating five nodes in rapid succession never drops or delays one, and a drag started during a create animation is not swallowed.
- Animations use `transform`/`opacity` only. A performance recording of 20 create/delete/select actions on the 150-node fixture shows no layout thrash — attach it.
- **AF-E6-S1 closeout:** toggling theme cross-fades canvas, chrome, nodes, edges and icons in ≤150ms with no flash of unstyled content; the choice persists across a reload; node text on node fill measures ≥4.5:1 and node/edge borders ≥3:1 in **both** themes — attach the measured ratios for `--node-foreground` on `--node`, `--node-border` on `--node`, and `--edge` on `--canvas`, for light and dark. Any failure is fixed by adjusting the token in `globals.css`, never by hardcoding a colour in a component.
- `grep -rE '#[0-9a-fA-F]{3,8}|oklch\(|rgb\(' src/features/editor` returns nothing.

**Definition of done:** `pnpm lint`, `pnpm typecheck`, `pnpm build` pass. Contrast measurements and the performance recording attached to the ticket.

---

## 4. Shared contracts

Frozen. Code against these, not against another ticket's implementation. Changing a signature here is a conversation, not a commit.

### 4.1 The store — `src/features/editor/state/index.ts` (T1-A)

```ts
import type {
  ArchFlowMetadata, C4Diagram, C4Edge, C4Level, C4Node, C4NodeType,
  EdgeDirection, EdgeStyle, Point, Viewport,
} from "@/types";

/** The model in memory. Diagrams keyed by id; serialized back to a sorted array. */
export interface EditorModel {
  version: string;
  metadata: ArchFlowMetadata;
  rootDiagramId: string;
  diagrams: Record<string, C4Diagram>;
  /** Unknown top-level fields from a newer minor version, preserved verbatim. */
  unknownFields: Record<string, unknown>;
}

export interface Selection {
  nodeIds: string[];
  edgeIds: string[];
}

export interface LabelEditTarget {
  kind: "node" | "edge";
  id: string;
}

export interface BreadcrumbSegment {
  diagramId: string;
  /** Owner node's name, or the model title at the root. */
  label: string;
  level: C4Level;
}

export interface DeleteResult {
  removedNodes: number;
  removedEdges: number;
  removedDiagrams: number;
}

export interface EditorState {
  model: EditorModel;
  activeDiagramId: string;
  selection: Selection;
  labelEdit: LabelEditTarget | null;
  /** Per-diagram camera, for breadcrumb restore (AF-E2-S3). */
  viewportByDiagramId: Record<string, Viewport>;
  /** Per-diagram last selected node id, for breadcrumb restore. */
  lastSelectedByDiagramId: Record<string, string | null>;
  isDirty: boolean;
  /** epoch ms of the last successful save to disk, or null. */
  savedAt: number | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Set by T3-A after a successful save; used for the draft key (D19). */
  fileHandleName: string | null;
}

export interface EditorActions {
  /* ---- model mutations. Each call is exactly ONE undo entry. ---- */
  createNode(input: {
    diagramId: string;
    type: C4NodeType;
    position: Point;
    name?: string;
    size?: { width: number; height: number };
  }): string; // new node id. Throws InvalidNodeTypeError.

  updateNode(
    diagramId: string,
    nodeId: string,
    patch: Partial<Omit<C4Node, "id">>,
    /** Successive calls sharing a coalesceKey collapse into one undo entry. */
    opts?: { coalesceKey?: string },
  ): void;

  /** Absolute final positions, keyed by node id. One entry for the whole drag. */
  moveNodes(diagramId: string, positions: Record<string, Point>): void;

  deleteNodes(diagramId: string, nodeIds: string[]): DeleteResult;

  createEdge(input: {
    diagramId: string;
    source: string;
    target: string;
    direction?: EdgeDirection;
    label?: string;
    technology?: string;
    style?: EdgeStyle;
  }): string; // new edge id. Throws CrossDiagramEdgeError; refuses source === target.

  updateEdge(diagramId: string, edgeId: string, patch: Partial<Omit<C4Edge, "id">>,
    opts?: { coalesceKey?: string }): void;
  deleteEdges(diagramId: string, edgeIds: string[]): DeleteResult;

  updateDiagram(diagramId: string, patch: Partial<Pick<C4Diagram, "title" | "description">>,
    opts?: { coalesceKey?: string }): void;
  updateMetadata(patch: Partial<ArchFlowMetadata>): void;

  /** Creates the child diagram one level deeper and sets BOTH pointers. Throws MaxDepthError at `code`. */
  createChildDiagram(diagramId: string, nodeId: string): string; // child diagram id

  /** Groups several mutations into ONE undo entry. Nested calls join the outer transaction. */
  transact<T>(label: string, fn: () => T): T;

  /* ---- view state. NEVER an undo entry. ---- */
  setActiveDiagram(diagramId: string): void;
  setSelection(selection: Selection): void;
  toggleNodeSelection(nodeId: string): void;
  clearSelection(): void;
  setViewport(diagramId: string, viewport: Viewport): void;
  beginLabelEdit(target: LabelEditTarget): void;
  /** commit=false reverts. An empty committed value keeps the previous one. */
  endLabelEdit(commit: boolean, value?: string): void;

  /* ---- history ---- */
  undo(): void;
  redo(): void;

  /* ---- persistence seams ---- */
  replaceModel(model: EditorModel, opts: { markSaved: boolean; fileHandleName?: string | null }): void;
  markSaved(at: number, fileHandleName?: string | null): void;
}

export type EditorStore = EditorState & EditorActions;

/** The only store. Zustand; use with a selector to avoid over-rendering. */
export declare const useEditorStore: import("zustand").UseBoundStore<
  import("zustand").StoreApi<EditorStore>
>;

/* ---- selectors: pure, (state) => value, safe in useEditorStore(...) ---- */
export declare function selectActiveDiagram(s: EditorState): C4Diagram;
export declare function selectActiveLevel(s: EditorState): C4Level;
export declare function selectValidNodeTypes(s: EditorState): readonly C4NodeType[];
/** Root → current, always at least one segment. */
export declare function selectBreadcrumb(s: EditorState): BreadcrumbSegment[];
export declare function selectChildCount(s: EditorState, nodeId: string): number;
/** For parallel-edge offsetting: edgeId → { index, count } within its source|target group. */
export declare function selectParallelEdgeGroups(
  s: EditorState,
): Record<string, { index: number; count: number }>;

export declare class InvalidNodeTypeError extends Error {
  readonly level: C4Level;
  readonly attempted: C4NodeType;
  readonly valid: readonly C4NodeType[];
}
export declare class MaxDepthError extends Error {}
export declare class CrossDiagramEdgeError extends Error {}
```

### 4.2 Custom node prop contract (T1-B defines, T2-A implements)

```ts
import type { Node, NodeProps } from "@xyflow/react";
import type { C4Level, C4Node, C4NodeType } from "@/types";

export interface C4NodeData extends Record<string, unknown> {
  /** The model node. Read-only — mutate via the store, never in place. */
  node: C4Node;
  /** The containing diagram's level. A node's level is never stored on the node. */
  level: C4Level;
  hasChildren: boolean;
  childCount: number;
  /** node.externalRef present ⇒ read-only boundary placeholder. */
  isPlaceholder: boolean;
  isEditingLabel: boolean;
  /** Icon slug after type-default resolution. Never empty. */
  resolvedIcon: string;
}

/** React Flow node id === C4Node.id. `type` === C4NodeType. */
export type C4FlowNode = Node<C4NodeData, C4NodeType>;
export type C4NodeComponentProps = NodeProps<C4FlowNode>;
// `selected`, `dragging`, `id`, `width`, `height` come from React Flow — do not duplicate them in data.
```

### 4.3 Custom edge prop contract (T1-B defines, T2-A implements)

```ts
import type { Edge, EdgeProps } from "@xyflow/react";
import type { C4Edge } from "@/types";

export interface C4EdgeData extends Record<string, unknown> {
  edge: C4Edge;
  isEditingLabel: boolean;
  /** 0-based position within the set of edges sharing this source|target pair. */
  parallelIndex: number;
  /** Size of that set. 1 ⇒ draw straight; >1 ⇒ offset the curve. */
  parallelCount: number;
}

export type C4FlowEdge = Edge<C4EdgeData, "c4">;
export type C4EdgeComponentProps = EdgeProps<C4FlowEdge>;
```

### 4.4 Mount-point stub contract (T1-B creates them all)

Every stub is **props-free** and reads the store itself. This is what makes them independently ownable.

```ts
// Mounted by editor-shell.tsx
export declare function Palette(): React.JSX.Element;
export declare function Breadcrumb(): React.JSX.Element;
export declare function InspectorPanel(): React.JSX.Element;
export declare function FileActions(): React.JSX.Element;
export declare function DirtyIndicator(): React.JSX.Element | null;
export declare function RecoveryPrompt(): React.JSX.Element | null;

// Mounted by canvas.tsx, inside the React Flow viewport wrapper
export declare function AlignmentGuides(): React.JSX.Element | null;
export declare function QuickAddMenu(): React.JSX.Element | null;
export declare function LevelTransition(): React.JSX.Element | null;
export declare function DeleteConfirmDialog(): React.JSX.Element | null;
export declare function NodeContextMenu(): React.JSX.Element | null;

// Registries consumed by canvas.tsx
export declare const nodeTypes: import("@xyflow/react").NodeTypes; // keys: C4NodeType values
export declare const edgeTypes: import("@xyflow/react").EdgeTypes; // key: "c4"
```

### 4.5 Shortcut registry — `hooks/use-keyboard-shortcuts.ts` (T1-B)

Each ticket registers its bindings from **its own hook file**. Nobody edits a shared keymap.

```ts
export interface ShortcutContext {
  store: EditorStore;
  event: KeyboardEvent;
}

export interface ShortcutBinding {
  /** Unique; duplicate ids throw in dev so collisions surface immediately. */
  id: string;
  /** e.g. "mod+z", "mod+shift+z", "mod+ArrowDown", "shift+1", "F2", "Escape". `mod` = Cmd on macOS, Ctrl elsewhere. */
  combo: string;
  when?: (ctx: ShortcutContext) => boolean;
  run: (ctx: ShortcutContext) => void;
  /** Default true. */
  preventDefault?: boolean;
}

/** Call inside an effect; returns the unregister function. */
export declare function useShortcuts(bindings: ShortcutBinding[]): void;
```

Bindings never fire while focus is inside `input`, `textarea`, or `[contenteditable]` — enforced centrally by T1-B; do not re-check it per binding. Reserved by T1-A/T1-B: `mod+z`, `mod+shift+z`, `mod+a`, `Escape`, `shift+1`, `shift+0`, arrow keys. Claimed elsewhere: `mod+ArrowDown`/`mod+ArrowUp` (T2-C), `Delete`/`Backspace` (T2-D), `F2`/`Enter` (T2-A), `mod+s`/`mod+o` (T3-A).

### 4.6 Icon registry and picker — T2-A

```ts
export type IconCategory =
  | "languages" | "databases" | "messaging" | "networking" | "cloud" | "generic";

export interface IconDef {
  slug: string;                  // "postgresql" — what the model stores
  name: string;                  // "PostgreSQL"
  aliases: string[];             // ["pg", "postgres"]
  category: IconCategory;
  Svg: React.FC<React.SVGProps<SVGSVGElement>>; // inline, currentColor where monochrome
  monochrome: boolean;
}

export declare const ICONS: Record<string, IconDef>;
export declare const DEFAULT_ICON_BY_TYPE: Record<C4NodeType, string>;
/** Never throws; unknown slug ⇒ the type's generic fallback, flagged. */
export declare function resolveIcon(
  node: Pick<C4Node, "icon" | "type">,
): { def: IconDef; isFallback: boolean };
export declare function searchIcons(query: string): IconDef[];

/** T2-D imports exactly this. */
export declare function IconPicker(props: {
  value?: string;
  nodeType: C4NodeType;
  onChange: (slug: string) => void;
  onClose: () => void;
}): React.JSX.Element;
```

### 4.7 Palette drag payload — `lib/drag-payload.ts` (T2-B), consumed by `canvas.tsx` (T1-B)

```ts
export const PALETTE_DRAG_MIME = "application/x-arch-flow-node-type";

export interface PaletteDragPayload {
  nodeType: C4NodeType;
  /** The level the palette was showing; canvas rejects a mismatch with the active level. */
  level: C4Level;
}

export declare function encodePaletteDrag(dt: DataTransfer, payload: PaletteDragPayload): void;
export declare function decodePaletteDrag(dt: DataTransfer): PaletteDragPayload | null;
```

### 4.8 Motion helper — `lib/motion.ts` (T1-B, frozen)

```ts
export declare function prefersReducedMotion(): boolean;
export declare const DURATIONS: {
  readonly hover: 120;
  readonly nodeIn: 180;
  readonly nodeOut: 140;
  readonly edgeDraw: 200;
  readonly selection: 100;
  readonly levelTransition: 320;   // within the 250–400ms band
  readonly fitView: 300;
  readonly themeCrossfade: 150;
};
/** Returns 0 (or the reduced-motion equivalent) when reduced motion is requested. */
export declare function duration(key: keyof typeof DURATIONS): number;
```

### 4.9 Toast — `src/components/ui/toast.tsx` (T1-B, frozen)

```ts
export declare function toast(input: {
  message: string;
  tone?: "info" | "warning" | "error";
  action?: { label: string; run: () => void };
  durationMs?: number; // default 5000
}): void;
export declare function Toaster(): React.JSX.Element; // mounted once by editor-shell
```

---

## 5. Out of scope this round

Do not build these. Do not "prepare" for them beyond the extension points already named above. If a ticket's implementation seems to need one, escalate instead.

| Story | Why out |
|---|---|
| AF-E1-S8 copy/paste/duplicate, AF-E1-S9 resize, AF-E1-S10 auto-layout | v0.2 / later. Resize handles are hidden this sprint; default sizes plus text wrapping only. |
| AF-E2-S5 boundary placeholder inheritance | v0.2. A new child diagram starts **empty** — no placeholder seeding. `externalRef` is honoured on load (render as read-only) but never authored. |
| AF-E2-S6 validation panel | v0.3. Load-time **hard errors** are in scope (T3-A); the warnings list and its panel are not. |
| AF-E3-S5 cross-level search (`Cmd+K`), AF-E3-S6 tags + tag filtering | v0.2. `tags` round-trip through the file and are editable in the inspector, but there is no filter UI and no tag colours. |
| AF-E4-S3 technology→icon inference, AF-E4-S4 custom icon import | v0.2 / v0.3. `iconSource` is written correctly (`explicit` when the user picks) so the later rule works, but nothing auto-swaps an icon. |
| AF-E5-S5 recent files, AF-E5-S6 diagram metadata beyond title/description, AF-E5-S7 multi-file split | v0.2 / later. No start screen (D16); no `owner`/`lastReviewedAt` editing; no "review overdue" chip; `childRef` is unsupported. |
| AF-E6-S3 custom theme tokens, AF-E6-S4 accessibility epic, AF-E6-S5 presentation-grade edge routing | v0.3 / later. Baseline focus rings and semantic controls only — named debt, not an oversight. Edges use React Flow's default routing; no obstacle avoidance. |
| AF-E7-S1..S4 viewer, presentation, HTML export, deep links | v0.2 / v0.3. |
| AF-E8-S1..S3 PNG/SVG/Mermaid export, Structurizr import | v0.2 / later. Screenshots are the interim answer. |
| AF-E8-S4 multiplayer | Won't. Collaboration is git. |

Also explicitly out: a test framework (D18), a published JSON Schema URL, telemetry, and any icon beyond the 16 in D15.

---

## 6. Integration risks

**R1 · Two sources of truth for node positions (highest risk).** React Flow wants to own `nodes`; our store owns the model. Get this wrong and you get drag jank, lost positions, or a history entry per animation frame. **The rule:** nodes/edges are *derived* from the store by `use-canvas-nodes.ts` via a memoized selector; during a drag, positions live in React Flow's local state only; on drag stop, exactly one `moveNodes` call commits absolute final positions. **Check:** drag a node 400px and confirm the history grows by exactly 1; drag a 20-node multi-selection and confirm the same; confirm React DevTools shows no re-render of unrelated nodes during a drag.

**R2 · Undo history polluted by React Flow's change events.** `onNodesChange` fires for selection, dimension measurement, and hover — none of which are model changes. **Check:** select five nodes one by one, hover ten, resize the window, navigate two levels, then press undo once — it must reverse the last real *edit*, not a selection. Only `position` (on drag stop) and `remove` changes may reach the store.

**R3 · File System Access API reality.** Requires a secure context; absent in Firefox and Safari; handles are revoked after some navigations; permission may need re-prompting; save can fail mid-write. **Check:** all four paths explicitly — Chromium happy path, Chromium with a revoked handle (expect the blocking error + "Download a copy"), Firefox fallback download, Firefox fallback `<input type="file">` open. Never branch on user-agent; branch on `typeof window.showSaveFilePicker === "function"`.

**R4 · Byte-identical round-trip is brittle.** Key order, omitted-vs-null optionals, integral zoom, sorted tags, `updatedAt` only-when-changed, and verbatim preservation of unknown fields each break it independently, and only one of them shows up in casual testing. **Check:** `pnpm check:roundtrip` must be part of the T3-A definition of done and must include a fixture carrying unknown fields at file, diagram, node **and** edge level, plus a node with every optional field absent and one with all present.

**R5 · Double-click and keyboard focus collisions.** Double-click is overloaded (drill vs rename, D5); React Flow also has pane and node double-click handlers; `Enter`/`F2`/`Escape`/`Delete` mean different things inside an inline editor, inside the inspector, and on the canvas. **Check:** with an inline label editor open, press `Delete` (must edit text, not delete the node), `Escape` (revert the label, not clear the selection), `Cmd+Z` (undo the *text*, not the model). Then double-click a node with children (drill), one without (rename), and the pane (nothing). Then confirm `Escape` while the quick-add menu is open closes only the menu.

**R6 · Level transition versus React Flow remount.** Swapping `activeDiagramId` replaces the entire node set mid-animation; naive implementations leave ghost layers or animate into an empty canvas. **Check:** six rapid drill/climb actions in one second — correct final level, no stuck opacity, no orphaned transform layer in the Layers panel.

---

## 7. Traceability — all 23 Must stories

| Story | Priority | Size | Batch | Ticket |
|---|---|---|---|---|
| AF-E1-S1 pan and zoom | Must | M | 1 | T1-B |
| AF-E1-S2 add node from palette | Must | M | 2 | T2-B |
| AF-E1-S3 move with snapping and guides | Must | M | 1 | T1-B |
| AF-E1-S4 select / multi / box-select | Must | M | 1 | T1-B |
| AF-E1-S5 connect two nodes with an edge | Must | L | 2 | T2-B |
| AF-E1-S6 edit labels inline | Must | M | 2 | T2-A |
| AF-E1-S7 undo/redo across every edit | Must | L | 1 | T1-A |
| AF-E2-S1 four-level model, level-aware canvas | Must | M | 1 | T1-A |
| AF-E2-S2 drill down into a child diagram | Must | L | 2 | T2-C |
| AF-E2-S3 breadcrumb navigation | Must | M | 2 | T2-C |
| AF-E2-S4 animated level transitions | Must | M | 2 | T2-C |
| AF-E3-S1 level-appropriate node types | Must | M | 2 | T2-A |
| AF-E3-S2 node properties panel | Must | M | 2 | T2-D |
| AF-E3-S3 relationship properties | Must | M | 2 | T2-D |
| AF-E3-S4 delete with clear consequences | Must | S | 2 | T2-D |
| AF-E4-S1 built-in tech-stack icon set | Must | M | 2 | T2-A |
| AF-E4-S2 searchable icon picker | Must | M | 2 | T2-A |
| AF-E5-S1 save to a local JSON file | Must | L | 3 | T3-A |
| AF-E5-S2 open an existing diagram file | Must | M | 3 | T3-A |
| AF-E5-S3 warn before losing unsaved work | Must | S | 3 | T3-B |
| AF-E5-S4 crash-safe draft recovery | Must | M | 3 | T3-B |
| AF-E6-S1 dark default, light available | Must | M | 3 | T3-C (closeout — canvas/node/edge/icon parity + measured contrast; chrome shipped pre-sprint) |
| AF-E6-S2 micro-interaction polish | Must | M | 3 | T3-C |

23 of 23 Must stories, each in exactly one ticket. 9 tickets across 3 batches: **Batch 1** T1-A, T1-B · **Batch 2** T2-A, T2-B, T2-C, T2-D · **Batch 3** T3-A, T3-B, T3-C.
