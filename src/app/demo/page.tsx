import type { Metadata } from "next";
import Link from "next/link";

import { listFlowchartExamples } from "@/features/flowchart/service/example-service";
import { VIEW_EXAMPLE_PARAM } from "@/features/playground/lib/example-param";
/* Deep-imported for the same reason the line above it is: the playground's
   barrel exports `ViewPlayground`, which is `"use client"`, and this page
   renders four headings. */
import { KIND_BLURB } from "@/features/playground/lib/kind-copy";
import { listSequenceExamples } from "@/features/sequence/service/example-service";
import { listUseCaseExamples } from "@/features/usecase/service/example-service";
import { listErExamples } from "@/features/er/service/example-service";
import { listDictExamples } from "@/features/dict/service/example-service";
import { listViewerModels } from "@/features/viewer";

export const metadata: Metadata = {
  /* NAMES THE COUNT, NOT FOUR OF THE SIX. The title listed four notations in 63
     characters — three over what a result shows, and two notations out of date
     the day ER and the data dictionary shipped, with no room to add them. The
     sections on this page name all six in prose, which is where a crawler reads
     them. 48 characters. */
  title: "Examples — finished diagrams in six notations",
  description:
    "Bundled example documents of all six kinds — C4, sequence, flowchart, use case, ER, data dictionary — each parsed by the real reader. Open one and edit it.",
  alternates: { canonical: "/demo" },
};

/**
 * The example index: six kinds, two showcased documents each.
 *
 * IT WAS A LANDING PAGE and did not need to be. Each card carried a gradient
 * hover wash, an icon tile, a "View-only" badge, four count statistics, a row
 * of level badges and its own call-to-action link — for a page whose entire
 * job is "here are eight documents, pick one".
 *
 * THEN IT BECAME HARD TO CLICK AND HARD TO READ, which is the failure this
 * revision is about, and both halves came from the same root: the page knew
 * what it meant and never said it.
 *
 *   1. THE ROW LOOKED LIKE THE TARGET AND WAS NOT. Hovering anywhere in a row
 *      washed the whole row, but only the title text was a link — so the
 *      description, the counts and the empty two thirds to the right of the
 *      title all invited a click and swallowed it. That is worse than an
 *      obviously small target: the affordance promised a hit area that did not
 *      exist. The row is now one link, stretched over the whole row with an
 *      `after` overlay (see `ExampleRowItem`), which is what makes a full-row
 *      target legal without nesting one anchor inside another.
 *   2. NOTHING SAID WHERE A CLICK WENT. The title opened the editable
 *      playground and a 12px dotted link beside the counts opened the
 *      crawlable read-only page, and the page never named either. Every row
 *      now shows "Open in playground" against its own kind's accent, the
 *      second link reads "Read-only page" and is padded to a real target, and
 *      the intro says which is which once, in prose, instead of leaving it to
 *      be inferred.
 *   3. THE KIND HEADINGS WERE FINE PRINT. Four sections were separated by
 *      12px uppercase muted labels — quieter than the rows they governed, so
 *      the page read as one long list. Each is now a real heading carrying
 *      `KIND_BLURB`, the same sentence the playground's starter buttons use:
 *      "Use cases" tells a newcomer nothing, "who can do what at the system's
 *      edge" tells them whether to keep reading.
 *
 * The counts stay, in one line rather than four blocks: they are the only
 * thing that distinguishes one document from another at a glance, and every
 * one is counted from the parsed document rather than written by hand.
 *
 * A BROKEN EXAMPLE STAYS VISIBLE. A bundled document that fails to parse is a
 * bug in this repo, and hiding it behind a filter is how it stays one.
 */

/** How many of a kind's examples the page SHOWS. See the note in DemoPage. */
const SHOWCASES_PER_KIND = 2;

/** The heading, the intro and the jump bar take the first three cascade slots. */
const ROWS_BEFORE_SECTIONS = 3;

type Kind = "c4" | "sequence" | "flowchart" | "usecase" | "er" | "dict";

/**
 * One showcased document, already resolved out of its kind's listing type.
 *
 * The four services return four different summaries — `nodeCount` here,
 * `participantCount` there — so the kind-specific reading happens once, in
 * `DemoPage`, and everything below this line renders one shape. The four
 * near-identical `.map()` blocks this replaces had drifted in exactly the way
 * copies do: three of them passed `row={base + row + n}` with a different `n`.
 */
