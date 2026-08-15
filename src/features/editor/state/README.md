# `state/` — the model store

One Zustand store holding the whole in-memory C4 model and **every**
mutation applied to it this sprint. Other tickets import **only** from
`./index.ts` and treat this directory as read-only.

## Invariants

1. **One mutating action = exactly one history entry.** `createNode`,
   `updateNode`, `moveNodes`, `deleteNodes`, `createEdge`, `updateEdge`,
   `deleteEdges`, `updateDiagram`, `updateMetadata`, `createChildDiagram`
   each push one snapshot; `transact()` groups several into one; a
   `coalesceKey` collapses a rapid same-key run (label typing) into one.
2. **Mutations live only here.** UI code never edits the model in place —
   `data.node` objects handed to components are read-only by convention.
3. **View state is never history.** `setActiveDiagram`, `setSelection`,
   `toggleNodeSelection`, `clearSelection`, `setViewport`, `beginLabelEdit`
   create no entry; undo/redo never changes the camera or selection except to
   prune ids that no longer exist.
4. **Snapshots, not inverse commands.** History is a 100-deep ring
   buffer of model snapshots; entry 101 evicts entry 1; it is _not_ cleared
   by level navigation. Every model object in the store is immutable once
   set — mutations run on a fresh `structuredClone` and swap it in, which is
   what makes the previous object a valid snapshot.
5. **Dirty tracking is revision-based.** Each mutation bumps a revision;
   snapshots carry the revision they restore. `isDirty` is
   `revision !== savedRevision`, so undoing back to the last-saved snapshot
   clears the dirty flag.
6. **Level rules are enforced here, not in the UI.**
   `createNode` throws `InvalidNodeTypeError` (message names the valid
   types); `createEdge` throws `CrossDiagramEdgeError` for cross-diagram
   endpoints and refuses self-edges; `createChildDiagram` throws
   `MaxDepthError` at `code` and always creates the level exactly one step
   deeper, setting both tree pointers.
7. **Geometry is normalised on write.** Every `position` the store writes is
   a multiple of 8; every `size` is ≥ 120×64.
8. **A thrown mutation changed nothing.** Validation happens before any
   snapshot or model swap.

## Files

| File           | Purpose                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `store.ts`     | The store: `EditorState` + `EditorActions` per                                                             |
| `history.ts`   | Snapshot ring buffer, coalescing, `transact()`                                                                              |
| `model.ts`     | Pure helpers: slugs/id de-collision, delete cascade, child-diagram back-pointers, grid/size normalisation, boot model |
| `selectors.ts` | The pure selectors (`selectActiveDiagram`, `selectBreadcrumb`, …), memoized on object identity                              |
| `errors.ts`    | `InvalidNodeTypeError`, `MaxDepthError`, `CrossDiagramEdgeError`                                                            |
| `index.ts`     | The barrel — the only import path for other tickets                                                                         |
