# arch-flow — Saved Diagram Data Model

Status: **proposed**, v1 schema. Decisions marked ⚠️ depend on Open Questions in `user-stories.md`.

## Design principles

The file format is a product feature, not an implementation detail. It is optimised, in this order, for:

1. **Diff readability.** A reviewer reading an MR must see *what changed in the architecture*, not a reshuffled blob. Consequences: stable human-readable IDs, deterministic key order, sorted arrays, 2-space pretty-print, one logical thing per line where possible, no timestamps on individual elements.
2. **Self-containment.** One file opens fully with no network access and no sibling assets. Icons are referenced by slug; custom icons are embedded.
3. **Explicitness over inference.** A node's `type` is stored, not derived from its shape. An explicitly chosen icon is distinguishable from an inherited default. Nothing is guessed at load time.
4. **Forward tolerance, backward honesty.** A reader that hits an unknown *minor* version preserves unknown fields on round-trip; an unknown *major* version is refused read-write rather than silently downgraded.

---

## Top-level structure

```
ArchFlowFile
├── $schema        string   — URL of the JSON Schema, for editor autocomplete
├── version        string   — schema version, "MAJOR.MINOR"
├── metadata       object   — title, ownership, timestamps, custom icons, theme hint
├── rootDiagramId  string   — the Context-level diagram; the entry point
└── diagrams       array    — every diagram at every level, flat, sorted by id
```

The critical shape decision: **diagrams are stored flat, not nested.** A nested tree would mirror the mental model but produces terrible diffs (adding one deep component reindents half the file) and makes any lookup a recursive walk. A flat, id-keyed array plus explicit parent/child pointers keeps every edit local to a small region of the file.

### `metadata`

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | ✅ | Display name of the whole model |
| `description` | string | | Free text, what this model covers |
| `owner` | string | | Team or person accountable for accuracy |
| `tags` | string[] | | Sorted. Model-level, e.g. `["payments","tier-1"]` |
| `createdAt` | string | ✅ | ISO-8601 UTC. Written once, never modified |
| `updatedAt` | string | ✅ | ISO-8601 UTC. Set on every save |
| `lastReviewedAt` | string | | Set manually; drives the "review overdue" chip (AF-E5-S6) |
| `tagColors` | object | | `{ "<tag>": "<hex>" }`, for AF-E3-S6 |
| `customIcons` | object | | `{ "<slug>": { "name": string, "svg": string } }`, sanitised inline SVG (AF-E4-S4) |
| `generator` | object | | `{ "name": "arch-flow", "version": "0.4.1" }`. Diagnostic only; never read for behaviour |

> `updatedAt` is the only field that changes on a no-op save, so it is the one field that breaks strict byte-identical round-trip. Resolution: **`updatedAt` is written only when the model actually changed.** A save with no edits is a no-op and touches nothing. This is what makes the 100% round-trip metric in the vision achievable.

### `diagrams[]` — a Diagram

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✅ | Slug, unique in file. Convention `d-<level>-<owner-slug>` |
| `level` | enum | ✅ | `context` \| `container` \| `component` \| `code` |
| `title` | string | ✅ | Shown in the breadcrumb segment |
| `description` | string | | What this particular view is scoped to |
| `ownerNodeId` | string \| null | ✅ | **The drill-down link.** The node (in `parentDiagramId`) whose internals this diagram shows. `null` only for the root Context diagram |
| `parentDiagramId` | string \| null | ✅ | `null` only for the root |
| `viewport` | object | | `{ "zoom": number, "x": number, "y": number }` — last saved camera, restored on open |
| `nodes` | Node[] | ✅ | Sorted by `id` |
| `edges` | Edge[] | ✅ | Sorted by `id` |

