import type { Metadata } from "next";
import Link from "next/link";

import { VIEW_EXAMPLE_PARAM } from "@/features/playground/lib/example-param";
import { listSequenceExamples } from "@/features/sequence/service/example-service";
import { listViewerModels } from "@/features/viewer";

export const metadata: Metadata = {
  title: "Examples — C4 models and sequence diagrams",
  description:
    "Bundled example documents of both kinds, each parsed by the real reader. Open one in the playground and edit it as text.",
  alternates: { canonical: "/demo" },
};

/**
 * The example index: two lists, one card per bundled document.
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
/** The heading and the intro take the first two slots of the entrance cascade. */
const C4_BASE = 2;

export default function DemoPage(): React.JSX.Element {
  const models = listViewerModels();
  const sequences = listSequenceExamples();

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
        Real documents, parsed by the same reader the app uses. Open one in the
        playground and edit it as text.
      </p>

      {/* `base` continues the cascade across sections rather than restarting
          it: two lists each counting from zero animate in lockstep, which reads
          as a glitch rather than an order. */}
      <Section
        title="C4 models"
        kind="c4"
        accent="var(--primary)"
        base={C4_BASE}
      >
        {models.map((listing, row) =>
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
      </Section>

      <Section
        title="Sequence diagrams"
        kind="sequence"
        accent="var(--accent)"
        base={C4_BASE + models.length + 1}
      >
        {sequences.map((listing, row) =>
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
 * (`--primary` for C4, `--accent` for sequence) that its rows inherit through
 * `currentColor`, and a glyph drawn from the kind itself: stacked frames for
 * C4's nesting, two lifelines and a message for a sequence. Not icons chosen
 * from a set — the shapes the reader is about to open.
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
  kind: "c4" | "sequence";
  accent: string;
  /** Where this section sits in the page-wide entrance cascade. */
  base: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      className="af-demo-kind af-demo-row mt-12"
      style={{ "--kind": accent, "--row": base } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <span className="af-demo-glyph text-(--kind)">
          {kind === "c4" ? <C4Glyph /> : <SequenceGlyph />}
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
