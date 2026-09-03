/**
 * `/mcp` — connecting an AI agent to arch-lab.
 *
 * Server-rendered, and every tool name, description and argument on the page
 * comes from `../catalog.ts` — the same module `server.ts` registers from,
 * with `pnpm check:mcp` asserting the two agree. So this page cannot claim a
 * tool the endpoint does not have, which is the failure mode that makes
 * integration docs worthless.
 *
 * The `origin` prop comes from the route, which derives it from the request —
 * so every snippet on the page advertises the host the reader actually
 * reached, and a domain rename cannot leave this page pointing at a dead
 * endpoint (it did once; see `lib/origin.ts`).
 *
 * Written for the person deciding whether to bother: what it is, one line to
 * connect, what it actually does for them, and what it deliberately does not
 * do. The "what it does not do" part is not modesty — an agent already has
 * file tools, and a reader who expects this to edit their repo will be
 * confused until told otherwise.
 */

import { ChevronRight, FlaskConical } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";

import {
  CONNECT_RECIPES,
  MCP_BETA_NOTICE,
  MCP_PROMPTS,
  MCP_RESOURCES,
  MCP_STATUS_LABEL,
  MCP_TOOL_GROUPS,
  MCP_TOOLS,
  SKILL_DESTINATION,
  SKILL_INSTALL,
  mcpEndpointUrl,
} from "../catalog";
import type { McpToolDoc } from "../catalog";
import { MAX_SOURCE_CHARS } from "../lib/limits";
import { CopySnippet } from "./copy-snippet";
import { McpRoundTrip } from "./mcp-round-trip";

/*
 * Each entry carries a one-line hint, because five bare labels tell a new
 * reader nothing about which one holds the thing they came for — most arrive
 * wanting exactly one of "the paste-in snippet" or "the tool list".
 */
const SECTIONS: readonly { id: string; label: string; hint: string }[] = [
  {
    id: "connect",
    label: "Connect",
    hint: "pick your client, copy one snippet",
  },
  {
    id: "skill",
    label: "No server? Use the skill",
    hint: "one command, the grammar as a file",
  },
  {
    id: "tools",
    label: "What it can do",
    hint: `${MCP_TOOLS.length} read-only tools`,
  },
  {
    id: "context",
    label: "Resources & prompts",
    hint: "pin the grammar instead of calling for it",
  },
  {
    id: "workflow",
    label: "A good workflow",
    hint: "the order that avoids rework",
  },
  {
    id: "limits",
    label: "Privacy & limits",
    hint: "what is kept (nothing) and what is refused",
  },
];

