/**
 * The `.alab` grammar, rendered as Markdown for an agent to read.
 *
 * The critical property: **not one line of syntax here is written by hand.**
 * Every example, every attribute row, every error message is generated from
 * `src/features/syntax-docs/content/snippets.ts` — the same module the
 * `/syntax` page renders from, and the one `pnpm check:syntax-docs` pushes
 * through the REAL `parseArchText` (valid snippets must parse; invalid ones
 * must fail at the exact line, column and message quoted).
 *
 * So the reference an agent is handed cannot drift from the parser: if the
 * grammar changes, that check fails until the data module is fixed, and this
 * file follows automatically. A syntax reference with an example that does
 * not parse is worse than no reference at all — especially for a caller that
 * will believe it.
 *
 * Pure string building; no SDK, no I/O.
 */

import {
  DIAGRAM_EXAMPLE,
  EDGE_ARROW_ROWS,
  SEQUENCE_ARROW_ROWS,
  SEQUENCE_LINE_STYLE_ROWS,
  EDGE_ATTR_ROWS,
  EDGE_EXAMPLE,
  FRAME_EXAMPLE,
  HEADER_EXAMPLE,
  HEADER_ROWS,
  INVALID_SNIPPETS,
  LAYOUT_EXAMPLE,
  MINIMAL_EXAMPLE,
  NODE_ATTR_ROWS,
  NODE_EXAMPLE,
  NODE_TYPE_ROWS,
  SEQUENCE_CURL_EXAMPLE,
  SEQUENCE_FRAGMENT_EXAMPLE,
  SEQUENCE_GROUPING_EXAMPLE,
  SEQUENCE_MESSAGE_EXAMPLE,
  SEQUENCE_MINIMAL_EXAMPLE,
  UNKNOWN_FIELDS_EXAMPLE,
  GANTT_MINIMAL_EXAMPLE,
  GANTT_RELATIVE_EXAMPLE,
  TIMELINE_MINIMAL_EXAMPLE,
  TIMELINE_REFUSALS_EXAMPLE,
  LIFECYCLE_MINIMAL_EXAMPLE,
  LIFECYCLE_REFUSALS_EXAMPLE,
} from "@/features/syntax-docs/content/snippets";

/* -------------------------------------------------------------------------- */
/* Markdown helpers                                                            */
/* -------------------------------------------------------------------------- */

function code(body: string): string {
  return `\`\`\`\n${body.replace(/\n$/, "")}\n\`\`\``;
}

/** A GitHub-flavoured table. Cell contents are escaped for `|`. */
function table(head: readonly string[], rows: readonly string[][]): string {
  const escape = (cell: string): string => cell.replaceAll("|", "\\|");
  const lines = [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escape).join(" | ")} |`),
  ];
  return lines.join("\n");
}

function inline(text: string): string {
  return `\`${text}\``;
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

/** The section ids `get_syntax_reference` accepts. */
export const SYNTAX_SECTION_IDS = [
  "overview",
  "example",
  "layout",
  "header",
  "diagrams",
  "frames",
  "nodes",
  "edges",
  "paths",
  "unknown-fields",
  "sequence",
  "gantt",
  "timeline",
  "lifecycle",
  "errors",
] as const;

export type SyntaxSectionId = (typeof SYNTAX_SECTION_IDS)[number];

export interface SyntaxSection {
  id: SyntaxSectionId;
  title: string;
  /** Markdown body, excluding the heading. */
  body: string;
}

