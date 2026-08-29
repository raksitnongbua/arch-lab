/**
 * Every piece of `.alab` source shown on the syntax reference page lives HERE,
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
 * keep the syntax erasable, and keep the imports to pure-data LEAVES — this
 * module is reached from `mcp/catalog.ts`, whose "no React, no zod, no SDK"
 * promise keeps a protocol server out of the `/mcp` page's bundle. There are
 * now FOUR, and each is a leaf whose own only dependency is `@/types`:
 *
 *   - `@/lib/constants` — the title cap the notes below quote.
 *   - `@/types` — the arrow grid and the two axis glossaries.
 *   - `archtext/lib/sequence/keywords` — the `.alab` arrow tokens.
 *   - `mermaid/lib/sequence-mapping` — the Mermaid arrow spellings.
 *
 * The last two are DEEP imports past a feature barrel, which this repo
 * otherwise avoids, and they are deliberate: reaching either barrel would pull
 * a parser into the `/mcp` bundle, and the alternative — retyping ten arrow
 * tokens and ten Mermaid spellings on this page — is the failure mode this
 * whole module exists to prevent. Everything a number or a token here quotes is
 * interpolated from the thing that implements it.
 */

import {
  SEQUENCE_ARROWS_GRID,
  SEQUENCE_HEAD_STYLE_MEANING,
  SEQUENCE_LINE_STYLE_MEANING,
  SEQUENCE_LINE_STYLES,
} from "@/types/sequence";
import { MAX_TITLE_LENGTH } from "@/lib/constants";
import { sequenceArrowToken } from "@/features/archtext/lib/sequence/keywords";
import { mermaidSequenceArrow } from "@/features/mermaid/lib/sequence-mapping";

/* -------------------------------------------------------------------------- */
/* Complete examples (shown as code blocks, checked verbatim)                 */
/* -------------------------------------------------------------------------- */

export interface DocSnippet {
  /** Stable id, used by the check script's output. */
  id: string;
  /** The exact `.alab` source displayed on the page. */
  code: string;
}

