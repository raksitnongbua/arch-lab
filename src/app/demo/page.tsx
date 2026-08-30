import type { Metadata } from "next";
import Link from "next/link";

import { listFlowchartExamples } from "@/features/flowchart/service/example-service";
import { VIEW_EXAMPLE_PARAM } from "@/features/playground/lib/example-param";
/* Deep-imported for the same reason the line above it is: the playground's
   barrel exports `ViewPlayground`, which is `"use client"`, and this page
   renders four headings. */
import { KIND_BLURB } from "@/features/playground/lib/kind-copy";
import type { SeedKind } from "@/features/playground/input/parse";
import { ExamplePreview } from "@/features/marketing/preview/example-preview";
import {
  exampleWireframe,
  type Wireframe,
} from "@/features/marketing/preview/wireframe";
import { listSequenceExamples } from "@/features/sequence/service/example-service";
import { listUseCaseExamples } from "@/features/usecase/service/example-service";
import { listErExamples } from "@/features/er/service/example-service";
import { listDictExamples } from "@/features/dict/service/example-service";
import { listGanttExamples } from "@/features/gantt/service/example-service";
import { listTimelineExamples } from "@/features/timeline/service/example-service";
import { listLifecycleExamples } from "@/features/lifecycle/service/example-service";
import { listViewerModels } from "@/features/viewer";
import { KIND_MARK, KIND_ORDER } from "@/components/ui/kind-mark";

export const metadata: Metadata = {
  /* NAMES THE COUNT, NOT FOUR OF THE SEVEN. The title listed four notations in
     63 characters — three over what a result shows, and two notations out of
     date the day ER and the data dictionary shipped, with no room to add them.
     The sections on this page name all nine in prose, which is where a crawler
     reads them. 50 characters. */
  title: "Examples — finished diagrams in nine notations",
  /* Measured at 156. The kind list survives here where the site description
     gave its own up, because this route's whole job is "which kinds are there,
     with worked documents" — and it is the enumeration that ranks for
     "flowchart example", then "gantt example", then "timeline" and now
     "lifecycle". "data dictionary" lost its qualifier to buy "gantt" its room,
     "use case" lost its to buy the timeline's, and "Bundled example documents"
     became "Bundled examples" to buy the lifecycle's — the noun was the only
     thing left that said nothing a reader could not see from the page. */
  description:
    "Bundled examples of all nine kinds — C4, sequence, flowchart, use case, ER, dictionary, gantt, timeline and lifecycle — parsed by the real reader. Open one.",
  alternates: { canonical: "/demo" },
};

/**
 * The example index: nine kinds, two showcased documents each.
 *
 * IT WAS A LANDING PAGE and did not need to be. Each card carried a gradient
 * hover wash, an icon tile, a "View-only" badge, four count statistics, a row
 * of level badges and its own call-to-action link — for a page whose entire
 * job is "here are nine documents, pick one". Stripping that back to plain
 * rows fixed the noise and left two problems behind, which is what this
 * revision is about.
 *
 * IT SHOWED NO DIAGRAMS. That is the one that matters. A reader arrives here
 * asking whether this thing draws the kind of picture they have in mind, and
 * nine sections of `12 steps · 14 arrows · 3 decisions` cannot answer it —
 * `purpose.md` calls a page like that out by name, because presentation is
 * what this project sells and a text index sells none of it. Every showcased
 * document now carries a `Wireframe`: its real geometry, from the real layout,
 * with the words dropped because none of them would be legible at 320px. The
 * reasoning, and why the real SVG exporter could not be used, is in
 * `features/marketing/preview/wireframe.ts`.
 *
 * IT WAS A KILOMETRE OF GREY. Nine sections of one-per-line rows is a scroll
 * nobody finishes, and the rows themselves ran four shades deep —
 * `foreground`, `muted-foreground`, then `/80` and `/60` beneath a tier that
 * is already the quiet one — so nothing in a row was loud enough to scan by.
 * The rows are a two-up card grid now, which halves the column; the shades are
 * back to two; and the primary action is no longer flung to the far right by a
 * `justify-between` inside a `max-w-4xl`, five hundred pixels from the title it
 * belonged to.
 *
 * WHAT SURVIVED, AND WHY.
 *
 *   - THE WHOLE CARD IS THE TARGET, by the same stretched-link trick the rows
 *     used (see `ExampleCard`): the anchor stays around the title so its
 *     accessible name and its focus ring are the words, and an `after` overlay
 *     grows its hit area to the card. That was right when it was a row and it
 *     is right at four times the size.
 *   - A CARD HAS ONE LINK. Both of the row's extra affordances are gone: the
 *     "Open in playground →" label, which existed because a row with a hover
 *     wash named no destination and is dead weight on a card whose picture of
 *     a diagram says the same thing; and the read-only link, which was a
 *     second target sitting on the card's whole reason to exist. Every
 *     example's read-only page is linked once per section instead, under the
 *     grid — see `ReadOnlyLinks`, and the note there about why those pages
 *     must stay linked from somewhere.
 *   - THE COUNTS STAY. They are still the only thing that separates two
 *     documents of one kind in words, and every one is counted from the parsed
 *     document rather than written by hand.
 *
 * A BROKEN EXAMPLE STAYS VISIBLE. A bundled document that fails to parse is a
 * bug in this repo, and hiding it behind a filter is how it stays one. It
 * keeps its place in the grid and says so in words.
 */

