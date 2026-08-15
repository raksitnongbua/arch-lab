import type { MetadataRoute } from "next";

import { publicOrigin } from "@/features/mcp/lib/origin";

/**
 * Everything is crawlable except `/api/*` — those endpoints (the MCP
 * transport and share-link minting) answer with JSON or protocol frames, and
 * a crawler that wanders in earns nothing but a confusing index entry and a
 * serverless invocation we pay for.
 *
 * THE AI CRAWLERS ARE NAMED, even though `*` already allows them. Two
 * reasons, and neither is decoration:
 *
 *   - An assistant that can read this site is the point. Half of what this
 *     product claims is that an agent authors your diagrams; being absent
 *     from the assistants people ask "how do I write a C4 diagram as text"
 *     would be losing the audience most likely to want it.
 *   - A named rule cannot be revoked by accident. The blanket `*` is one
 *     careless `disallow` away from taking these with it, and the failure is
 *     silent — nothing breaks, the site simply stops being citable. Spelling
 *     them out means removing one is a decision somebody makes on purpose.
 *
 * Each still inherits the `/api/` refusal: an agent belongs at the MCP
 * endpoint through a client, not through a crawl.
 *
 * TRAINING crawlers are deliberately NOT in this list (CCBot, Bytespider and
 * friends). They are neither allowed nor blocked here — `*` decides for them,
 * which is the honest default for a question this file should not be quietly
 * answering on the owner's behalf.
 *
 * The sitemap URL must be absolute per the robots spec, so this is one of the
 * few places `publicOrigin()` is spelled out rather than left to
 * `metadataBase` resolution.
 */

/**
 * The crawlers behind the assistants people actually ask — OpenAI's search
 * and browsing agents, Anthropic's, Perplexity's, and Google's separate
 * opt-in for its AI surfaces.
 */
const AI_SEARCH_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "PerplexityBot",
  "Google-Extended",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
      ...AI_SEARCH_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: "/api/",
      })),
    ],
    sitemap: `${publicOrigin()}/sitemap.xml`,
  };
}
