/**
 * `/api/mcp` — the arch-lab MCP server, over Streamable HTTP.
 *
 * Stateless by design (`sessionIdGenerator: undefined`, SSE disabled): every
 * tool is a pure function of its arguments, so there is nothing to keep
 * between calls, no Redis to provision, and no session affinity to get wrong
 * across serverless instances. The deprecated SSE transport is off because
 * the MCP spec dropped it in 2025-03-26 and keeping it would mean keeping
 * state we otherwise do not need.
 *
 * Unauthenticated on purpose. The endpoint stores nothing, reads nothing, and
 * holds no secrets — it parses text the caller already has and hands back
 * text derived from it. The one real abuse surface is a pathological payload
 * hitting the recursive `.alab` parser, which `MAX_SOURCE_CHARS` caps before
 * any parsing starts.
 *
 * Runs on Node rather than Edge: the share codec uses `CompressionStream`
 * through `Blob`/`Response`, and the parser is plain synchronous CPU work
 * that benefits from the longer duration ceiling.
 */

import { createMcpHandler } from "mcp-handler";

import { registerArchLabMcp } from "@/features/mcp";
import {
  MCP_BETA_NOTICE_SHORT,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "@/features/mcp/catalog";

export const runtime = "nodejs";

/**
 * Generous relative to the work (a large model parses in milliseconds), but
 * bounded: an unbounded handler turns one bad payload into a stuck function.
 */
export const maxDuration = 60;

const handler = createMcpHandler(
  registerArchLabMcp,
  {
    serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    instructions:
      "arch-lab reads and writes C4 architecture models in .alab text, " +
      "arch-lab JSON, and Mermaid C4. You already have file tools, so read " +
      "and write .alab files yourself and use this server for what it knows " +
      "that you cannot: the exact grammar (get_syntax_reference) and the " +
      "real parser's verdict (validate_model). Validate before presenting " +
      "any model you authored, and use create_share_link when a human needs " +
      "to actually see the diagram. " +
      // A client may connect without any human ever opening `/mcp`, so the
      // beta caveat travels with the handshake rather than living only on a
      // page nobody in the loop has read.
      MCP_BETA_NOTICE_SHORT,
  },
  {
    // `/api` + the file's own segment resolves to `/api/mcp`.
    basePath: "/api",
    disableSse: true,
    sessionIdGenerator: undefined,
    maxDuration: 60,
  },
);

export { handler as GET, handler as POST };
