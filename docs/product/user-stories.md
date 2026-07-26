# arch-flow — Epics & User Stories

**Story ID format:** `AF-E<epic>-S<story>`
**Priority:** MoSCoW — Must (MVP-blocking), Should (important, ship soon after), Could (nice, unscheduled), Won't (explicitly out for now)
**Size:** S ≈ ≤1 day · M ≈ 2–3 days · L ≈ ~1 week · XL ≈ >1 week, should probably be split before it's picked up

**Personas referenced**
- **Author** — engineer/tech lead editing the model (primary)
- **Architect** — maintains cross-team Context/Container levels (secondary)
- **Reader** — read-only consumer (tertiary)
- **Reviewer** — engineer reading the JSON diff in an MR (a Reader with git)

| Epic | Stories | Must | Should | Could | Won't |
|---|---|---|---|---|---|
| E1 · Canvas & Editing | 10 | 7 | 2 | 1 | — |
| E2 · C4 Hierarchy & Drill-down | 6 | 4 | 1 | 1 | — |
| E3 · Node & Relationship Modeling | 6 | 4 | 2 | — | — |
| E4 · Icon & Stack Library | 4 | 2 | 1 | 1 | — |
| E5 · Persistence (Local JSON) | 7 | 4 | 2 | 1 | — |
| E6 · Theming, Visual Design & Animation | 5 | 2 | 2 | 1 | — |
| E7 · Viewer / Presentation Mode | 4 | — | 2 | 2 | — |
| E8 · Import / Export & Interop | 4 | — | 1 | 2 | 1 |
| **Total** | **46** | **23** | **13** | **9** | **1** |

---

## E1 · Canvas & Editing

The draw.io-grade table stakes. If this epic is mediocre, nothing else matters — users bounce in the first 60 seconds.

### AF-E1-S1 · Pan and zoom the canvas
**As an** Author, **I want** to pan and zoom the canvas fluidly, **so that** I can work on a large diagram without losing my place.

**Acceptance criteria**
- **Given** a diagram is open, **when** I scroll with a trackpad two-finger gesture or hold Space and drag, **then** the canvas pans and the pointer stays locked to the same model coordinate under it.
- **Given** the canvas, **when** I `Cmd/Ctrl` + scroll or pinch, **then** zoom changes anchored on the pointer position, clamped to **10%–400%**.
- **Given** any zoom level, **when** I press `Shift+1`, **then** the viewport animates to fit all nodes with 48px padding in ≤300ms; `Shift+0` resets to 100% centred on selection.
- **Given** a 150-node diagram, **when** I pan continuously for 5 seconds, **then** measured frame rate stays **≥55fps** (Chrome, M-series laptop, no throttling).
- Current zoom % is displayed and clickable to reset.

**Priority:** Must · **Size:** M

### AF-E1-S2 · Add a node by drag-and-drop from a palette
**As an** Author, **I want** to drag a node type from a side palette onto the canvas, **so that** creating elements is discoverable without learning shortcuts.

**Acceptance criteria**
- **Given** the palette shows the node types valid for the current C4 level (see AF-E3-S1), **when** I drag one onto the canvas and release, **then** a node is created with its top-left at the drop point snapped to grid, default size, a default icon for its type, and the name field in inline-edit mode with the placeholder text selected.
- **Given** I drag a node type but release outside the canvas bounds, **then** no node is created and no error appears.
- **Given** the palette, **when** I double-click a node type instead of dragging, **then** a node is created at the viewport centre (offset to avoid exact overlap with an existing node).
- Node creation is a single undo step.

**Priority:** Must · **Size:** M

### AF-E1-S3 · Move nodes with snapping and alignment guides
**As an** Author, **I want** nodes to snap to a grid and show alignment guides, **so that** my diagram looks tidy without manual pixel-nudging.

**Acceptance criteria**
- **Given** grid snapping is on (default), **when** I drag a node, **then** its position quantises to an **8px** grid.
- **Given** I drag a node within **6px** of horizontal or vertical alignment with another node's edge or centre, **then** a 1px accent-coloured guide line appears and the node snaps to that alignment.
- **Given** I hold `Alt/Option` while dragging, **then** snapping and guides are suspended for free positioning.
- **Given** a node is selected, **when** I press an arrow key, **then** it moves 8px; with `Shift`, 1px.
- **Given** I drag a node, **then** all connected edges re-route live during the drag, not only on release.
- A drag from press to release is one undo step regardless of distance.

**Priority:** Must · **Size:** M

### AF-E1-S4 · Select, multi-select, and box-select
**As an** Author, **I want** to select several nodes at once, **so that** I can move or delete a whole subsystem in one action.

**Acceptance criteria**
- **Given** the canvas, **when** I click a node, **then** it becomes the sole selection and shows a selection outline plus resize handles.
- **Given** a selection, **when** I `Shift`-click another node, **then** it is added; `Shift`-clicking a selected node removes it.
- **Given** I press on empty canvas and drag, **then** a marquee appears and every node **intersecting** it is selected on release (edges are selected only if both endpoints are).
- **Given** a multi-selection, **when** I drag any member, **then** all members move together preserving relative positions, as one undo step.
- `Cmd/Ctrl+A` selects all on the current level only — never nodes on other levels. `Escape` clears selection.

**Priority:** Must · **Size:** M

