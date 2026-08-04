import type { MetadataRoute } from "next";

import { publicOrigin } from "@/features/mcp/lib/origin";

/**
 * Everything is crawlable except `/api/*` — those endpoints (the MCP
 * transport and share-link minting) answer with JSON or protocol frames, and
 * a crawler that wanders in earns nothing but a confusing index entry and a
 * serverless invocation we pay for.
 *
 * The sitemap URL must be absolute per the robots spec, so this is one of the
 * few places `publicOrigin()` is spelled out rather than left to
 * `metadataBase` resolution.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${publicOrigin()}/sitemap.xml`,
  };
}