/** How many of a kind's examples the page SHOWS. See the note in DemoPage. */
const SHOWCASES_PER_KIND = 2;

/** The heading, the intro and the jump bar take the first three cascade slots. */
const ROWS_BEFORE_SECTIONS = 3;

/**
 * The nine notations, named ONCE — in the playground's `SeedKind`.
 *
 * This page kept its own copy of the union, which meant a tenth notation
 * needed the same nine strings written in two files and `KIND_BLURB` was
 * already keyed by the other one. Importing it makes the drift unwritable.
 */
type Kind = SeedKind;

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

/**
 * A showcased document with the two things only this page knows about it: its
 * slot in the entrance cascade, and its shape.
 *
 * THE WIREFRAME IS ATTACHED HERE, not in the nine `.map()` blocks that build
 * the rows, because this is where the `SHOWCASES_PER_KIND` slice has already
 * happened and where the kind is still in hand. Laying out every REGISTERED
 * example to draw two of them would be a build-time cost for pictures nobody
 * sees, and the alternative — a `wireframe:` line in each of the nine
 * blocks — is nine chances for one of them to name the wrong kind.
 */
interface Showcase {
  row: ExampleRow;
  slot: number;
  /** `null` for a broken example, and for one whose layout draws nothing. */
  wireframe: Wireframe | null;
}