### AF-E1-S5 · Connect two nodes with an edge
**As an** Author, **I want** to drag from one node to another to create a relationship, **so that** describing how the system talks to itself is as fast as drawing it.

**Acceptance criteria**
- **Given** I hover a node, **then** four connection handles appear on its edge midpoints.
- **Given** I press a handle and drag, **then** a live preview edge follows the pointer; valid drop targets are highlighted.
- **Given** I release over another node, **then** an edge is created with an arrowhead at the target and the label field in inline-edit mode.
- **Given** I release over empty canvas, **then** a quick-add menu appears offering to create a new node of a level-valid type already connected; pressing `Escape` cancels and creates nothing.
- **Given** I release over the same node I started from, **then** no self-edge is created in MVP and a transient toast explains why.
- **Given** an edge already exists between A→B, **when** I create a second A→B edge, **then** it is allowed (two distinct relationships) and the two are rendered with an offset curve so both remain readable.

**Priority:** Must · **Size:** L

### AF-E1-S6 · Edit labels inline
**As an** Author, **I want** to rename a node or edge by double-clicking it, **so that** I never hunt for a properties panel to fix a typo.

**Acceptance criteria**
- **Given** a node, **when** I double-click it or select it and press `Enter`/`F2`, **then** a text caret appears over the node's name with existing text selected.
- **Given** inline edit is active, **when** I press `Enter`, **then** the value commits; `Escape` reverts to the prior value; clicking elsewhere commits.
- **Given** a name longer than the node width, **then** the text wraps to a maximum of 3 lines and truncates with an ellipsis, full value visible on hover.
- Inline editing an edge label works the same way, with the label rendered on a background chip so it stays legible over the line.
- An empty committed name falls back to the previous value, never to a blank node.

**Priority:** Must · **Size:** M

### AF-E1-S7 · Undo/redo across every edit
**As an** Author, **I want** reliable undo/redo, **so that** I can experiment without fear.

**Acceptance criteria**
- **Given** any model-changing action (create/delete/move/resize/relabel/reconnect/property edit/paste/level create), **when** I press `Cmd/Ctrl+Z`, **then** it reverses exactly one logical action; `Cmd/Ctrl+Shift+Z` reapplies it.
- History depth is **≥100** actions and survives navigating between C4 levels within the session.
- **Given** I undo past the point of the last save, **then** the "unsaved changes" indicator updates correctly (returning to the saved state clears it).
- Pure view changes (pan, zoom, selection, level navigation) are **not** undo steps.
- **Given** an undo that removes a node, **then** its edges are restored together with it in the same step.

**Priority:** Must · **Size:** L

### AF-E1-S8 · Copy, paste, and duplicate
**As an** Author, **I want** to duplicate nodes and subsystems, **so that** repetitive structures (three similar services) don't cost three times the work.

**Acceptance criteria**
- **Given** a selection, **when** I press `Cmd/Ctrl+C` then `Cmd/Ctrl+V`, **then** copies appear offset by 16px, selected, with **new IDs** and names suffixed " copy".
- **Given** a multi-selection where both endpoints of an edge are included, **then** the edge is duplicated too and rewired to the copies; edges to non-copied nodes are dropped.
- `Cmd/Ctrl+D` duplicates in place with the same rules, one undo step.
- **Given** a node that owns a child diagram, **when** I duplicate it, **then** I am asked whether to duplicate the child diagram too (deep) or create a copy with no children (shallow); the choice is remembered for the session.

**Priority:** Should · **Size:** M

### AF-E1-S9 · Resize nodes and keep them readable
**As an** Author, **I want** to resize nodes, **so that** important elements can be visually emphasised and long names fit.

**Acceptance criteria**
- **Given** a single selected node, **then** 8 resize handles are shown; dragging one resizes with 8px snapping and a minimum of **120×64px**.
- **Given** I hold `Shift` while resizing, **then** aspect ratio is preserved.
- **Given** a multi-selection, **then** resize handles are hidden in MVP (no group scaling).
- **Given** a resized node, **then** its icon stays at a fixed size and the text block reflows within the new bounds.

**Priority:** Should · **Size:** S

### AF-E1-S10 · Auto-layout assist
**As an** Author, **I want** a one-click tidy-up, **so that** an imported or hastily-drawn diagram becomes presentable.

**Acceptance criteria**
- **Given** a level with nodes, **when** I invoke "Tidy layout", **then** nodes are arranged by a layered algorithm respecting edge direction, animated into place over ≤500ms, as one undo step.
- **Given** I pinned specific nodes, **then** pinned nodes keep their coordinates and the rest lay out around them.
- Tidy layout is never applied automatically — only on explicit invocation.

**Priority:** Could · **Size:** L

---

## E2 · C4 Hierarchy & Drill-down Navigation

The differentiator. This is why arch-flow is not draw.io.

### AF-E2-S1 · Four-level model with a level-aware canvas
**As an** Architect, **I want** the editor to know which C4 level I'm on, **so that** each view stays at a consistent altitude and I can't accidentally mix a database table into a Context diagram.

**Acceptance criteria**
- **Given** the app, **then** the model supports exactly four levels: `context`, `container`, `component`, `code`.
- **Given** I am on a level, **then** the level name is displayed persistently and the palette offers only that level's valid node types (see AF-E3-S1).
- **Given** an attempt to place an invalid type for the current level (e.g. via paste from another level), **then** the app blocks it with an explanatory message naming the valid types — it does not silently coerce the type.
- Each level view has its own independent node positions and its own edge set.

