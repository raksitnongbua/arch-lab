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
  DOCUMENT_KIND_COUNT,
  MCP_BETA_NOTICE_SHORT,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "@/features/mcp/catalog";
/* The headline is imported rather than retyped so the rule in the handshake
   and the string a result actually opens with cannot part company — a
   near-miss quotation here is a rule the agent never recognises. `check:mcp`
   asserts this route names both. */
import { ASK_HUMAN_HEADLINE } from "@/features/mcp/lib/render";

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
      // NAMES THE NUMBER OF NOTATIONS, interpolated from the catalogue. This
      // said "reads and writes C4 architecture models" for eight notations'
      // worth of releases, and it is the first thing a connecting client
      // reads — so an agent asked for a plan or a schema learned from the
      // handshake that this server draws boxes and lines, and wrote one.
      `arch-lab reads and writes ${DOCUMENT_KIND_COUNT} notations of ` +
      "diagram as plain `.alab` text — C4 architecture models (also as " +
      "arch-lab JSON and Mermaid C4), sequence diagrams, flowcharts, " +
      "use-case diagrams, ER schemas, data dictionaries, gantt charts, " +
      "milestone timelines and lifecycles. Call list_example_models when a " +
      "request could fit more than one of them. You already have file tools, " +
      "so read and write .alab files yourself and use this server for what " +
      "it knows that you cannot: the exact grammar (get_syntax_reference, " +
      "which covers C4 and sequence only) and the real parser's verdict " +
      "(validate_model and the eight validate_<kind> tools). Validate before " +
      "presenting any document you authored, and use create_share_link when " +
      "a human needs to actually see the diagram. " +
      // THE STANDING RULE, and the reason it has to live here: this server
      // cannot ask a question over the protocol (see the note on
      // `askHumanResult` in features/mcp/lib/render.ts for why elicitation
      // and sampling are both structurally unavailable on a stateless
      // deployment), so a question can only arrive as the TEXT of a result.
      // An agent that has not been told to stop on that text will read the
      // options and pick one, which is the whole failure being prevented.
      `When a result begins "${ASK_HUMAN_HEADLINE}", stop and put the ` +
      "question and its numbered options to the person you are working for. " +
      "Do not choose for them unless the result names a default AND they " +
      "cannot be reached. " +
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
