import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";
import { listViewerModelIds } from "@/features/viewer";

/**
 * `/view/[modelId]` — a forwarding alias for the bundled-model viewer, which
 * now lives at `/live/[modelId]`.
 *
 * A CRAWLED PAGE, not just a bookmark: every registered model is in the
 * sitemap and linked from `/demo`, so the rename without a trampoline here
 * would hand a search engine a set of 404s. The canonical on the `/live` twin
 * plus `noindex` here is what moves the standing across.
 *
 * The ids come from the same registry the real page's `generateStaticParams`
 * reads, so this forwarding surface cannot fall behind the models that exist.
 * The reserved-id throw stays on the real page only — it is a build-time guard
 * against a model shadowing a static sibling, and one copy of it is enough.
 */
export function generateStaticParams(): Array<{ modelId: string }> {
  return listViewerModelIds().map((modelId) => ({ modelId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ modelId: string }>;
}): Promise<Metadata> {
  const { modelId } = await params;
  return {
    title: "Example moved to /live",
    alternates: { canonical: `/live/${modelId}` },
    robots: { index: false },
  };
}

export default async function LegacyViewModelPage({
  params,
}: {
  params: Promise<{ modelId: string }>;
}): Promise<React.JSX.Element> {
  const { modelId } = await params;
  return <AliasForward to={`/live/${modelId}`} label="the model" />;
}
