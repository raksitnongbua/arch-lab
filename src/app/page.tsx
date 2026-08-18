import {
  ArrowRight,
  Bot,
  FileText,
  GitBranch,
  MousePointerClick,
  Play,
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
 * roadmap is not published here, which is where a roadmap
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

            {/* A DEFINITION FIRST, then the detail. The lead used to open
                "Describe a system in a few lines of text and arch-lab draws
                it" — which describes an action and never says what the thing
                IS. Both audiences want the same sentence: a newcomer asking
                "what is this", and an assistant asked "what is arch-lab",
                which extracts an "X is a Y that Z" sentence and paraphrases
                anything else. Twelve words buys a claim that can be quoted
                back correctly. */}
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
              <span className="font-mono text-base text-foreground sm:text-lg">
                {APP_NAME}
              </span>{" "}
              is a browser-based editor for architecture diagrams written as
              plain text. Describe a system in a few lines and it draws it — a
              beautiful, zoomable C4 model you can drill into level by level, or
              a sequence flow you can click through message by message. Your AI
              agent can write that text for you.
            </p>

            {/* ONE primary destination. The old hero offered three buttons and
                a badge, and the first of them went to a gallery — a newcomer
                had to pick between "demo", "sequence diagrams" and "editor
                preview" before seeing anything at all. `/view/sequence` opens
                already seeded with a flow, so the first click ends in a
                working diagram rather than another choice. */}
            <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {/* ICON-LED, not word-led. The label is still here for anyone
                  who cannot see the icon — `sr-only` text, which is what gives
                  the link its accessible name — but sighted readers get a
                  play mark that pulses and an arrow that runs, because a
                  button that MOVES says "this does something now" faster than
                  four words say it.

                  The words are not merely deleted, though: the note beside
                  this link ("Opens with a worked example") is the visible
                  explanation, and it is why an icon-only face is affordable
                  here at all. An icon alone next to nothing would be a riddle;
                  `aria-describedby` already tied the two together. */}
              <Link
                href="/view?d=seq"
                aria-describedby="cta-note"
                className={buttonClasses({
                  size: "lg",
                  className: "af-cta-live group gap-2.5",
                })}
              >
                <span className="sr-only">Open a live diagram</span>
                <Play aria-hidden="true" className="af-cta-live-mark" />
                <ArrowRight
                  aria-hidden="true"
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
              <Link
                href="/view"
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
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-14">
          <div>
            {/* An eyebrow that says WHAT KIND of claim follows, not a label
                repeating the heading. The section's argument is a comparison
                — most tools hand you a picture — so the eyebrow makes the
                comparison and the heading makes the promise. */}
            <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              Not a picture
            </p>
            <h2
              id="present-heading"
              className="mt-2 text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl"
            >
              A diagram you can talk through
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
              Every element answers a gesture, so the diagram keeps up with the
              conversation instead of sitting behind it.
            </p>

            {/* GESTURES, each labelled with the input that performs it. The
                mono keycap is the product's own voice for something the tool
                understands — its hint bars already read "← → move between
                messages". Every key is a WORD, not a glyph: `⛶` said
                "immersive" in two characters and would have rendered as a
                tofu box wherever the font lacks U+26F6, and "immersive" is
                the button's own label anyway. Deliberately NOT numbered:
                these are three independent things you can do, and 01/02/03
                would assert an order that does not exist. */}
            <dl className="mt-7 flex flex-col divide-y divide-border/60 border-y border-border/60">
              <Gesture keys="click" title="Spotlight one message">
                Its arrow redraws itself and holds while the rest recede — with
                the endpoint, payload and failure modes beside it.
              </Gesture>
              <Gesture keys="double-click" title="Open the level beneath">
                Drill from a C4 box into what it contains, and follow the
                breadcrumb back out. One model, told at whatever depth the
                question needs.
              </Gesture>
              <Gesture keys="immersive" title="Take the whole screen">
                Immersive for the room you are presenting to. Export any view as
                SVG, PNG, or an animated GIF for the doc nobody opens live.
              </Gesture>
            </dl>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/view?d=seq"
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

          {/* THE SIGNATURE. Everything else in this section is quiet so that
              this can be the one loud thing: a miniature of the real viewer,
              on the real canvas surface, doing the thing the copy describes.
              It sits in a panel that borrows `--canvas` and the backdrop's
              grid, so it reads as the product rather than as an illustration
              of it. */}
          <figure className="relative overflow-hidden rounded-2xl border border-border bg-[var(--canvas)] shadow-xl shadow-primary/5">
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  "linear-gradient(to right, var(--canvas-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--canvas-grid) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />
            <TalkThroughPreview className="relative w-full" />
            <figcaption className="relative flex items-center gap-2 border-t border-border/60 bg-card/70 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
              <span className="size-1.5 shrink-0 rounded-full bg-primary" />
              Focus moves message by message — the same draw a click gives you.
            </figcaption>
          </figure>
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

/**
 * One gesture and what it does. A `<dl>` row rather than a bullet: the input
 * and its result are a term and its definition, which is what the markup now
 * says as well as what the layout shows.
 */
function Gesture({
  keys,
  title,
  children,
}: {
  keys: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 py-4">
      <dt className="col-start-1 row-span-2">
        <span className="inline-flex min-w-16 items-center justify-center rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] whitespace-nowrap text-muted-foreground shadow-sm">
          {keys}
        </span>
      </dt>
      <dd className="col-start-2 text-sm font-medium text-foreground">
        {title}
      </dd>
      <dd className="col-start-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </dd>
    </div>
  );
}

/**
 * A miniature of the sequence viewer, RUNNING: three lifelines, three
 * messages, and the focus moving between them the way it moves when a reader
 * clicks — the lit arrow draws itself, holds, and hands over.
 *
 * The section's whole argument is that these diagrams respond, and the still
 * that used to sit here was evidence against it as much as for it. The loop
 * is CSS (`af-talk-focus` in globals.css, which carries the mechanics and the
 * reduced-motion behaviour), so this stays a server component with no
 * hydration cost and no client state to get wrong.
 *
 * `aria-hidden`, and the copy beside it does not depend on it: everything the
 * animation demonstrates is stated in the gesture list, and the two buttons
 * are how a reader acts on it. A decorative loop that a screen reader had to
 * sit through would be a worse version of the same claim.
 *
 * Hand-drawn rather than the real renderer, for the reason the C4 hero is:
 * the real one needs a parsed document, a layout pass and a client component
 * — a lot of machinery to ship on a landing page for something nobody can
 * interact with. It borrows the viewer's own lane tokens and its dashed-reply
 * convention, so it cannot drift into a vocabulary the product does not have.
 */
function TalkThroughPreview({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  /** Lifelines: x centre and the lane token each card is drawn in. */
  const columns = [
    { x: 74, label: "Customer" },
    { x: 214, label: "Order API" },
    { x: 354, label: "Payments" },
  ];

  /**
   * The three messages, in the order the focus visits them. `delay` is
   * NEGATIVE so all three share one 9s clock and start already staggered —
   * with positive delays the first pass would run empty for two thirds of a
   * cycle before settling.
   */
  const messages = [
    { from: 74, to: 214, y: 132, label: "Place the order", reply: false },
    { from: 214, to: 354, y: 176, label: "Authorise card", reply: false },
    { from: 354, to: 214, y: 220, label: "requires_capture", reply: true },
  ];

  return (
    <svg
      aria-hidden="true"
      role="presentation"
      viewBox="0 0 428 268"
      className={className}
    >
      {columns.map((column, index) => (
        <g key={column.label}>
          <rect
            x={column.x - 54}
            y={28}
            width={108}
            height={34}
            rx={8}
            fill="var(--node)"
            stroke={`var(--seq-lane-${index + 1})`}
            strokeWidth={1.5}
          />
          <text
            x={column.x}
            y={49}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill="var(--node-foreground)"
          >
            {column.label}
          </text>
          <line
            x1={column.x}
            y1={62}
            x2={column.x}
            y2={244}
            stroke="var(--edge)"
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.55}
          />
        </g>
      ))}

      {messages.map((message, index) => {
        const head = message.from < message.to ? -7 : 7;
        return (
          <g key={message.label}>
            {/* Resting: always drawn, never animated. A sequence diagram is a
                record of what happened, so nothing here is ever absent — the
                focus only changes what is EMPHASISED. */}
            <line
              x1={message.from}
              y1={message.y}
              x2={message.to}
              y2={message.y}
              stroke="var(--edge)"
              strokeWidth={1.5}
              strokeDasharray={message.reply ? "5 4" : undefined}
              opacity={0.5}
            />
            <path
              d={`M${message.to} ${message.y} l${head} -4 v8 z`}
              fill="var(--edge)"
              opacity={0.5}
            />

            {/* Lit: draws itself, holds, hands over. `pathLength` normalises
                the dash geometry so one keyframe fits arrows of any span. */}
            <g
              className="af-talk-focus"
              style={{ animationDelay: `${index * -3}s` }}
            >
              <line
                x1={message.from}
                y1={message.y}
                x2={message.to}
                y2={message.y}
                pathLength={1}
                strokeDasharray={1}
                stroke="var(--primary)"
                strokeWidth={2}
              />
              <path
                d={`M${message.to} ${message.y} l${head} -4 v8 z`}
                fill="var(--primary)"
              />
              <text
                x={(message.from + message.to) / 2}
                y={message.y - 8}
                textAnchor="middle"
                fontSize={10}
                fontFamily="var(--font-mono)"
                fill="var(--primary)"
              >
                {message.label}
              </text>
            </g>
          </g>
        );
      })}
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
