import type { Metadata } from "next";
import Link from "next/link";

import { listFlowchartExamples } from "@/features/flowchart/service/example-service";
import { VIEW_EXAMPLE_PARAM } from "@/features/playground/lib/example-param";
import { listSequenceExamples } from "@/features/sequence/service/example-service";
import { listUseCaseExamples } from "@/features/usecase/service/example-service";
import { listViewerModels } from "@/features/viewer";

export const metadata: Metadata = {
  title: "Examples — C4 models, sequence diagrams, flowcharts and use cases",
  description:
    "Bundled example documents of all four kinds, each parsed by the real reader. Open one in the playground and edit it as text.",
  alternates: { canonical: "/demo" },
};

/**
 * The example index: four lists, one card per bundled document.
 *
 * IT WAS A LANDING PAGE and did not need to be. Each card carried a gradient
 * hover wash, an icon tile, a "View-only" badge, four count statistics, a row
 * of level badges and its own call-to-action link — for a page whose entire
 * job is "here are six documents, pick one". The chrome outweighed the six
 * facts it surrounded, which is the opposite of an index.
 *
 * TWO THINGS HERE WERE ALSO WRONG, and being wrong is what a page earns by
 * describing behaviour in prose that lives somewhere else: the "View-only"
 * badges and the "read-only" copy dated from when these cards linked at the
 * read-only routes. They open the PLAYGROUND now (`?e=`), where the document
 * is editable text.
 *
 * The counts stay, in one line rather than four blocks: they are the only
 * thing that distinguishes one card from another at a glance, and every one is
 * counted from the parsed document rather than written by hand.
 *
 * A BROKEN EXAMPLE STAYS VISIBLE. A bundled document that fails to parse is a
 * bug in this repo, and hiding it behind a filter is how it stays one.
 */
/** How many of a kind's examples the page SHOWS. See the note in DemoPage. */
const SHOWCASES_PER_KIND = 2;

/** The valid listings past the showcased two, as `{ id, title }` for AlsoLinks. */
function overflowOf(
  listings: { status: string; summary?: { id: string; title: string } }[],
): { id: string; title: string }[] {
  return listings
    .slice(SHOWCASES_PER_KIND)
    .flatMap((listing) =>
      listing.status === "ok" && listing.summary !== undefined
        ? [{ id: listing.summary.id, title: listing.summary.title }]
        : [],
    );
}

/** The heading, the intro and the jump bar take the first three cascade slots. */
const C4_BASE = 3;

