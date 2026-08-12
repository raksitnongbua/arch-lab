import {
  ArrowRight,
  Bot,
  Boxes,
  FileText,
  Layers,
  Network,
  Puzzle,
  Code2,
  Globe2,
  Keyboard,
  MousePointer2,
  Table2,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HeroDiagram } from "@/features/marketing/hero-diagram";
import { McpFlow } from "@/features/marketing/mcp-flow";
import { publicOrigin } from "@/features/mcp/lib/origin";
import {
  APP_DESCRIPTION,
  APP_NAME,
  C4_LEVEL_META,
  EDITOR_ENABLED,
} from "@/lib/constants";
import type { C4Level } from "@/types";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const LEVEL_ICONS: Record<C4Level, LucideIcon> = {
  context: Globe2,
  container: Boxes,
  component: Puzzle,
  code: Code2,
};

interface PlannedDiagramType {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
}

/** The three documentation surfaces that come after C4. Planned — no dates. */
const PLANNED_DIAGRAM_TYPES: readonly PlannedDiagramType[] = [
  {
    id: "data-dictionary",
    icon: Table2,
    title: "Data dictionary",
    body: "A structured catalogue of the data your containers own — entities, fields, and types, named once and referenced everywhere.",
  },
  {
    id: "network",
    icon: Network,
    title: "Network diagrams",
    body: "The physical layer under the logical one — zones, subnets, gateways, and the paths between them, kept in the same repository.",
  },
];

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

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: homeJsonLd() }}
      />
      <Backdrop />

      {/* ---------------------------------------------------------------- hero */}
      <section className="mx-auto w-full max-w-6xl px-5 pt-16 pb-14 sm:px-8 sm:pt-24 sm:pb-20">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16">
          <div>
            <Badge variant="accent" className="mb-6">
              <span className="size-1.5 rounded-full bg-accent" />
              {EDITOR_ENABLED
                ? "Early preview · C4 + sequence diagrams and an MCP server working today · editor in preview"
                : "Early preview · C4 + sequence diagrams and an MCP server working today · editor coming soon"}
            </Badge>

            {/* "C4" is deliberately NOT in the promise. The claim — diagrams
                that survive review — is true of every document kind here, and
                the headline used to name only one, which quietly made the
                sequence viewer and the MCP server look like footnotes to a C4
                product. The KINDS are named a line below, where they can be
                listed honestly and grow without rewriting the promise. */}
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
              Architecture diagrams that{" "}
              <span className="af-running-gradient bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                survive code review
              </span>
              .
            </h1>

            <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm text-muted-foreground">
              <span className="text-foreground">C4 models</span>
              <span aria-hidden="true" className="text-muted-foreground/40">
                ·
              </span>
              <span className="text-foreground">sequence diagrams</span>
              <span aria-hidden="true" className="text-muted-foreground/40">
                ·
              </span>
              <span className="text-foreground">MCP for agents</span>
            </p>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
              <span className="font-mono text-base text-foreground sm:text-lg">
                {APP_NAME}
              </span>{" "}
              {EDITOR_ENABLED
                ? "is a local-first workspace for architecture documentation. C4 models and sequence diagrams both read today, an MCP server lets an agent author and check them, and the canvas editor is in preview. Everything saves as diff-readable .alab text you own — or JSON, if a tool downstream wants it."
                : "is a local-first workspace for architecture documentation. C4 models and sequence diagrams both read today, and an MCP server lets an agent author and check them — the canvas editor that builds models by hand is coming soon. Everything lives as diff-readable .alab text you own — or JSON, if a tool downstream wants it."}
            </p>

            <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {EDITOR_ENABLED ? (
                <>
                  {/* The demo leads even with the editor enabled: it is the
                      thing that works end to end and needs no explanation,
                      while the editor is still a preview. */}
                  <Link
                    href="/demo"
                    aria-describedby="cta-note"
                    className={buttonClasses({ size: "lg" })}
                  >
                    Explore the live demo
                    <ArrowRight aria-hidden="true" />
                  </Link>
                  <Link
                    href="/view/sequence"
                    className={buttonClasses({
                      variant: "outline",
                      size: "lg",
                    })}
                  >
                    Try sequence diagrams
                  </Link>
                  <Link
                    href="/editor"
                    className={buttonClasses({
                      variant: "ghost",
                      size: "lg",
                    })}
                  >
                    Open the editor preview
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/demo"
                    aria-describedby="cta-note"
                    className={buttonClasses({ size: "lg" })}
                  >
                    Explore the live demo
                    <ArrowRight aria-hidden="true" />
                  </Link>
                  <Link
                    href="/view/sequence"
                    className={buttonClasses({
                      variant: "outline",
                      size: "lg",
                    })}
                  >
                    Try sequence diagrams
                  </Link>
                  <Badge variant="outline">Editor — coming soon</Badge>
                </>
              )}
              <p id="cta-note" className="text-sm text-muted-foreground">
                {EDITOR_ENABLED
                  ? "No account, no cloud — the model saves to one .alab text file you own."
                  : "No account, no cloud — models are plain text files, and nothing you paste leaves your browser."}
              </p>
            </div>
          </div>

          {/* Decorative mini C4 diagram — desktop only, hidden from AT. */}
          <HeroDiagram className="hidden lg:block" />
        </div>

        <ul className="mt-14 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-border/60 pt-8 sm:grid-cols-4">
          {/* Two of these changed with the second document kind: "4 C4 levels"
              described one surface as if it were the product, and the tool
              count is what makes the agent story concrete. */}
          <Stat
            value="2"
            label={
              EDITOR_ENABLED
                ? "Diagram kinds, editable today"
                : "Diagram kinds, readable today"
            }
          />
          <Stat value="10" label="MCP tools, all read-only" />
          <Stat value="0" label="Accounts or servers" />
          <Stat value="Git" label="Is the collaboration layer" />
        </ul>
      </section>

      {/* ------------------------------------------------------- diagram types */}
      <section
        aria-labelledby="diagram-types-heading"
        className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24"
      >
        <div className="mb-8 flex flex-col gap-2">
          <h2
            id="diagram-types-heading"
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            One workspace, four kinds of documentation
          </h2>
          <p className="max-w-2xl leading-relaxed text-muted-foreground">
            Two of them work today — C4 models and sequence diagrams, both
            readable and both plain text. The other two are planned and will
            share the same local-first, text-on-disk foundation; they are listed
            here as direction, not as promises with dates.
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Shipping now: C4 — the featured card with real destinations. */}
          <li className="flex lg:col-span-3">
            <Card className="group relative flex w-full flex-col overflow-hidden border-primary/25 transition-all duration-300 hover:border-primary/45 hover:shadow-lg hover:shadow-primary/5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/6"
              />
              <CardHeader className="relative gap-4 sm:p-8">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                    <Layers aria-hidden="true" className="size-5" />
                  </span>
                  <Badge variant="accent">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-accent"
                    />
                    Available now
                  </Badge>
                </div>
                <div className="flex flex-col gap-1.5">
                  <CardTitle className="text-xl leading-tight sm:text-2xl">
                    C4 model diagrams
                  </CardTitle>
                </div>
                <CardDescription className="max-w-2xl text-base">
                  {EDITOR_ENABLED
                    ? "Model your system from Context down to Code on an interactive canvas. Double-click any node to open the level beneath it, breadcrumb back out, and save the whole model as one diff-reviewable .alab file."
                    : "Explore complete systems from Context down to Code on an interactive canvas. Click any numbered node to open the level beneath it, breadcrumb back out, and inspect every relationship — each model is one diff-reviewable .alab file. The editor that builds them is coming soon."}
                </CardDescription>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {EDITOR_ENABLED ? (
                    <>
                      <Link
                        href="/editor"
                        className={buttonClasses({ size: "md" })}
                      >
                        Open the C4 editor
                        <ArrowRight aria-hidden="true" />
                      </Link>
                      <Link
                        href="/demo"
                        className={buttonClasses({
                          variant: "outline",
                          size: "md",
                        })}
                      >
                        Explore the live demo
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/demo"
                        className={buttonClasses({ size: "md" })}
                      >
                        Explore the live demo
                        <ArrowRight aria-hidden="true" />
                      </Link>
                      <Link
                        href="/view/c4"
                        className={buttonClasses({
                          variant: "outline",
                          size: "md",
                        })}
                      >
                        Paste your own model
                      </Link>
                      <Badge variant="outline">Editor — coming soon</Badge>
                    </>
                  )}
                </div>
              </CardHeader>
            </Card>
          </li>

          {/* Shipping now: sequence diagrams, view mode. A real card with real
              destinations, and no longer in PLANNED_DIAGRAM_TYPES — it was
              listed as "coming soon" for one release after it started working,
              which is the kind of stale promise this section exists to avoid. */}
          <li className="flex lg:col-span-2">
            <Card className="group relative flex w-full flex-col overflow-hidden border-accent/25 transition-all duration-300 hover:border-accent/45 hover:shadow-lg hover:shadow-accent/5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/8 via-transparent to-primary/6"
              />
              <CardHeader className="relative flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
                    <Workflow aria-hidden="true" className="size-5" />
                  </span>
                  <Badge variant="accent">
                    <span
                      aria-hidden="true"
                      className="size-1.5 rounded-full bg-accent"
                    />
                    Available now
                  </Badge>
                  <Badge variant="outline">View mode</Badge>
                </div>
                <CardTitle className="text-xl leading-tight">
                  Sequence diagrams
                </CardTitle>
                <CardDescription className="max-w-2xl text-base">
                  Trace one request across the systems you have modelled. The
                  whole flow renders at once — click any message, participant or{" "}
                  {/* Each <code> here is followed by PUNCTUATION, never by a
                      space and then a word. Not a style choice: `<code>alt</code>
                      branch` rendered as "altbranch" — the literal space was
                      dropped on the way to HTML, and an explicit {" "} did not
                      survive Prettier collapsing it back to a literal one.
                      Bracketing the kinds removes the fragile boundary, and
                      naming all three reads better than naming one anyway. */}
                  fragment branch (
                  <code className="font-mono text-[0.9em]">alt</code>,{" "}
                  <code className="font-mono text-[0.9em]">par</code>,{" "}
                  <code className="font-mono text-[0.9em]">opt</code>) to
                  spotlight it and read the details, or fold a service&apos;s
                  dependencies away to see the shape underneath. Write it as{" "}
                  <code className="font-mono text-[0.9em]">.alab</code> text or
                  paste a Mermaid{" "}
                  <code className="font-mono text-[0.9em]">
                    sequenceDiagram
                  </code>{" "}
                  straight in.
                </CardDescription>
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
                  <Link
                    href="/view/sequence"
                    className={buttonClasses({ size: "md" })}
                  >
                    Open the sequence viewer
                    <ArrowRight aria-hidden="true" />
                  </Link>
                  <Link
                    href="/syntax#sequence"
                    className={buttonClasses({
                      variant: "outline",
                      size: "md",
                    })}
                  >
                    Read the syntax
                  </Link>
                </div>
              </CardHeader>
            </Card>
          </li>

          {/* Shipping now, beta: the MCP server. Its own card rather than a
              footnote, because "an agent can author these" is the reason a
              reader with an agent open would care about the format at all. */}
          <li className="flex">
            <Card className="group relative flex w-full flex-col overflow-hidden transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
              <CardHeader className="relative flex flex-1 flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
                    <Bot aria-hidden="true" className="size-5" />
                  </span>
                  <Badge variant="outline">Beta</Badge>
                </div>
                <CardTitle className="text-xl leading-tight">
                  Built for AI agents
                </CardTitle>
                <CardDescription className="text-base">
                  Point an agent at the MCP server and it gets the grammar and
                  the real parser&apos;s verdict — ten read-only tools over both
                  document kinds, so what it writes is valid before anyone opens
                  it. Read-only by design: no tool here mutates your files.
                </CardDescription>
                {/* The transcript, and the reason this card no longer runs
                    short: it was the only one in its row with nothing but
                    prose, so it read as a footnote beside the sequence card and
                    left the row unbalanced. It also has the abstract claim to
                    make, and a verdict is easier to show than to describe. */}
                <McpFlow className="mt-1" />
                {/* mt-auto on both cards' CTA rows, so the buttons sit on one
                    line across the row however the copy above them wraps.
                    Grid already equalises the card HEIGHTS; this is what stops
                    the taller card's button floating mid-card. */}
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
                  <Link href="/mcp" className={buttonClasses({ size: "md" })}>
                    Connect an agent
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              </CardHeader>
            </Card>
          </li>

          {/* Planned: honestly labelled, deliberately non-interactive. */}
          {PLANNED_DIAGRAM_TYPES.map((diagramType) => {
            const Icon = diagramType.icon;
            return (
              <li key={diagramType.id} className="flex">
                <Card className="flex w-full flex-col border-dashed bg-card/50">
                  <CardHeader className="gap-3">
                    <div className="flex items-center justify-between">
                      <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary/60 text-muted-foreground">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <Badge variant="outline">Coming soon</Badge>
                    </div>
                    <CardTitle className="text-lg text-muted-foreground">
                      {diagramType.title}
                    </CardTitle>
                    <CardDescription>{diagramType.body}</CardDescription>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      Not part of the first release — no date yet.
                    </p>
                  </CardHeader>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {/* -------------------------------------------------------------- levels */}
      <section
        aria-labelledby="levels-heading"
        className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24"
      >
        <div className="mb-8 flex flex-col gap-2">
          <h2
            id="levels-heading"
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            Inside C4: one model, four altitudes
          </h2>
          <p className="max-w-2xl leading-relaxed text-muted-foreground">
            Every node can open into the level beneath it. Double-click to
            descend, breadcrumb to climb back out — the same model, told at the
            depth your audience needs.
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {C4_LEVEL_META.map((meta) => {
            const Icon = LEVEL_ICONS[meta.level];
            return (
              <li key={meta.level} className="flex">
                <Card className="group relative flex w-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                  {/* Hover wash — decorative, so it never affects layout. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/8 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <CardHeader className="relative gap-3">
                    <div className="flex items-center justify-between">
                      <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary/60 text-primary transition-colors group-hover:border-primary/40">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                        L{meta.order}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <CardTitle className="text-lg">{meta.label}</CardTitle>
                      <span className="text-xs font-medium tracking-wide text-muted-foreground/80 uppercase">
                        {meta.audience}
                      </span>
                    </div>
                    <CardDescription>{meta.summary}</CardDescription>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {meta.examples.map((example) => (
                        <li key={example}>
                          <Badge variant="outline">{example}</Badge>
                        </li>
                      ))}
                    </ul>
                  </CardHeader>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ------------------------------------------------------------ features */}
      <section
        aria-labelledby="principles-heading"
        className="border-t border-border/60 bg-card/30"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <h2
            id="principles-heading"
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            What it is built around
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            <Principle
              icon={MousePointer2}
              title="A canvas, not a syntax"
              body={
                EDITOR_ENABLED
                  ? "Drag, snap, connect. Direct manipulation with alignment guides and undo on every edit — closer to draw.io than to a text DSL."
                  : "Direct manipulation over a text DSL — closer to draw.io than to code. Pan, zoom, and drill the canvas today; drag-snap-connect editing arrives with the editor."
              }
            />
            <Principle
              icon={FileText}
              title="Plain text on disk"
              body="One .alab file per model — stable ids, deterministic line order, sorted tags. A reviewer sees what changed in the architecture, not a reshuffled blob. JSON stays available for tools that want it."
            />
            <Principle
              icon={Layers}
              title="Real drill-down"
              body="Parent relationships are inherited into child levels as read-only boundary nodes, so a component view reads on its own."
            />
            <Principle
              icon={Keyboard}
              title="Keyboard and screen reader first"
              body="Every action reachable without a mouse, and the model exposed as structure — not an image with no alt text."
            />
            <Principle
              icon={Boxes}
              title="Icons for the stack you run"
              body="Go, Next.js, MongoDB, MySQL, Postgres, Redis, Cloudflare, nginx, Kong — inferred from a node's technology, overridable by hand."
            />
            <Principle
              icon={Globe2}
              title="Local-first, no account"
              body="Nothing leaves the machine. Open a file, edit it, save it back. Git is the collaboration layer."
            />
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <li className="flex flex-col gap-1">
      <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-sm leading-snug text-muted-foreground">
        {label}
      </span>
    </li>
  );
}

function Principle({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <li className="flex flex-col gap-2">
      <span className="flex items-center gap-2.5 text-primary">
        <Icon aria-hidden="true" className="size-4.5" />
        <span className="text-[15px] font-medium text-foreground">{title}</span>
      </span>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </li>
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
