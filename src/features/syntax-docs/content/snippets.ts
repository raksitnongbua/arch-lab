/**
 * Every piece of `.aft` source shown on the syntax reference page lives HERE,
 * not inline in JSX — so `scripts/syntax-docs-check.mjs` can import this one
 * module and push every snippet through the real `parseArchText`:
 *
 *   - every valid snippet (full examples AND the per-row table examples,
 *     wrapped into complete files by the `wrap*` helpers below) must parse;
 *   - every deliberately-invalid snippet in `INVALID_SNIPPETS` must fail with
 *     EXACTLY the line, column and message the page displays.
 *
 * A syntax reference with an example that doesn't work is worse than no
 * reference — this module is what makes that impossible to ship.
 *
 * Imported by `scripts/syntax-docs-check.mjs` through Node's type stripping:
 * keep the syntax erasable and imports type-only (this module has none).
 */

/* -------------------------------------------------------------------------- */
/* Complete examples (shown as code blocks, checked verbatim)                 */
/* -------------------------------------------------------------------------- */

export interface DocSnippet {
  /** Stable id, used by the check script's output. */
  id: string;
  /** The exact `.aft` source displayed on the page. */
  code: string;
}

/** The whole-file example shown first — a complete two-level model. */
export const MINIMAL_EXAMPLE: DocSnippet = {
  id: "minimal-complete-model",
  code: `archflow 1.0
title "ShopFlow Platform"

@context ctx-root "ShopFlow Platform"
  customer:person "Customer" #shopper
  shop:system "ShopFlow Platform" @nextjs >cnt-shop
  stripe:external "Stripe"

  customer -> shop : "Places an order" [HTTPS]
  shop <-> stripe : "Authorises payment" [HTTPS/JSON]

@container cnt-shop owner=shop
  web:container "Web App" @nextjs
  db:database "Orders DB" @postgresql

  web -> db : "Reads and writes" [SQL/TCP]
`,
};

/** Every header line the format knows, in canonical order. */
export const HEADER_EXAMPLE: DocSnippet = {
  id: "full-header",
  code: `archflow 1.0
schema "https://arch-flow.dev/schema/v1/diagram.schema.json"
title "ShopFlow Platform"
description "Customer-facing commerce platform."
owner "Platform Team"
tags #commerce #payments
created 2026-07-01T00:00:00Z
updated 2026-07-27T00:00:00Z
reviewed 2026-07-20T00:00:00Z
tagcolor payments "#e11d48"
customicon warehouse "Warehouse" "<svg viewBox=\\"0 0 24 24\\"/>"
generator "arch-flow" "0.1.0"
root ctx-root

@context ctx-root "ShopFlow Platform"
  customer:person "Customer"
`,
};

/** A diagram header with every attribute, plus the desc/view body lines. */
export const DIAGRAM_EXAMPLE: DocSnippet = {
  id: "diagram-header",
  code: `archflow 1.0
title "ShopFlow Platform"

@context ctx-root "ShopFlow Platform"
  shop:system "ShopFlow Platform" >cnt-shop

@container cnt-shop "ShopFlow — Containers" owner=shop in=ctx-root
  desc "Deployable units inside the platform boundary."
  view 0.75 -120 64
  web:container "Web App"
`,
};

/** A node line carrying every attribute, with a desc continuation. */
export const NODE_EXAMPLE: DocSnippet = {
  id: "node-anatomy",
  code: `archflow 1.0
title "Orders"

@context ctx-root "Orders"
  shop:system "Shop" >cnt-shop

@container cnt-shop owner=shop
  orders:container "Orders Service" @golang! [Go 1.22] #critical-path >cmp-orders pin (656,616 176x88)
    desc "Order lifecycle: create, pay, cancel, fulfil."

@component cmp-orders owner=orders
  api:component "HTTP API"
`,
};