function overview(): string {
  return [
    "`.alab` is the arch-lab text format: a readable, Mermaid-like form of",
    "the same C4 model `.archlab.json` stores. The two are **lossless** in",
    "both directions — text → model → text is byte-identical, and so is",
    "JSON → text → JSON, including unknown forward-compatible fields in",
    "their original key positions.",
    "",
    "Facts worth knowing before writing any:",
    "",
    "- Line-structured with **significant indentation, spaces only, never tabs**.",
    "- Exactly three depths: `0` header lines and `@level` diagram headers,",
    "  `2` diagram body, `4` node/edge continuations.",
    "- Blank lines are ignored. `//` starts a full-line comment — comments are",
    "  the ONE thing a round trip does not preserve.",
    "- Four C4 levels: `@context`, `@container`, `@component`, `@code`.",
    "- Attributes on a node or edge line may appear in **any order**.",
    "- Anything omittable has a deterministic default applied identically by",
    "  the parser and the serializer (layered auto-layout from the diagram's",
    "  own relationships, per-type sizes, sentinel timestamps), so terse files",
    "  still round-trip exactly.",
    "",
    "Validate anything you write with the `validate_model` tool — it runs the",
    "real parser and reports the line, column and offending source line. Hand",
    "it a document of another kind and it does not fail: it names the tool",
    'that reads that kind and asks which picture was wanted. **Do not "fix"',
    "line 1 of a document whose header names another kind** — the header names",
    "the notation the rest of the document is written in, and changing it",
    "converts nothing.",
    "",
    "**This is not the whole format.** Everything in the sections below,",
    "unless a section says otherwise, describes the C4 model grammar opened",
    "by `archlab 1.0`. Four more notations have a section of their own here,",
    "each opened by its own header word and read by its own parser:",
    "`archlab 1.0 sequence`, `… gantt`, `… timeline` and `… lifecycle`. Each",
    "has its own `validate_<kind>` tool; a document handed to the wrong one",
    "fails on line 1.",
    "",
    "arch-lab draws four more notations that this reference does NOT cover —",
    "flowcharts, use-case diagrams, ER schemas and data dictionaries. That is",
    "deliberate rather than a gap: their constructs are arrows and named",
    "rows, and one worked example teaches them faster than a grammar would.",
    "Fetch one with `list_example_models` and `get_example_model` — every",
    "bundled document is parser-verified, which makes it the real reference",
    "for its grammar.",
  ].join("\n");
}

function nodeTypesTable(): string {
  return table(
    ["Keyword", "JSON `type`", "Legal at levels"],
    NODE_TYPE_ROWS.map((row) => [
      inline(row.keyword),
      inline(row.modelType),
      row.levels.map((level) => `@${level}`).join(", "),
    ]),
  );
}

