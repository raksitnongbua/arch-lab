# arch-lab — Product Vision

> One page. If a decision elsewhere in `docs/product/` contradicts this page, this page wins.

## The problem

Architecture diagrams rot. Teams draw them once in draw.io, Miro, or Lucidchart, screenshot them into Confluence, and never touch them again — because:

1. **Maintenance is expensive.** Generic canvas tools have no concept of *architecture*. Renaming a service means hunting every box on every board that mentions it. There is no model, only shapes.
2. **They don't scale across zoom levels.** Real systems need a one-pager for stakeholders *and* a component-level view for the engineer on call. Generic tools force a choice: one unreadable mega-diagram, or N disconnected boards that silently drift apart.
3. **They aren't reviewable.** Diagrams live in a proprietary blob outside the repo. Nobody can diff them, nobody reviews them in an MR, so nobody notices when they go stale.
4. **Diagram-as-code solves 3 but breaks 1 and 2 differently.** Structurizr DSL / Mermaid / PlantUML are diffable and model-aware, but you author architecture in a text editor and squint at a re-rendered PNG. Layout is not yours to control, and non-authors won't touch them.

## The product

**arch-lab is a browser-based C4 model editor: draw.io's directness with Structurizr's model discipline, saving to a plain JSON file in your repo.**

You place nodes on a real canvas — drag, drop, snap, connect, rename inline. But you are editing a *model*, not shapes: every node knows which C4 level it belongs to, and clicking a node **drills into that node's own child diagram** — Context → Container → Component → Code — with a breadcrumb to climb back out. The whole model saves to one human-readable JSON file on local disk that you commit next to your code.

## Target user

| Segment | Who they are |
|---|---|
| **Primary** | Backend / platform engineers and tech leads who own a service or domain and are expected to keep its architecture documented. Comfortable with git, allergic to ceremony. |
| **Secondary** | Software architects maintaining org-level Context and Container views across many teams. |
| **Tertiary (read-only)** | Anyone consuming the diagram — PMs, new joiners, SREs mid-incident, interview candidates. They never edit; they need to *navigate and understand*. |

Explicitly **not** targeted: non-technical diagramming (org charts, mind maps, marketing funnels).

## Value proposition

- **Easy to maintain** — one model, one file, in your repo. Edit in a real GUI, review as a readable diff in an MR, no re-render step.
- **Easy to view** — drill-down means each screen shows *one* level of detail at the right altitude. No 200-box wall diagram.
- **Zero setup, zero backend** — open the app, open a JSON file, edit, save. No account, no server, no seat license.
- **Speaks your stack** — first-class icons for Go, Next.js, Postgres, MySQL, MongoDB, Redis, nginx, Kong, Cloudflare, so a diagram reads correctly at a glance instead of via a legend.
- **Feels good** — smooth level transitions and honest 60fps interaction. Docs people *enjoy* opening are docs that stay alive.

## Non-goals (v1)

Deliberate noes. Revisited only with evidence.

- **No cloud backend, no accounts, no real-time multiplayer.** Collaboration is git. Two people editing one file at once is resolved by merge conflict, not CRDT.
- **No general-purpose diagramming.** No freeform shapes, sticky notes, swimlanes, sequence diagrams, ERDs. If it isn't a C4 element or relationship, it doesn't belong on the canvas.
- **No live infrastructure discovery.** We do not scan your Kubernetes cluster, cloud account, or source to auto-generate the model. Humans author intent.
- **No auto-layout as the primary mode.** Engineers want their boxes where they put them. Layout *assist* may exist; layout *takeover* does not.
- **Not a Structurizr replacement.** We may interop with its formats later (see roadmap); we do not chase DSL parity.
- **No deep C4 Level 4 (Code) authoring.** Level 4 is generated from source in practice; we support it structurally and invest nothing in class-diagram fidelity.
- **No mobile editing.** Read-only on tablet is acceptable; authoring is desktop, keyboard + pointer.

## Success metrics

Measured on ourselves and 5–10 design-partner engineers, since there is no telemetry backend in v1 (see Open Questions in `user-stories.md`).

| Metric | Target | Why it matters |
|---|---|---|
| **Time to first meaningful diagram** | 6-node Context + Container diagram authored by a first-time user in **under 10 minutes**, no docs read | Proves "easy" is real, not aspirational |
| **Time to update** | Rename + add one service + add two edges, done in **under 2 minutes** | This is the maintenance cost that kills diagrams today |
| **Diff readability** | Reviewer correctly states what changed from the JSON diff alone in **≥90%** of sampled single-intent commits | Enables architecture review inside MRs |
| **Survival rate** | **≥70%** of design-partner diagrams get at least one edit **30+ days** after creation | The only metric that proves we solved rot |
| **Drill-down adoption** | **≥50%** of diagrams that have a Container level also have ≥1 populated Component-level child | Proves hierarchy is used, not merely supported |
| **Interaction quality** | Sustained **≥55fps** pan/zoom/drag at 150 nodes; level transition completes in **≤400ms** | "Beautiful and smooth" expressed as a test |
| **Round-trip fidelity** | **100%**: open → save with zero edits yields a byte-identical file | Trust. A tool that reformats your file on open is one you stop committing |
