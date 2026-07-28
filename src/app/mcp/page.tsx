import type { Metadata } from "next";
import { headers } from "next/headers";

import { McpGuide } from "@/features/mcp/components/mcp-guide";
import { documentedOrigin } from "@/features/mcp/lib/origin";

export const metadata: Metadata = {
  title: "MCP server (beta) — use arch-lab from your AI agent",
  description:
    "Connect Claude Code, Claude Desktop, Cursor or any MCP client to arch-lab: validate .alab models against the real parser, convert between .alab, arch-lab JSON and Mermaid C4, read the verified syntax reference, and turn a model into a share link. Hosted, read-only, nothing stored. In beta — tool names and response wording may still change.",
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
export default async function McpPage(): Promise<React.JSX.Element> {
  const headerList = await headers();
  return <McpGuide origin={documentedOrigin((name) => headerList.get(name))} />;
}