type ExampleRow =
  | {
      status: "ok";
      id: string;
      title: string;
      description: string | null;
      /** Counted facts about the parsed document, joined with a middot. */
      meta: string[];
      /** The example's crawlable read-only page — see the note on the link. */
      readOnlyHref: string;
    }
  | { status: "invalid"; id: string; message: string };

/** A kind's section, with its slot in the page-wide entrance cascade. */
interface KindSection {
  kind: Kind;
  /** Heading text — plural and spelled out, unlike the jump bar's short form. */
  title: string;
  rows: { row: ExampleRow; slot: number }[];
  /** The examples past the showcased two, as read-only pages. */
  overflow: { id: string; title: string; href: string }[];
  slot: number;
}

/**
 * Each kind's mark and colour, in ONE table.
 *
 * It was two: an array of four tuples for the jump bar and a four-branch
 * ternary inside the section heading, which is two places to edit a colour and
 * two chances for the bar to stop being the legend it is meant to be.
 */
const KIND_CHROME: Record<
  Kind,
  { short: string; accent: string; Glyph: () => React.JSX.Element }
> = {
  c4: { short: "C4 models", accent: "var(--primary)", Glyph: C4Glyph },
  sequence: {
    short: "Sequence diagrams",
    accent: "var(--accent)",
    Glyph: SequenceGlyph,
  },
  flowchart: {
    short: "Flowcharts",
    accent: "var(--flow-decision-border)",
    Glyph: FlowchartGlyph,
  },
  usecase: {
    short: "Use cases",
    accent: "var(--uc-actor-border)",
    Glyph: UseCaseGlyph,
  },
  er: {
    short: "ER diagrams",
    accent: "var(--node-database-border)",
    Glyph: ErGlyph,
  },
  dict: {
    short: "Data dictionaries",
    accent: "var(--node-queue-border)",
    Glyph: DictGlyph,
  },
};

