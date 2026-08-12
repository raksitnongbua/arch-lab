import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { SequenceExampleView } from "@/features/sequence/components/sequence-example-view";
import {
  listSequenceExampleIds,
  loadSequenceExample,
} from "@/features/sequence/service/example-service";

/**
 * `/view/sequence/[exampleId]` — one registered example sequence document,
 * read-only. The sequence-diagram counterpart of `/view/[modelId]`, and the
 * destination the demo index links its sequence cards at.
 *
 * Statically generated from the registry, so the set of example routes is a
 * function of the registry and adding an example needs no route edit.
 *
 * ROUTE PRECEDENCE: this nests under the static `sequence` segment, so it can
 * never collide with `/view/[modelId]` — `sequence` already wins that contest
 * (see `/view/page.tsx`), and these ids live one level deeper again.
 *
 * A parse failure renders the parser's own located message rather than a 404 or
 * a blank canvas: a broken example is a bug in this repo, and hiding it behind
 * "not found" is how it stays broken.
 */

export function generateStaticParams(): { exampleId: string }[] {
  return listSequenceExampleIds().map((exampleId) => ({ exampleId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ exampleId: string }>;
}): Promise<Metadata> {
  const { exampleId } = await params;
  const example = loadSequenceExample(exampleId);
  if (example.status !== "ok") {
    return { title: "Example not found" };
  }
  const { title, description } = example.file.metadata;
  return {
    title: `${title} — example sequence diagram`,
    description:
      description ??
      `An example sequence diagram: ${title}. Click any message, participant or branch to spotlight its flow.`,
    alternates: { canonical: `/view/sequence/${exampleId}` },
  };
}

export default async function SequenceExamplePage({
  params,
}: {
  params: Promise<{ exampleId: string }>;
}): Promise<React.JSX.Element> {
  const { exampleId } = await params;
  const example = loadSequenceExample(exampleId);

  if (example.status === "not-found") notFound();

  if (example.status === "invalid") {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8">
        <h1 className="text-2xl font-semibold text-foreground">
          This example does not parse
        </h1>
        <p className="mt-3 text-muted-foreground">
          The registered document failed the real parser. That is a bug in this
          repository, not in your browser — the message below is the
          parser&apos;s own.
        </p>
        <pre className="mt-6 overflow-x-auto rounded-lg border border-destructive/40 bg-card p-4 font-mono text-sm text-foreground">
          {example.message}
        </pre>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-sm font-semibold text-foreground">
            {example.file.metadata.title}
          </h1>
          {example.file.metadata.description !== undefined ? (
            <p className="truncate text-xs text-muted-foreground">
              {example.file.metadata.description}
            </p>
          ) : null}
        </div>
        <Link
          href="/view/sequence"
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          Write your own
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
      <SequenceExampleView file={example.file} />
    </div>
  );
}
