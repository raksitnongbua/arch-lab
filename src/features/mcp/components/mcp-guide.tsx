/**
 * `/mcp` — connecting an AI agent to arch-lab.
 *
 * Server-rendered, and every tool name, description and argument on the page
 * comes from `../catalog.ts` — the same module `server.ts` registers from,
 * with `pnpm check:mcp` asserting the two agree. So this page cannot claim a
 * tool the endpoint does not have, which is the failure mode that makes
 * integration docs worthless.
 *
 * Written for the person deciding whether to bother: what it is, one line to
 * connect, what it actually does for them, and what it deliberately does not
 * do. The "what it does not do" part is not modesty — an agent already has
 * file tools, and a reader who expects this to edit their repo will be
 * confused until told otherwise.
 */

import { FlaskConical } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";

import {
  CONNECT_RECIPES,
  MCP_BETA_NOTICE,
  MCP_PROMPTS,
  MCP_RESOURCES,
  MCP_STATUS_LABEL,
  MCP_TOOLS,
  mcpEndpointUrl,
} from "../catalog";
import { MAX_SOURCE_CHARS } from "../lib/limits";
import { publicOrigin } from "../lib/origin";
import { CopySnippet } from "./copy-snippet";

const SECTIONS: readonly { id: string; label: string }[] = [
  { id: "connect", label: "Connect" },
  { id: "tools", label: "What it can do" },
  { id: "context", label: "Resources & prompts" },
  { id: "workflow", label: "A good workflow" },
  { id: "limits", label: "Privacy & limits" },
];

export function McpGuide(): React.JSX.Element {
  const endpoint = mcpEndpointUrl(publicOrigin());

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
      {/* ---- intro ---------------------------------------------------------- */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge variant="accent">
          <span className="size-1.5 rounded-full bg-accent" />
          Integration · Model Context Protocol
        </Badge>
        {/* Outline rather than accent: the status qualifies the badge next to
            it, so it should not compete with it for attention. */}
        <Badge variant="outline">{MCP_STATUS_LABEL}</Badge>
      </div>

      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        Use arch-lab from your AI agent
      </h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-pretty text-muted-foreground">
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
        speaking the protocol can read, write and check <Code>.alab</Code>{" "}
        models. It is hosted — there is nothing to install and no key to
        configure.
      </p>

      {/* Above the endpoint, not buried at the bottom: someone about to paste
          a URL into their client deserves to know what it does not promise
          before they depend on it. */}
      <div className="mt-6 max-w-3xl rounded-lg border border-accent/25 bg-accent/8 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <FlaskConical aria-hidden="true" className="size-4 text-accent" />
          {MCP_STATUS_LABEL}
        </h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          {MCP_BETA_NOTICE}
        </p>
      </div>

      <div className="mt-6 max-w-3xl">
        <CopySnippet
          snippet={endpoint}
          caption="endpoint"
          label="MCP endpoint URL"
        />
      </div>

      <div className="mt-8 max-w-3xl rounded-lg border border-border bg-card px-5 py-4">
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

      {/* ---- connect --------------------------------------------------------- */}
      <Section id="connect" title="Connect">
        <P>
          One transport, Streamable HTTP, at the URL above. Pick your client:
        </P>
        <div className="mt-6 space-y-6">
          {CONNECT_RECIPES.map((recipe) => (
            <div key={recipe.client} className="min-w-0">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {recipe.client}
              </h3>
              <p className="mt-1 mb-3 text-sm leading-relaxed text-muted-foreground">
                {recipe.note}
              </p>
              <CopySnippet
                snippet={recipe.snippet(endpoint)}
                caption={recipe.language}
                label={`${recipe.client} setup`}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* ---- tools ----------------------------------------------------------- */}
      <Section id="tools" title="What it can do">
        <P>
          {MCP_TOOLS.length} tools, all read-only — nothing here mutates
          anything, on your machine or ours.
        </P>
        <div className="mt-6 space-y-6">
          {MCP_TOOLS.map((tool) => (
            <div
              key={tool.name}
              className="rounded-lg border border-border bg-card px-5 py-4"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-mono text-sm font-semibold text-foreground">
                  {tool.name}
                </h3>
                <span className="text-sm text-muted-foreground">
                  {tool.title}
                </span>
              </div>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                {tool.description}
              </p>
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
              className="rounded-lg border border-border bg-card px-5 py-4"
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
              className="rounded-lg border border-border bg-card px-5 py-4"
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
            icons, drill-down links and traceability. Keep <Code>.alab</Code> or{" "}
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
      className={`max-w-3xl leading-relaxed text-muted-foreground ${className ?? "mt-4"}`}
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
    <li className="flex max-w-3xl gap-3 leading-relaxed">
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