### `nodes[]` — a Node

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✅ | Human-readable slug, unique **within the file**. Stable across renames — this is what makes diffs readable |
| `type` | enum | ✅ | See valid-types matrix below |
| `name` | string | ✅ | Display name |
| `description` | string | | ≤500 chars |
| `technology` | string | | Free text, e.g. `"Go 1.22 / chi"`, `"PostgreSQL 16"` |
| `icon` | string | | Icon slug, e.g. `"postgresql"`. Omitted ⇒ use the type default |
| `iconSource` | enum | | `explicit` \| `inferred`. Present only when `icon` is. Enforces AF-E4-S3: an `explicit` icon is never auto-overridden |
| `position` | object | ✅ | `{ "x": int, "y": int }` — top-left, model coords, multiples of 8 |
| `size` | object | ✅ | `{ "width": int, "height": int }` — min 120×64 |
| `tags` | string[] | | Sorted |
| `childDiagramId` | string \| null | | **The drill-down link.** Points at a `diagrams[].id`. `null`/absent ⇒ leaf |
| `childRef` | string | | ⚠️ AF-E5-S7 only. Relative path to another file holding the child subtree. Mutually exclusive with `childDiagramId` |
| `externalRef` | object | | Present ⇒ this is a read-only boundary placeholder (AF-E2-S5): `{ "diagramId": string, "nodeId": string }` pointing at the real element one level up |
| `pinned` | boolean | | Excluded from Tidy layout (AF-E1-S10) |

**Valid `type` per level** (AF-E3-S1):

| Level | Valid node types |
|---|---|
| `context` | `person`, `softwareSystem`, `externalSystem` |
| `container` | `container`, `database`, `queue`, `externalSystem`, `person` |
| `component` | `component`, `database`, `queue`, `externalSystem` |
| `code` | `codeElement` |

A node's C4 level is **not stored on the node** — it is the `level` of its containing diagram (Assumption A6). One source of truth, no way to desynchronise.

### `edges[]` — an Edge

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✅ | Slug, unique in file. Convention `e-<source>-<target>[-n]` |
| `source` | string | ✅ | Node id **in the same diagram** ⚠️ (OQ-5: strict-level relationships) |
| `target` | string | ✅ | Node id in the same diagram |
| `label` | string | | e.g. `"Places order"` |
| `technology` | string | | e.g. `"gRPC"`, `"HTTPS/JSON"`, `"SQL/TCP"` |
| `direction` | enum | ✅ | `forward` (arrow at target) \| `bidirectional` \| `none` |
| `style` | enum | | `solid` (default) \| `dashed` |
| `tags` | string[] | | Sorted |
| `realizes` | string | | Edge id **one level up** that this relationship implements. The consistency link that makes AF-E2-S5 and AF-E2-S6 possible |
| `waypoints` | object[] | | Manual routing overrides, `[{ "x": int, "y": int }]`. Absent ⇒ auto-routed |

Two edges may share the same `source`/`target` pair — they are two distinct relationships (AF-E1-S5) and are rendered with offset curves.

---

## How drill-down actually works

Two pointers, deliberately redundant, forming a doubly-linked tree:

```
                       diagrams[0]  (level: context, ownerNodeId: null, parentDiagramId: null)
                         └── nodes[]
                              └── node "shopflow-platform"
                                    childDiagramId ──────────┐
                                                             ▼
                       diagrams[1]  (level: container, ownerNodeId: "shopflow-platform",
                                     parentDiagramId: "d-ctx-root")
                         └── nodes[]
                              └── node "orders-service"
                                    childDiagramId ──────────┐
                                                             ▼
                       diagrams[2]  (level: component, ownerNodeId: "orders-service",
                                     parentDiagramId: "d-cnt-shopflow")
```

**Downward: `node.childDiagramId`.** Rendering a node, the editor checks this field. Present ⇒ show the "has children" badge with `diagrams[childDiagramId].nodes.length`, and a double-click / `Cmd+↓` navigates into that diagram. Absent ⇒ leaf, and the context menu instead offers "Drill into", which creates a new diagram at the next level down and sets the pointer.

**Upward: `diagram.parentDiagramId` + `diagram.ownerNodeId`.** These build the breadcrumb without any search. From the current diagram, follow `parentDiagramId` until `null`, resolving `ownerNodeId` at each hop to get the segment's display name. Depth is bounded at 4 by the level enum, so the walk is trivially cheap and cannot cycle in a valid file.