export function McpGuide({ origin }: { origin: string }): React.JSX.Element {
  const endpoint = mcpEndpointUrl(origin);

  return (
    /*
     * ONE column width, set here and nowhere else. This used to be max-w-5xl
     * with every prose block capped at max-w-3xl individually — which left
     * anything that forgot its own cap (the tool cards, the resource and
     * prompt lists, the workflow list) spanning the full 5xl, so the page read
     * as a narrow left-hugging column that suddenly went wide at "What it can
     * do". Constraining the container instead makes every section share the
     * same centred measure and makes that class of drift impossible.
     */
    <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      {/* ---- intro ---------------------------------------------------------- */}
      <div className="af-mcp-fade mb-6 flex flex-wrap items-center gap-2">
        <Badge variant="accent">
          <span className="af-mcp-pulse size-1.5 rounded-full bg-accent" />
          Integration · Model Context Protocol
        </Badge>
        {/* Outline rather than accent: the status qualifies the badge next to
            it, so it should not compete with it for attention. */}
        <Badge variant="outline">{MCP_STATUS_LABEL}</Badge>
      </div>

      {/* NAMES THE CATEGORY, not the product. "Use arch-lab from your AI
          agent" was the heading here, and it identifies the page only to a
          reader who already knows what arch-lab is — which is nobody arriving
          from a search or from an agent's answer. The opening sentence below
          is a DEFINITION for the same reason the landing page's is (there is a
          check pinning that one): a sentence of the form "X runs a Y, so Z can
          do W" is the shape a model quotes when asked what this is. Both are
          load-bearing wording; rewrite them together or not at all. */}
      <h1 className="af-mcp-rise af-mcp-d1 text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        An MCP server for architecture diagrams
      </h1>
      <p className="af-mcp-rise af-mcp-d2 mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">
        arch-lab runs an{" "}
        <a
          href="https://modelcontextprotocol.io"
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-primary hover:underline"
        >
          MCP
        </a>{" "}
        server, so Claude Code, Claude Desktop, Cursor and anything else
        speaking the protocol can read, write and check C4 models and sequence
        diagrams as <Code>.alab</Code> text. It is hosted — there is nothing to
        install and no key to configure.
      </p>

      {/* Above the endpoint, not buried at the bottom: someone about to paste
          a URL into their client deserves to know what it does not promise
          before they depend on it. */}
      <div className="af-mcp-rise af-mcp-d3 mt-6 rounded-lg border border-accent/25 bg-accent/8 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <FlaskConical aria-hidden="true" className="size-4 text-accent" />
          {MCP_STATUS_LABEL}
        </h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          {MCP_BETA_NOTICE}
        </p>
      </div>

      <div className="af-mcp-rise af-mcp-d4 mt-6">
        <CopySnippet
          snippet={endpoint}
          caption="endpoint"
          label="MCP endpoint URL"
        />
      </div>

      {/* The figure sits UNDER the endpoint, not above it: someone who came
          here to copy a URL should reach it before anything decorative. The
          tool name comes from the catalogue, so the picture cannot advertise a
          call the server does not have. */}
      <McpRoundTrip
        toolName={MCP_TOOLS[0]?.name ?? "validate_model"}
        className="af-mcp-rise af-mcp-d5 mt-6"
      />

      <div className="af-mcp-card af-mcp-rise af-mcp-d6 mt-8 rounded-lg border border-border bg-card px-5 py-4">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          What this is for
        </h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Your agent can already read and write files — that is the point of a
          text format, and you should let it edit <Code>.alab</Code> directly.
          This server exists for the two things it cannot do on its own:{" "}
          <strong className="text-foreground">know the grammar exactly</strong>{" "}
          and{" "}
          <strong className="text-foreground">
            get the real parser&apos;s verdict
          </strong>
          . It is a compiler and a reference, not a filesystem.
        </p>
      </div>

      {/* ---- on this page ---------------------------------------------------- */}
      <nav
        aria-label="On this page"
        className="af-mcp-fade af-mcp-d7 mt-8 rounded-lg border border-border bg-card px-5 py-4"
      >
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          On this page
        </p>
        <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <li
              key={section.id}
              className="flex flex-wrap items-baseline gap-x-2"
            >
              <a
                href={`#${section.id}`}
                className="font-medium text-primary hover:underline"
              >
                {section.label}
              </a>
              <span className="text-xs text-muted-foreground">
                {section.hint}
              </span>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---- connect --------------------------------------------------------- */}
      <Section id="connect" title="Connect">
        <P>
          One transport, Streamable HTTP, at the URL above. Open your client —
          each entry is the complete setup:
        </P>
        {/*
         * One <details> per client, because seven recipes stacked open meant
         * scrolling past six irrelevant configs to reach yours — the client
         * names are the index, and they were buried under their own snippets.
         * details/summary is the disclosure widget that costs no client
         * component, which this page is not allowed to have (the route reads
         * headers(); see the file comment).
         *
         * The first recipe ships open: it shows what a row expands into, so a
         * closed list does not read as a menu with nothing behind it — and it
         * keeps a copyable snippet on the page for anyone skimming past the
         * summaries.
         */}
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          {CONNECT_RECIPES.map((recipe, index) => (
            <details
              key={recipe.client}
              open={index === 0}
              className="group border-b border-border/60 last:border-b-0"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none"
                />
                <h3 className="min-w-0 flex-1 text-sm font-semibold tracking-tight text-foreground">
                  {recipe.client}
                </h3>
                <span
                  aria-hidden="true"
                  className="shrink-0 font-mono text-xs text-muted-foreground"
                >
                  {recipe.language}
                </span>
              </summary>
              <div className="min-w-0 px-5 pt-0.5 pb-5">
                <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                  {recipe.note}
                </p>
                <CopySnippet
                  snippet={recipe.snippet(endpoint)}
                  caption={recipe.language}
                  label={`${recipe.client} setup`}
                />
              </div>
            </details>
          ))}
        </div>
      </Section>

      {/* ---- the skill ------------------------------------------------------- */}
      <Section id="skill" title="No server? Use the skill">
        <P>
          Connecting a server is not the only way to get this. Most of what the
          MCP server offers an agent is <em>knowledge</em> — the grammar, in
          exact detail — and knowledge travels fine as a file. If you would
          rather not add a connector, drop the skill into your project instead:
        </P>
        <div className="mt-5">
          <CopySnippet
            snippet={SKILL_INSTALL}
            caption="bash"
            label="Install the .alab skill"
          />
        </div>
        <P className="mt-4">
          That writes <Code>{SKILL_DESTINATION}</Code> — one markdown file,
          generated from the same syntax reference this server hands out and
          verified against the real parser on every build. Nothing runs, nothing
          connects, and it is a normal file you can read and diff.
        </P>

        {/* The honest boundary. Someone who thinks a skill replaces the server
            will trust an invalid file because "the skill said so" — which is a
            worse outcome than not offering the skill at all. */}
        <div className="af-mcp-card mt-6 rounded-lg border border-border bg-card px-5 py-4">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            What you give up
          </h3>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            The grammar, but not the verdict. A file in your project cannot tell
            you whether the model you just wrote actually parses — for that you
            need <Code>validate_model</Code>, which means the server, or the{" "}
            <Link
              href="/validate"
              className="font-medium text-primary hover:underline"
            >
              validator on this site
            </Link>
            . The two are not exclusive: plenty of people want the skill for
            everyday writing and the server for the check at the end.
          </p>
        </div>
      </Section>

      {/* ---- tools ----------------------------------------------------------- */}
      <Section id="tools" title="What it can do">
        <P>
          {MCP_TOOLS.length} tools, all read-only — nothing here mutates
          anything, on your machine or ours. Grouped by job:
        </P>
        {/*
         * Grouped, not a flat list: ten identical cards gave a reader no way
         * to skim for "the sharing one" without reading all ten. The grouping
         * comes from the catalogue like everything else — the component still
         * knows no tool names.
         */}
        <div className="mt-6 space-y-10">
          {MCP_TOOL_GROUPS.map((group) => (
            <div key={group.id}>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                {group.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {group.blurb}
              </p>
              <div className="mt-4 space-y-4">
                {group.tools.map((tool) => (
                  <ToolCard key={tool.name} tool={tool} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ---- resources & prompts --------------------------------------------- */}
      <Section id="context" title="Resources & prompts">
        <P>
          Clients that prefer to pin reference material rather than call a tool
          for it can read the grammar as a resource:
        </P>
        <ul className="mt-4 space-y-3">
          {MCP_RESOURCES.map((resource) => (
            <li
              key={resource.uri}
              className="af-mcp-card rounded-lg border border-border bg-card px-5 py-4"
            >
              <p className="font-mono text-sm font-semibold text-foreground">
                {resource.uri}
              </p>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">
                {resource.description}
              </p>
            </li>
          ))}
        </ul>
        <P className="mt-6">
          And one prompt, for when you want the whole authoring procedure rather
          than a single call:
        </P>
        <ul className="mt-4 space-y-3">
          {MCP_PROMPTS.map((prompt) => (
            <li
              key={prompt.name}
              className="af-mcp-card rounded-lg border border-border bg-card px-5 py-4"
            >
              <p className="font-mono text-sm font-semibold text-foreground">
                {prompt.name}
              </p>
              <p className="mt-1.5 leading-relaxed text-muted-foreground">
                {prompt.description}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Arguments:{" "}
                {prompt.args
                  .map(
                    (arg) => `${arg.name}${arg.required ? "" : " (optional)"}`,
                  )
                  .join(", ")}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ---- workflow -------------------------------------------------------- */}
      <Section id="workflow" title="A good workflow">
        <P>
          The order that avoids rework, whether you drive it yourself or use the{" "}
          <Code>author_c4_model</Code> prompt:
        </P>
        <ol className="mt-4 space-y-3 text-muted-foreground">
          {[
            <>
              <Code>get_syntax_reference</Code> first. <Code>.alab</Code> has
              significant indentation and order-free attributes; writing it from
              memory produces plausible, invalid files.
            </>,
            <>
              <Code>get_example_model</Code> to see idiomatic structure at a
              real scale before inventing one.
            </>,
            <>
              Write the file with your own editing tools. Omit geometry — the
              defaults are deterministic and lossless.
            </>,
            <>
              <Code>validate_model</Code> until it passes. Every failure comes
              back with a line, a column and the offending source line.
            </>,
            <>
              <Code>format_model</Code> so the committed file is canonical and
              diffs cleanly, then <Code>create_share_link</Code> so a human can
              actually look at the diagram.
            </>,
          ].map((step, index) => (
            <li key={index} className="flex gap-3 leading-relaxed">
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-border bg-secondary/60 font-mono text-xs text-foreground"
              >
                {index + 1}
              </span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </Section>

      {/* ---- limits ---------------------------------------------------------- */}
      <Section id="limits" title="Privacy & limits">
        <ul className="mt-2 space-y-3 text-muted-foreground">
          <Bullet>
            <strong className="text-foreground">Nothing is stored.</strong>{" "}
            Every tool is a pure function of the text you send it. There is no
            database, no account, and no model history — send a model, get an
            answer, nothing is kept.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">
              Share links do not upload your model.
            </strong>{" "}
            The model is compressed into the URL <em>fragment</em> (after{" "}
            <Code>#</Code>), which browsers never transmit to a server. Opening
            one renders entirely in the recipient&apos;s browser.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">No authentication.</strong> The
            endpoint holds no secrets and reads nothing but its arguments, so
            there is no key to manage. Do not send a model you would not paste
            into a public form.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">
              {MAX_SOURCE_CHARS.toLocaleString("en-US")}-character ceiling
            </strong>{" "}
            on any single model, which is several times larger than any model
            anyone has authored. Past it, split the model with{" "}
            <Code>childRef</Code>.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">Mermaid is one-way.</strong>{" "}
            Importing Mermaid C4 works; exporting to it drops geometry, tags,
            icons, drill-down links and traceability. Sequence documents import
            from Mermaid <Code>sequenceDiagram</Code> the same one-way — there
            is no Mermaid export for them at all. Keep <Code>.alab</Code> or{" "}
            <Code>.archlab.json</Code> as the source of truth.
          </Bullet>
        </ul>

        <P className="mt-8">
          The grammar itself is documented at{" "}
          <Link
            href="/syntax"
            className="font-medium text-primary hover:underline"
          >
            /syntax
          </Link>
          , and you can check a model by hand at{" "}
          <Link
            href="/validate"
            className="font-medium text-primary hover:underline"
          >
            /validate
          </Link>{" "}
          — the same checker this server calls.
        </P>
      </Section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout primitives (kept local — the page is the only consumer)             */
/* -------------------------------------------------------------------------- */

/**
 * One tool's reference card. h4, because it sits under a group's h3 — the
 * groups are what a skimmer reads, the cards are what they read after picking
 * one.
 */
function ToolCard({ tool }: { tool: McpToolDoc }): React.JSX.Element {
  return (
    <div className="af-mcp-card rounded-lg border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h4 className="font-mono text-sm font-semibold text-foreground">
          {tool.name}
        </h4>
        <span className="text-sm text-muted-foreground">{tool.title}</span>
      </div>
      <p className="mt-2 leading-relaxed text-muted-foreground">
        {tool.description}
      </p>
      {/* A ROW OF ITS OWN, not a sentence buried in the description above.
          Whether a tool can stop and hand its human a question is the thing
          a reader deciding to wire this into an automated loop needs to see
          without reading a paragraph — and it reads from `tool.asks`, the
          same field `check:mcp` asserts is set for exactly the tools that can
          raise one, so this row cannot advertise a question that never
          arrives. */}
      {tool.asks === undefined ? null : (
        <p className="mt-2 leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            May ask your human when{" "}
          </span>
          {tool.asks}
        </p>
      )}
      {tool.args.length > 0 ? (
        <dl className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
          {tool.args.map((arg) => (
            <div
              key={arg.name}
              className="flex flex-col gap-x-2 gap-y-0.5 sm:flex-row"
            >
              <dt className="shrink-0 font-mono text-xs text-foreground sm:w-40">
                {arg.name}
                {arg.required ? (
                  <span
                    aria-label="required"
                    title="required"
                    className="ml-1 text-primary"
                  >
                    *
                  </span>
                ) : null}
              </dt>
              <dd className="min-w-0 text-sm text-muted-foreground">
                {arg.description}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
          No arguments.
        </p>
      )}
    </div>
  );
}

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
      className="mt-14 scroll-mt-20 border-t border-border/60 pt-10"
    >
      <h2
        id={`${id}-heading`}
        className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
      >
        {title}
      </h2>
      {/* Draws out from the left under the title. Decorative — the heading
          above it already says where you are — so it is hidden from the
          accessibility tree rather than announced as a separator. */}
      <span
        aria-hidden="true"
        className="af-mcp-rule mt-3 block h-px w-16 rounded-full bg-primary/60"
      />
      {children}
    </section>
  );
}

function P({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <p
      className={`leading-relaxed text-muted-foreground ${className ?? "mt-4"}`}
    >
      {children}
    </p>
  );
}

function Bullet({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <li className="flex gap-3 leading-relaxed">
      <span
        aria-hidden="true"
        className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground">
      {children}
    </code>
  );
}
