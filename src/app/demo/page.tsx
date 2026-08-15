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
export default function DemoPage(): React.JSX.Element {
  const models = listViewerModels();
  const sequences = listSequenceExamples();

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Examples
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Real documents, parsed by the same reader the app uses. Open one in the
        playground and edit it as text.
      </p>

      <Section title="C4 models">
        {models.map((listing) =>
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
              meta={[
                `${listing.summary.diagramCount} diagrams`,
                `${listing.summary.nodeCount} elements`,
                `${listing.summary.edgeCount} relationships`,
              ]}
            />
          ),
        )}
      </Section>

      <Section title="Sequence diagrams">
        {sequences.map((listing) =>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="mt-10">
      <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {/* A divided list, not a grid of cards: six rows read faster than six
          boxes, and the kind headings already do the grouping a grid would. */}
      <ul className="mt-3 divide-y divide-border/60 border-y border-border/60">
        {children}
      </ul>
    </section>
  );
}

function ExampleCard({
  id,
  title,
  description,
  meta,
}: {
  id: string;
  title: string;
  description: string | null;
  meta: string[];
}): React.JSX.Element {
  return (
    <li>
      {/* The whole row is the link — one target, no separate call to action
          competing with the title above it. */}
      <Link
        href={`/view?${VIEW_EXAMPLE_PARAM}=${id}`}
        className="group flex flex-col gap-1 py-4 transition-colors hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none sm:px-2"
      >
        <span className="font-medium text-foreground group-hover:text-primary">
          {title}
        </span>
        {description === null ? null : (
          <span className="text-sm text-muted-foreground">{description}</span>
        )}
        <span className="text-xs text-muted-foreground/80">
          {meta.join(" · ")}
        </span>
      </Link>
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
