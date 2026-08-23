/**
 * `/syntax` — the `.alab` text-format reference. Server-rendered: every
 * snippet and table row comes from `../content/snippets.ts`, the SAME module
 * `scripts/syntax-docs-check.mjs` pushes through the real parser — so
 * nothing on this page can drift from what `parseArchText` actually accepts.
 *
 * Structured for someone who has just seen `.alab` in the two-pane editor:
 * what it is → one complete example → reference tables per construct →
 * layout rules → what errors look like → where to try it.
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";

import {
  DIAGRAM_EXAMPLE,
  FRAME_EXAMPLE,
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
  SEQUENCE_CURL_EXAMPLE,
  SEQUENCE_FRAGMENT_EXAMPLE,
  SEQUENCE_GROUPING_EXAMPLE,
  SEQUENCE_MESSAGE_EXAMPLE,
  SEQUENCE_MINIMAL_EXAMPLE,
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
  { id: "sequence", label: "Sequence diagrams" },
  { id: "errors", label: "Errors" },
  { id: "editor-support", label: "Editor support" },
  { id: "try-it", label: "Where to use it" },
];

/**
 * Shell, not model source — so it deliberately lives here rather than in
 * `../content/snippets`, every entry of which `pnpm check:syntax-docs` feeds
 * to the real `.alab` parser.
 */
const VSCODE_INSTALL_SNIPPET = `git clone https://github.com/raksitnongbua/arch-lab.git
ln -s "$PWD/arch-lab/editors/vscode" ~/.vscode/extensions/alab-syntax`;