**Priority:** Must · **Size:** M

### AF-E2-S2 · Drill down into a node's child diagram
**As a** Reader, **I want** to click a node and see inside it, **so that** I can go from the big picture to the detail I actually need.

**Acceptance criteria**
- **Given** a node that owns a child diagram, **then** it renders a persistent "has children" affordance (a corner badge with child count).
- **Given** such a node, **when** I double-click it (or select it and press `Cmd/Ctrl+↓`), **then** the canvas transitions to that node's child diagram and the breadcrumb gains a segment. Note: double-click-to-drill and double-click-to-rename conflict — resolved by making double-click **drill** when children exist and **rename** when they don't; rename is always available via `F2`. See Open Question OQ-3.
- **Given** a node with **no** child diagram, **when** I choose "Drill into" from its context menu, **then** an empty child diagram at the next level down is created and opened, pre-seeded with placeholder edges mirroring the parent's relationships (see AF-E2-S5).
- **Given** a `code`-level node (deepest level), **then** no drill-down affordance is offered.
- Drill-down is not an undo step; creating a child diagram is.

**Priority:** Must · **Size:** L

### AF-E2-S3 · Breadcrumb navigation up and across
**As a** Reader, **I want** a breadcrumb, **so that** I always know where I am and can climb back out in one click.

**Acceptance criteria**
- **Given** any depth, **then** a breadcrumb shows the full path, e.g. `Internet Banking [Context] › API Gateway [Container] › Auth Handler [Component]`, each segment showing the node name and its level.
- **Given** the breadcrumb, **when** I click any ancestor segment, **then** the canvas navigates there and restores that level's **last viewport** (pan + zoom) from this session.
- `Cmd/Ctrl+↑` navigates to the parent level; it is a no-op with a subtle shake animation at the root.
- **Given** a breadcrumb too wide for the window, **then** middle segments collapse into a `…` menu, with root and current always visible.
- **Given** I navigate away and return, **then** the previously selected node on that level is re-selected and scrolled into view.

**Priority:** Must · **Size:** M

### AF-E2-S4 · Animated level transitions
**As a** Reader, **I want** drilling down to feel like zooming into the node, **so that** I don't lose spatial orientation between levels.

**Acceptance criteria**
- **Given** I drill into node N, **then** the outgoing level scales up and fades out anchored on N's bounds while the child level scales in from N's bounds, completing in **250–400ms** with an ease-out curve.
- **Given** I navigate up, **then** the inverse animation plays, ending with the parent node briefly highlighted.
- **Given** the OS setting `prefers-reduced-motion: reduce`, **then** transitions become an instant cut with a ≤100ms opacity fade only.
- **Given** a rapid sequence of drill actions, **then** animations interrupt cleanly without visual artifacts or stuck ghost layers.
- Transition runs on compositor-friendly properties (`transform`, `opacity`) only; no layout thrash.

**Priority:** Must · **Size:** M

### AF-E2-S5 · Inherit boundary relationships into a child level
**As an** Architect, **I want** a child diagram to already show the outside world it talks to, **so that** each level is self-consistent with its parent instead of drifting.

**Acceptance criteria**
- **Given** parent node N has relationships to A and B, **when** I create N's child diagram, **then** the child level shows read-only "external" placeholder nodes for A and B positioned at the boundary edges.
- **Given** such a placeholder, **when** I connect an internal child node to it, **then** the model records that the parent-level relationship is realised by that internal element.
- **Given** a parent relationship is deleted, **then** the corresponding child placeholder is flagged as orphaned with a visible warning rather than being silently deleted.
- Placeholders cannot be renamed or repurposed in the child level — editing them navigates to the parent.

**Priority:** Should · **Size:** L

### AF-E2-S6 · Model consistency validation panel
**As an** Architect, **I want** a list of consistency problems, **so that** a large multi-level model doesn't quietly rot.

**Acceptance criteria**
- **Given** a model, **when** I open the Validate panel, **then** it lists: orphaned placeholders, parent relationships with no child realisation, duplicate node names within a level, nodes with no relationships, and edges referencing missing node IDs.
- Each finding is clickable and navigates to the offending element on the right level with it selected.
- Findings are advisory — nothing is auto-fixed and nothing blocks saving.

**Priority:** Could · **Size:** M

---

## E3 · Node & Relationship Modeling

Because we're editing a model, not shapes.

### AF-E3-S1 · Level-appropriate node types
**As an** Author, **I want** the node types C4 actually defines, **so that** my diagram is recognisably C4 and not generic boxes.

**Acceptance criteria**
- **Given** the `context` level, **then** available types are `person`, `softwareSystem`, `externalSystem`.
- **Given** `container`, **then**: `container`, `database`, `queue`, `externalSystem`, `person`.
- **Given** `component`, **then**: `component`, `database`, `queue`, `externalSystem`.
- **Given** `code`, **then**: `codeElement`.
- **Given** each type, **then** it has a distinct default visual treatment: `person` renders with the C4 stick-figure motif, `database` with a cylinder motif, `queue` with a pipe motif, `externalSystem` with a muted fill and dashed border.
- Type is stored in the JSON as a stable string enum, not inferred from appearance.