/** An edge line carrying every attribute, realizing a parent-level edge. */
export const EDGE_EXAMPLE: DocSnippet = {
  id: "edge-anatomy",
  code: `archflow 1.0
title "Orders"

@context ctx-root "Orders"
  cust:person "Customer"
  shop:system "Shop" >cnt-shop

  cust -> shop : "Places orders" [HTTPS]

@container cnt-shop owner=shop
  web:container "Web App"
  db:database "Orders DB"

  web -> db : "Reads and writes orders" [SQL/TCP (pgx)] #system-of-record ~e-cust-shop id=e-ord-db via (640,700) (600,760)
`,
};

/** `!` escape lines at file, metadata, diagram and node scope. */
export const UNKNOWN_FIELDS_EXAMPLE: DocSnippet = {
  id: "unknown-fields",
  code: `archflow 1.0
title "Forward compatible"
! meta.x-review after updatedAt : {"cycle":30}
! x-pipeline : {"stage":"prod"}

@context ctx-root "Forward compatible"
  ! x-diagram-flag : true
  api:system "API"
    ! x-node-meta after name : [1,2]
`,
};

/** The indentation contract and full-line comments. */
export const LAYOUT_EXAMPLE: DocSnippet = {
  id: "indentation-and-comments",
  code: `// Full-line comments start with // — at any indentation, even line 1.
archflow 1.0
title "Layout rules"

// Blank lines are ignored. Comments are text-only sugar: they are the one
// thing a round trip does not preserve.
@context ctx-root "Layout rules"
  api:system "API"
    desc "Indent 4: a continuation of the node line above."
`,
};

export const FULL_SNIPPETS: readonly DocSnippet[] = [
  MINIMAL_EXAMPLE,
  HEADER_EXAMPLE,
  DIAGRAM_EXAMPLE,
  NODE_EXAMPLE,
  EDGE_EXAMPLE,
  UNKNOWN_FIELDS_EXAMPLE,
  LAYOUT_EXAMPLE,
];

/* -------------------------------------------------------------------------- */
/* Wrap helpers — turn a one-line table example into a complete file          */
/* -------------------------------------------------------------------------- */

/** Indents every non-empty line of `block` by two spaces. */
function indentBody(block: string): string {
  return block
    .split("\n")
    .map((line) => (line === "" ? line : `  ${line}`))
    .join("\n");
}

/** Wraps a header-line example into a complete parseable file. */
export function wrapHeaderExample(example: string): string {
  const keyword = example.split(" ")[0] ?? "";
  const lines: string[] = [];
  if (keyword === "archflow") {
    lines.push(example, 'title "Header demo"');
  } else {
    lines.push("archflow 1.0");
    if (keyword !== "title") lines.push('title "Header demo"');
    lines.push(example);
  }
  lines.push("", '@context ctx-root "Header demo"', '  team:person "Team"', "");
  return lines.join("\n");
}

/**
 * Wraps a node-line example (container level) into a complete file.
 * `suffix` appends extra top-level lines — e.g. the child diagram a
 * `>cmp-api` drill-down points at.
 */
export function wrapNodeExample(example: string, suffix?: string): string {
  const lines = [
    "archflow 1.0",
    'title "Node demo"',
    "",
    '@context ctx-root "Node demo"',
    '  shop:system "Shop"',
    "",
    "@container cnt-shop owner=shop",
    indentBody(example),
  ];
  if (suffix !== undefined) lines.push("", suffix);
  lines.push("");
  return lines.join("\n");
}

/**
 * Wraps an edge-line example into a complete file whose container diagram
 * has `web` and `db` nodes, and whose context has the `e-cust-shop` edge a
 * `~realizes` example can point at.
 */
export function wrapEdgeExample(example: string): string {
  return [
    "archflow 1.0",
    'title "Edge demo"',
    "",
    '@context ctx-root "Edge demo"',
    '  cust:person "Customer"',
    '  shop:system "Shop"',
    "",
    '  cust -> shop : "Uses"',
    "",
    "@container cnt-shop owner=shop",
    '  web:container "Web App"',
    '  db:database "Orders DB"',
    "",
    indentBody(example),
    "",
  ].join("\n");
}

