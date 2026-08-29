import type { MetadataRoute } from "next";

import { publicOrigin } from "@/features/mcp/lib/origin";
import { listFlowchartExampleIds } from "@/features/flowchart/service/example-service";
import { listSequenceExampleIds } from "@/features/sequence/service/example-service";
import { listUseCaseExampleIds } from "@/features/usecase/service/example-service";
import { listErExampleIds } from "@/features/er/service/example-service";
import { listDictExampleIds } from "@/features/dict/service/example-service";
import { listGanttExampleIds } from "@/features/gantt/service/example-service";
import { listTimelineExampleIds } from "@/features/timeline/service/example-service";
import { listLifecycleExampleIds } from "@/features/lifecycle/service/example-service";
import { listViewerModelIds } from "@/features/viewer";

/**
 * Every page a crawler should know about. The static routes are written out
 * by hand — there are seven and they change with the router, not with data —
 * and `check:seo` measures the description of every one of them, plus every
 * forwarding alias it finds on disk. The `/live/[modelId]` entries come from
 * the same registry that feeds `generateStaticParams`, so a bundled example
 * added there appears here without anyone remembering a second list.
 *
 * `/api/*` is deliberately absent (robots.ts disallows it), and no
 * lastModified is claimed: deploys touch every prerendered page at once, so a
 * per-URL date would be an invented signal, not information.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicOrigin();

  const staticRoutes = [
    "",
    "/demo",
    "/syntax",
    "/validate",
    /* ONE playground URL, and `/editor` is no longer beside it. The C4 canvas
       on `/live` is editable in place, so the two were one job on two pages;
       `/editor` is a forwarding alias now, and listing a route that canonicals
       elsewhere asks a crawler to index a trampoline. Same reason `/live/c4`,
       `/live/seq`, the gantt's own pair (`/live/gt`, `/live/gantt`) and the
       timeline's (`/live/tl`, `/live/timeline`) and the lifecycle's
       (`/live/lc`, `/live/lifecycle`) are absent — and the same reason the ENTIRE retired
       `/view` family is, trampolines and example pages alike: this route
       family was called `/view` until the page stopped being only a viewer,
       and every old path still forwards, but a trampoline is not a page and
       asking a crawler to index sixteen of them would spend the site's crawl
       budget on redirects. `check:seo` fails if one appears here. The seed
       lives in `?d=`, which a sitemap has no reason to enumerate — it changes
       the starting text, not the page. */
    "/live",
    "/mcp",
    "/faq",
  ];

  // All NINE example registries, so a new example is in the sitemap the moment
  // it is registered — the same reason the model routes are derived rather than
  // typed out above. `check:seo` derives its coverage expectation from what
  // this function returns, so a registry left out here is a page nothing
  // crawls and nothing measures.
  const modelRoutes = listViewerModelIds().map((id) => `/live/${id}`);
  const sequenceRoutes = listSequenceExampleIds().map(
    (id) => `/live/sequence/${id}`,
  );
  const flowchartRoutes = listFlowchartExampleIds().map(
    (id) => `/live/flowchart/${id}`,
  );
  const erRoutes = listErExampleIds().map((id) => `/live/er/${id}`);
  const dictRoutes = listDictExampleIds().map((id) => `/live/dict/${id}`);
  const usecaseRoutes = listUseCaseExampleIds().map(
    (id) => `/live/usecase/${id}`,
  );
  const ganttRoutes = listGanttExampleIds().map((id) => `/live/gantt/${id}`);
  const timelineRoutes = listTimelineExampleIds().map(
    (id) => `/live/timeline/${id}`,
  );
  const lifecycleRoutes = listLifecycleExampleIds().map(
    (id) => `/live/lifecycle/${id}`,
  );

  return [
    ...staticRoutes,
    ...modelRoutes,
    ...sequenceRoutes,
    ...flowchartRoutes,
    ...usecaseRoutes,
    ...erRoutes,
    ...dictRoutes,
    ...ganttRoutes,
    ...timelineRoutes,
    ...lifecycleRoutes,
  ].map((path) => ({
    url: `${origin}${path === "" ? "/" : path}`,
    // The homepage is the page search should surface first; everything else
    // shares one rung below it rather than pretending finer-grained priorities
    // mean anything to a crawler.
    priority: path === "" ? 1 : 0.7,
    changeFrequency: "weekly" as const,
  }));
}
