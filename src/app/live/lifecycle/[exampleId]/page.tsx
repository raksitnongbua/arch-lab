import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { LifecycleExampleView } from "@/features/lifecycle/components/lifecycle-example-view";
import {
  listLifecycleExampleIds,
  loadLifecycleExample,
} from "@/features/lifecycle/service/example-service";
import { VIEW_EXAMPLE_PARAM } from "@/features/playground/lib/example-param";

/**
 * `/live/lifecycle/[exampleId]` — one registered example lifecycle,
 * read-only. The lifecycle counterpart of `/live/[modelId]`,
 * `/live/sequence/[exampleId]`, `/live/flowchart/[exampleId]`,
 * `/live/usecase/[exampleId]`, `/live/er/[exampleId]`,
 * `/live/dict/[exampleId]`, `/live/gantt/[exampleId]` and
 * `/live/timeline/[exampleId]`, and the destination the demo index links its
 * lifecycle cards at.
 *
 * Statically generated from the registry, so the set of example routes is a
 * function of the registry and adding an example needs no route edit.
 *
 * WHY THE READABLE WORD HERE AND `lc` NEXT DOOR: nothing is ever minted
 * against this path — it is a crawlable page a human or a search engine
 * follows a link to, so the word beats the two characters. The short alias
 * exists for a URL someone types; this one exists for a URL someone reads.
 *
 * ROUTE PRECEDENCE: this nests under the static `lifecycle` segment, so it can
 * never collide with `/live/[modelId]` — a static segment wins that contest,
 * and it is a different route from the `/live/lifecycle` alias, which is that
 * segment exactly.
 *
 * A parse failure renders the parser's own located message rather than a 404 or
 * a blank canvas: a broken example is a bug in this repo, and hiding it behind
 * "not found" is how it stays broken.
 */

export function generateStaticParams(): { exampleId: string }[] {
  return listLifecycleExampleIds().map((exampleId) => ({ exampleId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ exampleId: string }>;
}): Promise<Metadata> {
  const { exampleId } = await params;
  const example = loadLifecycleExample(exampleId);
  if (example.status !== "ok") {
    return { title: "Example not found" };
  }
  const { title, description } = example.file.metadata;
  return {
    title: `${title} — example lifecycle`,
    description:
      description ??
      `An example lifecycle: ${title}. Click any state to light it and its ways out.`,
    alternates: { canonical: `/live/lifecycle/${exampleId}` },
  };
}

export default async function LifecycleExamplePage({
  params,
}: {
  params: Promise<{ exampleId: string }>;
}): Promise<React.JSX.Element> {
  const { exampleId } = await params;
  const example = loadLifecycleExample(exampleId);

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
        {/* A plain link naming the example in a handful of characters, not a
            compressed hand-off: the URL stays short, the playground renders it
            SERVER-SIDE, and it works with JavaScript disabled — none of which
            a fragment can do, since a fragment never reaches the server. */}
        <Link
          href={`/live?${VIEW_EXAMPLE_PARAM}=${exampleId}`}
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          Open in the playground
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
      <LifecycleExampleView file={example.file} />
    </div>
  );
}
