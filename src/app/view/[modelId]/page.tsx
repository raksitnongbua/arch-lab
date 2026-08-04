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

export function generateStaticParams(): Array<{ modelId: string }> {
  return listViewerModelIds().map((modelId) => ({ modelId }));
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
    alternates: { canonical: `/view/${modelId}` },
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
