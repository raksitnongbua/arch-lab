import type { Metadata } from "next";

import { McpGuide } from "@/features/mcp/components/mcp-guide";

export const metadata: Metadata = {
  title: "MCP server — use arch-lab from your AI agent",
  description:
    "Connect Claude Code, Claude Desktop, Cursor or any MCP client to arch-lab: validate .alab models against the real parser, convert between .alab, arch-lab JSON and Mermaid C4, read the verified syntax reference, and turn a model into a share link. Hosted, read-only, nothing stored.",
};

/**
 * `/mcp` — how to connect an agent to arch-lab.
 *
 * A top-level route alongside `/syntax` and `/validate` because it is the same
 * kind of thing: a first-class way to use the format, not a docs subtree. The
 * page imports the guide component directly rather than through the feature's
 * barrel, because that barrel is the SERVER surface and pulls in the MCP SDK —
 * see `src/features/mcp/README.md`.
 */
export default function McpPage(): React.JSX.Element {
  return <McpGuide />;
}