**Priority:** Must · **Size:** M

### AF-E3-S2 · Node properties panel
**As an** Author, **I want** to fill in a node's description and technology, **so that** the diagram carries the "why" and not only the "what".

**Acceptance criteria**
- **Given** a selected node, **then** an inspector panel shows editable `name`, `description` (multiline, ≤500 chars), `technology` (free text with autocomplete from the icon library, e.g. typing "post" suggests "PostgreSQL"), `type`, `icon`, and `tags`.
- **Given** I edit a field, **then** the canvas updates on blur or after 300ms debounce, as one undo step per coherent edit.
- **Given** `technology` is set, **then** it renders on the node in the C4 convention — smaller, bracketed, e.g. `[Go]` — and truncates gracefully.
- **Given** `description` is set, **then** it renders on the node if it fits, and is always available in a hover tooltip.
- **Given** an empty inspector selection, **then** the panel shows diagram-level metadata instead (see AF-E5-S6).

**Priority:** Must · **Size:** M

### AF-E3-S3 · Relationship properties, direction, and style
**As an** Author, **I want** to describe what flows over a relationship and in which direction, **so that** readers understand the interaction and not just the coupling.

**Acceptance criteria**
- **Given** a selected edge, **then** the inspector exposes `label`, `technology` (e.g. "gRPC", "HTTPS/JSON", "SQL/TCP"), `direction` (`forward` | `bidirectional` | `none`), and `style` (`solid` | `dashed`).
- **Given** `direction: bidirectional`, **then** arrowheads render at both ends; `none` renders no arrowhead.
- **Given** `technology` is set, **then** it renders under the label in smaller bracketed text.
- **Given** an edge whose label plus technology exceeds available space, **then** the label truncates and the full text appears in a hover tooltip — the line is never obscured.
- Deleting either endpoint node deletes the edge in the same undo step.

**Priority:** Must · **Size:** M

### AF-E3-S4 · Delete with clear consequences
**As an** Author, **I want** deletion to tell me what I'm about to lose, **so that** I never destroy a nested level by accident.

**Acceptance criteria**
- **Given** a selected node with no children and no edges, **when** I press `Delete`/`Backspace`, **then** it is removed immediately with no dialog (undo available).
- **Given** a selected node **with** a child diagram, **then** a confirmation names the node and states how many descendant nodes and levels will be removed, requiring explicit confirmation.
- **Given** a selected node with edges but no children, **then** it deletes immediately and its edges go with it, with a toast stating "Removed 1 node and 3 relationships — Undo".
- Any delete, however large, is reversible in exactly one undo.

**Priority:** Must · **Size:** S

### AF-E3-S5 · Search and jump across all levels
**As an** Architect, **I want** to search the whole model, **so that** I can find "Redis" without remembering which of nine levels it lives on.

**Acceptance criteria**
- **Given** any level, **when** I press `Cmd/Ctrl+K`, **then** a palette opens searching node names, descriptions, technologies, and tags across **all** levels.
- **Given** results, **then** each shows the node name, type, and its breadcrumb path; results are keyboard-navigable.
- **Given** I select a result, **then** the app navigates to that node's level, selects it, centres it, and pulses it once.
- Search over a 500-node model returns results in **<100ms** with no visible input lag.

**Priority:** Should · **Size:** M

### AF-E3-S6 · Tags and tag-based visual grouping
**As an** Architect, **I want** to tag nodes (e.g. `team:payments`, `pci`, `deprecated`), **so that** cross-cutting concerns are visible without a second diagram.

**Acceptance criteria**
- **Given** a node, **then** I can add/remove multiple free-text tags with autocomplete from tags already used in the model.
- **Given** a tag filter is active, **then** matching nodes stay at full opacity and non-matching drop to 25% opacity — nothing is hidden or moved.
- **Given** a tag, **then** I can assign it an accent colour that renders as a left border stripe on tagged nodes.
- Tags round-trip through save/load and appear as a sorted array in the JSON for stable diffs.

**Priority:** Should · **Size:** M

---

## E4 · Icon & Stack Library

### AF-E4-S1 · Built-in tech-stack icon set
**As an** Author, **I want** recognisable icons for my stack, **so that** readers parse the diagram in a glance instead of reading every label.

**Acceptance criteria**
- **Given** the library, **then** it ships **at minimum**: Golang, Next.js, MongoDB, MySQL, PostgreSQL, Redis, Cloudflare, nginx, Kong — plus generic fallbacks for `person`, `database`, `queue`, `service`, `browser`, `mobile`, `external`.
- **Given** an icon, **then** it is an inline SVG bundled with the app — **no network request at render time** (the app must work fully offline).
- **Given** dark or light theme, **then** every icon remains legible; monochrome-only marks invert, brand-coloured marks keep brand colour with a contrast-safe backing shape.
- Icons are referenced in the JSON by stable slug (e.g. `"icon": "postgresql"`), never by embedded SVG data or URL.
- Rendering 150 icon-bearing nodes adds **<50ms** to first paint versus icon-less nodes.

**Priority:** Must · **Size:** M

### AF-E4-S2 · Searchable icon picker
**As an** Author, **I want** to search icons by name and alias, **so that** setting an icon takes 3 seconds.

