# arch-lab — Release Roadmap

Slices are ordered by **risk retired per week**, not by feature count. Each release states plainly what is in, what is out, and what would make us stop and rethink.

Sizes are indicative for a **single full-time engineer**. They are not commitments.

---

## MVP — "Walking skeleton" · target ~4–5 weeks

**Thesis to prove:** an engineer can author a two-level C4 diagram in a browser, drill into it, save it as a JSON file, reopen it, and commit it — and that loop feels good enough to repeat voluntarily.

The walking skeleton is deliberately vertical: one thin slice through *every* layer (canvas → model → hierarchy → file) rather than a polished canvas with no persistence. A beautiful editor that can't save is worth nothing; an ugly one that can save is a product.

### In

| Epic | Stories |
|---|---|
| Canvas & Editing | AF-E1-S1 pan/zoom · S2 drag-drop create · S3 move + snap · S4 multi-select · S5 connect edges · S6 inline labels · S7 undo/redo |
| Hierarchy | AF-E2-S1 four-level model · S2 drill down · S3 breadcrumb · S4 animated transitions |
| Modeling | AF-E3-S1 node types · S2 node properties · S3 edge properties · S4 delete with consequences |
| Icons | AF-E4-S1 built-in icon set (the required 9 + generics) · S2 searchable picker |
| Persistence | AF-E5-S1 save · S2 open · S3 unsaved warning · S4 crash-safe draft recovery |
| Theming | AF-E6-S1 dark default + light · S2 micro-interactions |

23 Must stories. Nothing else.

### Explicitly out of MVP

- Copy/paste and duplicate (AF-E1-S8) — painful to lack, but not loop-blocking.
- Resize (AF-E1-S9) — default sizes plus text wrapping are survivable.
- Boundary placeholder inheritance (AF-E2-S5) — drill-down works without it; child levels just start empty.
- Cross-level search (AF-E3-S5), tags (AF-E3-S6).
- Any export: no PNG, no SVG, no HTML, no Mermaid. Screenshot tooling exists.
- Viewer and presentation modes, deep links.
- Auto-layout, custom themes, custom icons, multi-file split, imports.
- Accessibility beyond baseline focus rings and semantic controls in the chrome. **This is a deliberate debt with a named payment date (v0.3), not an oversight** — AF-E6-S4 is scheduled, not deferred indefinitely.

### Entry conditions

**OQ-1 (browser strategy) must be answered before the first line of persistence code.** It determines whether E5 is File System Access API, a download/upload fallback, or a desktop shell. Getting this wrong costs a rewrite of the most load-bearing epic. Recommendation on file: Chromium-first with fallback.

OQ-3 (double-click semantics) and OQ-4 (what Level 4 is) should be answered in week 1 — both are cheap to decide and both are wired into MVP stories.

### Exit criteria

- A first-time engineer authors a 6-node Context + Container diagram in **<10 minutes** with no guidance.
- Open → save with no edits produces a **byte-identical** file, verified by an automated test.
- Sustained **≥55fps** pan/drag on a 150-node fixture.
- Level transition completes in **≤400ms**; `prefers-reduced-motion` honoured.
- Undo reverses 100% of model-changing actions in a scripted 40-action sequence.
- The MVP's own architecture is documented *in arch-lab*, committed to this repo. If we won't dogfood it, it isn't ready.

### Stop-and-rethink signals

Design partners save the file but never open it again; or the JSON diff of a realistic edit is unreadable in a GitLab MR view. Either invalidates the core thesis and matters more than any feature backlog.

---

## v0.2 — "Daily driver" · target ~3 weeks

**Thesis:** the editor stops being a demo and becomes the thing you actually reach for, including for diagrams you didn't create.

### In

| Epic | Stories |
|---|---|
| Canvas | AF-E1-S8 copy/paste/duplicate · S9 resize |
| Hierarchy | AF-E2-S5 boundary relationship inheritance |
| Modeling | AF-E3-S5 cross-level search (`Cmd+K`) · S6 tags + tag filtering |
| Icons | AF-E4-S3 type-derived defaults & technology inference |
| Persistence | AF-E5-S5 recent files · S6 diagram metadata |
| Export | AF-E8-S1 PNG + SVG export |
| Viewer | AF-E7-S1 read-only viewer mode |