/** A kind's section, with its slot in the page-wide entrance cascade. */
interface KindSection {
  kind: Kind;
  /** Heading text — plural and spelled out, unlike the jump bar's short form. */
  title: string;
  rows: Showcase[];
  /**
   * EVERY example of the kind, as its read-only page — not only the ones past
   * the showcased two.
   *
   * It listed just the overflow while each card carried its own read-only link
   * in the corner. That link is gone, and these pages are in the sitemap: this
   * line is now the only thing linking to them, and a sitemap entry with no
   * inbound link is an orphan page, which is the bug the read-only links were
   * added to fix in the first place.
   */
  readOnly: { id: string; title: string; href: string }[];
  slot: number;
}

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

  const gantt: ExampleRow[] = listGanttExamples().map((listing) =>
    listing.status === "invalid"
      ? listing
      : {
          status: "ok",
          id: listing.summary.id,
          title: listing.summary.title,
          description: listing.summary.description,
          meta: [
            `${listing.summary.taskCount} tasks`,
            listing.summary.milestoneCount === 1
              ? "1 milestone"
              : `${listing.summary.milestoneCount} milestones`,
            /* DURATION, where every other kind's third fact is a count. It is
               the number a gantt exists to produce — and it comes from the
               same forward pass the canvas draws from, never counted here. */
            `${listing.summary.dayCount} days`,
          ],
          readOnlyHref: `/live/gantt/${listing.summary.id}`,
        },
  );

  const timeline: ExampleRow[] = listTimelineExamples().map((listing) =>
    listing.status === "invalid"
      ? listing
      : {
          status: "ok",
          id: listing.summary.id,
          title: listing.summary.title,
          description: listing.summary.description,
          meta: [
            `${listing.summary.periodCount} periods`,
            `${listing.summary.eventCount} events`,
            /* HOW MUCH IS ANNOTATED, where the gantt's third fact is a
               duration and every other kind's is a count. There is no
               duration to give — nothing in this notation measures — and the
               honest second fact about a history is how much of it is
               explained. */
            `${listing.summary.annotatedCount} explained`,
          ],
          readOnlyHref: `/live/timeline/${listing.summary.id}`,
        },
  );

  const lifecycle: ExampleRow[] = listLifecycleExamples().map((listing) =>
    listing.status === "invalid"
      ? listing
      : {
          status: "ok",
          id: listing.summary.id,
          title: listing.summary.title,
          description: listing.summary.description,
          meta: [
            /* THE SUBJECT FIRST, where every other kind leads with a count.
               It is the one fact this notation has that none of the others
               do — a lifecycle is about ONE named thing — and a card that led
               with "6 states" would describe a milestone timeline. */
            listing.summary.subject,
            `${listing.summary.stateCount} states`,
            /* THE TWO KINDS OF DEPARTURE, split rather than totalled: where
               the subject can stop, and where it goes back to, are the two
               different things the branches say, and the split is exactly the
               distinction the canvas draws by shape. */
            `${listing.summary.terminalCount} end · ${listing.summary.returningCount} return`,
          ],
          readOnlyHref: `/live/lifecycle/${listing.summary.id}`,
        },
  );

  const byKind: Record<Kind, ExampleRow[]> = {
    c4,
    sequence,
    flowchart,
    usecase,
    er,
    dict,
    gantt,
    timeline,
    lifecycle,
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
      title: KIND_MARK[kind].short,
      slot: slot++,
      rows: rows.slice(0, SHOWCASES_PER_KIND).map((row) => ({
        row,
        slot: slot++,
        wireframe: row.status === "ok" ? exampleWireframe(kind, row.id) : null,
      })),
      readOnly: rows.flatMap((row) =>
        row.status === "ok"
          ? [{ id: row.id, title: row.title, href: row.readOnlyHref }]
          : [],
      ),
    };
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
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
        Real documents of all nine kinds, parsed by the same reader the app uses
        — every preview below is the document&apos;s own geometry, not a
        mock-up. Click a card to open it in the playground, where its text is
        yours to edit, or take the read-only page listed under each section,
        which is the one to send someone who only wants to look.
      </p>

      {/* A JUMP BAR, sticky under the header. Nine sections is long enough that
          "where is the flowchart one" is a real question; nine links answer it
          without the reader hunting. Plain anchors, so they work before
          hydration and survive being copied. `backdrop-blur` rather than a
          solid ground, because it passes over cards as it sticks.

          IT SCROLLS SIDEWAYS RATHER THAN WRAPPING, which it did not when it
          was built for four kinds. At nine, `flex-wrap` made it two lines on a
          laptop and five on a phone — a block of sticky chrome parked over the
          content it was meant to help the reader reach, and `scroll-mt-28`
          below only ever cleared one line of it, so a jump landed the heading
          underneath the bar that sent it there. One line is one line at every
          width, which makes that offset correct again. */}
      <nav
        aria-label="Jump to a document kind"
        className="af-demo-row sticky top-16 z-20 -mx-2 mt-8 flex [scrollbar-width:none] gap-1 overflow-x-auto rounded-lg border border-border/60 bg-background/80 px-2 py-1.5 backdrop-blur [&::-webkit-scrollbar]:hidden"
        style={{ "--row": 2 } as React.CSSProperties}
      >
        {KIND_ORDER.map((kind) => {
          const { short, accent, Glyph } = KIND_MARK[kind];
          return (
            <a
              key={kind}
              href={`#${kind}`}
              /* Each link wears its OWN section's glyph and accent — the same
                 pair that heads the section it jumps to, so the bar is a legend
                 as much as a nav. The words alone made the reader match label
                 to heading; the mark does that matching for them. The tint only
                 arrives on hover, because nine coloured icons sitting at rest
                 would compete with the cards they sit above.
                 `py-1.5` rather than `py-1`: at the old size these were 24px
                 tall, which is under every touch-target guideline going, on the
                 one control on the page a phone reader reaches for first. */
              style={{ "--kind": accent } as React.CSSProperties}
              className="group/jump flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
  const { kind, title, rows, readOnly, slot } = section;
  const { accent, Glyph } = KIND_MARK[kind];
  return (
    <section
      /* The anchor the sticky jump bar targets. `scroll-mt` clears the bar
         itself, or the heading lands underneath it. */
      id={kind}
      className="af-demo-kind af-demo-row mt-12 scroll-mt-28"
      style={{ "--kind": accent, "--row": slot } as React.CSSProperties}
    >
      {/* HEADING AND BLURB ON ONE LINE, where the blurb used to be a paragraph
          indented under the heading. Nine of those cost the page a third of a
          screen in labels for content the reader had not reached yet. The
          blurb drops below `sm`, where there is no room for it beside the
          heading and the two would wrap into the same stack it replaced. */}
      <div className="flex items-baseline gap-2.5">
        <span className="af-demo-glyph self-center text-(--kind)">
          <Glyph />
        </span>
        <h2 className="shrink-0 text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="hidden truncate text-sm text-muted-foreground sm:block">
          {KIND_BLURB[kind]}
        </p>
        {/* A rule that runs out to the edge, tinted with the kind: it is what
            makes the groups read as nine at a glance, before any word is. */}
        <span
          aria-hidden="true"
          className="h-px min-w-6 flex-1 bg-linear-to-r from-(--kind)/40 to-transparent"
        />
      </div>
      <p className="mt-1 ml-[26px] max-w-2xl text-sm text-muted-foreground sm:hidden">
        {KIND_BLURB[kind]}
      </p>
      {/* TWO UP, from one row per document. `items-start` rather than a
          stretched grid: two cards whose descriptions differ by a line should
          not both grow to the taller one's height, because the gap that
          creates under the shorter one reads as a missing element. */}
      <ul className="mt-4 grid items-start gap-4 sm:grid-cols-2">
        {rows.map(({ row, slot: rowSlot, wireframe }) =>
          row.status === "invalid" ? (
            <Broken key={row.id} id={row.id} message={row.message} />
          ) : (
            <ExampleCard
              key={row.id}
              row={row}
              slot={rowSlot}
              wireframe={wireframe}
            />
          ),
        )}
      </ul>
      <ReadOnlyLinks kindTitle={title} items={readOnly} />
    </section>
  );
}

/**
 * One example, as a card: its shape, its title, and a second link to its
 * read-only page.
 *
 * THE WHOLE CARD IS THE PRIMARY TARGET, and getting there took three tries.
 * It was the row; then it became the TITLE ONLY, because a row-wide anchor
 * cannot contain the read-only link beside it — nesting one anchor in another
 * is invalid HTML that browsers silently unnest — while the hover wash stayed
 * on the row, so the row kept advertising a target that had shrunk to a few
 * words. The fix was the stretched link, and it is the part of that revision
 * worth keeping: the anchor stays in the flow around the title, so its
 * accessible name is the title and its focus ring outlines the words, and an
 * `after` pseudo-element expands its HIT AREA to the positioned card. The
 * second link is lifted above that overlay with `z-10`. Two anchors, neither
 * inside the other, one of them the size of the card.
 *
 * THE PREVIEW IS THE AFFORDANCE now, which is what let the row's
 * "Open in playground →" label go. That label existed because a row with a
 * hover wash named no destination; a picture of the diagram, under a cursor,
 * over a card that lifts its border to the kind's own colour, does not have
 * that problem.
 *
 * THE CARD CARRIES ONE LINK, NOT TWO. The read-only page used to have a badge
 * in the preview's corner, and before that a dotted link sharing a line with
 * the counts; both put a second target on a card whose whole surface is
 * already the first one, and the badge sat on top of the picture that is the
 * card's reason to exist. Every example's read-only page is now linked once
 * per section, from `ReadOnlyLinks` under the grid — which keeps those pages
 * out of the orphan state they were in before any of these links existed,
 * without spending a second affordance per card on the quieter of two
 * destinations.
 *
 * `aria-label` puts the destination after the title rather than replacing it,
 * so the accessible name still starts with the visible words — voice control
 * matches "click Order Shop", and a screen reader hears where it goes.
 */
function ExampleCard({
  row,
  slot,
  wireframe,
}: {
  row: Extract<ExampleRow, { status: "ok" }>;
  /** Position in the page-wide cascade — drives the entrance, nothing else. */
  slot: number;
  wireframe: Wireframe | null;
}): React.JSX.Element {
  return (
    <li
      className="af-demo-row"
      style={{ "--row": slot } as React.CSSProperties}
    >
      <div className="group relative flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-colors hover:border-(--kind)/50">
        <ExamplePreview wireframe={wireframe} />
        <div className="flex flex-col gap-1 px-4 py-3.5">
          <Link
            href={`/live?${VIEW_EXAMPLE_PARAM}=${row.id}`}
            aria-label={`${row.title} — open in the playground`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
          {row.description === null ? null : (
            /* CLAMPED TO TWO LINES. These are the documents' own `description`
               metadata and one of them is a 300-character paragraph about
               MirrorMaker — accurate, and on an index it turns one card into a
               wall twice the height of the one beside it. Two lines is enough
               to tell one example from another, which is all this page has to
               do; the full text is on the page the card opens. */
            <span className="line-clamp-2 text-sm text-muted-foreground">
              {row.description}
            </span>
          )}
          {/* ONLY COUNTS. This line used to carry the read-only link too, which
              made it two things at once and put a target inside a run of prose.
              And it is `muted-foreground` flat, where it was `/80`: the page
              ran four shades deep and the bottom two were below the tier that
              is already the quiet one. */}
          <span className="mt-0.5 text-xs text-muted-foreground">
            {row.meta.join(" · ")}
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * Every example of one kind, as its crawlable read-only page.
 *
 * IT USED TO LIST ONLY THE OVERFLOW — the examples past the showcased two —
 * because each card carried its own read-only link. It carries none now, so
 * this line is the only inbound link those pages have, and every one of them
 * is in the sitemap: a sitemap entry nothing links to is an orphan page, which
 * is the bug the read-only links were added to fix.
 *
 * Not a "show more" toggle: a link a crawler cannot follow until JavaScript
 * runs is that same orphan problem wearing a different hat. Plain anchors,
 * always in the markup.
 *
 * THE LEAD-IN NAMES WHAT THEY ARE. It said "Also:" — also what, of which kind,
 * opening where? Three questions for a reader who had no reason to ask any of
 * them. And the links were a comma-separated run of 12px text, which is a row
 * of targets a few pixels tall touching each other; they are padded chips now.
 *
 * It sits BESIDE the grid rather than inside it: as an `li` among cards it was
 * a grid cell, which put it in a column half the width of the line it needs
 * and left a hole beside it.
 */
function ReadOnlyLinks({
  kindTitle,
  items,
}: {
  /** The section's own heading, so the line can name the kind it belongs to. */
  kindTitle: string;
  items: { id: string; title: string; href: string }[];
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>
        Read-only pages for every one of these {kindTitle.toLowerCase()}:
      </span>
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="-my-1 rounded px-1.5 py-1 underline decoration-dotted underline-offset-2 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {item.title}
        </Link>
      ))}
    </div>
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
    <li className="rounded-xl border border-destructive/40 px-4 py-4">
      <span className="font-medium text-destructive">{id}</span>
      <span className="mt-1 block font-mono text-xs text-muted-foreground">
        {message}
      </span>
    </li>
  );
}