export default function DemoPage(): React.JSX.Element {
  /*
   * TWO SHOWCASES PER KIND on the page, not every registered example.
   *
   * The index had grown to eleven cards across four sections, which is a
   * catalogue rather than an overview: a reader arriving here is deciding
   * whether the product draws the kind of diagram they have in mind, and the
   * third example of a kind cannot change that answer. Two shows the range;
   * the rest are still LINKED, as a compact line under each section, because
   * every one has a crawlable read-only page in the sitemap and dropping the
   * link would orphan it — which is the exact bug the read-only links were
   * added to fix.
   */
  const models = listViewerModels();
  const sequences = listSequenceExamples();
  const flowcharts = listFlowchartExamples();
  const usecases = listUseCaseExamples();

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 sm:py-16">
      <h1
        className="af-demo-row text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        style={{ "--row": 0 } as React.CSSProperties}
      >
        Examples
      </h1>
      <p
        className="af-demo-row mt-3 max-w-2xl text-muted-foreground"
        style={{ "--row": 1 } as React.CSSProperties}
      >
        Real documents of all four kinds, parsed by the same reader the app
        uses. Open one in the playground and edit it as text.
      </p>

      {/* A JUMP BAR, sticky under the header. Four sections of two cards is
          short enough to scroll and long enough that "where is the flowchart
          one" is a real question; four links answer it without the reader
          hunting. Plain anchors, so they work before hydration and survive
          being copied. `backdrop-blur` rather than a solid ground, because it
          passes over cards as it sticks. */}
      <nav
        aria-label="Jump to a document kind"
        className="af-demo-row sticky top-16 z-20 -mx-2 mt-8 flex flex-wrap gap-1 rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 backdrop-blur"
        style={{ "--row": 2 } as React.CSSProperties}
      >
        {(
          [
            ["c4", "C4 models"],
            ["sequence", "Sequence diagrams"],
            ["flowchart", "Flowcharts"],
            ["usecase", "Use cases"],
          ] as const
        ).map(([anchor, label]) => (
          <a
            key={anchor}
            href={`#${anchor}`}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>

      {/* `base` continues the cascade across sections rather than restarting
          it: four lists each counting from zero animate in lockstep, which
          reads as a glitch rather than an order. */}
      <Section
        title="C4 models"
        kind="c4"
        accent="var(--primary)"
        base={C4_BASE}
      >
        {models.slice(0, SHOWCASES_PER_KIND).map((listing, row) =>
          listing.status === "invalid" ? (
            <Broken
              key={listing.id}
              id={listing.id}
              message={listing.message}
            />
          ) : (
            <ExampleCard
              key={listing.summary.id}
              id={listing.summary.id}
              title={listing.summary.title}
              description={listing.summary.description}
              row={C4_BASE + row + 1}
              readOnlyHref={`/view/${listing.summary.id}`}
              meta={[
                `${listing.summary.diagramCount} diagrams`,
                `${listing.summary.nodeCount} elements`,
                `${listing.summary.edgeCount} relationships`,
              ]}
            />
          ),
        )}
        <AlsoLinks
          items={overflowOf(models)}
          hrefFor={(id) => `/view/${id}`}
        />
      </Section>

      <Section
        title="Sequence diagrams"
        kind="sequence"
        accent="var(--accent)"
        base={C4_BASE + models.length + 1}
      >
        {sequences.slice(0, SHOWCASES_PER_KIND).map((listing, row) =>
          listing.status === "invalid" ? (
            <Broken
              key={listing.id}
              id={listing.id}
              message={listing.message}
            />
          ) : (
            <ExampleCard
              key={listing.summary.id}
              id={listing.summary.id}
              title={listing.summary.title}
              description={listing.summary.description}
              row={C4_BASE + models.length + row + 2}
              readOnlyHref={`/view/sequence/${listing.summary.id}`}
              meta={[
                `${listing.summary.participantCount} participants`,
                `${listing.summary.messageCount} messages`,
              ]}
            />
          ),
        )}
        <AlsoLinks
          items={overflowOf(sequences)}
          hrefFor={(id) => `/view/sequence/${id}`}
        />
      </Section>

      <Section
        title="Flowcharts"
        kind="flowchart"
        accent="var(--flow-decision-border)"
        base={C4_BASE + models.length + sequences.length + 2}
      >
        {flowcharts.slice(0, SHOWCASES_PER_KIND).map((listing, row) =>
          listing.status === "invalid" ? (
            <Broken
              key={listing.id}
              id={listing.id}
              message={listing.message}
            />
          ) : (
            <ExampleCard
              key={listing.summary.id}
              id={listing.summary.id}
              title={listing.summary.title}
              description={listing.summary.description}
              row={C4_BASE + models.length + sequences.length + row + 3}
              readOnlyHref={`/view/flowchart/${listing.summary.id}`}
              meta={[
                `${listing.summary.nodeCount} steps`,
                `${listing.summary.edgeCount} arrows`,
                `${listing.summary.decisionCount} decisions`,
              ]}
            />
          ),
        )}
        <AlsoLinks
          items={overflowOf(flowcharts)}
          hrefFor={(id) => `/view/flowchart/${id}`}
        />
      </Section>

      <Section
        title="Use cases"
        kind="usecase"
        accent="var(--uc-actor-border)"
        base={
          C4_BASE + models.length + sequences.length + flowcharts.length + 3
        }
      >
        {usecases.slice(0, SHOWCASES_PER_KIND).map((listing, row) =>
          listing.status === "invalid" ? (
            <Broken
              key={listing.id}
              id={listing.id}
              message={listing.message}
            />
          ) : (
            <ExampleCard
              key={listing.summary.id}
              id={listing.summary.id}
              title={listing.summary.title}
              description={listing.summary.description}
              row={
                C4_BASE +
                models.length +
                sequences.length +
                flowcharts.length +
                row +
                4
              }
              readOnlyHref={`/view/usecase/${listing.summary.id}`}
              meta={[
                `${listing.summary.actorCount} actors`,
                `${listing.summary.useCaseCount} use cases`,
                `${listing.summary.boundaryCount} ${
                  listing.summary.boundaryCount === 1
                    ? "boundary"
                    : "boundaries"
                }`,
              ]}
            />
          ),
        )}
        <AlsoLinks
          items={overflowOf(usecases)}
          hrefFor={(id) => `/view/usecase/${id}`}
        />
      </Section>
    </div>
  );
}

/**
 * One kind of document, with its own colour and its own glyph.
 *
 * THE GROUPING IS THE POINT of this page — a C4 model and a sequence diagram
 * are different things to look at, and a heading alone made them read as one
 * list with a label in the middle. Each section now carries an accent
 * (`--primary` for C4, `--accent` for sequence, and a kind-specific canvas
 * colour for the other two) that its rows inherit through `currentColor`, and
 * a glyph drawn from the kind itself: stacked frames for C4's nesting, two
 * lifelines and a message for a sequence, a rhombus for a flowchart, an actor
 * against an ellipse for a use case. Not icons chosen from a set — the shapes
 * the reader is about to open.
 *
 * The tint is applied through `text-(--kind)` on the section, so a row's
 * connector picks it up without either of them naming a colour.
 */
function Section({
  title,
  kind,
  accent,
  base,
  children,
}: {
  title: string;
  kind: "c4" | "sequence" | "flowchart" | "usecase";
  accent: string;
  /** Where this section sits in the page-wide entrance cascade. */
  base: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      /* The anchor the sticky jump bar targets. `scroll-mt` clears the bar
         itself, or the heading lands underneath it. */
      id={kind}
      className="af-demo-kind af-demo-row mt-12 scroll-mt-24"
      style={{ "--kind": accent, "--row": base } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <span className="af-demo-glyph text-(--kind)">
          {kind === "c4" ? (
            <C4Glyph />
          ) : kind === "sequence" ? (
            <SequenceGlyph />
          ) : kind === "flowchart" ? (
            <FlowchartGlyph />
          ) : (
            <UseCaseGlyph />
          )}
        </span>
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        {/* A rule that runs out to the edge, tinted with the kind: it is what
            makes the two groups read as two at a glance, before any word is. */}
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-linear-to-r from-(--kind)/40 to-transparent"
        />
      </div>
      <ul className="mt-2 divide-y divide-border/60">{children}</ul>
    </section>
  );
}

/** C4's nesting: a frame holding a frame. */
function C4Glyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="1.2" y="2.6" width="13.6" height="10.8" rx="2.2" />
      <rect x="4.4" y="5.6" width="7.2" height="4.8" rx="1.4" />
    </svg>
  );
}

/** A sequence: two lifelines and the message between them. */
function SequenceGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M3.4 2v12M12.6 2v12" strokeDasharray="2 2" />
      <path d="M3.4 7.4h9.2M10.6 5.6l2 1.8-2 1.8" />
    </svg>
  );
}

