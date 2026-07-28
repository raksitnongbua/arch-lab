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
  EDGE_ATTR_ROWS,
  EDGE_EXAMPLE,
  HEADER_EXAMPLE,
  HEADER_ROWS,
  INVALID_SNIPPETS,
  LAYOUT_EXAMPLE,
  MINIMAL_EXAMPLE,
  NODE_ATTR_ROWS,
  NODE_EXAMPLE,
  NODE_TYPE_ROWS,
  UNKNOWN_FIELDS_EXAMPLE,
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
  "nodes",
  "edges",
  "unknown-fields",
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
    "real parser and reports the line, column and offending source line.",
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
      "[owner=<node>] [in=<diagram>]`.",
      "",
      "- The title may be omitted when it equals the owner node's name.",
      "- `owner=<node>` is `ownerNodeId`; `in=<diagram>` is `parentDiagramId`.",
      "- `in=` may be omitted when it equals the diagram containing the owner",
      "  node; `in=null` forces a parentless diagram that still has an owner.",
      '- Body lines at indent 2: `desc "…"` and `view <zoom> <x> <y>`.',
      "",
      code(DIAGRAM_EXAMPLE.code),
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
          `→ \`line ${snippet.expected.line}, column ${snippet.expected.column}: ` +
            `${snippet.expected.message}\``,
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
