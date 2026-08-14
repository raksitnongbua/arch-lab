import type { MetadataRoute } from "next";

import { publicOrigin } from "@/features/mcp/lib/origin";
import { listSequenceExampleIds } from "@/features/sequence/service/example-service";
import { listViewerModelIds } from "@/features/viewer";

/**
 * Every page a crawler should know about. The static routes are written out
 * by hand — there are nine and they change with the router, not with data —
 * while the `/view/[modelId]` entries come from the same registry that feeds
 * `generateStaticParams`, so a bundled example added there appears here
 * without anyone remembering a second list.
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
    "/editor",
    "/syntax",
    "/validate",
    "/view",
    "/view/c4",
    "/view/sequence",
    "/mcp",
  ];

  // Both example registries, so a new example is in the sitemap the moment it
  // is registered — the same reason the model routes are derived rather than
  // typed out above.
  const modelRoutes = listViewerModelIds().map((id) => `/view/${id}`);
  const sequenceRoutes = listSequenceExampleIds().map(
    (id) => `/view/sequence/${id}`,
  );

  return [...staticRoutes, ...modelRoutes, ...sequenceRoutes].map((path) => ({
    url: `${origin}${path === "" ? "/" : path}`,
    // The homepage is the page search should surface first; everything else
    // shares one rung below it rather than pretending finer-grained priorities
    // mean anything to a crawler.
    priority: path === "" ? 1 : 0.7,
    changeFrequency: "weekly" as const,
  }));
}