/** The whole-file example shown first — a complete two-level model. */
export const MINIMAL_EXAMPLE: DocSnippet = {
  id: "minimal-complete-model",
  code: `archlab 1.0
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
  code: `archlab 1.0
schema "https://arch-lab.dev/schema/v1/diagram.schema.json"
title "ShopFlow Platform"
description "Customer-facing commerce platform."
owner "Platform Team"
tags #commerce #payments
created 2026-07-01T00:00:00Z
updated 2026-07-27T00:00:00Z
reviewed 2026-07-20T00:00:00Z
tagcolor payments "#e11d48"
customicon warehouse "Warehouse" "<svg viewBox=\\"0 0 24 24\\"/>"
generator "arch-lab" "0.1.0"
root ctx-root

@context ctx-root "ShopFlow Platform"
  customer:person "Customer"
`,
};

/** A diagram header with every attribute, plus the desc/live body lines. */
export const DIAGRAM_EXAMPLE: DocSnippet = {
  id: "diagram-header",
  code: `archlab 1.0
title "ShopFlow Platform"

@context ctx-root "ShopFlow Platform"
  shop:system "ShopFlow Platform" >cnt-shop

@container cnt-shop "ShopFlow — Containers" owner=shop in=ctx-root
  desc "Deployable units inside the platform boundary."
  view 0.75 -120 64
  web:container "Web App"
`,
};

/** Frames: a nested boundary, and the nodes that sit inside each one. */
export const FRAME_EXAMPLE: DocSnippet = {
  id: "frames",
  code: `archlab 1.0
title "ShopFlow Platform"

@context ctx-root "ShopFlow Platform"
  shop:system "ShopFlow Platform" >cnt-shop

@container cnt-shop "ShopFlow — Containers" owner=shop
  frame internal "Internal"
  frame storage "Data Layer" in=internal
  web:container "Web App" in=internal
  orders:container "Orders Service" [Go 1.22] in=internal
  orders-db:database "Orders DB" [PostgreSQL 16] in=storage
  ext-pay:external "Payment Provider"

  web -> orders : "Submits the order"
  orders -> orders-db : "Reads and writes orders"
  orders -> ext-pay : "Authorises payment"
`,
};

/** A node line carrying every attribute, with a desc continuation. */
export const NODE_EXAMPLE: DocSnippet = {
  id: "node-anatomy",
  code: `archlab 1.0
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
  code: `archlab 1.0
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
  code: `archlab 1.0
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
archlab 1.0
title "Layout rules"

// Blank lines are ignored. Comments are text-only sugar: they are the one
// thing a round trip does not preserve.
@context ctx-root "Layout rules"
  api:system "API"
    desc "Indent 4: a continuation of the node line above."
`,
};

/* -------------------------------------------------------------------------- */
/* Sequence documents (a DIFFERENT grammar, checked by a different parser)     */
/* -------------------------------------------------------------------------- */

/**
 * `.alab` document kinds do not mix. There are nine — a C4 model
 * (`archlab 1.0`), a sequence diagram (`archlab 1.0 sequence`), a flowchart,
 * a use-case diagram, an ER diagram, a data dictionary, a gantt, a milestone
 * timeline and a lifecycle — and this page documents five of them: the C4
 * model above, the sequence diagram here, and the gantt, the timeline and the
 * lifecycle below. The
 * header decides which parser reads the file, and `detectAlabKind` is what
 * picks.
 *
 * These snippets are kept separate from `FULL_SNIPPETS` because the check
 * script must push them through `parseSequenceText`, not `parseArchText` —
 * feeding a sequence document to the C4 parser fails at line 1, and a check
 * that "proved" that would prove nothing. Same contract otherwise: every
 * snippet here is parsed on every build, so the page cannot show a sequence
 * example that does not work.
 */

/** A complete sequence document, exercising the constructs worth seeing first. */
export const SEQUENCE_MINIMAL_EXAMPLE: DocSnippet = {
  id: "sequence-minimal",
  code: `archlab 1.0 sequence
title "Checkout"

@sequence
  autonumber
  cust:actor "Customer" @person
  web "Storefront" @nextjs [Next.js]
  api:participant "Order API" @golang [Go]

  cust -> web : "Clicks Place order"
  web ->+ api : "POST /orders" [HTTPS]
  api ..>- web : "201 Created"
`,
};

/** Arrow kinds, a message `desc`, a self-message, and notes. */
export const SEQUENCE_MESSAGE_EXAMPLE: DocSnippet = {
  id: "sequence-messages",
  code: `archlab 1.0 sequence
title "Message kinds"

@sequence
  web "Storefront"
  api:participant "Order API"
  queue:participant "Events" [Kafka]

  web -> api : "Call login API" [HTTPS]
    desc "POST /api/v1/basic/verify\\nbody { email, password }\\n200 → { token } (15 min)\\n401 → bad credentials"
  api -> api : "Validates the cart"
  api ~> queue : "order.created" [Avro]
  queue ..> api : "ack"
  api x> queue : "stale.event (dropped)"
  api <-> queue : "Health handshake"
  queue ..~> api : "replay.offer"
  web -- api : "Shares a session cookie"
  note right api : "Retries are idempotent"
  note over api queue : "Both sides are at-least-once"
`,
};

/** Fragments nest by INDENTATION — there is no \`end\` keyword. */
export const SEQUENCE_FRAGMENT_EXAMPLE: DocSnippet = {
  id: "sequence-fragments",
  code: `archlab 1.0 sequence
title "Branching"

@sequence
  web "Storefront"
  api:participant "Order API"
  pay:participant "Payments"

  alt "card accepted"
    api ->+ pay : "Create charge" [REST]
    pay ..>- api : "charge.succeeded"
    par "receipt"
      api ~> web : "Emails the receipt"
    and "audit"
      api -> api : "Writes audit row"
  else "card declined"
    api ..> web : "402 Payment Required"
  opt "first purchase"
    web -> web : "Shows onboarding tips"
`,
};

/**
 * GROUPING AND HIGHLIGHTING — the two constructs that say "these belong
 * together" without saying anything about control flow.
 *
 * `box` groups LIFELINES and its members are the lines nested inside it,
 * which is not decoration in the grammar: nesting is what makes a box a
 * contiguous run, and a bracket over a non-contiguous set has no honest
 * drawing. `rect` groups STEPS and takes a colour rather than a guard.
 *
 * Both accept `tint=`, and both accept only colours the format stores
 * (`#rrggbb`, `rgb(…)`, common names) — a colour is normalised to one
 * spelling on the way in so two documents that mean the same shade are the
 * same bytes.
 */
export const SEQUENCE_GROUPING_EXAMPLE: DocSnippet = {
  id: "sequence-grouping",
  code: `archlab 1.0 sequence
title "Grouped and highlighted"

@sequence
  box "Front of house" tint=#bfdfff
    cust:actor "Customer"
    web "Storefront"
  box "Payments" tint=#ffe4e1
    pay:participant "Payments"
    ledger:participant "Ledger"

  cust -> web : "Places the order"
  rect tint=#bfdfff
    web -> pay : "Create charge" [REST]
    pay -> ledger : "Post entry"
  critical "Capture the funds"
    pay ..> web : "charge.succeeded"
  option "gateway timeout"
    pay ..> web : "retry scheduled"
  break "card declined"
    pay ..> web : "402 Payment Required"
`,
};

/**
 * A `desc` holding a whole runnable request — the case the details dock's code
 * block exists for, and the one that looks impossible in a line-structured
 * format until you notice the `desc` value is a JSON string.
 *
 * BUILT BY `JSON.stringify` RATHER THAN TYPED OUT. Writing this escaped by
 * hand means `\\\\n` for a newline, `\\\\\\\\` for curl's line-continuation
 * backslash and `\\"` for every quote in the JSON body — four levels of
 * escaping in a template literal, unreadable and wrong on the first attempt.
 * Stringifying the real lines gives exactly the bytes the parser wants, and
 * the source of truth stays the readable array below. `check:syntax-docs`
 * pushes the result through `parseSequenceText`, so if the escaping were
 * wrong the page could not ship.
 */
const CURL_DESC = [
  "curl https://api.shopflow.dev/v1/orders \\",
  "  --request POST \\",
  "  --header 'Content-Type: application/json' \\",
  "  --header 'Authorization: Bearer $SHOPFLOW_TOKEN' \\",
  "  --data '{",
  '    "cart_id": "cart_8f21c3",',
  '    "address_id": 4102,',
  '    "coupon": null',
  "  }'",
  "",
  "201 → { order_id }   409 → the cart changed under us",
].join("\n");

/** A `desc` carrying a complete `curl` call, quotes and JSON body included. */
export const SEQUENCE_CURL_EXAMPLE: DocSnippet = {
  id: "sequence-curl-desc",
  code: `archlab 1.0 sequence
title "Order intake"

@sequence
  web "Storefront" [Next.js]
  api:participant "Order API" [Go]

  web ->+ api : "Place the order" [HTTPS]
    desc ${JSON.stringify(CURL_DESC)}
  api ..>- web : "201 Created"
`,
};

export const SEQUENCE_SNIPPETS: readonly DocSnippet[] = [
  SEQUENCE_MINIMAL_EXAMPLE,
  SEQUENCE_MESSAGE_EXAMPLE,
  SEQUENCE_CURL_EXAMPLE,
  SEQUENCE_FRAGMENT_EXAMPLE,
];

/* -------------------------------------------------------------------------- */
/* Gantt documents (a THIRD grammar, checked by a third parser)             */
/* -------------------------------------------------------------------------- */

/**
 * `archlab 1.0 gantt` — a plan: what the work is, how long each piece takes
 * and what cannot start until something else is done.
 *
 * WHY THIS PAGE DOCUMENTS IT AND NOT THE FOUR KINDS BETWEEN, which is the
 * question a reader arriving from `detectAlabKind` will ask. The flowchart,
 * use-case, ER and dictionary grammars are read by the playground and by the
 * MCP server, and neither needs prose here to be usable — their constructs are
 * arrows and named rows a reader can infer from one example on `/demo`. A
 * gantt is the first kind since the sequence diagram whose LINE ORDER means
 * nothing and whose drawing is SOLVED: the bar's position is arithmetic over
 * `at` and `after`, and the critical path is arithmetic the author cannot
 * write down. That is not inferable from an example, so it is written here.
 *
 * These snippets are kept out of `FULL_SNIPPETS` and `SEQUENCE_SNIPPETS` alike,
 * for the reason the sequence block gives: the check script must push them
 * through `parseGanttText`. Handing a gantt to either of the other two
 * parsers fails at line 1, and a check that "proved" that would prove nothing.
 */

/** A complete gantt, on a calendar axis, exercising both item keywords,
 *  both start forms and the state vocabulary. */
export const GANTT_MINIMAL_EXAMPLE: DocSnippet = {
  id: "gantt-minimal",
  code: `archlab 1.0 gantt
title "Order store migration"
starts 2026-09-07

@gantt
  section "Prepare"
    task audit "Schema audit" 5d done at 0
      desc "Read every column, write down what actually moves."
    task shadow "Shadow writes" 13d active after audit
    task verify "Verify parity" 6d at-risk after shadow
    milestone parity "Parity signed off" after verify
  section "Cut over"
    task cutover "Point traffic over" 3d after parity
`,
};

/**
 * THE SAME PLAN WITH `starts` DELETED, and that is the whole point of showing
 * it twice: one optional header line is the entire difference between a
 * calendar axis and a relative one (`W1, W2, W3`). Nothing else about the
 * document changes, which is a claim worth being able to check by eye rather
 * than take on trust.
 */
export const GANTT_RELATIVE_EXAMPLE: DocSnippet = {
  id: "gantt-relative-axis",
  code: `archlab 1.0 gantt
title "Order store migration"

@gantt
  section "Prepare"
    task audit "Schema audit" 5d done at 0
    task shadow "Shadow writes" 13d active after audit
    task backfill "Historical backfill" 12d after audit
    milestone parity "Parity signed off" after shadow, backfill
`,
};

export const GANTT_SNIPPETS: readonly DocSnippet[] = [
  GANTT_MINIMAL_EXAMPLE,
  GANTT_RELATIVE_EXAMPLE,
];

/* -------------------------------------------------------------------------- */
/* Timeline documents (a FOURTH grammar, checked by a fourth parser)           */
/* -------------------------------------------------------------------------- */

/**
 * `archlab 1.0 timeline` — a milestone timeline: what happened when, and
 * which period it happened in.
 *
 * WHY THIS PAGE DOCUMENTS IT, when it does not document the flowchart, the
 * use-case diagram, the ER diagram or the dictionary. Those four are inferable
 * from one example: their constructs are arrows and named rows. This one is
 * documented for the opposite reason to the gantt above — not because it is
 * hard to infer, but because what a reader needs to know is what is NOT here.
 * The grammar is two keywords and they are obvious; the four things it refuses
 * are not, and every one of them is a thing a reader arriving from a plan tool
 * will reach for first. So the second snippet is a REFUSAL LIST, which no
 * other kind on this page needs.
 *
 * These snippets are kept out of `FULL_SNIPPETS`, `SEQUENCE_SNIPPETS` and
 * `GANTT_SNIPPETS` alike, for the reason those blocks give: the check script
 * must push them through `parseTimelineText`.
 */

/** A complete timeline, exercising both keywords, a `#tag` and the one nested
 *  prose slot — which is the whole grammar. */
export const TIMELINE_MINIMAL_EXAMPLE: DocSnippet = {
  id: "timeline-minimal",
  code: `archlab 1.0 timeline
title "How the platform grew"

@timeline
  period "2016"
    event "Two people and a prototype"
      desc "One Rails app on one box, deployed by hand on Friday afternoons."
  period "2018"
    event "First paying customer"
    event "Split the monolith into an API and a web app"
  period "2024"
    event "Opened the public API" #platform
    event "First region outside Europe"
`,
};

/**
 * THE SAME DOCUMENT WITH EVERY REFUSAL WRITTEN OUT AS A COMMENT, which is the
 * one snippet on this page that teaches by what it cannot say.
 *
 * A reader arriving from a plan tool will try `5d`, `after`, `at` and a state
 * word within their first five minutes, because those are the four things
 * every other timeline product has. Each is refused BY NAME with a message
 * pointing at the gantt, and the page is where that is cheapest to learn — an
 * error message is read once, in a hurry, by someone who has already lost
 * their place.
 *
 * It is a real document (the check script parses it), so the `//` lines are
 * the grammar's own comment syntax and not prose about it.
 */
export const TIMELINE_REFUSALS_EXAMPLE: DocSnippet = {
  id: "timeline-refusals",
  code: `archlab 1.0 timeline
title "What a timeline will not hold"

@timeline
  period "Any label — a year, a quarter, a phrase"
    // An event is a POINT. It carries its label and "#tag"s, nothing else.
    event "What happened"
      desc "The one nested slot: a note, drawn under the label."
    // Each of these is refused by name, and each points at the gantt:
    //   event "Migration" 5d          — no duration; a point has no length
    //   event "Cutover" after freeze  — no dependency; nothing waits here
    //   event "Rewrite" at 12         — no start; nothing is measured
    //   event "Rollout" active        — no state; this is what already happened
    // If the work has lengths and prerequisites, write "archlab 1.0 gantt".
    event "What happened next"
`,
};

export const TIMELINE_SNIPPETS: readonly DocSnippet[] = [
  TIMELINE_MINIMAL_EXAMPLE,
  TIMELINE_REFUSALS_EXAMPLE,
];

/* -------------------------------------------------------------------------- */
/* Lifecycle documents (a FIFTH grammar, checked by a fifth parser)            */
/* -------------------------------------------------------------------------- */

/**
 * `archlab 1.0 lifecycle` — one thing, the states it went through, and where
 * it can end up.
 *
 * WHY THIS PAGE DOCUMENTS IT, when it does not document the flowchart, the
 * use-case diagram, the ER diagram or the dictionary. For the timeline's
 * reason, one degree stronger: what a reader needs is what is NOT here. This
 * notation overlaps the flowchart on purpose and is deliberately the smaller
 * of the two (`src/types/lifecycle.ts` records that the overlap was waived
 * rather than argued away), so the thing that has to be learned first is that
 * there is NO LINE BETWEEN TWO STATES — which is invisible in a working
 * example, because an absence always is. So the second snippet is a REFUSAL
 * LIST, the same shape the timeline's is, and for the same reason: an error
 * message is read once, in a hurry, by someone who has already lost their
 * place.
 *
 * These snippets are kept out of `FULL_SNIPPETS`, `SEQUENCE_SNIPPETS`,
 * `GANTT_SNIPPETS` and `TIMELINE_SNIPPETS` alike, for the reason those blocks
 * give: the check script must push them through `parseLifecycleText`.
 */

/** A complete lifecycle, exercising every keyword the grammar has — the
 *  subject, a state, a terminal exit, a returning one and `ends`. */
export const LIFECYCLE_MINIMAL_EXAMPLE: DocSnippet = {
  id: "lifecycle-minimal",
  code: `archlab 1.0 lifecycle
title "An order, from checkout to the doormat"

@lifecycle
  subject "Order"
    desc "One customer order, followed from checkout until it stops."
  state placed "Placed"
    exit "Cancelled" ends
      when "the customer changes their mind before paying"
  state paid "Paid"
  state packed "Packed"
  state shipped "Shipped"
    exit "Returned" rejoins packed
      when "the parcel comes back unopened"
  state delivered "Delivered" ends
`,
};

/**
 * THE SAME DOCUMENT WITH EVERY REFUSAL WRITTEN OUT AS A COMMENT, which is the
 * snippet that teaches this notation by what it cannot say.
 *
 * A reader arriving from a flowchart will try to join two states within their
 * first five minutes, because that is what every other state-shaped notation
 * lets them do. Each attempt is refused BY NAME with a message pointing at
 * `archlab 1.0 flowchart`, and the page is where that is cheapest to learn.
 *
 * It is a real document (the check script parses it), so the `//` lines are
 * the grammar's own comment syntax and not prose about it.
 */
export const LIFECYCLE_REFUSALS_EXAMPLE: DocSnippet = {
  id: "lifecycle-refusals",
  code: `archlab 1.0 lifecycle
title "What a lifecycle will not hold"

@lifecycle
  subject "The thing"
  state first "First"
    // A branch belongs to the state it leaves, and lands in one of two
    // places: it "ends", or it "rejoins" a state declared EARLIER.
    exit "Gave up" ends
      when "nothing happens for a week"
  state second "Second"
    // Each of these is refused by name, and each points at the flowchart:
    //   state third "Third" to second   — no edge; the track IS the order
    //   exit "Skip" rejoins last        — no forward rejoin; that is a shortcut
    //   exit "Sent back" rejoins first  — this one is FINE: first comes earlier
    //     exit "And then"               — no branch off a branch; depth is one
    //   subject "Something else"        — one subject; two would be a graph
    // If the picture is really steps that can go anywhere, write
    // "archlab 1.0 flowchart".
    exit "Sent back" rejoins first
      when "it needs redoing"
  state last "Last" ends
`,
};

export const LIFECYCLE_SNIPPETS: readonly DocSnippet[] = [
  LIFECYCLE_MINIMAL_EXAMPLE,
  LIFECYCLE_REFUSALS_EXAMPLE,
];

export const FULL_SNIPPETS: readonly DocSnippet[] = [
  MINIMAL_EXAMPLE,
  HEADER_EXAMPLE,
  DIAGRAM_EXAMPLE,
  FRAME_EXAMPLE,
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
  if (keyword === "archlab") {
    lines.push(example, 'title "Header demo"');
  } else {
    lines.push("archlab 1.0");
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
    "archlab 1.0",
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
    "archlab 1.0",
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
  const lines = ["archlab 1.0", 'title "Type demo"', ""];
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
    syntax: "archlab <version>",
    example: "archlab 1.0",
    mapsTo: "version",
    notes: "Required; must be the first content line of the file.",
  },
  {
    syntax: 'schema "<url>"',
    example: 'schema "https://arch-lab.dev/schema/v1/diagram.schema.json"',
    mapsTo: "$schema",
    notes: "Optional JSON-schema URL.",
  },
  {
    syntax: 'title "<text>"',
    example: 'title "ShopFlow Platform"',
    mapsTo: "metadata.title",
    // The cap is interpolated, not typed out: the checkers quote the same
    // constant, and a number that disagreed with them would be worse than no
    // number. Stated as a GUIDE because that is what it is — the parser accepts
    // a longer title and the checkers raise a review note instead.
    notes:
      `Required — a file without a title is refused. Keep it to ` +
      `${MAX_TITLE_LENGTH} characters: longer still parses, but the checkers ` +
      `raise a review note, since the title becomes the export filename too.`,
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
    example: 'generator "arch-lab" "0.1.0"',
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
  /** The `.alab` keyword written after `id:`. */
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
    example: 'billing:container "Billing" >>"./billing.archlab.json"',
    notes: "Reference to another model file; mutually exclusive with >child.",
  },
  {
    attr: "^diagram/node",
    mapsTo: "externalRef",
    // The terse form is the canonical one: the writer omits a name that equals
    // the referenced node's, so documenting `"Shop (boundary)" ^ctx-root/shop`
    // taught a form the tool immediately rewrites — copy it, press Format, and
    // watch the name disappear.
    example: "shop-ref:container ^ctx-root/shop",
    notes:
      "Boundary placeholder for a node that lives in another diagram. The " +
      "name is omitted here because it is derived from the referenced node; " +
      'give one ("Shop (boundary)") only to override it locally.',
  },
  {
    attr: "in=<frame>",
    mapsTo: "frameId",
    // Two lines, because the attribute is only meaningful next to the frame
    // it names — a lone `in=internal` would be a dangling reference, and the
    // page's snippets are all parsed for real.
    example: 'frame internal "Internal"\napi:container "API" in=internal',
    notes:
      "Puts the node inside a frame declared on the same diagram. Name the " +
      "INNERMOST frame; nesting is recorded on the frame itself.",
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

/* -------------------------------------------------------------------------- */
/* Sequence arrows                                                             */
/* -------------------------------------------------------------------------- */

export interface SequenceArrowRow {
  arrow: string;
  lineStyle: string;
  headStyle: string;
  /**
   * What the HEAD says, only. The line axis is glossed once in the prose above
   * the table rather than repeated down a column: composing the two
   * ("a call outward, both ways at once") produced a phrase that read as
   * self-contradictory, and the reader already has the line style in the
   * column beside it.
   */
  headMeaning: string;
  /** The Mermaid arrow this converts to and from, both ways, losslessly. */
  mermaid: string;
}

/** The line axis in one line each, for the prose above the arrow table. */
export const SEQUENCE_LINE_STYLE_ROWS: readonly {
  lineStyle: string;
  meaning: string;
}[] = SEQUENCE_LINE_STYLES.map((lineStyle) => ({
  lineStyle,
  meaning: SEQUENCE_LINE_STYLE_MEANING[lineStyle],
}));

/**
 * The sequence grammar's ten arrows, DERIVED from the grid rather than typed
 * out. A table of ten hand-written rows is a table that shows nine after the
 * next axis value is added, and this page is where an author comes to find out
 * what the format can spell — an incomplete answer here reads as an
 * unsupported feature.
 *
 * `check:syntax-docs` parses every example on the page through the real
 * parser, which is what keeps the derived spelling honest: a token that stopped
 * parsing would fail the build rather than render as a suggestion.
 */
export const SEQUENCE_ARROW_ROWS: readonly SequenceArrowRow[] =
  SEQUENCE_ARROWS_GRID.map((arrow) => ({
    arrow: sequenceArrowToken(arrow),
    lineStyle: arrow.lineStyle,
    headStyle: arrow.headStyle,
    headMeaning: SEQUENCE_HEAD_STYLE_MEANING[arrow.headStyle],
    mermaid: mermaidSequenceArrow(arrow),
  }));

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
  /** The exact broken `.alab` source displayed on the page. */
  code: string;
  /** The full parser message the page displays — asserted verbatim. */
  expected: { line: number; column: number; message: string };
}

export const INVALID_SNIPPETS: readonly InvalidSnippet[] = [
  {
    id: "error-unknown-node-type",
    title: "A node type the format does not know",
    code: `archlab 1.0
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
    code: `archlab 1.0
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
    code: `archlab 1.0
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
    code: `archlab 1.0
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
    code: `archlab 1.0
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
    code: `archlab 1.0
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
    code: `archlab 1.0

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