/** The order the sections render and the jump bar lists them in. */
const KIND_ORDER: readonly Kind[] = [
  "c4",
  "sequence",
  "flowchart",
  "usecase",
  "er",
  "dict",
] as const;

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
  const c4: ExampleRow[] = listViewerModels().map((listing) =>
    listing.status === "invalid"
      ? listing
      : {
          status: "ok",
          id: listing.summary.id,
          title: listing.summary.title,
          description: listing.summary.description,
          meta: [
            `${listing.summary.diagramCount} diagrams`,
            `${listing.summary.nodeCount} elements`,
            `${listing.summary.edgeCount} relationships`,
          ],
          readOnlyHref: `/live/${listing.summary.id}`,
        },
  );

  const sequence: ExampleRow[] = listSequenceExamples().map((listing) =>
    listing.status === "invalid"
      ? listing
      : {
          status: "ok",
          id: listing.summary.id,
          title: listing.summary.title,
          description: listing.summary.description,
          meta: [
            `${listing.summary.participantCount} participants`,
            `${listing.summary.messageCount} messages`,
          ],
          readOnlyHref: `/live/sequence/${listing.summary.id}`,
        },
  );

  const flowchart: ExampleRow[] = listFlowchartExamples().map((listing) =>
    listing.status === "invalid"
      ? listing
      : {
          status: "ok",
          id: listing.summary.id,
          title: listing.summary.title,
          description: listing.summary.description,
          meta: [
            `${listing.summary.nodeCount} steps`,
            `${listing.summary.edgeCount} arrows`,
            `${listing.summary.decisionCount} decisions`,
          ],
          readOnlyHref: `/live/flowchart/${listing.summary.id}`,
        },
  );

  const usecase: ExampleRow[] = listUseCaseExamples().map((listing) =>
    listing.status === "invalid"
      ? listing
      : {
          status: "ok",
          id: listing.summary.id,
          title: listing.summary.title,
          description: listing.summary.description,
          meta: [
            `${listing.summary.actorCount} actors`,
            `${listing.summary.useCaseCount} use cases`,
            listing.summary.boundaryCount === 1
              ? "1 boundary"
              : `${listing.summary.boundaryCount} boundaries`,
          ],
          readOnlyHref: `/live/usecase/${listing.summary.id}`,
        },
  );

  const er: ExampleRow[] = listErExamples().map((listing) =>
    listing.status === "invalid"
      ? listing
      : {
          status: "ok",
          id: listing.summary.id,
          title: listing.summary.title,
          description: listing.summary.description,
          meta: [
            `${listing.summary.entityCount} tables`,
            `${listing.summary.columnCount} columns`,
            listing.summary.relationshipCount === 1
              ? "1 relationship"
              : `${listing.summary.relationshipCount} relationships`,
          ],
          readOnlyHref: `/live/er/${listing.summary.id}`,
        },
  );

  const dict: ExampleRow[] = listDictExamples().map((listing) =>
    listing.status === "invalid"
      ? listing
      : {
          status: "ok",
          id: listing.summary.id,
          title: listing.summary.title,
          description: listing.summary.description,
          meta: [
            `${listing.summary.sectionCount} sections`,
            `${listing.summary.fieldCount} fields`,
            /* Coverage, not a raw count — it is the number that says whether
               an example is a dictionary or a schema dump. */
            `${listing.summary.describedCount} described`,
          ],
          readOnlyHref: `/live/dict/${listing.summary.id}`,
        },
  );

  const byKind: Record<Kind, ExampleRow[]> = {
    c4,
    sequence,
    flowchart,
    usecase,
    er,
    dict,
  };

  /*
   * ONE RUNNING COUNTER for the entrance, not per-section arithmetic.
   *
   * The slots used to be spelled out per section as `C4_BASE + models.length +
   * sequences.length + 2`, which counted every REGISTERED example while the
   * page renders only two per kind — so the last section's rows waited on
   * slots for rows that were never drawn, and the cascade had visible holes in
   * it. Counting the elements actually rendered cannot drift from what is on
   * screen.
   */
  let slot = ROWS_BEFORE_SECTIONS;
  const sections: KindSection[] = KIND_ORDER.map((kind) => {
    const rows = byKind[kind];
    return {
      kind,
      title: KIND_CHROME[kind].short,
      slot: slot++,
      rows: rows
        .slice(0, SHOWCASES_PER_KIND)
        .map((row) => ({ row, slot: slot++ })),
      overflow: rows
        .slice(SHOWCASES_PER_KIND)
        .flatMap((row) =>
          row.status === "ok"
            ? [{ id: row.id, title: row.title, href: row.readOnlyHref }]
            : [],
        ),
    };
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 sm:py-16">
      <h1
        className="af-demo-row text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        style={{ "--row": 0 } as React.CSSProperties}
      >
        Examples
      </h1>
      {/* THE TWO LINKS ARE EXPLAINED HERE, ONCE. Every row carries both, and a
          reader cannot be expected to infer the difference between an editable
          playground and a static page from two link labels. Said in prose at
          the top, the rows themselves need only name their destinations. */}
      <p
        className="af-demo-row mt-3 max-w-2xl text-muted-foreground"
        style={{ "--row": 1 } as React.CSSProperties}
      >
        Real documents of all six kinds, parsed by the same reader the app uses.
        Click a row to open it in the playground, where its text is yours to
        edit — or take the read-only page beside it, which is the one to send
        someone who only wants to look.
      </p>

      {/* A JUMP BAR, sticky under the header. Four sections of two rows is
          short enough to scroll and long enough that "where is the flowchart
          one" is a real question; four links answer it without the reader
          hunting. Plain anchors, so they work before hydration and survive
          being copied. `backdrop-blur` rather than a solid ground, because it
          passes over rows as it sticks. */}
      <nav
        aria-label="Jump to a document kind"
        className="af-demo-row sticky top-16 z-20 -mx-2 mt-8 flex flex-wrap gap-1 rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 backdrop-blur"
        style={{ "--row": 2 } as React.CSSProperties}
      >
        {KIND_ORDER.map((kind) => {
          const { short, accent, Glyph } = KIND_CHROME[kind];
          return (
            <a
              key={kind}
              href={`#${kind}`}
              /* Each link wears its OWN section's glyph and accent — the same
                 pair that heads the section it jumps to, so the bar is a legend
                 as much as a nav. Four words alone made the reader match label
                 to heading; the mark does that matching for them. The tint only
                 arrives on hover, because four coloured icons sitting at rest
                 would compete with the rows they sit above.
                 `py-1.5` rather than `py-1`: at the old size these were 24px
                 tall, which is under every touch-target guideline going, on the
                 one control on the page a phone reader reaches for first. */
              style={{ "--kind": accent } as React.CSSProperties}
              className="group/jump flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="text-muted-foreground/70 transition-colors group-hover/jump:text-(--kind)">
                <Glyph />
              </span>
              {short}
            </a>
          );
        })}
      </nav>

      {sections.map((section) => (
        <Section key={section.kind} section={section} />
      ))}
    </div>
  );
}