**Why store both directions?** Downward alone would force an O(n) scan of all diagrams to build a breadcrumb; upward alone would force a scan to find a node's children. Both directions make every navigation O(depth). The cost is one invariant to enforce:

> For every diagram `D` with `parentDiagramId = P` and `ownerNodeId = N`: the node `N` must exist in diagram `P`, and `P.nodes[N].childDiagramId` must equal `D.id`.

This is checked on load and surfaced through the validation panel (AF-E2-S6), never silently repaired.

**Level progression is enforced, not conventional.** A child diagram's `level` must be exactly one step deeper than its parent's (`context → container → component → code`). A `code`-level diagram can have no children. This is what guarantees the drill path is always a genuine C4 descent rather than an arbitrary nesting.

**Boundary placeholders (`externalRef`).** When a child diagram is created, every relationship the parent node has is mirrored into the child as a read-only placeholder node carrying `externalRef`. So inside `orders-service`'s component view, `kong` and `postgres` appear as boundary nodes — the component diagram is self-explanatory without opening the parent. Internal edges to those placeholders carry `realizes`, naming the parent-level edge they implement. That single field is what lets the validator answer "is this container's stated relationship actually built by anything?"

---

## Complete example

A small e-commerce platform: Next.js web app behind Cloudflare and nginx → Kong gateway → two Go services → PostgreSQL, Redis, MongoDB. Three diagrams: Context, Container, and one drill-down into the Orders Service's Component level.