**Acceptance criteria**
- **Given** a node's inspector, **when** I click the icon swatch, **then** a searchable picker opens with the current icon highlighted.
- **Given** I type, **then** results filter on name, slug, and aliases — "pg" and "postgres" both find PostgreSQL; "k8s" finds Kubernetes if present.
- Icons are grouped by category (Languages & Runtimes, Databases, Caching & Messaging, Networking & Edge, Cloud, Generic) and keyboard-navigable with arrows + `Enter`.
- **Given** no match, **then** the empty state offers "use generic <type> icon" and links to the custom-icon flow (AF-E4-S4).
- Picker opens in **<80ms** even with 300+ icons registered.

**Priority:** Must · **Size:** M

### AF-E4-S3 · Type-derived default icon and technology inference
**As an** Author, **I want** sensible icons without picking one every time, **so that** a rough diagram already looks right.

**Acceptance criteria**
- **Given** I create a node of type `database`, **then** it gets the generic database icon with no prompt.
- **Given** I set `technology` to a string matching a known icon's name or alias **and** the node still has its type default icon, **then** the icon updates automatically and a toast notes it, with an inline undo.
- **Given** I have explicitly chosen an icon, **then** changing `technology` never overrides my choice.
- The JSON distinguishes an explicit icon from an inherited default so this rule survives save/load.

**Priority:** Should · **Size:** S

### AF-E4-S4 · Custom icon import
**As an** Author, **I want** to add our internal platform's logo, **so that** in-house systems look as clear as third-party ones.

**Acceptance criteria**
- **Given** the picker, **when** I choose "Add custom icon" and select an SVG (≤32KB), **then** it is sanitised (scripts, external refs, and event handlers stripped) and registered with a slug I name.
- Custom icons are stored inside the diagram file as base64 or sanitised SVG under `metadata.customIcons` so the file remains self-contained and portable.
- **Given** a file referencing an unknown icon slug, **then** the node renders the generic fallback for its type plus a small warning marker — it never renders broken or empty.

**Priority:** Could · **Size:** M

---

## E5 · Persistence (Local JSON)

### AF-E5-S1 · Save the model to a local JSON file
**As an** Author, **I want** to save to a real file on disk, **so that** I can commit the diagram next to the code it describes.

**Acceptance criteria**
- **Given** unsaved changes, **when** I press `Cmd/Ctrl+S`, **then** the whole multi-level model writes to a single `.archflow.json` file; the unsaved indicator clears and the timestamp updates.
- **Given** the first save of a new diagram, **then** the OS file-save dialog appears with a name derived from the diagram title.
- **Given** a subsequent save, **then** it writes to the same handle with **no dialog**.
- **Given** the file is written, **then** JSON is pretty-printed at 2-space indent with **deterministic key order** and **sorted collections**, so identical models always produce identical bytes.
- **Given** save fails (permissions, disk full, revoked handle), **then** a blocking error explains the cause and offers "Download a copy" as a fallback — the in-memory model is never lost.
- Saving a 500-node model completes in **<300ms** and never blocks the UI thread visibly.

**Priority:** Must · **Size:** L

### AF-E5-S2 · Open an existing diagram file
**As an** Author, **I want** to open a diagram someone else committed, **so that** the file, not the tool, is the source of truth.

**Acceptance criteria**
- **Given** the app, **when** I choose Open (or `Cmd/Ctrl+O`) and pick a valid file, **then** all levels load, the Context level renders fit-to-view, and the breadcrumb shows the root.
- **Given** I drag a `.archflow.json` file onto the app window, **then** it opens the same way.
- **Given** unsaved changes when opening another file, **then** I am prompted to save, discard, or cancel.
- **Given** an invalid or corrupt file, **then** a readable error names the problem and, where possible, the JSON path (e.g. `nodes[3].type: "servcie" is not a valid node type`) — the app does not crash or half-load.
- **Given** a file whose `version` is newer than this app supports, **then** the app refuses to open it read-write and explains that an upgrade is needed, rather than silently dropping unknown fields.
- **Given** open → immediate save with no edits, **then** the file is **byte-identical** (round-trip fidelity).

**Priority:** Must · **Size:** M

### AF-E5-S3 · Warn before losing unsaved work
**As an** Author, **I want** to be stopped from closing the tab with unsaved edits, **so that** twenty minutes of modelling doesn't vanish.

**Acceptance criteria**
- **Given** unsaved changes, **when** I close or reload the tab, **then** the browser's leave-confirmation appears.
- **Given** unsaved changes, **then** the title bar shows a dot marker and the document title is prefixed `•`.
- **Given** a save has just succeeded, **then** the marker clears within 100ms.

**Priority:** Must · **Size:** S

### AF-E5-S4 · Crash-safe local draft recovery
**As an** Author, **I want** my work recoverable after a crash, **so that** trusting a browser tool isn't reckless.

**Acceptance criteria**
- **Given** an open diagram with changes, **then** a snapshot writes to browser local storage (IndexedDB) at most every **5 seconds**, keyed by file identity.
- **Given** the app reopens after an unclean shutdown and a snapshot is newer than the on-disk file, **then** I am offered "Recover unsaved changes" or "Discard", showing both timestamps.
- Autosave to IndexedDB **never** writes to the user's file on disk — explicit save only.
- **Given** a successful save to disk, **then** the matching snapshot is cleared.