const SECTION_BUILDERS: Record<SyntaxSectionId, () => SyntaxSection> = {
  overview: () => ({
    id: "overview",
    title: "Overview",
    body: overview(),
  }),

  example: () => ({
    id: "example",
    title: "A complete example",
    body: [
      "A whole small model, so the shape is clear before the details.",
      "Geometry is omitted throughout — omitted positions are laid out",
      "top-down from the relationships, so this file is still lossless.",
      "",
      code(MINIMAL_EXAMPLE.code),
    ].join("\n"),
  }),

  layout: () => ({
    id: "layout",
    title: "Indentation & comments",
    body: [
      table(
        ["Indent", "What lives there"],
        [
          ["0", "header lines, `@level` diagram headers"],
          ["2", "diagram body: `desc`, `view`, `!`, node lines, edge lines"],
          ["4", "node/edge continuations: `desc`, `!`"],
        ],
      ),
      "",
      code(LAYOUT_EXAMPLE.code),
    ].join("\n"),
  }),

  header: () => ({
    id: "header",
    title: "Header lines",
    body: [
      "Header lines sit at indent 0 before the first diagram. `archlab",
      "<version>` must be the first content line; `title` is required.",
      "",
      table(
        ["Syntax", "Maps to", "Notes"],
        HEADER_ROWS.map((row) => [
          inline(row.syntax),
          inline(row.mapsTo),
          row.notes,
        ]),
      ),
      "",
      "Every header line at once:",
      "",
      code(HEADER_EXAMPLE.code),
    ].join("\n"),
  }),

  diagrams: () => ({
    id: "diagrams",
    title: "Diagrams",
    body: [
      '`@context | @container | @component | @code <id> ["Title"]',
      "[owner=<node>] [in=<diagram>] [direction=tb|lr]`.",
      "",
      "- The title may be omitted when it equals the owner node's name.",
      "- `owner=<node>` is `ownerNodeId`; `in=<diagram>` is `parentDiagramId`.",
      "- `direction=tb|lr` sets THIS diagram's layout direction, overriding the",
      "  file's `direction` header line. Absent means the file's; a file that",
      "  says nothing lays out `tb`, exactly as every document did before the",
      "  field existed. It only moves nodes whose position the text OMITS — a",
      "  hand-written `(x,y)` is honoured whichever way the layout runs.",
      "  `lr` runs the layers along the long axis and FOLDS a long flow into",
      "  bands, which is what keeps a deep chain from being drawn as a column",
      "  three screens tall; a diagram already wider than it is deep is left",
      "  top-down even under `lr`, because turning that sideways would make a",
      "  column of it the other way. `validate_model` raises a review note",
      "  naming the diagrams this would help, with both measured shapes.",
      "- `in=` may be omitted when it equals the diagram containing the owner",
      "  node; `in=null` forces a parentless diagram that still has an owner.",
      '- Body lines at indent 2: `desc "…"` and `view <zoom> <x> <y>`.',
      "",
      code(DIAGRAM_EXAMPLE.code),
    ].join("\n"),
  }),

  frames: () => ({
    id: "frames",
    title: "Frames (C4 boundaries)",
    body: [
      "A frame is C4's labelled grouping drawn BEHIND a set of elements —",
      '"Internal", an AWS region, a trust boundary. One line each, at diagram',
      "body depth, before the nodes:",
      "",
      code('frame internal "Internal"\nframe storage "Data Layer" in=internal'),
      "",
      "Two rules do most of the work:",
      "",
      "- A frame owns **no behaviour and no relationships**. It is never an",
      "  endpoint of an edge; writing one as a source or target is an error.",
      "- Membership lives on the NODE, as `in=<frame>`, and names the",
      "  **innermost** frame only. A frame's own nesting is recorded once, on",
      "  the frame's `in=`, so the two can never disagree.",
      "",
      "A frame carries **no geometry**. Its rectangle is derived from the",
      "bounding box of its members plus padding, so it cannot drift out of step",
      "when an element moves — and a frame with no members has no rectangle and",
      "is simply not drawn. An empty frame is still legal and still round-trips:",
      "emptying one while editing is not a destructive act.",
      "",
      "Frame ids are unique **within their diagram**, not file-wide, and a",
      "frame may only nest inside another frame of the same diagram. Cycles are",
      "rejected.",
      "",
      code(FRAME_EXAMPLE.code),
    ].join("\n"),
  }),

  paths: () => ({
    id: "paths",
    title: "Paths (authored walks)",
    body: [
      "A path is an ordered walk through ONE diagram that a reader steps",
      "through beat by beat. It is a pure overlay: the viewer dims everything",
      "off the walk and lights the current beat, and nothing about the model",
      "changes. Paths are written last in a diagram, after the edges:",
      "",
      code(
        'path send "Send email path"\n' +
          '  beat "Callers reach the service only through the gateway"\n' +
          "    caller -> gateway -> service\n" +
          '  beat "Requests are queued and consumed"\n' +
          "    service -> queue -> consumer\n" +
          "    consumer -> provider ~e-consumer-provider",
      ),
      "",
      "The shape, exactly:",
      "",
      '- `path <id> "Title"` at diagram body depth (indent 2). Ids are',
      "  unique within their diagram.",
      '- `beat "One sentence"` at indent 4. At least one per path. The',
      "  sentence is the caption the reader is shown; there is no second",
      "  prose slot, because a beat with words and no elements would be a",
      "  caption card floating over the drawing.",
      "- Chain lines at indent 6, at least one per beat: `a -> b -> c`. A",
      "  beat may carry several, and its elements are the union of them, so a",
      "  branching step is one beat, not two.",
      "",
      "**The arrow orders the telling, not the traffic.** Only `->` is legal",
      "in a chain, and a hop matches every relationship joining its pair in",
      "EITHER direction — a request and its response point opposite ways, and",
      "a walk has to be able to go against an arrow. Where two relationships",
      "join one pair the hop lights both; append `~<edge-id>` to the line to",
      "pin its last hop to one of them.",
      "",
      "Every id a beat names must exist on the same diagram, and every hop",
      "must be joined by a relationship that is actually written down. Both",
      "are parse errors rather than silent omissions: a walk that lights the",
      "wrong thing is worse than one that refuses to load.",
      "",
      "Paths keep the order they were written in — it is the order the reader",
      "walks and the order the menu offers — so they are never sorted by id",
      "the way frames, nodes and edges are.",
    ].join("\n"),
  }),

  nodes: () => ({
    id: "nodes",
    title: "Nodes",
    body: [
      'One line per node: `<id>:<type> "Name"` followed by attributes in any',
      "order. Node types are checked against the diagram's level at parse",
      "time.",
      "",
      nodeTypesTable(),
      "",
      "Attributes (canonical order shown):",
      "",
      table(
        ["Attribute", "Maps to", "Notes"],
        NODE_ATTR_ROWS.map((row) => [
          inline(row.attr),
          inline(row.mapsTo),
          row.notes,
        ]),
      ),
      "",
      "A node line carrying everything:",
      "",
      code(NODE_EXAMPLE.code),
      "",
      "Icon slugs are a fixed vocabulary, and an unknown one never errors —",
      "the node silently falls back to its type's generic icon — so never",
      "guess a slug. Over MCP, `list_icons` searches the vocabulary by name,",
      "slug or alias; an icon it lacks can be supplied by the document itself",
      "with a `customicon` header line (see the header section).",
    ].join("\n"),
  }),

  edges: () => ({
    id: "edges",
    title: "Edges",
    body: [
      "`<source> <arrow> <target>` plus attributes. Both endpoints must be",
      "nodes of the SAME diagram.",
      "",
      table(
        ["Arrow", "Direction", "Style"],
        EDGE_ARROW_ROWS.map((row) => [
          inline(row.arrow),
          row.direction,
          row.style,
        ]),
      ),
      "",
      table(
        ["Attribute", "Maps to", "Notes"],
        EDGE_ATTR_ROWS.map((row) => [
          inline(row.attr),
          inline(row.mapsTo),
          row.notes,
        ]),
      ),
      "",
      code(EDGE_EXAMPLE.code),
    ].join("\n"),
  }),

  "unknown-fields": () => ({
    id: "unknown-fields",
    title: "Unknown & forward-compatible fields (`!` lines)",
    body: [
      "Any field the grammar has no sugar for — an unknown key from a newer",
      "minor version, or a known optional key carrying an unexpected shape —",
      "becomes a `!` escape line, valid at every scope. Both the JSON value",
      "and the key's position (via the `after` anchor) survive a round trip.",
      "",
      code(UNKNOWN_FIELDS_EXAMPLE.code),
      "",
      "Bare path segments match `[A-Za-z0-9_-]+`; anything else is",
      "JSON-quoted. Ids, tags and icons follow the same rule everywhere",
      '(`"weird id":person …`).',
    ].join("\n"),
  }),

  sequence: () => ({
    id: "sequence",
    title: "Sequence diagrams (a second document kind)",
    body: [
      "`.alab` describes TWO kinds of document, and the first line decides",
      "which. Everything above is the C4 model grammar, opened by",
      "`archlab 1.0`. A sequence diagram — participants and messages over",
      "time — is opened by **`archlab 1.0 sequence`** and read by a different",
      "parser. The two never mix: a C4 model has no messages, a sequence",
      "document has no `@context`/`@container` levels, and feeding one to the",
      "other's tool fails on line 1. Validate these with the",
      "`validate_sequence` tool, not `validate_model`.",
      "",
      "The body lives under a single `@sequence` block: participants first,",
      "then the flow, in order.",
      "",
      code(SEQUENCE_MINIMAL_EXAMPLE.code),
      "",
      "Facts that are easy to get wrong:",
      "",
      '- The label is introduced by **` : `** — `a -> b : "Label"`. A message',
      "  without it does not parse.",
      "- **An arrow is two independent choices**, not one name: a LINE STYLE",
      "  (solid or dotted) and a HEAD STYLE (none, arrowhead, cross, open, or",
      "  a head at each end). Ten arrows, one token each, and each converts",
      "  to and from its Mermaid equivalent losslessly in both directions.",
      "  The line says which way the step runs — " +
        SEQUENCE_LINE_STYLE_ROWS.map(
          (row) => `\`${row.lineStyle}\` is ${row.meaning}`,
        ).join(", ") +
        " — and the head says what happens when it arrives:",
      "",
      table(
        ["Arrow", "Line", "Head", "The head means", "Mermaid"],
        SEQUENCE_ARROW_ROWS.map((row) => [
          inline(row.arrow),
          row.lineStyle,
          row.headStyle,
          row.headMeaning,
          inline(row.mermaid),
        ]),
      ),
      "",
      "- **Activation rides the arrow**, not a separate line: `->+` opens the",
      "  receiver's bar, `..>-` closes the sender's. So a call-and-return pair",
      "  is `web ->+ api` … `api ..>- web`.",
      '- A participant\'s kind is optional — `web "Storefront"` is a',
      '  participant; `cust:actor "Customer"` draws the stick figure. Only',
      "  `actor` and `participant` exist.",
      "- `[Technology]` works on participants and on messages, same as C4.",
      '- **A message takes a `desc "…"` continuation**, indented two spaces',
      "  under it, exactly like a participant's. The label is the TITLE drawn",
      "  on the arrow and should stay short; the `desc` holds the endpoint,",
      "  payload or caveat, and the viewer shows it when the message is",
      '  clicked. Prefer `"Call login API"` + a `desc` naming',
      "  `POST /api/v1/basic/verify` over one long label. Notes take no",
      "  `desc` — a note is already its own text.",
      "- **A `desc` is a JSON string, so `\\n` gives it several lines**, and the",
      "  viewer renders it as a monospace block that keeps them. Write a",
      "  request as method+path, then the body, then one line per status code",
      "  — not as a paragraph. The escape keeps the source one physical line,",
      "  so the file stays canonical. It can hold a whole runnable `curl`:",
      '  escape `"` as `\\"` and `\\` as `\\\\`, or just JSON-stringify the',
      "  command and paste the result. Budget: 500 characters.",
      "- `autonumber` on its own line numbers every message.",
      "- A message from a participant to itself draws a self-loop.",
      "",
      code(SEQUENCE_MESSAGE_EXAMPLE.code),
      "",
      "A `desc` carrying a complete request — this is what the escaping looks",
      "like in practice, and it round-trips byte for byte:",
      "",
      code(SEQUENCE_CURL_EXAMPLE.code),
      "",
      "**Choosing between a `desc` and a `note`.** They are not",
      "interchangeable, and picking wrong is the main way a valid document",
      "renders badly:",
      "",
      "- `desc` — belongs to ONE message, hidden until a reader clicks that",
      "  message, and **never measured**, so any amount of detail costs no",
      "  width. Use it for the endpoint, the payload, the status codes, the",
      "  header names: everything true of that one step.",
      "- `note` — always visible, wraps to a box, and costs VERTICAL space in",
      "  the flow. Use it for what is true across several steps: an ordering",
      "  hazard, a trap in the API, an invariant. A long note is fine — notes",
      "  wrap — so write one note, not three.",
      "",
      "**Keep labels shorter than their arrow.** Column gaps are capped, so a",
      "label much wider than its own arrow is drawn OVER the neighbouring",
      "lifelines. `validate_sequence` reports how many labels do this and",
      "which are worst; the fix is always the same — verb phrase on the wire,",
      "detail in the `desc`.",
      "",
      "**Fragments nest by INDENTATION and there is no `end` keyword** — this",
      "is the single biggest difference from Mermaid, whose `end` lines have",
      "no equivalent here. `alt`/`else`, `par`/`and`, `critical`/`option`,",
      "`opt`, `loop` and `break` open a block; what belongs to it is what is",
      "indented under it.",
      "",
      code(SEQUENCE_FRAGMENT_EXAMPLE.code),
      "",
      "**Grouping without control flow.** `box` brackets a contiguous run of",
      "lifelines and takes its members as the participant lines nested INSIDE",
      "it; `rect` highlights a run of steps. Both take an optional",
      "`tint=#rrggbb` (or `rgb(…)`, or a common colour name — all normalised",
      "to one spelling). Neither changes what happens; both survive a Mermaid",
      "import unchanged.",
      "",
      code(SEQUENCE_GROUPING_EXAMPLE.code),
      "",
      "Mermaid `sequenceDiagram` code can be imported instead of authored —",
      "pass it to `validate_sequence` or `format_sequence` and it is detected",
      "automatically. That import is ONE-WAY and lossy; the response names",
      "what was dropped.",
    ].join("\n"),
  }),

  /*
   * THE THREE SMALLER GRAMMARS, wired from the snippets `/syntax` already
   * carries and `check:syntax-docs` already pushes through their own parsers.
   *
   * WHY THEY WERE MISSING AND WHY THE FIX IS THIS SMALL. The reference used to
   * end at `sequence`, so an agent told "read the grammar before you write" and
   * then asked for a gantt received ~22 KB of C4 with the word `gantt` nowhere
   * in it — which reads as "arch-lab does not draw those".
   * `KINDS_WITHOUT_SYNTAX_SECTIONS` in `catalog.ts` derives the tool's own
   * confession from THIS array, so adding a section here retires that sentence
   * in the same edit; `check:mcp` asserts the two agree.
   *
   * NOT ONE LINE OF SYNTAX IS WRITTEN HERE, exactly as this file's header
   * requires. Every example below is the snippet the `/syntax` page renders,
   * and a snippet that stopped parsing would fail `check:syntax-docs` before it
   * ever reached an agent.
   *
   * THE FOUR REMAINING KINDS ARE STILL ABSENT, DELIBERATELY. `snippets.ts`
   * argues that the flowchart, use case, ER and dictionary grammars are
   * inferable from one example — their constructs are arrows and named rows —
   * which is why that page does not document them either. Writing a reference
   * for them here would put four hand-authored grammars in the one file whose
   * whole premise is that it contains none, and the honest answer for those
   * kinds is the one the tool already gives: call `get_example_model`.
   */
  gantt: () => ({
    id: "gantt",
    title: "Gantt charts (`archlab 1.0 gantt`)",
    body: [
      "A plan: how long each piece takes and what cannot start until",
      "something else is done. Opened by **`archlab 1.0 gantt`**, read by its",
      "own parser, validated with `validate_gantt`.",
      "",
      code(GANTT_MINIMAL_EXAMPLE.code),
      "",
      "What is easy to get wrong:",
      "",
      "- **`starts <YYYY-MM-DD>` is the whole difference between a calendar",
      "  axis and a relative one.** With it, bars are dated; without it they",
      "  are numbered periods. Nothing else about the document changes:",
      "",
      code(GANTT_RELATIVE_EXAMPLE.code),
      "",
      "- **There is no `crit` keyword.** The critical path is DERIVED — the",
      "  chain with no float, computed from the durations and the `after`",
      "  edges — so it cannot disagree with the plan. `validate_gantt` reports",
      "  it back to you; declaring it is not possible and would not be true.",
      "- `task` has a length, `milestone` is a point. A milestone with a",
      "  duration does not parse.",
      "- `after` takes a comma-separated list, and an item waits for all of",
      "  them. `at <n>` pins a start instead.",
    ].join("\n"),
  }),

  timeline: () => ({
    id: "timeline",
    title: "Timelines (`archlab 1.0 timeline`)",
    body: [
      "What happened, when, and which period it happened in. Opened by",
      "**`archlab 1.0 timeline`**, validated with `validate_timeline`.",
      "",
      code(TIMELINE_MINIMAL_EXAMPLE.code),
      "",
      "The grammar is two keywords, `period` and `event`, and the one nested",
      "`desc`. What has to be learned is not what it has but what it REFUSES,",
      "because every refusal is something a reader arriving from a plan tool",
      "reaches for first — and an absence is invisible in a working example:",
      "",
      code(TIMELINE_REFUSALS_EXAMPLE.code),
      "",
      "If the work has lengths and prerequisites, it is a gantt. The parser",
      "says so by name rather than failing generically.",
    ].join("\n"),
  }),

  lifecycle: () => ({
    id: "lifecycle",
    title: "Lifecycles (`archlab 1.0 lifecycle`)",
    body: [
      "One thing, the states it passes through, and where it can stop.",
      "Opened by **`archlab 1.0 lifecycle`**, validated with",
      "`validate_lifecycle`.",
      "",
      code(LIFECYCLE_MINIMAL_EXAMPLE.code),
      "",
      "**The thing to learn first is an absence: there is no line between two",
      "states.** Declaration order IS the track, and the only branches are",
      "`exit … ends` and `exit … rejoins <id>`. This notation overlaps the",
      "flowchart on purpose and is deliberately the smaller of the two, so",
      "the words that would draw an edge are refused by name:",
      "",
      code(LIFECYCLE_REFUSALS_EXAMPLE.code),
      "",
      "If the states need arbitrary edges between them, write a flowchart.",
    ].join("\n"),
  }),

  errors: () => ({
    id: "errors",
    title: "What errors look like",
    body: [
      "A parse is all-or-nothing and every failure is located:",
      "`line <n>, column <n>: <message>`. Real examples, with the parser's",
      "exact output:",
      "",
      INVALID_SNIPPETS.map((snippet) =>
        [
          `**${snippet.title}**`,
          "",
          code(snippet.code),
          "",
          /* THE MESSAGE ALONE. `expected.message` is the parser's whole
             sentence and it already opens `line <n>, column <n>: ` — prefixing
             the location again put "line 5, column 7: line 5, column 7: …" in
             front of every error example in this reference and in the
             generated `skills/alab/SKILL.md`. The line and the column stay in
             the snippet type because `check:syntax-docs` asserts the parser
             reports exactly those; they are not text to re-render. */
          `→ \`${snippet.expected.message}\``,
        ].join("\n"),
      ).join("\n\n"),
    ].join("\n"),
  }),
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/** One section by id. */
export function syntaxSection(id: SyntaxSectionId): SyntaxSection {
  return SECTION_BUILDERS[id]();
}

/** Every section, in reading order. */
export function allSyntaxSections(): SyntaxSection[] {
  return SYNTAX_SECTION_IDS.map((id) => syntaxSection(id));
}

/** The whole reference as one Markdown document. */
export function syntaxReferenceMarkdown(): string {
  return [
    "# The `.alab` syntax (arch-lab text format)",
    ...allSyntaxSections().map(
      (section) => `## ${section.title}\n\n${section.body}`,
    ),
  ].join("\n\n");
}