```json
{
  "$schema": "https://arch-flow.dev/schema/v1/diagram.schema.json",
  "version": "1.0",
  "metadata": {
    "title": "ShopFlow Platform",
    "description": "Customer-facing commerce platform. Context and Container levels are authoritative; Orders Service component view is maintained by the Orders team.",
    "owner": "platform-team",
    "tags": ["commerce", "tier-1"],
    "createdAt": "2026-05-14T09:12:00Z",
    "updatedAt": "2026-07-26T11:48:33Z",
    "lastReviewedAt": "2026-07-01T00:00:00Z",
    "tagColors": {
      "pci": "#f5a524",
      "team-orders": "#7c5cff"
    },
    "generator": { "name": "arch-flow", "version": "0.4.1" }
  },
  "rootDiagramId": "d-ctx-root",
  "diagrams": [
    {
      "id": "d-ctx-root",
      "level": "context",
      "title": "ShopFlow Platform — System Context",
      "description": "Who uses ShopFlow and which third parties it depends on.",
      "ownerNodeId": null,
      "parentDiagramId": null,
      "viewport": { "zoom": 1, "x": 0, "y": 0 },
      "nodes": [
        {
          "id": "customer",
          "type": "person",
          "name": "Customer",
          "description": "Shopper browsing the catalogue and placing orders.",
          "position": { "x": 480, "y": 80 },
          "size": { "width": 160, "height": 96 }
        },
        {
          "id": "ops-engineer",
          "type": "person",
          "name": "Ops Engineer",
          "description": "On-call engineer inspecting order state and replaying failed payments.",
          "position": { "x": 800, "y": 80 },
          "size": { "width": 160, "height": 96 }
        },
        {
          "id": "shopflow-platform",
          "type": "softwareSystem",
          "name": "ShopFlow Platform",
          "description": "Catalogue browsing, cart, checkout, and order fulfilment.",
          "technology": "Go / Next.js",
          "position": { "x": 480, "y": 320 },
          "size": { "width": 480, "height": 128 },
          "childDiagramId": "d-cnt-shopflow"
        },
        {
          "id": "stripe",
          "type": "externalSystem",
          "name": "Stripe",
          "description": "Card authorisation and capture.",
          "technology": "REST API",
          "icon": "stripe",
          "iconSource": "explicit",
          "position": { "x": 320, "y": 600 },
          "size": { "width": 200, "height": 96 },
          "tags": ["pci"]
        },
        {
          "id": "sendgrid",
          "type": "externalSystem",
          "name": "SendGrid",
          "description": "Transactional email delivery for order receipts.",
          "technology": "REST API",
          "position": { "x": 600, "y": 600 },
          "size": { "width": 200, "height": 96 }
        },
        {
          "id": "warehouse-wms",
          "type": "externalSystem",
          "name": "Warehouse WMS",
          "description": "Third-party warehouse management system that fulfils shipments.",
          "technology": "SFTP / CSV",
          "position": { "x": 880, "y": 600 },
          "size": { "width": 200, "height": 96 }
        }
      ],
      "edges": [
        {
          "id": "e-customer-shopflow",
          "source": "customer",
          "target": "shopflow-platform",
          "label": "Browses catalogue and places orders",
          "technology": "HTTPS",
          "direction": "forward"
        },
        {
          "id": "e-ops-shopflow",
          "source": "ops-engineer",
          "target": "shopflow-platform",
          "label": "Inspects orders, replays payments",
          "technology": "HTTPS / internal admin",
          "direction": "forward"
        },
        {
          "id": "e-shopflow-stripe",
          "source": "shopflow-platform",
          "target": "stripe",
          "label": "Authorises and captures payments",
          "technology": "HTTPS/JSON",
          "direction": "forward",
          "tags": ["pci"]
        },
        {
          "id": "e-shopflow-sendgrid",
          "source": "shopflow-platform",
          "target": "sendgrid",
          "label": "Sends order confirmation emails",
          "technology": "HTTPS/JSON",
          "direction": "forward"
        },
        {
          "id": "e-shopflow-wms",
          "source": "shopflow-platform",
          "target": "warehouse-wms",
          "label": "Exports fulfilment batches, imports shipment status",
          "technology": "SFTP",
          "direction": "bidirectional"
        }
      ]
    },
    {
      "id": "d-cnt-shopflow",
      "level": "container",
      "title": "ShopFlow Platform — Containers",
      "description": "Deployable units inside the platform boundary.",
      "ownerNodeId": "shopflow-platform",
      "parentDiagramId": "d-ctx-root",
      "viewport": { "zoom": 0.85, "x": -40, "y": -20 },
      "nodes": [
        {
          "id": "ext-customer",
          "type": "person",
          "name": "Customer",
          "position": { "x": 560, "y": 40 },
          "size": { "width": 160, "height": 88 },
          "externalRef": { "diagramId": "d-ctx-root", "nodeId": "customer" }
        },
        {
          "id": "cloudflare-edge",
          "type": "container",
          "name": "Edge / CDN",
          "description": "TLS termination, WAF, bot mitigation, static asset caching.",
          "technology": "Cloudflare",
          "icon": "cloudflare",
          "iconSource": "inferred",
          "position": { "x": 560, "y": 176 },
          "size": { "width": 160, "height": 88 }
        },
        {
          "id": "nginx-ingress",
          "type": "container",
          "name": "Ingress",
          "description": "Reverse proxy and TLS re-termination inside the cluster; routes /api to the gateway and everything else to the web app.",
          "technology": "nginx 1.27",
          "icon": "nginx",
          "iconSource": "inferred",
          "position": { "x": 560, "y": 312 },
          "size": { "width": 160, "height": 88 }
        },
        {
          "id": "web-app",
          "type": "container",
          "name": "Web Application",
          "description": "Server-rendered storefront: catalogue, cart, checkout flow.",
          "technology": "Next.js 15 (App Router)",
          "icon": "nextjs",
          "iconSource": "inferred",
          "position": { "x": 344, "y": 456 },
          "size": { "width": 176, "height": 88 }
        },
        {
          "id": "kong-gateway",
          "type": "container",
          "name": "API Gateway",
          "description": "Authn/authz enforcement, rate limiting, request routing to internal services.",
          "technology": "Kong Gateway 3.7",
          "icon": "kong",
          "iconSource": "inferred",
          "position": { "x": 760, "y": 456 },
          "size": { "width": 176, "height": 88 }
        },
        {
          "id": "orders-service",
          "type": "container",
          "name": "Orders Service",
          "description": "Order lifecycle: create, pay, cancel, fulfil. Owns the order aggregate.",
          "technology": "Go 1.22",
          "icon": "golang",
          "iconSource": "inferred",
          "position": { "x": 656, "y": 616 },
          "size": { "width": 176, "height": 88 },
          "tags": ["pci", "team-orders"],
          "childDiagramId": "d-cmp-orders"
        },
        {
          "id": "catalog-service",
          "type": "container",
          "name": "Catalog Service",
          "description": "Product, pricing, and inventory read models.",
          "technology": "Go 1.22",
          "icon": "golang",
          "iconSource": "inferred",
          "position": { "x": 936, "y": 616 },
          "size": { "width": 176, "height": 88 }
        },
        {
          "id": "orders-db",
          "type": "database",
          "name": "Orders Database",
          "description": "Orders, payments, and the outbox table. System of record.",
          "technology": "PostgreSQL 16",
          "icon": "postgresql",
          "iconSource": "inferred",
          "position": { "x": 560, "y": 800 },
          "size": { "width": 176, "height": 88 },
          "tags": ["pci", "team-orders"]
        },
        {
          "id": "session-cache",
          "type": "database",
          "name": "Session & Rate-limit Cache",
          "description": "Sessions, idempotency keys, gateway rate-limit counters.",
          "technology": "Redis 7",
          "icon": "redis",
          "iconSource": "inferred",
          "position": { "x": 776, "y": 800 },
          "size": { "width": 176, "height": 88 }
        },
        {
          "id": "catalog-db",
          "type": "database",
          "name": "Catalog Store",
          "description": "Denormalised product documents and search facets.",
          "technology": "MongoDB 7",
          "icon": "mongodb",
          "iconSource": "inferred",
          "position": { "x": 992, "y": 800 },
          "size": { "width": 176, "height": 88 }
        },
        {
          "id": "ext-stripe",
          "type": "externalSystem",
          "name": "Stripe",
          "position": { "x": 344, "y": 960 },
          "size": { "width": 160, "height": 80 },
          "externalRef": { "diagramId": "d-ctx-root", "nodeId": "stripe" }
        },
        {
          "id": "ext-sendgrid",
          "type": "externalSystem",
          "name": "SendGrid",
          "position": { "x": 560, "y": 960 },
          "size": { "width": 160, "height": 80 },
          "externalRef": { "diagramId": "d-ctx-root", "nodeId": "sendgrid" }
        }
      ],
      "edges": [
        {
          "id": "e-cust-cf",
          "source": "ext-customer",
          "target": "cloudflare-edge",
          "label": "Visits shopflow.example",
          "technology": "HTTPS",
          "direction": "forward",
          "realizes": "e-customer-shopflow"
        },
        {
          "id": "e-cf-nginx",
          "source": "cloudflare-edge",
          "target": "nginx-ingress",
          "label": "Forwards uncached requests",
          "technology": "HTTPS (origin pull)",
          "direction": "forward"
        },
        {
          "id": "e-nginx-web",
          "source": "nginx-ingress",
          "target": "web-app",
          "label": "Routes page requests",
          "technology": "HTTP/1.1",
          "direction": "forward"
        },
        {
          "id": "e-nginx-kong",
          "source": "nginx-ingress",
          "target": "kong-gateway",
          "label": "Routes /api/*",
          "technology": "HTTP/1.1",
          "direction": "forward"
        },
        {
          "id": "e-web-kong",
          "source": "web-app",
          "target": "kong-gateway",
          "label": "Server-side data fetching",
          "technology": "HTTP/JSON",
          "direction": "forward"
        },
        {
          "id": "e-kong-orders",
          "source": "kong-gateway",
          "target": "orders-service",
          "label": "Routes order operations",
          "technology": "gRPC",
          "direction": "forward"
        },
        {
          "id": "e-kong-catalog",
          "source": "kong-gateway",
          "target": "catalog-service",
          "label": "Routes catalogue queries",
          "technology": "gRPC",
          "direction": "forward"
        },
        {
          "id": "e-kong-cache",
          "source": "kong-gateway",
          "target": "session-cache",
          "label": "Reads sessions, increments rate-limit counters",
          "technology": "RESP/TCP",
          "direction": "bidirectional"
        },
        {
          "id": "e-orders-db",
          "source": "orders-service",
          "target": "orders-db",
          "label": "Reads and writes orders",
          "technology": "SQL/TCP (pgx)",
          "direction": "bidirectional"
        },
        {
          "id": "e-orders-cache",
          "source": "orders-service",
          "target": "session-cache",
          "label": "Stores idempotency keys",
          "technology": "RESP/TCP",
          "direction": "bidirectional"
        },
        {
          "id": "e-orders-stripe",
          "source": "orders-service",
          "target": "ext-stripe",
          "label": "Authorises and captures payments",
          "technology": "HTTPS/JSON",
          "direction": "forward",
          "tags": ["pci"],
          "realizes": "e-shopflow-stripe"
        },
        {
          "id": "e-orders-sendgrid",
          "source": "orders-service",
          "target": "ext-sendgrid",
          "label": "Sends receipts via outbox worker",
          "technology": "HTTPS/JSON",
          "direction": "forward",
          "realizes": "e-shopflow-sendgrid"
        },
        {
          "id": "e-orders-catalog",
          "source": "orders-service",
          "target": "catalog-service",
          "label": "Reserves stock at checkout",
          "technology": "gRPC",
          "direction": "forward"
        },
        {
          "id": "e-catalog-db",
          "source": "catalog-service",
          "target": "catalog-db",
          "label": "Reads and writes product documents",
          "technology": "MongoDB wire protocol",
          "direction": "bidirectional"
        },
        {
          "id": "e-catalog-cache",
          "source": "catalog-service",
          "target": "session-cache",
          "label": "Caches hot product reads",
          "technology": "RESP/TCP",
          "direction": "bidirectional",
          "style": "dashed"
        }
      ]
    },
    {
      "id": "d-cmp-orders",
      "level": "component",
      "title": "Orders Service — Components",
      "description": "Internal structure of the Orders Service. Boundary nodes are inherited from the container view and are read-only here.",
      "ownerNodeId": "orders-service",
      "parentDiagramId": "d-cnt-shopflow",
      "viewport": { "zoom": 1, "x": 0, "y": 0 },
      "nodes": [
        {
          "id": "ext-kong",
          "type": "externalSystem",
          "name": "API Gateway",
          "position": { "x": 480, "y": 40 },
          "size": { "width": 176, "height": 80 },
          "externalRef": { "diagramId": "d-cnt-shopflow", "nodeId": "kong-gateway" }
        },
        {
          "id": "order-grpc-handler",
          "type": "component",
          "name": "Order gRPC Handler",
          "description": "Decodes requests, validates payloads, maps domain errors to status codes. No business logic.",
          "technology": "Go / grpc-go",
          "icon": "golang",
          "iconSource": "inferred",
          "position": { "x": 480, "y": 200 },
          "size": { "width": 176, "height": 88 }
        },
        {
          "id": "checkout-usecase",
          "type": "component",
          "name": "Checkout Use Case",
          "description": "Orchestrates stock reservation, payment authorisation, and order persistence in one transactional boundary.",
          "technology": "Go",
          "icon": "golang",
          "iconSource": "inferred",
          "position": { "x": 480, "y": 360 },
          "size": { "width": 176, "height": 88 },
          "tags": ["pci"]
        },
        {
          "id": "idempotency-guard",
          "type": "component",
          "name": "Idempotency Guard",
          "description": "Rejects duplicate checkout attempts by key before any side effect occurs.",
          "technology": "Go",
          "position": { "x": 232, "y": 360 },
          "size": { "width": 176, "height": 88 }
        },
        {
          "id": "payment-client",
          "type": "component",
          "name": "Payment Client",
          "description": "Stripe adapter: retries, webhook signature verification, card data never logged.",
          "technology": "Go / stripe-go",
          "position": { "x": 232, "y": 528 },
          "size": { "width": 176, "height": 88 },
          "tags": ["pci"]
        },
        {
          "id": "order-repository",
          "type": "component",
          "name": "Order Repository",
          "description": "Persistence for the order aggregate plus the transactional outbox write.",
          "technology": "Go / pgx",
          "position": { "x": 480, "y": 528 },
          "size": { "width": 176, "height": 88 }
        },
        {
          "id": "outbox-worker",
          "type": "component",
          "name": "Outbox Worker",
          "description": "Polls the outbox table and dispatches receipt emails and fulfilment events at-least-once.",
          "technology": "Go",
          "position": { "x": 736, "y": 528 },
          "size": { "width": 176, "height": 88 }
        },
        {
          "id": "ext-orders-db",
          "type": "database",
          "name": "Orders Database",
          "position": { "x": 480, "y": 704 },
          "size": { "width": 176, "height": 80 },
          "externalRef": { "diagramId": "d-cnt-shopflow", "nodeId": "orders-db" }
        },
        {
          "id": "ext-cache",
          "type": "database",
          "name": "Session & Rate-limit Cache",
          "position": { "x": 232, "y": 704 },
          "size": { "width": 176, "height": 80 },
          "externalRef": { "diagramId": "d-cnt-shopflow", "nodeId": "session-cache" }
        },
        {
          "id": "ext-stripe-cmp",
          "type": "externalSystem",
          "name": "Stripe",
          "position": { "x": 24, "y": 528 },
          "size": { "width": 160, "height": 80 },
          "externalRef": { "diagramId": "d-cnt-shopflow", "nodeId": "ext-stripe" }
        },
        {
          "id": "ext-sendgrid-cmp",
          "type": "externalSystem",
          "name": "SendGrid",
          "position": { "x": 760, "y": 704 },
          "size": { "width": 160, "height": 80 },
          "externalRef": { "diagramId": "d-cnt-shopflow", "nodeId": "ext-sendgrid" }
        },
        {
          "id": "ext-catalog-svc",
          "type": "externalSystem",
          "name": "Catalog Service",
          "position": { "x": 736, "y": 360 },
          "size": { "width": 176, "height": 80 },
          "externalRef": { "diagramId": "d-cnt-shopflow", "nodeId": "catalog-service" }
        }
      ],
      "edges": [
        {
          "id": "e-kong-handler",
          "source": "ext-kong",
          "target": "order-grpc-handler",
          "label": "CreateOrder, CancelOrder, GetOrder",
          "technology": "gRPC",
          "direction": "forward",
          "realizes": "e-kong-orders"
        },
        {
          "id": "e-handler-checkout",
          "source": "order-grpc-handler",
          "target": "checkout-usecase",
          "label": "Invokes",
          "direction": "forward"
        },
        {
          "id": "e-handler-guard",
          "source": "order-grpc-handler",
          "target": "idempotency-guard",
          "label": "Checks request key before dispatch",
          "direction": "forward"
        },
        {
          "id": "e-guard-cache",
          "source": "idempotency-guard",
          "target": "ext-cache",
          "label": "SETNX on idempotency key, 24h TTL",
          "technology": "RESP/TCP",
          "direction": "bidirectional",
          "realizes": "e-orders-cache"
        },
        {
          "id": "e-checkout-payment",
          "source": "checkout-usecase",
          "target": "payment-client",
          "label": "Authorises payment",
          "direction": "forward",
          "tags": ["pci"]
        },
        {
          "id": "e-checkout-catalog",
          "source": "checkout-usecase",
          "target": "ext-catalog-svc",
          "label": "Reserves stock",
          "technology": "gRPC",
          "direction": "forward",
          "realizes": "e-orders-catalog"
        },
        {
          "id": "e-checkout-repo",
          "source": "checkout-usecase",
          "target": "order-repository",
          "label": "Persists order and outbox record",
          "direction": "forward"
        },
        {
          "id": "e-payment-stripe",
          "source": "payment-client",
          "target": "ext-stripe-cmp",
          "label": "PaymentIntents create/capture",
          "technology": "HTTPS/JSON",
          "direction": "bidirectional",
          "tags": ["pci"],
          "realizes": "e-orders-stripe"
        },
        {
          "id": "e-repo-db",
          "source": "order-repository",
          "target": "ext-orders-db",
          "label": "SELECT / INSERT / UPDATE",
          "technology": "SQL/TCP",
          "direction": "bidirectional",
          "realizes": "e-orders-db"
        },
        {
          "id": "e-outbox-db",
          "source": "outbox-worker",
          "target": "ext-orders-db",
          "label": "Polls outbox, marks dispatched",
          "technology": "SQL/TCP",
          "direction": "bidirectional",
          "style": "dashed",
          "realizes": "e-orders-db"
        },
        {
          "id": "e-outbox-sendgrid",
          "source": "outbox-worker",
          "target": "ext-sendgrid-cmp",
          "label": "Sends receipt email",
          "technology": "HTTPS/JSON",
          "direction": "forward",
          "realizes": "e-orders-sendgrid"
        }
      ]
    }
  ]
}
```

