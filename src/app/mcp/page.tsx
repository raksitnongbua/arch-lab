import type { Metadata } from "next";
import { headers } from "next/headers";

import {
  MCP_SERVER_NAME,
  MCP_STATUS_LABEL,
  MCP_TOOLS,
} from "@/features/mcp/catalog";
import { McpGuide } from "@/features/mcp/components/mcp-guide";
import { documentedOrigin, publicOrigin } from "@/features/mcp/lib/origin";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: "MCP server (beta) — use arch-lab from your AI agent",
  description:
    "Connect Claude Code, Cursor or any MCP client and let your agent write C4 and sequence diagrams the real parser has already checked. Hosted, read-only.",
  alternates: { canonical: "/mcp" },
};

/**
 * `/mcp` — how to connect an agent to arch-lab.
 *
 * A top-level route alongside `/syntax` and `/validate` because it is the same
 * kind of thing: a first-class way to use the format, not a docs subtree. The
 * page imports the guide component directly rather than through the feature's
 * barrel, because that barrel is the SERVER surface and pulls in the MCP SDK —
 * see `src/features/mcp/README.md`.
 *
 * Reading `headers()` makes this route dynamic rather than prerendered, which
 * is a deliberate trade: the page's entire job is to hand out a URL that
 * works, and deriving that URL from the host actually being served is what
 * survives a domain rename. It cost a production bug to learn — `/mcp` spent a
 * day advertising an endpoint that 404'd after the subdomain changed. One
 * function invocation per view is a cheap price for a page that cannot be
 * wrong about itself.
 */
/**
 * Structured data for the SERVER this page documents — a distinct piece of
 * software from the site itself, with its own endpoint and its own feature
 * list, which is why it gets a node here rather than leaning on the home
 * page's `SoftwareApplication`.
 *
 * `featureList` is READ FROM THE CATALOGUE the server registers from, so the
 * markup cannot advertise a tool the server does not expose — the same rule
 * the visible page already follows. A hand-typed list here would be a second
 * place to forget when a tool is renamed.
 *
 * Deliberately NOT `FAQPage` or `HowTo`: the first is for government and
 * healthcare answers and the second was deprecated in 2023, and a connect
 * guide is neither.
 */
function mcpJsonLd(origin: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `${APP_NAME} MCP server`,
    alternateName: MCP_SERVER_NAME,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Any (Model Context Protocol client)",
    url: `${origin}/mcp`,
    softwareVersion: MCP_STATUS_LABEL,
    description:
      "A Model Context Protocol server that lets an AI agent read, validate " +
      "and convert arch-lab C4 and sequence documents against the real parser.",
    featureList: MCP_TOOLS.map((tool) => tool.name),
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    isAccessibleForFree: true,
  });
}

export default async function McpPage(): Promise<React.JSX.Element> {
  const headerList = await headers();
  return (
    <>
      {/* Built from `publicOrigin()` rather than the request host: a canonical
          URL in structured data has to be the one canonical names, and the
          visible endpoint below is host-derived for a different reason (it has
          to work when pasted, whatever domain served it). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: mcpJsonLd(publicOrigin()) }}
      />
      <McpGuide origin={documentedOrigin((name) => headerList.get(name))} />
    </>
  );
}