/**
 * One kind of document, with its own colour, its own glyph and its own reason
 * to exist.
 *
 * THE GROUPING IS THE POINT of this page — a C4 model and a sequence diagram
 * are different things to look at, and a heading alone made them read as one
 * list with a label in the middle. Each section carries an accent
 * (`--primary` for C4, `--accent` for sequence, and a kind-specific canvas
 * colour for the other two) that its rows inherit through `currentColor`, and
 * a glyph drawn from the kind itself: stacked frames for C4's nesting, two
 * lifelines and a message for a sequence, a rhombus for a flowchart, an actor
 * against an ellipse for a use case. Not icons chosen from a set — the shapes
 * the reader is about to open.
 *
 * THE HEADING IS A HEADING NOW. It was 12px uppercase `muted-foreground`,
 * which set the page's own structure below the rows in the visual order and
 * left four sections reading as one list. It is `text-base` on `foreground`,
 * with `KIND_BLURB` under it: the section says what it is for before the
 * reader has to open something to find out.
 *
 * The tint is applied through `text-(--kind)` on the section, so a row's
 * connector picks it up without either of them naming a colour.
 */
function Section({ section }: { section: KindSection }): React.JSX.Element {
  const { kind, title, rows, overflow, slot } = section;
  const { accent, Glyph } = KIND_CHROME[kind];
  return (
    <section
      /* The anchor the sticky jump bar targets. `scroll-mt` clears the bar
         itself, or the heading lands underneath it. */
      id={kind}
      className="af-demo-kind af-demo-row mt-12 scroll-mt-28"
      style={{ "--kind": accent, "--row": slot } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <span className="af-demo-glyph text-(--kind)">
          <Glyph />
        </span>
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {/* A rule that runs out to the edge, tinted with the kind: it is what
            makes the groups read as four at a glance, before any word is. */}
        <span
          aria-hidden="true"
          className="h-px flex-1 bg-linear-to-r from-(--kind)/40 to-transparent"
        />
      </div>
      <p className="mt-1 ml-[26px] max-w-2xl text-sm text-muted-foreground">
        {KIND_BLURB[kind]}
      </p>
      <ul className="mt-3 divide-y divide-border/60">
        {rows.map(({ row, slot: rowSlot }) =>
          row.status === "invalid" ? (
            <Broken key={row.id} id={row.id} message={row.message} />
          ) : (
            <ExampleRowItem key={row.id} row={row} slot={rowSlot} />
          ),
        )}
        <AlsoLinks kindTitle={title} items={overflow} />
      </ul>
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
/** An ER diagram: two tables, ruled under their headers, and the line
 * between them ending in a crow's foot. */
/** A dictionary: a heading rule and three ruled rows — a table of text. */
function DictGlyph(): React.JSX.Element {
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
      <path d="M2 3.5h12M2 6.6h5M9.6 6.6h4.4M2 9.5h5M9.6 9.5h4.4M2 12.4h5M9.6 12.4h4.4" />
    </svg>
  );
}

function ErGlyph(): React.JSX.Element {
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
      <rect x="1" y="3" width="5.2" height="6" rx="1" />
      <path d="M1 5.2h5.2" />
      <rect x="9.8" y="7" width="5.2" height="6" rx="1" />
      <path d="M9.8 9.2h5" />
      <path d="M6.2 6.1h1.8v3.9h1.8M8 8.6l1.8 1.4M8 11.4l1.8-1.4" />
    </svg>
  );
}

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

/**
 * One example, as a row-sized link to the playground with a second, smaller
 * link to its read-only page.
 *
 * THE WHOLE ROW IS THE PRIMARY TARGET, and getting there took two tries. It
 * was the row, then it became the TITLE ONLY because a row-wide anchor cannot
 * contain the read-only link beside it — nesting one anchor in another is
 * invalid HTML that browsers silently unnest. But the hover wash stayed on the
 * row, so the row kept advertising a target that had shrunk to a few words:
 * clicking the description, the counts, or the empty space to the right did
 * nothing at all.
 *
 * The fix is the stretched link: the anchor stays in the flow around the title
 * (so its accessible name is the title and its focus ring outlines the words),
 * and an `after` pseudo-element expands its HIT AREA to the positioned row.
 * The second link is lifted above that overlay with `relative z-10`. Two
 * anchors, neither inside the other, one of them the size of the row.
 *
 * `aria-label` puts the destination after the title rather than replacing it,
 * so the accessible name still starts with the visible words — voice control
 * matches "click Order Shop", and a screen reader hears where it goes.
 */
function ExampleRowItem({
  row,
  slot,
}: {
  row: Extract<ExampleRow, { status: "ok" }>;
  /** Position in the page-wide cascade — drives the entrance, nothing else. */
  slot: number;
}): React.JSX.Element {
  return (
    <li
      className="af-demo-row"
      style={{ "--row": slot } as React.CSSProperties}
    >
      <div className="group relative flex flex-col gap-1 rounded-md px-3 py-4 transition-colors hover:bg-secondary/40">
        <div className="flex items-baseline justify-between gap-4">
          <Link
            href={`/live?${VIEW_EXAMPLE_PARAM}=${row.id}`}
            aria-label={`${row.title} — open in the playground`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="flex items-center gap-0 text-(--kind)">
              {/* Grows out of nothing on hover and meets the title — the
                  gesture a diagram is made of, rather than an underline. */}
              <span
                aria-hidden="true"
                className="af-demo-tick h-px bg-current"
              />
              <span className="font-medium text-foreground transition-[margin,color] duration-200 group-hover:ml-2 group-hover:text-(--kind)">
                {row.title}
              </span>
            </span>
          </Link>
          {/* WHERE THE CLICK GOES, in words, on the row it belongs to. The row
              had a hover wash and a growing tick and named no destination, so
              the one thing a reader needed to know was the one thing the row
              would not say. Decorative to assistive tech — the link's own
              `aria-label` already carries it, and hearing it twice per row is
              worse than not seeing it. */}
          <span
            aria-hidden="true"
            className="shrink-0 text-xs whitespace-nowrap text-muted-foreground/60 transition-colors group-hover:text-(--kind)"
          >
            Open in playground →
          </span>
        </div>
        {row.description === null ? null : (
          /* CLAMPED TO TWO LINES. These are the documents' own `description`
             metadata and one of them is a 300-character paragraph about
             MirrorMaker — accurate, and on an index it turns a row into a wall
             that buries the two rows under it. Two lines is enough to tell one
             example from another, which is all this page has to do; the full
             text is on the page the row opens. */
          <span className="line-clamp-2 max-w-2xl text-sm text-muted-foreground">
            {row.description}
          </span>
        )}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
          <span>{row.meta.join(" · ")}</span>
          {/* The read-only page for this example. It carries its own title,
              description and social card and is the only CRAWLABLE rendering
              of the document — the playground renders nothing server-side for
              a search engine to read. Before this link the examples were in
              the sitemap with no inbound link at all, which is the definition
              of an orphan page.
              STILL QUIET, BUT NOW HITTABLE: it is padded to a real target and
              lifted above the row's overlay, where before it was a 12px run of
              text sharing a line with the counts, easier to miss than to hit.
              And it says "page", not "view" — "read-only view" read as a mode
              of the thing you were already looking at. */}
          <Link
            href={row.readOnlyHref}
            className="relative z-10 -my-1 rounded px-1.5 py-1 underline decoration-dotted underline-offset-2 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Read-only page
          </Link>
        </span>
      </div>
    </li>
  );
}

/**
 * The examples this page does not showcase, as read-only pages.
 *
 * Not a "show more" toggle: every one of these has a crawlable read-only page
 * listed in the sitemap, and a link a crawler cannot follow until JavaScript
 * runs is the orphan-page problem the read-only links exist to solve. Plain
 * anchors, always in the markup.
 *
 * THE LEAD-IN NAMES WHAT THEY ARE. It said "Also:" — also what, of which kind,
 * opening where? Three questions for a reader who had no reason to ask any of
 * them. And the links were a comma-separated run of 12px text, which is a row
 * of targets a few pixels tall touching each other; they are padded chips now,
 * for the same reason the read-only link above is.
 */
function AlsoLinks({
  kindTitle,
  items,
}: {
  /** The section's own heading, so the line can name the kind it belongs to. */
  kindTitle: string;
  items: { id: string; title: string; href: string }[];
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pt-3 text-xs text-muted-foreground">
      <span>More {kindTitle.toLowerCase()}, as read-only pages:</span>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="-my-1 rounded px-1.5 py-1 underline decoration-dotted underline-offset-2 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {item.title}
        </Link>
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
    <li className="px-3 py-4">
      <span className="font-medium text-destructive">{id}</span>
      <span className="mt-1 block font-mono text-xs text-muted-foreground">
        {message}
      </span>
    </li>
  );
}