### Reading the example

- **The drill path.** `d-ctx-root` → node `shopflow-platform` has `childDiagramId: "d-cnt-shopflow"` → that diagram's node `orders-service` has `childDiagramId: "d-cmp-orders"`. Breadcrumb renders from the reverse pointers: `ShopFlow Platform › Orders Service`.
- **Boundary inheritance.** `d-cmp-orders` contains `ext-kong`, `ext-orders-db`, `ext-cache`, `ext-stripe-cmp`, `ext-sendgrid-cmp`, `ext-catalog-svc` — all `externalRef` placeholders. The component view is readable on its own, and the placeholders can't drift because they are references, not copies.
- **Traceability via `realizes`.** The Context edge `e-shopflow-stripe` is realised at Container level by `e-orders-stripe`, which is realised at Component level by `e-payment-stripe`. The validator can answer "which code component actually talks to Stripe?" by following the chain — and can flag any Context relationship with no realisation anywhere below it.
- **Placeholders may chain.** `ext-stripe-cmp` (Component) references `ext-stripe` (Container), which itself references `stripe` (Context). Resolution follows `externalRef` until it reaches a non-placeholder node, so a rename at Context propagates to every depth with no duplication.
- **`iconSource`.** `stripe` on the Context node is `explicit` (someone chose it), while `orders-service`'s `golang` is `inferred` from `technology: "Go 1.22"`. Changing that node's technology to Rust would swap the icon; changing Stripe's would not.
- **Cross-cutting tags.** Filtering on `pci` lights up exactly the payment path across all three levels, with no separate diagram to maintain.