**Priority:** Must · **Size:** M

### AF-E5-S5 · Recent files list
**As an** Author, **I want** my recent diagrams one click away, **so that** I don't navigate the file picker every session.

**Acceptance criteria**
- **Given** the start screen, **then** up to 10 recent diagrams are listed with title, path hint, and last-opened time, most recent first.
- **Given** the browser retained permission for that file handle, **when** I click an entry, **then** it opens without a picker; otherwise a one-click permission re-prompt appears.
- **Given** a file that no longer exists, **then** the entry is marked unavailable and offers removal from the list.

**Priority:** Should · **Size:** S

### AF-E5-S6 · Diagram metadata editing
**As an** Architect, **I want** to record title, description, owner, and last-reviewed date, **so that** a reader can judge whether to trust the diagram.

**Acceptance criteria**
- **Given** no selection, **then** the inspector shows editable `title`, `description`, `owner`, `tags`, and a read-only `updatedAt`.
- **Given** a save, **then** `metadata.updatedAt` is set to an ISO-8601 UTC timestamp and `metadata.createdAt` is preserved untouched.
- **Given** a `lastReviewedAt` older than 90 days, **then** the header shows a muted "review overdue" chip (advisory only, dismissible for the session).

**Priority:** Should · **Size:** S

### AF-E5-S7 · Split model across multiple files
**As an** Architect, **I want** to split a large model into several files, **so that** teams can own their subtrees and avoid merge conflicts on one giant file.

**Acceptance criteria**
- **Given** a node owning a child diagram, **when** I choose "Extract to separate file", **then** the child subtree is written to its own file and the parent stores a relative `childRef` path.
- **Given** a file with `childRef`s, **when** opened, **then** referenced files are resolved relative to the parent file and loaded lazily on first drill-down.
- **Given** a missing referenced file, **then** the owning node renders with a clear "child diagram not found" state naming the expected path; the rest of the model still works.

**Priority:** Could · **Size:** XL — *split before scheduling; requires directory-handle permissions*

---

## E6 · Theming, Visual Design & Animation

### AF-E6-S1 · Dark theme by default, light theme available
**As a** Reader, **I want** a dark UI by default and a light option, **so that** the tool matches how I work and how I present.

**Acceptance criteria**
- **Given** a first visit, **then** the dark theme is active regardless of OS preference (explicit product decision).
- **Given** the theme toggle, **when** I switch to light, **then** canvas, chrome, nodes, edges, and icons all update in a ≤150ms cross-fade with no flash of unstyled content, and the choice persists across sessions.
- **Given** either theme, **then** node text against node fill meets **WCAG AA (4.5:1)** and non-text UI borders meet **3:1**.
- Theme is applied via CSS custom properties from a single token file — no colour is hardcoded in a component.
- Theme choice is app-level, not stored in the diagram file (a diagram looks correct in whatever theme its reader prefers).

**Priority:** Must · **Size:** M

### AF-E6-S2 · Micro-interaction polish
**As an** Author, **I want** the editor to respond visibly to everything I do, **so that** it feels precise rather than laggy.

**Acceptance criteria**
- Node hover raises elevation and reveals connection handles within **120ms**.
- Newly created nodes fade and scale in from 0.96→1.0 over **180ms**; deleted nodes fade and scale out over **140ms**.
- New edges animate their path draw from source to target over **200ms**.
- Selection outlines animate in over **100ms**; drag ghosts render at 60% opacity.
- All of the above respect `prefers-reduced-motion: reduce` by collapsing to instant state changes.
- No animation delays user input: interaction handlers never wait for an animation to finish.

**Priority:** Must · **Size:** M

### AF-E6-S3 · Custom theme tokens
**As an** Architect, **I want** to tune the palette, **so that** diagrams can match our design system for external decks.

**Acceptance criteria**
- **Given** theme settings, **then** I can override accent, canvas background, node fill, node border, text, and edge colours from a colour picker with a live preview.
- **Given** a custom theme, **then** it persists locally and can be exported/imported as a small JSON token blob.
- **Given** a chosen colour combination failing WCAG AA for node text, **then** an inline contrast warning shows the computed ratio — it warns, it does not block.

**Priority:** Should · **Size:** M

### AF-E6-S4 · Full keyboard operability and screen-reader structure
**As a** Reader **who uses assistive tech, I want** to navigate the model without a mouse, **so that** the diagram is actually accessible documentation.

**Acceptance criteria**
- **Given** canvas focus, **then** `Tab`/arrow keys move selection between nodes in a deterministic reading order (top-to-bottom, left-to-right) with a visible focus ring at ≥3:1 contrast.
- **Given** a focused node, **then** a screen reader announces name, type, technology, relationship count, and whether it has a child diagram.
- **Given** a focused node with children, **then** `Enter` drills in and `Escape`/`Cmd+↑` navigates up.
- **Given** the app, **then** an alternative structured tree/outline view of the whole model is reachable and readable without the canvas.
- A documented shortcut reference is available via `?`.

**Priority:** Should · **Size:** L

### AF-E6-S5 · Presentation-grade edge routing
**As an** Author, **I want** edges to route around nodes rather than through them, **so that** dense diagrams stay readable.

