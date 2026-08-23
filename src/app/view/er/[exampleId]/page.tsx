import type { Metadata } from "next";

import { AliasForward } from "@/components/share/alias-forward";
import { listErExampleIds } from "@/features/er/service/example-service";

/**
 * `/view/er/[exampleId]` — a forwarding alias for the ER diagram example page,
 * which now lives under `/live`.
 *
 * THESE ARE CRAWLED PAGES, not just bookmarks: every example route is in the
 * sitemap and `/demo` links each one, so renaming the family without leaving
 * a trampoline here would hand a search engine a set of 404s and lose whatever
 * standing each example page had. The pair that moves that standing across is
 * the canonical on the `/live` twin plus `noindex` on this URL.
 *
 * The ids come from the same registry `generateStaticParams` uses on the real
 * page, so the forwarding surface is a function of the registry rather than a
 * second list to keep in step (`codebase.md` habit 4).
 */
export function generateStaticParams(): { exampleId: string }[] {
  return listErExampleIds().map((exampleId) => ({ exampleId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ exampleId: string }>;
}): Promise<Metadata> {
  const { exampleId } = await params;
  return {
    title: "Example moved to /live",
    alternates: { canonical: `/live/er/${exampleId}` },
    robots: { index: false },
  };
}

export default async function LegacyViewErExamplePage({
  params,
}: {
  params: Promise<{ exampleId: string }>;
}): Promise<React.JSX.Element> {
  const { exampleId } = await params;
  return <AliasForward to={`/live/er/${exampleId}`} label="the example" />;
}