Also in v0.2, unglamorous and non-negotiable: the **published JSON Schema** (`$schema` in the data model currently points at a URL that must become real), the load-time validator with path-named errors, and the icon set expanded past the required nine (pending OQ-7's licence audit).

### Out

Presentation mode, HTML export, deep links, custom themes, accessibility epic, auto-layout, multi-file, imports, anything git-aware.

### Exit criteria

- PNG/SVG export round-trips into a GitLab MR and Confluence without manual fixing.
- `Cmd+K` search over a 500-node fixture returns in **<100ms**.
- Creating a child diagram pre-seeds boundary placeholders correctly for a node with 5 relationships.
- Design partners report the update-an-existing-diagram flow at **<2 minutes** (vision metric).

---

## v0.3 — "Shareable and inclusive" · target ~4 weeks

**Thesis:** the diagram's audience is larger than its author, and that audience includes people who don't use a mouse and people who don't have the tool.

### In

| Epic | Stories |
|---|---|
| Accessibility | AF-E6-S4 full keyboard operability + screen-reader structure + outline view |
| Theming | AF-E6-S3 custom theme tokens |
| Viewer | AF-E7-S2 presentation mode · S3 self-contained interactive HTML export · S4 deep links |
| Hierarchy | AF-E2-S6 model consistency validation panel |
| Icons | AF-E4-S4 custom icon import (with SVG sanitisation) |

Plus the **OQ-2 spike**: a time-boxed (≤1 week) prototype of a visual "what changed between two versions" diff view. Outcome is a go/no-go decision, not a shipped feature. If it lands well it likely becomes the headline of v0.4, because it is the most direct attack on the maintainability problem in the vision.

### Out

Auto-layout, multi-file split, Structurizr import, multiplayer.

### Exit criteria

- Full authoring of a 3-level diagram completed keyboard-only, verified by an engineer who does it without touching the pointer.
- Screen-reader pass on the outline view with no unlabelled interactive controls.
- Interactive HTML export of a 150-node model is **≤2MB** and works with the network disabled.
- Validation panel correctly identifies all seven warning classes on a deliberately broken fixture.

---

## Later — unscheduled, in rough priority order

Nothing here is committed. Each needs a trigger before it earns a slot.

| Candidate | Stories | Trigger that would promote it |
|---|---|---|
| **Visual version diff** | (from OQ-2 spike) | Spike succeeds and partners rank it top-2 |
| **Auto-layout assist** | AF-E1-S10 | Import work lands, or partners complain about tidying cost |
| **Presentation-grade edge routing** | AF-E6-S5 | Partners hit unreadable dense diagrams — likely once real 100+ node models exist |
| **Structurizr import** | AF-E8-S3 (XL, split first) | A partner has an existing workspace and adoption is genuinely blocked on it |
| **Mermaid / PlantUML text export** | AF-E8-S2 | Demand for README-inline diagrams |
| **Multi-file model split** | AF-E5-S7 (XL, split first) | Merge conflicts on one file become a reported pain — this is also the trigger to revisit OQ-6 (shared elements) |
| **Shared element identity** | (needs OQ-6 decided) | Same as above; couples tightly to multi-file |
| **CLI / CI validation** | not yet a story | Teams want an MR pipeline check that the diagram is valid and not stale |
| **VS Code extension** | not yet a story | Editing in-repo without leaving the editor is requested repeatedly |

### Not on the roadmap at all

- **Real-time multiplayer** (AF-E8-S4) — rejected in the vision. Collaboration is git. Only revisited if design partners name merge conflicts as their single top pain, and even then multi-file split is the cheaper answer to try first.
- **Live infrastructure discovery** — humans author intent; scanners produce noise.
- **Auto-layout as the default mode** — layout assist yes, layout takeover never.
- **Mobile authoring.**
- **General-purpose diagramming** (sticky notes, freeform shapes, ERDs) — the fastest way to become a worse draw.io.
  - Sequence diagrams were on this list and have been REMOVED from it (v0.4, shipped in view mode). The test this list applies is "does it have a model behind it?" — sequence diagrams do, and the rest of this bullet still does not. See `vision.md` for the full reasoning.

---

## Sequencing rationale

Three ordering choices worth defending:

**Persistence is in MVP, not deferred.** Tempting to ship a beautiful canvas first and add saving later. Wrong: the file format is the product's central bet (diffable, git-friendly, reviewable) and the highest-risk unknown (OQ-1's browser API constraint). Risky bets go first, while there is still time to be wrong about them.

**Export is v0.2, not MVP.** Export feels essential but is genuinely replaceable by a screenshot for a few weeks. It also gets meaningfully cheaper once the renderer has settled, so building it early means building it twice.

**Accessibility is v0.3, and named as debt.** Honest position: it isn't in MVP, and MVP is a validation artefact, not a public release. It is scheduled with exit criteria rather than left as a vague "later", because "later" is how accessibility becomes never. If arch-lab ships publicly before v0.3, this ordering must change.