**Acceptance criteria**
- **Given** an edge whose straight path would cross a third node, **then** it routes orthogonally around that node with rounded corners.
- **Given** several parallel edges between the same pair of nodes, **then** they are offset so labels don't collide.
- **Given** a node drag, **then** re-routing keeps up at ≥55fps on a 150-node diagram.

**Priority:** Could · **Size:** L

---

## E7 · Viewer / Read-only Presentation Mode

### AF-E7-S1 · Read-only viewer mode
**As a** Reader, **I want** a mode where I cannot break anything, **so that** I can explore during an incident without fear of an accidental edit.

**Acceptance criteria**
- **Given** viewer mode, **then** palette, inspector edit fields, and all mutating shortcuts are disabled or hidden; pan, zoom, drill-down, breadcrumb, search, and tag filters all still work.
- **Given** viewer mode, **when** I attempt an edit gesture (drag a node, double-click to rename), **then** nothing changes and a transient hint says the diagram is read-only, offering "Enable editing".
- Mode is indicated persistently in the header and persists across level navigation and reload.

**Priority:** Should · **Size:** S

### AF-E7-S2 · Presentation mode
**As an** Architect, **I want** a distraction-free full-screen mode, **so that** I can walk stakeholders through the architecture live.

**Acceptance criteria**
- **Given** presentation mode, **then** all editor chrome hides except the breadcrumb; the canvas fills the screen and fits the current level to view.
- **Given** presentation mode, **then** `→`/`←` step through a saved tour order of levels (defaulting to depth-first from the root) with the standard level transition animation.
- `Escape` exits and restores the previous viewport and selection exactly.

**Priority:** Should · **Size:** M

### AF-E7-S3 · Shareable static export bundle
**As an** Architect, **I want** to hand someone a self-contained interactive file, **so that** readers without the tool can still drill down.

**Acceptance criteria**
- **Given** an open diagram, **when** I choose "Export interactive HTML", **then** a single self-contained `.html` file downloads with the model, icons, and viewer inlined — no network access required to view it.
- **Given** the exported file opened in a browser, **then** pan, zoom, drill-down, breadcrumb, and search work; editing is impossible.
- Exported file for a 150-node model is **≤2MB**.

**Priority:** Could · **Size:** L

### AF-E7-S4 · Deep link to a specific level
**As a** Reader, **I want** to link a teammate directly to one level, **so that** an incident channel can point at the exact view.

**Acceptance criteria**
- **Given** any level, **then** the URL hash reflects the node path (e.g. `#/api-gateway/auth-handler`) and optionally selection.
- **Given** such a URL with the matching file open, **then** the app restores that exact level and selection on load.
- **Given** a path referencing nodes not present in the open file, **then** the app falls back to the root level with an explanatory notice.

**Priority:** Could · **Size:** S

---

## E8 · Import / Export & Interop

### AF-E8-S1 · Export the current level as PNG and SVG
**As an** Author, **I want** to export an image, **so that** I can paste the diagram into an MR, Confluence, or a slide.

**Acceptance criteria**
- **Given** a level, **when** I export PNG, **then** I can choose 1x/2x/3x scale and transparent or theme-coloured background; the output contains exactly the level's content with 32px padding.
- **Given** SVG export, **then** text is real text (selectable, searchable), icons are inlined, and no external font or asset is referenced.
- **Given** either export, **then** the file downloads named `<diagram-title>-<level-path>.<ext>`.
- Export never mutates the model or the current viewport.

**Priority:** Should · **Size:** M

### AF-E8-S2 · Export to Mermaid / PlantUML text
**As an** Author, **I want** a text export, **so that** the current level can live inline in a README where images are unwelcome.

**Acceptance criteria**
- **Given** a level, **then** I can copy a Mermaid `flowchart` (or PlantUML C4) rendering of its nodes and edges to the clipboard.
- Node names, technologies, and edge labels are preserved and escaped correctly.
- Export is explicitly documented as **one-way and lossy** — positions, icons, tags, and child levels are not represented.

**Priority:** Could · **Size:** M

### AF-E8-S3 · Import from Structurizr JSON
**As an** Architect **with an existing Structurizr workspace, I want** to import it, **so that** adopting arch-flow isn't a re-draw from scratch.

**Acceptance criteria**
- **Given** a Structurizr workspace JSON, **when** I import it, **then** software systems, containers, components, people, and relationships map to arch-flow nodes/edges across the corresponding levels with parent/child links intact.
- **Given** the import completes, **then** a report lists what was mapped, what was approximated, and what was dropped.
- **Given** no layout information in the source, **then** Tidy layout (AF-E1-S10) is applied so the result is immediately readable.

**Priority:** Could · **Size:** XL — *split; depends on AF-E1-S10*

### AF-E8-S4 · Real-time multiplayer editing
**As a** team, **we want** to co-edit a diagram live.

**Acceptance criteria** — n/a.

**Priority:** Won't (for now) · **Size:** XL
**Rationale:** Requires the cloud backend, identity, and conflict resolution that the vision explicitly rejects. Collaboration is git. Revisit only if design partners report merge conflicts as their top pain.

---

## Assumptions

These were **not** specified in the brief. They shape scope, so they are called out rather than buried.

