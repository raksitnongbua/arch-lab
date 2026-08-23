import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  listViewerModelIds,
  loadViewerModel,
  ViewerBundledView,
} from "@/features/viewer";

interface ViewPageProps {
  params: Promise<{ modelId: string }>;
}

/**
 * `c4`, `sequence`, `seq`, `flow`, `flowchart` and `uc` are RESERVED model
 * ids: they are static sibling segments (`/live/c4`, `/live/sequence`,
 * `/live/flowchart`, and the short aliases `/live/seq`, `/live/flow` and
 * `/live/uc`), and Next.js resolves a static segment before a dynamic one —
 * a bundled model registered under any of these names would build fine and
 * then silently never be reachable. Throwing at build time turns that silent
 * shadowing into a failed build.
 */
const RESERVED_MODEL_IDS = new Set([
  "c4",
  "sequence",
  "seq",
  "flow",
  "flowchart",
  "uc",
  "usecase",
]);

export function generateStaticParams(): Array<{ modelId: string }> {
  const ids = listViewerModelIds();
  for (const id of ids) {
    if (RESERVED_MODEL_IDS.has(id)) {
      throw new Error(
        `viewer model id "${id}" is reserved: /live/${id} is a static route ` +
          "and would shadow this model. Rename the model.",
      );
    }
  }
  return ids.map((modelId) => ({ modelId }));
}

export async function generateMetadata({
  params,
}: ViewPageProps): Promise<Metadata> {
  const { modelId } = await params;
  const result = loadViewerModel(modelId);
  if (result.status !== "ok") return { title: "View mode" };
  return {
    title: `${result.model.title} — example C4 model`,
    // A registered model can have an empty description; falling back keeps
    // the meta tag saying something true rather than shipping it blank.
    description:
      result.model.description !== ""
        ? result.model.description
        : `${result.model.title} — a complete example C4 architecture model, explorable from Context down to Code in the arch-lab viewer.`,
    alternates: { canonical: `/live/${modelId}` },
  };
}

export default async function ViewPage({
  params,
}: ViewPageProps): Promise<React.JSX.Element> {
  const { modelId } = await params;
  const result = loadViewerModel(modelId);

  if (result.status === "not-found") notFound();

  if (result.status === "invalid") {
    // The JSON exists but failed schema validation — say exactly why, with
    // the validator's own JSON-path message, instead of a blank canvas.
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          This model failed to load
        </h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          The model <span className="font-mono">{result.id}</span> is
          registered, but its JSON does not conform to the{" "}
          <span className="font-mono">.archlab.json</span> schema:
        </p>
        <ul className="mt-4 space-y-2">
          {result.issues.map((issue) => (
            <li
              key={`${issue.path}:${issue.message}`}
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 font-mono text-sm text-foreground"
            >
              <span className="font-medium">{issue.path}</span>: {issue.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return <ViewerBundledView model={result.model} />;
}