/** A minimal file with one node of the given keyword at the given level. */
export function wrapNodeTypeExample(
  level: "context" | "container" | "component" | "code",
  keyword: string,
): string {
  const lines = ["archflow 1.0", 'title "Type demo"', ""];
  const node = `  n:${keyword} "Example"`;
  if (level === "context") {
    lines.push('@context ctx-root "Type demo"', node, "");
    return lines.join("\n");
  }
  lines.push('@context ctx-root "Type demo"', '  shop:system "Shop"', "");
  if (level === "container") {
    lines.push("@container cnt-shop owner=shop", node, "");
    return lines.join("\n");
  }
  lines.push("@container cnt-shop owner=shop", '  web:container "Web App"', "");
  if (level === "component") {
    lines.push("@component cmp-web owner=web", node, "");
    return lines.join("\n");
  }
  lines.push(
    "@component cmp-web owner=web",
    '  api:component "HTTP API"',
    "",
    "@code code-api owner=api",
    node,
    "",
  );
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/* Header lines                                                               */
/* -------------------------------------------------------------------------- */

export interface HeaderRow {
  /** The line's shape, shown as inline code. */
  syntax: string;
  /** A working example line — checked via `wrapHeaderExample`. */
  example: string;
  /** What it maps to in the JSON model. */
  mapsTo: string;
  notes: string;
}

export const HEADER_ROWS: readonly HeaderRow[] = [
  {
    syntax: "archflow <version>",
    example: "archflow 1.0",
    mapsTo: "version",
    notes: "Required; must be the first content line of the file.",
  },
  {
    syntax: 'schema "<url>"',
    example: 'schema "https://arch-flow.dev/schema/v1/diagram.schema.json"',
    mapsTo: "$schema",
    notes: "Optional JSON-schema URL.",
  },
  {
    syntax: 'title "<text>"',
    example: 'title "ShopFlow Platform"',
    mapsTo: "metadata.title",
    notes: "Required — a file without a title is refused.",
  },
  {
    syntax: 'description "<text>"',
    example: 'description "Customer-facing commerce platform."',
    mapsTo: "metadata.description",
    notes: "Optional.",
  },
  {
    syntax: 'owner "<text>"',
    example: 'owner "Platform Team"',
    mapsTo: "metadata.owner",
    notes: "Optional.",
  },
  {
    syntax: "tags #a #b",
    example: "tags #commerce #payments",
    mapsTo: "metadata.tags",
    notes: 'At least one tag; quote odd names: #"needs review".',
  },
  {
    syntax: "created <timestamp>",
    example: "created 2026-07-01T00:00:00Z",
    mapsTo: "metadata.createdAt",
    notes: "Defaults to the fixed sentinel 1970-01-01T00:00:00Z when omitted.",
  },
  {
    syntax: "updated <timestamp>",
    example: "updated 2026-07-27T00:00:00Z",
    mapsTo: "metadata.updatedAt",
    notes: "Same default sentinel as created.",
  },
  {
    syntax: "reviewed <timestamp>",
    example: "reviewed 2026-07-20T00:00:00Z",
    mapsTo: "metadata.lastReviewedAt",
    notes: "Optional.",
  },
  {
    syntax: 'tagcolor <tag> "<colour>"',
    example: 'tagcolor payments "#e11d48"',
    mapsTo: "metadata.tagColors",
    notes: "One line per tag; repeat for more tags.",
  },
  {
    syntax: 'customicon <slug> "<name>" "<svg>"',
    example:
      'customicon warehouse "Warehouse" "<svg viewBox=\\"0 0 24 24\\"/>"',
    mapsTo: "metadata.customIcons",
    notes: "One line per icon; the SVG is a JSON string, so quotes escape.",
  },
  {
    syntax: 'generator "<name>" "<version>"',
    example: 'generator "arch-flow" "0.1.0"',
    mapsTo: "metadata.generator",
    notes: "Optional tool fingerprint.",
  },
  {
    syntax: "root <diagram-id>",
    example: "root ctx-root",
    mapsTo: "rootDiagramId",
    notes:
      "May be omitted when exactly one parentless @context diagram exists — it is then the root.",
  },
];

/* -------------------------------------------------------------------------- */
/* Node types                                                                 */
/* -------------------------------------------------------------------------- */

export interface NodeTypeRow {
  /** The `.aft` keyword written after `id:`. */
  keyword: string;
  /** The node `type` value in the JSON model. */
  modelType: string;
  /** Diagram levels where this type is legal. */
  levels: readonly string[];
  /** The level `wrapNodeTypeExample` demonstrates it at. */
  exampleLevel: "context" | "container" | "component" | "code";
}

export const NODE_TYPE_ROWS: readonly NodeTypeRow[] = [
  {
    keyword: "person",
    modelType: "person",
    levels: ["context", "container"],
    exampleLevel: "context",
  },
  {
    keyword: "system",
    modelType: "softwareSystem",
    levels: ["context"],
    exampleLevel: "context",
  },
  {
    keyword: "external",
    modelType: "externalSystem",
    levels: ["context", "container", "component"],
    exampleLevel: "context",
  },
  {
    keyword: "container",
    modelType: "container",
    levels: ["container"],
    exampleLevel: "container",
  },
  {
    keyword: "database",
    modelType: "database",
    levels: ["container", "component"],
    exampleLevel: "container",
  },
  {
    keyword: "queue",
    modelType: "queue",
    levels: ["container", "component"],
    exampleLevel: "container",
  },
  {
    keyword: "component",
    modelType: "component",
    levels: ["component"],
    exampleLevel: "component",
  },
  {
    keyword: "code",
    modelType: "codeElement",
    levels: ["code"],
    exampleLevel: "code",
  },
];

/* -------------------------------------------------------------------------- */
/* Node attributes                                                            */
/* -------------------------------------------------------------------------- */

export interface NodeAttrRow {
  /** The attribute's shape, shown as inline code. */
  attr: string;
  /** What it maps to in the JSON model. */
  mapsTo: string;
  /**
   * A working node line (container level) — checked via `wrapNodeExample`.
   * Multi-line examples carry their own relative indentation.
   */
  example: string;
  /** Extra top-level lines the wrapped example needs (e.g. a child diagram). */
  suffix?: string;
  notes: string;
}

export const NODE_ATTR_ROWS: readonly NodeAttrRow[] = [
  {
    attr: "@slug",
    mapsTo: "icon",
    example: 'api:container "API" @golang',
    notes: "Icon slug. No marker: the model carries no iconSource.",
  },
  {
    attr: "@slug! / @slug~",
    mapsTo: "icon + iconSource",
    example: 'api:container "API" @golang!',
    notes: '"!" = explicit, "~" = inferred iconSource.',
  },
  {
    attr: "[technology]",
    mapsTo: "technology",
    example: 'api:container "API" [Go 1.22]',
    notes: 'Free text up to "]". Quote when it contains one: ["odd ] tech"].',
  },
  {
    attr: '#tag / #"weird tag"',
    mapsTo: "tags",
    example: 'api:container "API" #critical-path #"needs review"',
    notes: "Repeat for more tags.",
  },
  {
    attr: ">diagram-id",
    mapsTo: "childDiagramId",
    example: 'api:container "API" >cmp-api',
    suffix: "@component cmp-api owner=api",
    notes: "Drill-down to a child diagram declared in the same file.",
  },
  {
    attr: ">null",
    mapsTo: "childDiagramId: null",
    example: 'api:container "API" >null',
    notes:
      "An explicit null in the model (distinct from the key being absent).",
  },
  {
    attr: '>>"file"',
    mapsTo: "childRef",
    example: 'billing:container "Billing" >>"./billing.archflow.json"',
    notes: "Reference to another model file; mutually exclusive with >child.",
  },
  {
    attr: "^diagram/node",
    mapsTo: "externalRef",
    example: 'shop-ref:container "Shop (boundary)" ^ctx-root/shop',
    notes: "Boundary placeholder for a node that lives in another diagram.",
  },
  {
    attr: "pin / pin=false",
    mapsTo: "pinned",
    example: 'api:container "API" pin',
    notes: "Bare pin means pinned: true.",
  },
  {
    attr: "(x,y wxh)",
    mapsTo: "position + size",
    example: 'api:container "API" (656,616 176x88)',
    notes:
      "Omit it and the node gets a deterministic grid position and per-type default size.",
  },
  {
    attr: 'desc "…" (indent 4)',
    mapsTo: "description",
    example: 'api:container "API"\n  desc "Order lifecycle."',
    notes: "A continuation line under the node, indented four spaces.",
  },
];

/* -------------------------------------------------------------------------- */
/* Edge arrows and attributes                                                 */
/* -------------------------------------------------------------------------- */

export interface EdgeArrowRow {
  arrow: string;
  direction: string;
  style: string;
  /** A working edge line — checked via `wrapEdgeExample`. */
  example: string;
}

export const EDGE_ARROW_ROWS: readonly EdgeArrowRow[] = [
  {
    arrow: "->",
    direction: "forward",
    style: "solid (no style key)",
    example: 'web -> db : "Writes"',
  },
  {
    arrow: "<->",
    direction: "bidirectional",
    style: "solid (no style key)",
    example: 'web <-> db : "Syncs"',
  },
  {
    arrow: "--",
    direction: "none",
    style: "solid (no style key)",
    example: 'web -- db : "Peers with"',
  },
  {
    arrow: "..>",
    direction: "forward",
    style: "dashed",
    example: 'web ..> db : "Writes, async"',
  },
  {
    arrow: "<..>",
    direction: "bidirectional",
    style: "dashed",
    example: 'web <..> db : "Syncs, async"',
  },
  {
    arrow: "..",
    direction: "none",
    style: "dashed",
    example: "web .. db",
  },
];

export interface EdgeAttrRow {
  attr: string;
  mapsTo: string;
  /** A working edge line — checked via `wrapEdgeExample`. */
  example: string;
  notes: string;
}

export const EDGE_ATTR_ROWS: readonly EdgeAttrRow[] = [
  {
    attr: ': "label"',
    mapsTo: "label",
    example: 'web -> db : "Reads and writes orders"',
    notes: "The relationship's label.",
  },
  {
    attr: "[technology]",
    mapsTo: "technology",
    example: "web -> db [SQL/TCP (pgx)]",
    notes: "Same quoting rule as on nodes.",
  },
  {
    attr: "#tag",
    mapsTo: "tags",
    example: "web -> db #system-of-record",
    notes: "Repeat for more tags.",
  },
  {
    attr: "~edge-id",
    mapsTo: "realizes",
    example: "web -> db ~e-cust-shop",
    notes: "Traceability to the parent-level edge this one realizes.",
  },
  {
    attr: "id=<edge-id>",
    mapsTo: "id",
    example: "web -> db id=e-orders-write",
    notes: "Omitted when the id is the conventional e-<source>-<target>.",
  },
  {
    attr: "style=solid",
    mapsTo: 'style: "solid"',
    example: "web -> db style=solid",
    notes:
      'Carries the rare explicit "style": "solid" — a plain solid arrow writes no style key at all.',
  },
  {
    attr: "via (x,y) (x,y)",
    mapsTo: "waypoints",
    example: "web -> db via (640,700) (600,760)",
    notes: "One or more routing points.",
  },
  {
    attr: "! key : json (indent 4)",
    mapsTo: "unknown fields",
    example: 'web -> db : "Writes"\n  ! x-edge-meta after label : true',
    notes: "Forward-compatible fields — see the ! lines section.",
  },
];

/* -------------------------------------------------------------------------- */
/* Deliberately invalid snippets — checked to FAIL with exactly this error    */
/* -------------------------------------------------------------------------- */

export interface InvalidSnippet {
  id: string;
  /** What the mistake is, in the page's words. */
  title: string;
  /** The exact broken `.aft` source displayed on the page. */
  code: string;
  /** The full parser message the page displays — asserted verbatim. */
  expected: { line: number; column: number; message: string };
}

export const INVALID_SNIPPETS: readonly InvalidSnippet[] = [
  {
    id: "error-unknown-node-type",
    title: "A node type the format does not know",
    code: `archflow 1.0
title "Broken"

@context ctx-root "Broken"
  api:blob "API"
`,
    expected: {
      line: 5,
      column: 7,
      message:
        'line 5, column 7: "blob" is not a node type — expected person, system, external, container, database, queue, component or code',
    },
  },
  {
    id: "error-type-illegal-at-level",
    title: "A node type that is real, but illegal at this level",
    code: `archflow 1.0
title "Broken"

@context ctx-root "Broken"
  db:database "Orders DB"
`,
    expected: {
      line: 5,
      column: 6,
      message:
        'line 5, column 6: "database" is not valid at level "context" — valid types here: person, system, external',
    },
  },
  {
    id: "error-bad-indentation",
    title: "Indentation that is not 0, 2 or 4 spaces",
    code: `archflow 1.0
title "Broken"

@context ctx-root "Broken"
   api:person "API"
`,
    expected: {
      line: 5,
      column: 4,
      message:
        'line 5, column 4: inconsistent indentation of 3 spaces — expected 0 (header or "@" diagram), 2 (diagram body) or 4 (node/edge continuation)',
    },
  },
  {
    id: "error-missing-node",
    title: "An edge whose endpoint is not a node in this diagram",
    code: `archflow 1.0
title "Broken"

@context ctx-root "Broken"
  cust:person "Customer"

  cust -> ghost : "Uses"
`,
    expected: {
      line: 7,
      column: 11,
      message:
        'line 7, column 11: the target "ghost" does not resolve to a node in this diagram',
    },
  },
  {
    id: "error-trailing-comment",
    title: "A trailing comment — comments must be full lines",
    code: `archflow 1.0
title "Broken" // not allowed here
`,
    expected: {
      line: 2,
      column: 16,
      message: 'line 2, column 16: unexpected text after the "title" line',
    },
  },
  {
    id: "error-unterminated-string",
    title: "A string that is never closed",
    code: `archflow 1.0
title "Broken"

@context ctx-root "Broken
`,
    expected: {
      line: 4,
      column: 19,
      message:
        "line 4, column 19: the string for the diagram title opened here is never closed — expected a closing '\"'",
    },
  },
  {
    id: "error-missing-title",
    title: "A file without a title",
    code: `archflow 1.0

@context ctx-root "Untitled"
`,
    expected: {
      line: 1,
      column: 1,
      message:
        'line 1, column 1: the file has no title — add a line like: title "My System"',
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Everything the check script parses                                         */
/* -------------------------------------------------------------------------- */

export interface CheckedSource {
  id: string;
  source: string;
}

/** Every VALID snippet on the page, as complete parseable sources. */
export function checkedSources(): readonly CheckedSource[] {
  const sources: CheckedSource[] = [];
  for (const snippet of FULL_SNIPPETS) {
    sources.push({ id: snippet.id, source: snippet.code });
  }
  for (const row of HEADER_ROWS) {
    sources.push({
      id: `header-row: ${row.syntax}`,
      source: wrapHeaderExample(row.example),
    });
  }
  for (const row of NODE_TYPE_ROWS) {
    sources.push({
      id: `node-type: ${row.keyword} at @${row.exampleLevel}`,
      source: wrapNodeTypeExample(row.exampleLevel, row.keyword),
    });
  }
  for (const row of NODE_ATTR_ROWS) {
    sources.push({
      id: `node-attr: ${row.attr}`,
      source: wrapNodeExample(row.example, row.suffix),
    });
  }
  for (const row of EDGE_ARROW_ROWS) {
    sources.push({
      id: `edge-arrow: ${row.arrow}`,
      source: wrapEdgeExample(row.example),
    });
  }
  for (const row of EDGE_ATTR_ROWS) {
    sources.push({
      id: `edge-attr: ${row.attr}`,
      source: wrapEdgeExample(row.example),
    });
  }
  return sources;
}