/** A use case: a stick figure beside an ellipse. The pairing is the whole
 * tell — an actor against the system's edge is what no other kind draws. */
function UseCaseGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <circle cx="4.2" cy="3.4" r="1.5" />
      <path d="M4.2 4.9v3.4M2.2 6.6h4M4.2 8.3l-1.7 3.2M4.2 8.3l1.7 3.2" />
      <ellipse cx="11.4" cy="8" rx="3.4" ry="2.4" />
    </svg>
  );
}

/** A flowchart: a step, a decision below it, and the branch leaving the
 * diamond. The rhombus is the whole tell — it is what no other kind draws. */
function FlowchartGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <rect x="4.6" y="1.6" width="6.8" height="3.4" rx="0.8" />
      <path d="M8 5v2.2" />
      <path d="M8 7.6l3 2.6-3 2.6-3-2.6z" />
      <path d="M8 12.8v1.6" />
    </svg>
  );
}

function ExampleCard({
  id,
  title,
  description,
  meta,
  row,
  readOnlyHref,
}: {
  id: string;
  title: string;
  description: string | null;
  meta: string[];
  /** Position in its section — drives the entrance stagger, nothing else. */
  row: number;
  /** The example's read-only page — see the note on the link below. */
  readOnlyHref: string;
}): React.JSX.Element {
  return (
    <li className="af-demo-row" style={{ "--row": row } as React.CSSProperties}>
      {/* The whole row is the link — one target, no separate call to action
          competing with the title above it. */}
      {/* The TITLE is the link, not the whole row. It was the row, which is
          the better target — but a row-wide anchor cannot contain the
          read-only link beside it, and nesting one anchor in another is
          invalid HTML that browsers silently unnest. The hover affordance
          stays on the row through `group`, so it still reads as one target
          while being two. */}
      <div className="group flex flex-col gap-1 rounded-md px-2 py-4 transition-colors hover:bg-secondary/40">
        <Link
          href={`/view?${VIEW_EXAMPLE_PARAM}=${id}`}
          className="focus-visible:outline-none"
        >
          <span className="flex items-center gap-0 text-(--kind)">
            {/* Grows out of nothing on hover and meets the title — the gesture a
              diagram is made of, rather than an underline. */}
            <span aria-hidden="true" className="af-demo-tick h-px bg-current" />
            <span className="font-medium text-foreground transition-[margin,color] duration-200 group-hover:ml-2 group-hover:text-(--kind)">
              {title}
            </span>
          </span>
        </Link>
        {description === null ? null : (
          <span className="text-sm text-muted-foreground">{description}</span>
        )}
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground/80">
          <span>{meta.join(" · ")}</span>
          {/* The read-only page for this example. It carries its own title,
              description and social card and is the only CRAWLABLE rendering
              of the document — the playground renders nothing server-side for
              a search engine to read. Before this link the six of them were in
              the sitemap with no inbound link at all, which is the definition
              of an orphan page. Quiet on purpose: the playground is what a
              reader wants, and this is for the reader who wants to send
              someone a diagram rather than an editor. */}
          <Link
            href={readOnlyHref}
            className="underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
          >
            read-only view
          </Link>
        </span>
      </div>
    </li>
  );
}

/**
 * The examples this page does not showcase, as one compact line of links.
 *
 * Not a "show more" toggle: every one of these has a crawlable read-only page
 * listed in the sitemap, and a link a crawler cannot follow until JavaScript
 * runs is the orphan-page problem the read-only links exist to solve. Plain
 * anchors, always in the markup, quietly styled.
 */
function AlsoLinks({
  items,
  hrefFor,
}: {
  items: { id: string; title: string }[];
  hrefFor: (id: string) => string;
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <li className="px-2 pt-3 text-xs text-muted-foreground">
      Also:{" "}
      {items.map((item, index) => (
        <span key={item.id}>
          {index > 0 ? ", " : ""}
          <Link
            href={hrefFor(item.id)}
            className="underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
          >
            {item.title}
          </Link>
        </span>
      ))}
    </li>
  );
}

function Broken({
  id,
  message,
}: {
  id: string;
  message: string;
}): React.JSX.Element {
  return (
    <li className="py-4 sm:px-2">
      <span className="font-medium text-destructive">{id}</span>
      <span className="mt-1 block font-mono text-xs text-muted-foreground">
        {message}
      </span>
    </li>
  );
}
