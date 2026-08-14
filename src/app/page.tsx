import {
  ArrowRight,
  Bot,
  FileText,
  GitBranch,
  MousePointerClick,
  Presentation,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { HeroDiagram } from "@/features/marketing/hero-diagram";
import { McpFlow } from "@/features/marketing/mcp-flow";
import {
  CONNECT_RECIPES,
  MCP_STATUS_LABEL,
  MCP_TOOLS,
  mcpEndpointUrl,
} from "@/features/mcp/catalog";
import { CopySnippet } from "@/features/mcp/components/copy-snippet";
import { publicOrigin } from "@/features/mcp/lib/origin";
import { APP_DESCRIPTION, APP_NAME, EDITOR_ENABLED } from "@/lib/constants";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * THE LANDING PAGE, rewritten for someone who has never heard of this.
 *
 * It used to be five long sections — a four-card grid of diagram kinds (two of
 * them "coming soon"), the four C4 altitudes, the four constructs of a
 * sequence document with their literal syntax tokens, and six principles. All
 * of it accurate, and most of it REFERENCE: the C4 levels are taught by the
 * demo, the sequence grammar by `/syntax`, and a visitor who does not yet know
 * what the site is cannot use either. A first-time reader had to scroll past
 * roughly four screens of it before anything said "click here to see one".
 *
 * So the page now answers three questions in order, and stops:
 *
 *   1. WHAT IS THIS — one sentence, then a button that puts a real diagram on
 *      screen. The primary CTA goes to `/view/sequence` rather than `/view`
 *      deliberately: the chooser asks a question ("C4 or sequence?") that a
 *      newcomer has no basis to answer, while the sequence playground opens
 *      seeded with a working flow they can click immediately.
 *   2. WHY THIS AND NOT DRAW.IO — the two things nothing else here does:
 *      diagrams you can PRESENT (click a message, drill a level, go
 *      immersive) and an AGENT that writes them for you over MCP. One section
 *      each, both ending in a link that does the thing.
 *   3. WHAT DO I DO WITH IT — three steps, then the format and the footer.
 *
 * WHAT WAS CUT, so nobody restores it by reflex: the "coming soon" cards for
 * the data dictionary and network diagrams (a newcomer cannot act on a
 * roadmap, and two dashed cards were a third of the fold), the C4 levels
 * grid, the sequence-constructs grid, and three of the six principles. The
 * roadmap lives in `docs/product/roadmap.md`, which is where a roadmap
 * belongs.
 */

/* -------------------------------------------------------------------------- */
/* Content                                                                     */
/* -------------------------------------------------------------------------- */

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

/**
 * The three steps, in the order they actually happen. Written for someone who
 * has not yet decided this is for them, so each one names a thing they do,
 * not a feature the product has.
 */
const STEPS: readonly Step[] = [
  {
    icon: MousePointerClick,
    title: "Open a playground",
    body: "Nothing to install and no account. A worked example is already on screen — edit the text beside it and the diagram follows as you type.",
  },
  {
    icon: Bot,
    title: "Or let your agent write it",
    body: "Point Claude Code, Cursor or any MCP client at the server. It gets the grammar and the real parser's verdict, so what it hands you is valid before you open it.",
  },
  {
    icon: GitBranch,
    title: "Commit the text",
    body: "The diagram is one .alab file — stable ids, one line per element. It sits next to the code it describes and a reviewer sees what changed in the architecture.",
  },
];

/** The Claude Code recipe, read from the same catalogue `/mcp` renders, so the
 * command on the landing page cannot drift from the one that works. */
const CLAUDE_CODE_RECIPE = CONNECT_RECIPES.find(
  (recipe) => recipe.client === "Claude Code",
);

/**
 * Structured data for the one page that represents the product. Two nodes:
 * `WebSite` names the site (with the spaced "arch lab" as an alternateName,
 * since that is how people type it into a search box), and
 * `SoftwareApplication` describes what the site IS — free, browser-based, a
 * developer tool. Serialized inline because there are no user-controlled
 * strings here; everything comes from constants this file already owns.
 */
function homeJsonLd(): string {
  const origin = publicOrigin();
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: APP_NAME,
        alternateName: "arch lab",
        url: origin,
        description: APP_DESCRIPTION,
      },
      {
        "@type": "SoftwareApplication",
        name: APP_NAME,
        url: origin,
        description: APP_DESCRIPTION,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web browser",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* The page                                                                    */
/* -------------------------------------------------------------------------- */

export default function Home() {
  const endpoint = mcpEndpointUrl(publicOrigin());

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: homeJsonLd() }}
      />
      <Backdrop />

      {/* ---------------------------------------------------------------- hero */}
      <section className="mx-auto w-full max-w-6xl px-5 pt-14 pb-12 sm:px-8 sm:pt-20 sm:pb-16">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16">
          <div>
            <Badge variant="accent" className="mb-6">
              <span className="size-1.5 rounded-full bg-accent" />
              Runs in your browser · no account, nothing uploaded
            </Badge>

            {/* The promise is what the diagram DOES, not what it is made of.
                The previous headline ("diagrams that survive code review")
                sold the format to someone who already believed in the format;
                a newcomer's question is "why not draw.io", and the answer is
                the two things below it. */}
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
              Architecture diagrams you can{" "}
              <span className="af-running-gradient bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                present
              </span>
              , and an agent can write.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
              Describe a system in a few lines of text and{" "}
              <span className="font-mono text-base text-foreground sm:text-lg">
                {APP_NAME}
              </span>{" "}
              draws it — a C4 model you can drill into, or a sequence flow you
              can click through message by message. Your AI agent can write that
              text for you.
            </p>

            {/* ONE primary destination. The old hero offered three buttons and
                a badge, and the first of them went to a gallery — a newcomer
                had to pick between "demo", "sequence diagrams" and "editor
                preview" before seeing anything at all. `/view/sequence` opens
                already seeded with a flow, so the first click ends in a
                working diagram rather than another choice. */}
            <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/view/sequence"
                aria-describedby="cta-note"
                className={buttonClasses({ size: "lg" })}
              >
                Open a live diagram
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link
                href="/view/c4"
                className={buttonClasses({ variant: "outline", size: "lg" })}
              >
                Build a C4 model
              </Link>
              <p id="cta-note" className="text-sm text-muted-foreground">
                Opens with a worked example — nothing to set up.
              </p>
            </div>
          </div>

          {/* Decorative mini C4 diagram — desktop only, hidden from AT. */}
          <HeroDiagram className="hidden lg:block" />
        </div>
      </section>

      {/* --------------------------------------------------- killer feature 1 */}
      <section
        aria-labelledby="present-heading"
        className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-20"
      >
        <div className="grid gap-8 rounded-2xl border border-primary/25 bg-card/40 p-6 sm:p-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <span className="mb-4 grid size-10 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
              <Presentation aria-hidden="true" className="size-5" />
            </span>
            <h2
              id="present-heading"
              className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              A diagram you can talk through
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
              Most tools give you a picture. These respond to you, which is what
              makes them usable in front of a room:
            </p>
            <ul className="mt-5 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <Point>
                <strong className="font-medium text-foreground">
                  Click one message
                </strong>{" "}
                in a sequence flow and it redraws itself while everything else
                recedes — with the endpoint, payload and failure modes beside
                it.
              </Point>
              <Point>
                <strong className="font-medium text-foreground">
                  Drill into a box
                </strong>{" "}
                in a C4 model to open the level underneath, and follow the
                breadcrumb back out. One model, told at whatever depth the
                question needs.
              </Point>
              <Point>
                <strong className="font-medium text-foreground">
                  Go immersive
                </strong>{" "}
                and the diagram takes the whole screen. Export any view as SVG,
                PNG or an animated GIF for the doc nobody will open live.
              </Point>
            </ul>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/view/sequence/checkout"
                className={buttonClasses({ size: "md" })}
              >
                Click through a checkout flow
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link
                href="/view/shopflow"
                className={buttonClasses({ variant: "outline", size: "md" })}
              >
                Drill a C4 model
              </Link>
            </div>
          </div>

          {/* The hero's diagram is the C4 half of this claim; showing it again
              here would be the same picture twice. This side carries the
              sequence half instead — a still of what a focused message looks
              like — as pure decoration, since the two buttons above are the
              real invitation. */}
          <FocusPreview className="hidden lg:block" />
        </div>
      </section>

      {/* --------------------------------------------------- killer feature 2 */}
      <section
        aria-labelledby="agent-heading"
        className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-20"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
                <Bot aria-hidden="true" className="size-5" />
              </span>
              <Badge variant="outline">{MCP_STATUS_LABEL}</Badge>
            </div>
            <h2
              id="agent-heading"
              className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              Ask your agent for the diagram
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
              The format is plain text, so an AI agent can write it — and the
              MCP server gives it the two things it cannot guess: the exact
              grammar, and the real parser&apos;s verdict on what it just wrote.{" "}
              {MCP_TOOLS.length} read-only tools, over both document kinds.
              Nothing here can change your files.
            </p>

            {CLAUDE_CODE_RECIPE === undefined ? null : (
              <div className="mt-6">
                <CopySnippet
                  snippet={CLAUDE_CODE_RECIPE.snippet(endpoint)}
                  caption="Claude Code"
                  label="Claude Code install command"
                />
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/mcp" className={buttonClasses({ size: "md" })}>
                Connect your agent
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link
                href="/syntax"
                className={buttonClasses({ variant: "outline", size: "md" })}
              >
                Read the format
              </Link>
            </div>
          </div>

          <McpFlow />
        </div>
      </section>

      {/* ---------------------------------------------------------- three steps */}
      <section
        aria-labelledby="start-heading"
        className="border-t border-border/60 bg-card/30"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <h2
            id="start-heading"
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            How you actually use it
          </h2>
          <ol className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex flex-col gap-2">
                  <span className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {index + 1} of {STEPS.length}
                    </span>
                  </span>
                  <h3 className="text-base font-medium text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              );
            })}
          </ol>

          {/* The format, in one paragraph rather than a principles grid. A
              newcomer needs to know the file is theirs and readable; the six
              design principles that used to sit here answer questions nobody
              has yet asked, and the README answers them properly. */}
          <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-8 sm:flex-row sm:items-start sm:gap-8">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
              <FileText aria-hidden="true" className="size-5" />
            </span>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                It is your file, and you can read it.
              </span>{" "}
              A model is one{" "}
              <code className="font-mono text-[0.95em] text-foreground">
                .alab
              </code>{" "}
              text file — stable ids, one line per element, deterministic order,
              so a diff shows what changed in the architecture rather than a
              reshuffled blob. JSON is one click away for tools that want it,
              and Mermaid pastes straight in. No account, no server, nothing
              uploaded: git is the collaboration layer.{" "}
              <Link
                href="/demo"
                className="font-medium text-primary hover:underline"
              >
                See finished examples
              </Link>
              {EDITOR_ENABLED ? (
                <>
                  {" · "}
                  <Link
                    href="/editor"
                    className="font-medium text-primary hover:underline"
                  >
                    Try the canvas editor
                  </Link>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

/** One bullet of the presentation list — a marker that is not a list-style
 * disc, so it aligns with the text baseline rather than the line box. */
function Point({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden="true"
        className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/**
 * A still of a FOCUSED sequence message: three lifelines, one arrow lit, the
 * rest receded. Decorative and `aria-hidden` — the claim it illustrates is
 * made in the prose beside it, and the two buttons there are how a reader
 * acts on it.
 *
 * Hand-drawn SVG rather than the real renderer: the real one needs a parsed
 * document, a layout pass and a client component, which is a lot of machinery
 * to ship on a landing page for something nobody can interact with. It uses
 * the same lane tokens the viewer does, so it cannot drift into colours the
 * product does not have.
 */
function FocusPreview({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 210"
      className={className}
      role="presentation"
    >
      {[0, 1, 2].map((index) => {
        const x = 46 + index * 112;
        return (
          <g key={index}>
            <rect
              x={x - 40}
              y={12}
              width={80}
              height={30}
              rx={7}
              fill="var(--node)"
              stroke={`var(--seq-lane-${index + 1})`}
              strokeWidth={1.5}
              opacity={index === 1 ? 1 : 0.5}
            />
            <line
              x1={x}
              y1={42}
              x2={x}
              y2={186}
              stroke="var(--edge)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.6}
            />
          </g>
        );
      })}

      {/* The receded pair, above and below the lit one. */}
      <line
        x1={46}
        y1={74}
        x2={158}
        y2={74}
        stroke="var(--edge)"
        strokeWidth={1.5}
        opacity={0.35}
      />
      <line
        x1={158}
        y1={166}
        x2={46}
        y2={166}
        stroke="var(--edge)"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        opacity={0.35}
      />

      {/* The focused message: full strength, with its label. */}
      <line
        x1={158}
        y1={120}
        x2={270}
        y2={120}
        stroke="var(--primary)"
        strokeWidth={2}
      />
      <path d="M270 120 l-8 -4 v8 z" fill="var(--primary)" />
      <text
        x={214}
        y={112}
        textAnchor="middle"
        fontSize={10}
        fontFamily="var(--font-mono)"
        fill="var(--primary)"
      >
        POST /orders
      </text>
    </svg>
  );
}

/**
 * Decorative background: a faint canvas grid plus two soft colour washes.
 * Purely presentational, fixed behind content, ignored by assistive tech.
 */
function Backdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-transparent to-transparent" />
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--canvas-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--canvas-grid) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, black 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, black 20%, transparent 75%)",
        }}
      />
      <div className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-accent/10 blur-[120px]" />
      <div className="absolute -top-24 -left-32 size-[26rem] rounded-full bg-primary/10 blur-[120px]" />
    </div>
  );
}
