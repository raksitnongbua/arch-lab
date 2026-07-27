/**
 * `/syntax` — the `.aft` text-format reference. Server-rendered: every
 * snippet and table row comes from `../content/snippets.ts`, the SAME module
 * `scripts/syntax-docs-check.mjs` pushes through the real parser — so
 * nothing on this page can drift from what `parseArchText` actually accepts.
 *
 * Structured for someone who has just seen `.aft` in the two-pane editor:
 * what it is → one complete example → reference tables per construct →
 * layout rules → what errors look like → where to try it.
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";

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
} from "../content/snippets";
import { CodeBlock } from "./code-block";

const SECTIONS: readonly { id: string; label: string }[] = [
  { id: "example", label: "A complete example" },
  { id: "layout", label: "Indentation & comments" },
  { id: "header", label: "Header lines" },
  { id: "diagrams", label: "Diagrams" },
  { id: "nodes", label: "Nodes" },
  { id: "edges", label: "Edges" },
  { id: "unknown-fields", label: "Unknown fields (! lines)" },
  { id: "errors", label: "Errors" },
  { id: "try-it", label: "Where to use it" },
];

export function SyntaxReference(): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
      {/* ---- intro ---------------------------------------------------------- */}
      <Badge variant="accent" className="mb-6">
        <span className="size-1.5 rounded-full bg-accent" />
        Reference · the arch-flow text format
      </Badge>

      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        The <span className="font-mono">.aft</span> syntax
      </h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-pretty text-muted-foreground">
        <span className="font-mono text-base text-foreground">.aft</span> is a
        readable, Mermaid-like text form of the same model{" "}
        <span className="font-mono text-base text-foreground">
          .archflow.json
        </span>{" "}
        stores — <strong className="text-foreground">lossless</strong> in both
        directions, so you can edit whichever you prefer and nothing is dropped.
        Text → model → text is byte-identical, and so is JSON → text → JSON;{" "}
        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground">
          pnpm check:archtext
        </code>{" "}
        proves the round trip on every run. Every snippet on this page is
        checked against the real parser by{" "}
        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground">
          pnpm check:syntax-docs
        </code>
        .
      </p>

      {/* ---- on this page ---------------------------------------------------- */}
      <nav aria-label="On this page" className="mt-8">
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="font-medium text-primary hover:underline"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---- 1. complete example --------------------------------------------- */}
      <Section id="example" title="A complete example">
        <P>
          A whole small model first, so the shape is obvious before the details:
          header lines, then one <Code>@context</Code> diagram and one{" "}
          <Code>@container</Code> diagram, each with nodes and edges. Geometry
          is omitted throughout — omitted positions get deterministic grid
          defaults, so terse files stay lossless.
        </P>
        <CodeBlock
          code={MINIMAL_EXAMPLE.code}
          label="complete minimal model"
          tryIt
        />
      </Section>

      {/* ---- 2. layout rules --------------------------------------------------- */}
      <Section id="layout" title="Indentation & comments">
        <P>
          The format is line-structured with significant indentation —{" "}
          <strong className="text-foreground">spaces only, never tabs</strong> —
          and the parser accepts exactly three depths:
        </P>
        <Table
          caption="Indentation depths"
          head={["Indent", "What lives there"]}
          rows={[
            [
              <Code key="i0">0</Code>,
              <>
                Header lines and <Code>@level</Code> diagram headers
              </>,
            ],
            [
              <Code key="i2">2</Code>,
              <>
                Diagram body: <Code>desc</Code>, <Code>view</Code>,{" "}
                <Code>!</Code> lines, node lines, edge lines
              </>,
            ],
            [
              <Code key="i4">4</Code>,
              <>
                Node/edge continuations: <Code>desc</Code> and <Code>!</Code>{" "}
                lines
              </>,
            ],
          ]}
        />
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            Any other indentation (3 spaces, a tab, …) is a parse error naming
            the line and column.
          </li>
          <li>Blank lines are ignored.</li>
          <li>
            <Code>{"//"}</Code> starts a <em>full-line</em> comment — at any
            indentation, even above the <Code>archflow</Code> line. Trailing
            comments after content are a parse error (see{" "}
            <a
              href="#errors"
              className="font-medium text-primary hover:underline"
            >
              Errors
            </a>
            ). Comments are the one thing a round trip does not preserve — they
            are text-only sugar, not model data.
          </li>
          <li>
            All quoted strings are JSON string literals, so <Code>{'\\"'}</Code>
            , <Code>{"\\n"}</Code> and <Code>{"\\uXXXX"}</Code> escapes work
            exactly as in the JSON file. Ids, tags and icon slugs may be bare (
            <Code>[A-Za-z0-9_][A-Za-z0-9_.-]*</Code>) or JSON-quoted when they
            contain anything else: <Code>{'"weird id":person "Name"'}</Code>.
          </li>
        </ul>
        <CodeBlock code={LAYOUT_EXAMPLE.code} label="layout rules" />
      </Section>

      {/* ---- 3. header --------------------------------------------------------- */}
      <Section id="header" title="Header lines">
        <P>
          Header lines sit at indent 0, before the first <Code>@</Code> diagram
          (a header line after a diagram is a parse error). Only{" "}
          <Code>archflow</Code> and <Code>title</Code> are required. Each line
          maps to one field of the JSON model:
        </P>
        <Table
          caption="Header lines"
          head={["Line", "Example", "Maps to", "Notes"]}
          rows={HEADER_ROWS.map((row) => [
            <Code key="s">{row.syntax}</Code>,
            <ExampleCode key="e">{row.example}</ExampleCode>,
            <Code key="m">{row.mapsTo}</Code>,
            row.notes,
          ])}
        />
        <CodeBlock code={HEADER_EXAMPLE.code} label="full header" tryIt />
      </Section>

      {/* ---- 4. diagrams -------------------------------------------------------- */}
      <Section id="diagrams" title="Diagrams">
        <P>
          A diagram opens with an <Code>@level</Code> line at indent 0 —{" "}
          <Code>@context</Code>, <Code>@container</Code>,{" "}
          <Code>@component</Code> or <Code>@code</Code> — followed by the
          diagram id, an optional quoted title, and optional attributes:
        </P>
        <Table
          caption="Diagram header parts"
          head={["Part", "Maps to", "Notes"]}
          rows={[
            [
              <Code key="s">@container cnt-shop {'"Title"'}</Code>,
              <Code key="m">id, level, title</Code>,
              <>
                The title may be omitted — it is then inferred from the owner
                node&apos;s name.
              </>,
            ],
            [
              <Code key="s">owner=&lt;node-id&gt;</Code>,
              <Code key="m">ownerNodeId</Code>,
              "The node this diagram details.",
            ],
            [
              <Code key="s">in=&lt;diagram-id&gt;</Code>,
              <Code key="m">parentDiagramId</Code>,
              <>
                May be omitted when it equals the diagram containing the owner
                node; <Code>in=null</Code> forces a parent-less diagram that
                still has an owner. Each level must sit exactly one level below
                its parent&apos;s.
              </>,
            ],
            [
              <Code key="s">desc {'"…"'}</Code>,
              <Code key="m">description</Code>,
              "A body line at indent 2.",
            ],
            [
              <Code key="s">view &lt;zoom&gt; &lt;x&gt; &lt;y&gt;</Code>,
              <Code key="m">viewport</Code>,
              "A body line at indent 2; three numbers.",
            ],
          ]}
        />
        <CodeBlock code={DIAGRAM_EXAMPLE.code} label="diagram header" tryIt />
      </Section>

      {/* ---- 5. nodes ------------------------------------------------------------ */}
      <Section id="nodes" title="Nodes">
        <P>
          One line per node at indent 2: <Code>{'<id>:<type> "Name"'}</Code> —
          no space around the <Code>:</Code> — followed by attributes in any
          order. Each node type keyword is only legal at certain diagram levels;
          the parser checks this at parse time:
        </P>
        <Table
          caption="Node type keywords"
          head={["Keyword", "Model type", "Legal at levels"]}
          rows={NODE_TYPE_ROWS.map((row) => [
            <Code key="k">{row.keyword}</Code>,
            <Code key="t">{row.modelType}</Code>,
            row.levels.map((level) => `@${level}`).join(", "),
          ])}
        />
        <Table
          caption="Node attributes"
          head={["Attribute", "Example", "Maps to", "Notes"]}
          rows={NODE_ATTR_ROWS.map((row) => [
            <Code key="a">{row.attr}</Code>,
            <ExampleCode key="e">{row.example}</ExampleCode>,
            <Code key="m">{row.mapsTo}</Code>,
            row.notes,
          ])}
        />
        <P>
          The geometry separator between width and height is the ASCII letter{" "}
          <Code>x</Code>, as in <Code>(656,616 176x88)</Code>. A node line with
          everything on it:
        </P>
        <CodeBlock code={NODE_EXAMPLE.code} label="node anatomy" tryIt />
      </Section>

      {/* ---- 6. edges -------------------------------------------------------------- */}
      <Section id="edges" title="Edges">
        <P>
          One line per relationship at indent 2:{" "}
          <Code>source &lt;arrow&gt; target</Code>, then attributes in any
          order. Both endpoints must be nodes of the <em>same diagram</em> —
          cross-diagram edges are a parse error. Solid arrows write no{" "}
          <Code>style</Code> key at all; dashed arrows write{" "}
          <Code>{'"style": "dashed"'}</Code>; the rare explicit{" "}
          <Code>{'"style": "solid"'}</Code> is spelled <Code>style=solid</Code>{" "}
          so absent-vs-solid survives the round trip.
        </P>
        <Table
          caption="Arrow forms"
          head={["Arrow", "Direction", "Style", "Example"]}
          rows={EDGE_ARROW_ROWS.map((row) => [
            <Code key="a">{row.arrow}</Code>,
            <Code key="d">{row.direction}</Code>,
            row.style,
            <ExampleCode key="e">{row.example}</ExampleCode>,
          ])}
        />
        <Table
          caption="Edge attributes"
          head={["Attribute", "Example", "Maps to", "Notes"]}
          rows={EDGE_ATTR_ROWS.map((row) => [
            <Code key="a">{row.attr}</Code>,
            <ExampleCode key="e">{row.example}</ExampleCode>,
            <Code key="m">{row.mapsTo}</Code>,
            row.notes,
          ])}
        />
        <P>An edge line with everything on it:</P>
        <CodeBlock code={EDGE_EXAMPLE.code} label="edge anatomy" tryIt />
      </Section>

      {/* ---- 7. unknown fields ------------------------------------------------------ */}
      <Section id="unknown-fields" title="Unknown fields — ! lines">
        <P>
          Any model field the grammar has no sugar for — unknown keys from newer
          minor versions, or known optional keys carrying an unexpected shape —
          is written as a <Code>!</Code> escape line, valid at every scope:{" "}
          <Code>! &lt;path&gt; [after &lt;key&gt;] : &lt;json&gt;</Code>. The
          JSON value and the key&apos;s position (via the <Code>after</Code>{" "}
          anchor) both survive the round trip byte-for-byte. Bare path segments
          match <Code>[A-Za-z0-9_-]+</Code>; anything else is JSON-quoted. A
          field that has dedicated syntax (like <Code>title</Code>) cannot be
          set with a <Code>!</Code> line — the parser refuses it.
        </P>
        <CodeBlock
          code={UNKNOWN_FIELDS_EXAMPLE.code}
          label="unknown fields"
          tryIt
        />
      </Section>

      {/* ---- 8. errors ---------------------------------------------------------------- */}
      <Section id="errors" title="Errors">
        <P>
          Parsing is all-or-nothing: a broken file throws one error and applies
          nothing. Every message reads{" "}
          <Code>line &lt;n&gt;, column &lt;n&gt;: &lt;what is wrong&gt;</Code> —
          in the two-pane editor the offending line is quoted with a caret at
          that column. These snippets are deliberately broken; the check script
          asserts each one fails with <em>exactly</em> the message shown:
        </P>
        <ul className="flex flex-col gap-6">
          {INVALID_SNIPPETS.map((snippet) => (
            <li key={snippet.id} className="flex min-w-0 flex-col gap-2">
              <h3 className="text-base font-medium text-foreground">
                {snippet.title}
              </h3>
              <CodeBlock code={snippet.code} label={snippet.title} />
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
                <span className="text-sm font-medium text-foreground">
                  Error:{" "}
                </span>
                <code className="font-mono text-xs break-words text-foreground">
                  {snippet.expected.message}
                </code>
              </p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---- 9. where to use it -------------------------------------------------------- */}
      <Section id="try-it" title="Where to use it">
        <P>
          The fastest way to learn the format is to write it live:{" "}
          <Link
            href="/view/new"
            className="font-medium text-primary hover:underline"
          >
            view mode
          </Link>{" "}
          is a two-pane editor with <Code>.aft</Code> on one side and{" "}
          <Code>.archflow.json</Code> on the other — each pane regenerates the
          other as you type, and parse errors appear inline with the caret
          format above. The &quot;Open in view mode&quot; buttons on this
          page&apos;s complete examples carry the snippet there inside the link
          itself (nothing is uploaded); they only appear while the encoded link
          stays under the share codec&apos;s honest ~2000-character limit. For
          finished, read-only models, see the{" "}
          <Link
            href="/demo"
            className="font-medium text-primary hover:underline"
          >
            live demo
          </Link>
          .
        </P>
      </Section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Local building blocks                                                       */
/* -------------------------------------------------------------------------- */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="mt-14 flex min-w-0 scroll-mt-24 flex-col gap-5"
    >
      <h2
        id={`${id}-heading`}
        className="border-b border-border/60 pb-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="max-w-3xl text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">
      {children}
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <code className="rounded bg-secondary px-1 py-0.5 font-mono text-[0.85em] whitespace-nowrap text-foreground">
      {children}
    </code>
  );
}

/** A table cell's example: preserves the newlines of multi-line examples. */
function ExampleCode({ children }: { children: string }): React.JSX.Element {
  return (
    <code className="inline-block rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.85em] whitespace-pre text-foreground">
      {children}
    </code>
  );
}

/** A reference table: proper headers, horizontal scroll inside itself. */
function Table({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: readonly string[];
  rows: readonly (readonly React.ReactNode[])[];
}): React.JSX.Element {
  return (
    <div className="min-w-0 overflow-x-auto rounded-lg border border-border shadow-sm">
      <table className="w-full min-w-max border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-secondary/60">
            {head.map((label) => (
              <th
                key={label}
                scope="col"
                className="px-3 py-2 text-xs font-semibold tracking-wide text-foreground uppercase"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-border/60 align-top last:border-b-0"
            >
              {cells.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-3 py-2.5 leading-relaxed text-muted-foreground"
                >
                  {typeof cell === "string" ? (
                    // Prose cells wrap at a readable measure; code cells
                    // size to their content and the table scrolls.
                    <span className="block max-w-xs min-w-40">{cell}</span>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