export function SyntaxReference(): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
      {/* ---- intro ---------------------------------------------------------- */}
      <Badge variant="accent" className="mb-6">
        <span className="size-1.5 rounded-full bg-accent" />
        Reference · the arch-lab text format
      </Badge>

      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        The <span className="font-mono">.alab</span> syntax
      </h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-pretty text-muted-foreground">
        <span className="font-mono text-base text-foreground">.alab</span> is a
        readable, Mermaid-like text form of the same model{" "}
        <span className="font-mono text-base text-foreground">
          .archlab.json
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
            the line and column. The{" "}
            <a
              href="#editor-support"
              className="font-medium text-primary hover:underline"
            >
              VS Code extension
            </a>{" "}
            pins spaces-only indentation for <Code>.alab</Code> files, so this
            is one mistake you can stop making.
          </li>
          <li>Blank lines are ignored.</li>
          <li>
            <Code>{"//"}</Code> starts a <em>full-line</em> comment — at any
            indentation, even above the <Code>archlab</Code> line. Trailing
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
          <Code>archlab</Code> and <Code>title</Code> are required. Each line
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
            [
              <Code key="s">frame &lt;id&gt; {'"Label"'}</Code>,
              <Code key="m">frames[]</Code>,
              <>
                A body line at indent 2, before the nodes. Add{" "}
                <Code>in=&lt;frame&gt;</Code> to nest one frame in another.
              </>,
            ],
          ]}
        />
        <CodeBlock code={DIAGRAM_EXAMPLE.code} label="diagram header" tryIt />
        <P>
          A <strong>frame</strong> is a labelled rectangle drawn behind a group
          of nodes — the C4 boundary. Declare it in the diagram body, then put
          nodes in it with <Code>in=&lt;frame&gt;</Code> on the node line. Frame
          ids are unique within their diagram, not across the file.
        </P>
        <P>
          Frames carry no geometry: the rectangle is derived from its
          members&apos; bounding box, so it follows them when they move. A frame
          with no members is not drawn.
        </P>
        <CodeBlock code={FRAME_EXAMPLE.code} label="frames" tryIt />
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

      {/* ---- 8. sequence diagrams ----------------------------------------------------- */}
      <Section id="sequence" title="Sequence diagrams">
        <P>
          Everything above describes a <strong>C4 model</strong>, opened by{" "}
          <Code>archlab 1.0</Code>. <Code>.alab</Code> reads a second, separate
          document kind: a <strong>sequence diagram</strong> — participants and
          messages over time — opened by <Code>archlab 1.0 sequence</Code> and
          parsed by its own grammar. The two never mix. A sequence document has
          no <Code>@context</Code> levels, a C4 model has no messages, and
          handing one to the other&apos;s parser fails on line 1. The body sits
          under a single <Code>@sequence</Code> block: participants first, then
          the flow in order.
        </P>
        <CodeBlock
          code={SEQUENCE_MINIMAL_EXAMPLE.code}
          label="sequence diagram"
        />
        <P>
          The label is introduced by <Code>:</Code> —{" "}
          <Code>a -&gt; b : &quot;Label&quot;</Code> — and a message without one
          does not parse. Three arrows carry the kind: <Code>-&gt;</Code> a
          synchronous call, <Code>~&gt;</Code> asynchronous, <Code>..&gt;</Code>{" "}
          a reply. <strong>Activation rides the arrow</strong> rather than
          sitting on its own line: <Code>-&gt;+</Code> opens the receiver&apos;s
          bar and <Code>..&gt;-</Code> closes the sender&apos;s, so a call and
          its return read <Code>web -&gt;+ api</Code> …{" "}
          <Code>api ..&gt;- web</Code>. A participant&apos;s kind is optional
          and only two exist — a bare <Code>web &quot;Storefront&quot;</Code> is
          a participant, <Code>cust:actor</Code> draws the stick figure. A
          message from a participant to itself draws a self-loop, and{" "}
          <Code>autonumber</Code> numbers every step.
        </P>
        <CodeBlock code={SEQUENCE_MESSAGE_EXAMPLE.code} label="message kinds" />
        <P>
          <strong>Keep the label short and put the rest in a</strong>{" "}
          <Code>desc</Code>. Indented two spaces under its message — the same
          continuation a node or participant takes — it carries the endpoint,
          the payload, the failure modes: whatever would turn the arrow into a
          paragraph. Only the label is ever drawn on the wire, so a{" "}
          <Code>desc</Code> costs no width and widens no column; the{" "}
          <Link href="/live?d=seq" className="underline">
            playground
          </Link>{" "}
          marks a message that has one with a small dot and shows the text when
          you click the message. Notes are the exception — a note already{" "}
          <em>is</em> its text, so it takes no <Code>desc</Code>.
        </P>
        <P>
          A <Code>desc</Code> is a JSON string, so <Code>\n</Code> puts the
          detail on <strong>separate lines</strong> — and the viewer renders it
          as a monospace block that keeps them. That is what makes a request
          worth reading: the method and path, the body, then one line per status
          code, instead of all of it welded into a paragraph. The escape keeps
          the source one line per <Code>desc</Code>, so the file stays
          canonical.
        </P>
        <P>
          Because it is a JSON string, a <Code>desc</Code> can hold a{" "}
          <strong>whole runnable request</strong> — quotes, curl&apos;s
          line-continuation backslashes and a JSON body included. Escape{" "}
          <Code>&quot;</Code> as <Code>\&quot;</Code> and <Code>\</Code> as{" "}
          <Code>\\</Code>, and the dock gives it back exactly as written:
        </P>
        <CodeBlock code={SEQUENCE_CURL_EXAMPLE.code} label="a curl in a desc" />
        <P>
          Escaping that by hand is miserable, so don&apos;t: get your editor or
          an agent to <Code>JSON.stringify</Code> the command and paste the
          result after <Code>desc</Code>. The <Code>desc</Code> budget is 500
          characters, which is a request and its responses — not a tutorial.
        </P>
        <P>
          Fragments — <Code>alt</Code>/<Code>else</Code>, <Code>par</Code>/
          <Code>and</Code>, <Code>critical</Code>/<Code>option</Code>,{" "}
          <Code>opt</Code>, <Code>loop</Code>, <Code>break</Code> —{" "}
          <strong>
            nest by indentation, with no <Code>end</Code> keyword
          </strong>
          . This is the one place the format departs sharply from Mermaid: what
          belongs to a fragment is whatever is indented under it.
        </P>
        <CodeBlock code={SEQUENCE_FRAGMENT_EXAMPLE.code} label="fragments" />
        <P>
          A participant takes the same <Code>@icon</Code> a C4 node does, in the
          same place on the line — after the name, before{" "}
          <Code>[technology]</Code> — and from the same set of slugs. One
          vocabulary across both document kinds, because a participant and a
          container are usually the same system drawn twice, and two icon
          namespaces would let them disagree about what to call one. There is no{" "}
          <Code>!</Code>/<Code>~</Code> suffix here: nothing infers icons for a
          sequence document, so there is no inference to override.
        </P>
        <P>
          Two more constructs say <em>these belong together</em> without saying
          anything about control flow. <Code>box</Code> brackets a run of
          lifelines and takes its members as the participant lines{" "}
          <strong>nested inside it</strong> — nesting is what keeps a box a
          contiguous run, which is the only shape a bracket can honestly be
          drawn around. <Code>rect</Code> highlights a run of steps instead, and
          takes a colour where the other fragments take a guard. Both accept{" "}
          <Code>tint=</Code>, in <Code>#rrggbb</Code>, <Code>rgb(…)</Code> or a
          common colour name; whichever you write is stored as one canonical
          spelling, and drawn as a wash so it reads in both themes.
        </P>
        <CodeBlock
          code={SEQUENCE_GROUPING_EXAMPLE.code}
          label="boxes and highlights"
        />
        <P>
          Render any of these in the{" "}
          <Link href="/live?d=seq" className="underline">
            sequence playground
          </Link>
          , which also imports pasted Mermaid <Code>sequenceDiagram</Code> code
          one-way. These snippets carry no <em>Open in view mode</em> button on
          purpose: that button encodes a snippet into a share link, and share
          links exist only for C4 models so far — a sequence one would hand the
          text to the C4 playground, which would reject it.
        </P>
      </Section>

      {/* ---- 9. errors ---------------------------------------------------------------- */}
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
      {/* ---- 9. editor support ------------------------------------------------- */}
      <Section id="editor-support" title="Editor support">
        <P>
          Out of the box an editor sees <Code>.alab</Code> as an unknown
          extension and renders it as plain text — unhelpful for a format with
          significant indentation. The repo ships a VS Code extension in{" "}
          <Code>editors/vscode</Code> that highlights every construct on this
          page and, more usefully, makes the indentation rules impossible to
          break: spaces only, two at a time, with indent guides on and any tab
          shown as an error before you save.
        </P>
        <P>
          It is not on the Marketplace yet. Symlink it into your extensions
          folder from a clone of the repo and reload the window:
        </P>
        <CodeBlock
          code={VSCODE_INSTALL_SNIPPET}
          label="VS Code install commands"
          caption="sh"
        />
        <P>
          Prefer a package? Run{" "}
          <Code>npx @vscode/vsce package --out alab-syntax.vsix</Code> inside{" "}
          <Code>editors/vscode</Code>, then{" "}
          <Code>code --install-extension alab-syntax.vsix</Code>.
        </P>
        <div className="max-w-3xl rounded-lg border border-border bg-card/60 p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">
              One workaround to avoid:
            </strong>{" "}
            associating <Code>.alab</Code> with YAML (
            <Code>{'"files.associations": { "*.alab": "yaml" }'}</Code>) is
            worse than plain text. YAML treats <Code>#</Code> as a comment, so
            tags like <Code>#critical-path</Code> grey out as comments while
            real <Code>{"//"}</Code> comments colour as content — wrong in both
            directions.
          </p>
        </div>
        <P>
          No extension for your editor yet? The grammar is a portable TextMate
          grammar (<Code>editors/vscode/syntaxes/alab.tmLanguage.json</Code>),
          which Neovim, Zed and Sublime can all consume.
        </P>
      </Section>

      <Section id="try-it" title="Where to use it">
        <P>
          The fastest way to learn the format is to write it live:{" "}
          <Link
            href="/live"
            className="font-medium text-primary hover:underline"
          >
            the playground
          </Link>{" "}
          is a two-pane editor with <Code>.alab</Code> on one side and{" "}
          <Code>.archlab.json</Code> on the other — each pane regenerates the
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