| # | Assumption | Impact if wrong |
|---|---|---|
| A1 | "Local folder on disk" means the **File System Access API** in a Chromium browser (real file handles, no server). Firefox/Safari fall back to download/upload. | If cross-browser parity is required, we need an Electron/Tauri shell or a small local companion process — a significant architectural change affecting E5 entirely. |
| A2 | One model = **one JSON file** in MVP. Multi-file splitting is a later option (AF-E5-S7). | If teams need per-team file ownership from day one, AF-E5-S7 becomes a Must and MVP grows by ~1 week. |
| A3 | Single-user editing. Concurrency is handled by git, not the app. | Would invalidate AF-E8-S4's "Won't". |
| A4 | Desktop-first: ≥1280px viewport, keyboard + pointer. Tablet is read-only-acceptable, not designed for. | Mobile-authoring demand would require rethinking all direct-manipulation interactions. |
| A5 | Icons are bundled and rendered as inline SVG; the app works fully offline. | A CDN-icon approach would break offline use and file portability. |
| A6 | The C4 level of a node is determined by the diagram it sits in, not stored redundantly per node. Simplifies validation and diffs. | If nodes must be shared across levels by reference, the data model changes materially. |
| A7 | Node IDs are human-readable slugs (`api-gateway`), stable across renames, unique within a file. Chosen for diff readability over UUID collision-safety. | Slug collisions on paste/import need a disambiguation rule — currently "-2" suffix. |
| A8 | No telemetry. Success metrics are gathered by manual observation of design partners. | Product decisions stay slower and more anecdotal than ideal. |
| A9 | "Drill down all the way to Code" is supported *structurally*; Level 4 gets no special tooling (no class shapes, no source parsing). | If real Level-4 fidelity is expected, that's a new epic. |

---

## Open Questions

Ranked by how much they block work. Each names who should answer it.

**OQ-1 · Browser strategy: Chromium-only, or a desktop shell?** *(blocks E5 architecture — needs an answer before MVP starts)*
The File System Access API gives us true "save to a folder" but is Chromium-only. Options: (a) Chromium-only web app, document the limitation; (b) web app with graceful download/upload fallback elsewhere; (c) Tauri/Electron desktop app for universal real file access. This changes the MVP's technical foundation, not just a feature. **Recommendation: (b)** — Chromium-first with fallback, revisit (c) if design partners are on Safari/Firefox. *Owner: requester + tech lead.*

**OQ-2 · Is git integration in the product, or purely external?** *(blocks E5/E8 scope)*
"Diffable and git-friendly" is a schema property we deliver either way. But should arch-flow itself show diffs, blame, or branch state? A visual "what changed between these two versions" view is arguably the killer feature for maintainability — and is easily a whole epic. **Recommendation: out of MVP, prototype for v0.3.** *Owner: requester.*

**OQ-3 · Double-click: drill down or rename?** *(blocks AF-E1-S6 and AF-E2-S2 — small but user-visible)*
draw.io users expect double-click to edit the label. C4 tool users expect it to drill in. AF-E2-S2 proposes conditional behaviour (drill if children exist, else rename), which is clever but potentially surprising. Alternative: double-click **always** renames; drilling is a dedicated affordance (badge click or `Cmd+↓`). **Recommendation: test both with 3 engineers before locking.** *Owner: design + requester.*

**OQ-4 · What exactly belongs at Level 4 (Code)?** *(blocks AF-E2-S1 completeness)*
C4's own guidance is that Level 4 is rarely hand-maintained. Do we ship it as generic boxes (cheap, honest), attempt class/interface semantics (expensive, will be stale), or omit it and support 3 levels in MVP? **Recommendation: generic boxes, structurally present, zero special tooling.** *Owner: requester.*

**OQ-5 · Are cross-level relationships legal?** *(blocks the data model — affects AF-E2-S5)*
Can a Component in service A point directly at a Container in service B, or must every relationship stay within one level, with cross-boundary traffic expressed via placeholders (AF-E2-S5)? Strict-level is cleaner to validate and render; cross-level is what engineers often actually want to express. **Recommendation: strict-level in MVP, placeholders as the escape hatch.** *Owner: architect.*

**OQ-6 · Can the same element appear on more than one level or diagram?** *(affects identity model, A6)*
A shared Postgres instance plausibly appears in three teams' Container diagrams. Duplicate nodes (simple, drifts) vs. a shared element referenced by ID (correct, complicates the file format and multi-file story). **Recommendation: duplicate in MVP, revisit alongside AF-E5-S7.** *Owner: architect.*

**OQ-7 · Which icons beyond the required nine?** *(affects AF-E4-S1 sizing)*
The brief names nine. A realistic set is 60–100 (Kafka, RabbitMQ, Kubernetes, Docker, S3, AWS/GCP primitives, React, Node, Python, Java, Elasticsearch, gRPC…). Every icon has a licensing question (many brand marks restrict modification). **Needs a decision on scope and a licence audit.** *Owner: requester + legal-ish sanity check.*

**OQ-8 · Do we need diagram versioning inside the file?** *(affects data model)*
`version` covers the schema version. Should the file also carry a model revision, or a changelog of edits? Git already provides history; embedding it duplicates and bloats. **Recommendation: schema version only.** *Owner: architect.*

**OQ-9 · How do we validate the "diff readability" metric without telemetry?** *(affects success measurement)*
The ≥90% target in the vision needs a repeatable protocol — e.g. 20 scripted single-intent commits reviewed blind by 3 engineers. Someone must own building that harness or the metric is decoration. *Owner: PO.*
