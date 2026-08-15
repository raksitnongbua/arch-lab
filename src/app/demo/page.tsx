import type { Metadata } from "next";
import { ArrowRight, Eye, Layers, Workflow } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listSequenceExamples } from "@/features/sequence/service/example-service";
import { listViewerModels } from "@/features/viewer";
import { EDITOR_ENABLED, LEVEL_META_BY_LEVEL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Live demo — example C4 models and sequence diagrams",
  description:
    "Read-only examples of both document kinds: C4 models you can drill from Context down to Code, and sequence diagrams you can click to spotlight a flow. Every example is plain text, parsed by the real reader.",
  alternates: { canonical: "/demo" },
};

/**
 * The demo index: no canvas here any more. A short intro plus one card per
 * model the viewer service knows about, each linking into `/view/[modelId]`.
 * Every number on a card is counted from the parsed model, not hand-written.
 */
export default function DemoPage(): React.JSX.Element {
  const listings = listViewerModels();
  const sequenceListings = listSequenceExamples();

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <Badge variant="accent" className="mb-6">
        <span className="size-1.5 rounded-full bg-accent" />
        Live demo · read-only examples
      </Badge>

      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        Real models, in view mode
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
        Every example below is a real document, stored as plain text and parsed
        by the same reader the app uses — so nothing here renders that a file of
        your own could not. Open one to explore it read-only.
      </p>

      {/* ---- C4 models -------------------------------------------------------
          The page SECTIONS itself by document kind, and each section is driven
          by its own registry: adding an example, or a whole new kind, changes a
          registry rather than this page. That is the same promise the cards
          make about their numbers — everything on screen is derived, not
          written here by hand. */}
      <section aria-labelledby="c4-examples-heading" className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2
            id="c4-examples-heading"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            C4 models
          </h2>
          <p className="text-sm text-muted-foreground">
            Structure — click a numbered node to zoom from Context down to Code,
            and Escape to step back out.
          </p>
        </div>

        <ul className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {listings.map((listing) => {
            if (listing.status === "invalid") {
              // Broken JSON is shown honestly — validator message included.
              return (
                <li key={listing.id} className="flex">
                  <Card className="flex w-full flex-col border-dashed">
                    <CardHeader className="gap-3">
                      <Badge variant="outline">Failed to load</Badge>
                      <CardTitle className="font-mono text-lg">
                        {listing.id}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs">
                        {listing.message}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              );
            }

            const { summary } = listing;
            return (
              <li key={summary.id} className="flex">
                <Card className="group relative flex w-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/6 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <CardHeader className="relative gap-4 sm:p-8">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                        <Layers aria-hidden="true" className="size-5" />
                      </span>
                      <Badge variant="accent">
                        <Eye aria-hidden="true" className="size-3" />
                        View-only
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <CardTitle className="text-xl leading-tight">
                        {summary.title}
                      </CardTitle>
                      <CardDescription className="max-w-xl text-base">
                        {summary.description}
                      </CardDescription>
                    </div>

                    {/* Real counts, straight from the parsed model. */}
                    <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border/60 pt-4">
                      <CountStat
                        value={summary.levels.length}
                        label={`C4 level${summary.levels.length === 1 ? "" : "s"}`}
                      />
                      <CountStat
                        value={summary.diagramCount}
                        label="diagrams"
                      />
                      <CountStat value={summary.nodeCount} label="elements" />
                      <CountStat
                        value={summary.edgeCount}
                        label="relationships"
                      />
                    </dl>
                    <ul className="flex flex-wrap gap-1.5">
                      {summary.levels.map((level) => {
                        const meta = LEVEL_META_BY_LEVEL[level];
                        return (
                          <li key={level}>
                            <Badge variant="outline">
                              <span className="font-mono">L{meta.order}</span>
                              {meta.label}
                            </Badge>
                          </li>
                        );
                      })}
                    </ul>

                    <Link
                      href={`/view/${summary.id}`}
                      className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors group-hover:text-primary/90 after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Open in view mode
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </CardHeader>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---- sequence diagrams ---------------------------------------------- */}
      <section aria-labelledby="sequence-examples-heading" className="mt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2
            id="sequence-examples-heading"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            Sequence diagrams
          </h2>
          <p className="text-sm text-muted-foreground">
            Behaviour over time — click a message, participant or branch to
            spotlight its flow.
          </p>
        </div>

        <ul className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sequenceListings.map((listing) => {
            if (listing.status === "invalid") {
              // Same honesty as a broken model: the parser's own located
              // message, on a visible card, rather than a missing one.
              return (
                <li key={listing.id} className="flex">
                  <Card className="flex w-full flex-col border-dashed">
                    <CardHeader className="gap-3">
                      <Badge variant="outline">Failed to parse</Badge>
                      <CardTitle className="font-mono text-lg">
                        {listing.id}
                      </CardTitle>
                      <CardDescription className="font-mono text-xs">
                        {listing.message}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              );
            }

            const { summary } = listing;
            return (
              <li key={summary.id} className="flex">
                <Card className="group relative flex w-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent/8 via-transparent to-primary/6 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <CardHeader className="relative gap-4 sm:p-8">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
                        <Workflow aria-hidden="true" className="size-5" />
                      </span>
                      <Badge variant="accent">
                        <Eye aria-hidden="true" className="size-3" />
                        View-only
                      </Badge>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <CardTitle className="text-xl leading-tight">
                        {summary.title}
                      </CardTitle>
                      <CardDescription className="max-w-xl text-base">
                        {summary.blurb}
                      </CardDescription>
                    </div>

                    {/* Counted from the parsed document, like the C4 cards. */}
                    <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border/60 pt-4">
                      <CountStat
                        value={summary.participantCount}
                        label="participants"
                      />
                      <CountStat
                        value={summary.messageCount}
                        label="messages"
                      />
                      <CountStat
                        value={summary.fragmentKinds.length}
                        label="fragment kinds"
                      />
                    </dl>
                    <ul className="flex flex-wrap gap-1.5">
                      {summary.fragmentKinds.map((kind) => (
                        <li key={kind}>
                          <Badge variant="outline">
                            <span className="font-mono">{kind}</span>
                          </Badge>
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={`/view/sequence/${summary.id}`}
                      className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors group-hover:text-primary/90 after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Open in view mode
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </CardHeader>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-10 text-sm leading-relaxed text-muted-foreground">
        Have a model of your own? Paste it —{" "}
        <span className="font-mono text-foreground">.archlab.json</span> or
        Mermaid C4 code — into{" "}
        <Link href="/view" className="font-medium text-primary hover:underline">
          view mode
        </Link>{" "}
        to render it right here in the browser, or write a sequence document in{" "}
        <Link
          href="/view/sequence"
          className="font-medium text-primary hover:underline"
        >
          the sequence playground
        </Link>
        .{" "}
        {EDITOR_ENABLED ? (
          <>
            Want to change something? These examples are read-only — head to the{" "}
            <Link
              href="/editor"
              className="font-medium text-primary hover:underline"
            >
              editor
            </Link>{" "}
            to build a model of your own.
          </>
        ) : (
          <>
            Want to change something? These examples are read-only, and the
            editor that builds models like these is coming soon.
          </>
        )}
      </p>
    </div>
  );
}

function CountStat({
  value,
  label,
}: {
  value: number;
  label: string;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="order-2 text-xs text-muted-foreground">{label}</dt>
      <dd className="order-1 text-lg font-semibold text-foreground tabular-nums">
        {value}
      </dd>
    </div>
  );
}