---

## Validation rules (load-time)

Hard errors — file is refused, with the JSON path named (AF-E5-S2):

1. `version` major exceeds supported major.
2. `rootDiagramId` does not resolve, or its diagram's `level` ≠ `context`, or its `ownerNodeId`/`parentDiagramId` ≠ `null`.
3. Duplicate `id` among diagrams, or among nodes/edges across the file.
4. `edge.source` / `edge.target` does not resolve to a node in the **same** diagram.
5. `node.type` invalid for its diagram's `level`.
6. A child diagram's `level` is not exactly one step deeper than its parent's.
7. A cycle in `parentDiagramId`, or depth exceeding 4.
8. Both `childDiagramId` and `childRef` present on one node.

Warnings — file loads, findings surface in the validation panel (AF-E2-S6):

1. `parentDiagramId`/`ownerNodeId`/`childDiagramId` back-pointer mismatch.
2. `externalRef` pointing at a node that no longer exists (orphaned placeholder).
3. `realizes` pointing at a non-existent edge, or at an edge not one level up.
4. Parent-level relationship with no `realizes` from any child diagram.
5. Unknown `icon` slug not present in the bundled set or `metadata.customIcons`.
6. Duplicate node `name` within one diagram.
7. Nodes with no edges at all.

## Determinism rules (write-time)

To make the diff-readability metric real:

1. Object keys written in the schema-declared order above, never alphabetically or by insertion order.
2. `diagrams`, `nodes`, `edges` sorted by `id`; `tags` sorted lexically.
3. 2-space indent, LF line endings, trailing newline, no trailing whitespace.
4. Absent optional fields are **omitted**, never written as `null` or `""` — so an unset description contributes zero diff noise.
5. Numbers written as integers where integral (`"zoom": 1`, not `1.0`); positions always integral.
6. `metadata.updatedAt` written only when the model actually changed.
7. Unknown fields from a newer minor version are preserved verbatim in their original position on round-trip.
