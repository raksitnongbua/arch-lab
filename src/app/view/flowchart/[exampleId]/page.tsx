import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { FlowchartExampleView } from "@/features/flowchart/components/flowchart-example-view";
import {
  listFlowchartExampleIds,
  loadFlowchartExample,
} from "@/features/flowchart/service/example-service";
import { VIEW_EXAMPLE_PARAM } from "@/features/playground/lib/example-param";

/**
 * `/view/flowchart/[exampleId]` — one registered example flowchart, read-only.
 * The flowchart counterpart of `/view/[modelId]` and
 * `/view/sequence/[exampleId]`, and the destination the demo index links its
 * flowchart cards at.
 *
 * Statically generated from the registry, so the set of example routes is a
 * function of the registry and adding an example needs no route edit.
 *
 * WHY THE LONG SEGMENT, when new share links mint against bare `/view` and the
 * seed alias is the short `/view/flow`: nothing is ever minted against THIS
 * path — it is a crawlable page a human or a search engine follows a link to,
 * so the readable word beats the four characters. `/view/flow` stays the
 * alias-forward trampoline and is a different route from this one; they cannot
 * collide, because this nests one level deeper under a distinct segment.
 *
 * ROUTE PRECEDENCE: this nests under the static `flowchart` segment, so it can
 * never collide with `/view/[modelId]` — a static segment wins that contest,
 * and `RESERVED_MODEL_IDS` in `/view/[modelId]/page.tsx` throws at build time
 * if a model ever claims the same word.
 *
 * A parse failure renders the parser's own located message rather than a 404 or
 * a blank canvas: a broken example is a bug in this repo, and hiding it behind
 * "not found" is how it stays broken.
 */

export function generateStaticParams(): { exampleId: string }[] {
  return listFlowchartExampleIds().map((exampleId) => ({ exampleId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ exampleId: string }>;
}): Promise<Metadata> {
  const { exampleId } = await params;
  const example = loadFlowchartExample(exampleId);
  if (example.status !== "ok") {
    return { title: "Example not found" };
  }
  const { title, description } = example.file.metadata;
  return {
    title: `${title} — example flowchart`,
    description:
      description ??
      `An example flowchart: ${title}. Click any step or branch to spotlight its path.`,
    alternates: { canonical: `/view/flowchart/${exampleId}` },
  };
}

export default async function FlowchartExamplePage({
  params,
}: {
  params: Promise<{ exampleId: string }>;
}): Promise<React.JSX.Element> {
  const { exampleId } = await params;
  const example = loadFlowchartExample(exampleId);

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
        {/* A plain link naming the example in six characters, not a compressed
            hand-off: the URL stays short, the playground renders it
            SERVER-SIDE, and it works with JavaScript disabled — none of which
            a fragment can do, since a fragment never reaches the server. */}
        <Link
          href={`/view?${VIEW_EXAMPLE_PARAM}=${exampleId}`}
          className={buttonClasses({ variant: "outline", size: "sm" })}
        >
          Open in the playground
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
      <FlowchartExampleView file={example.file} />
    </div>
  );
}
