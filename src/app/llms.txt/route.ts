import {
  MCP_ENDPOINT_PATH,
  MCP_STATUS_LABEL,
  MCP_TOOLS,
} from "@/features/mcp/catalog";
import { publicOrigin } from "@/features/mcp/lib/origin";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

/**
 * `/llms.txt` — what this site is, for a model reading it rather than a person.
 *
 * WHY THIS SITE OF ALL SITES. The convention (llmstxt.org) is a plain-text
 * index an assistant can read instead of guessing from rendered HTML, and it
 * earns its place here more than on most sites: half this product's pitch is
 * that an AI agent authors the diagrams, and the agent's own first move —
 * finding the MCP endpoint and the grammar — is exactly what this file
 * answers in one request. A site that asks agents to use it and then makes
 * them scrape a React page for the endpoint is arguing against itself.
 *
 * EVERY FACT IS DERIVED. The endpoint path, the tool names and the beta
 * marker come from the same catalogue the server registers from and the
 * `/mcp` page renders, so this file cannot advertise a tool that does not
 * exist or an endpoint that moved. That is the whole reason it is a route
 * handler and not a file in `public/`: a static copy is a second place to
 * forget.
 *
 * It is deliberately SHORT. The format's value is being skimmable in one
 * read; a mirror of the docs would just be the docs again, less current.
 * Links point at the pages that own each subject.
 */

/** Plain text, cached at the edge — it changes only when a deploy changes it. */
export const dynamic = "force-static";

export function GET(): Response {
  const origin = publicOrigin();
  const body = `# ${APP_NAME}

> ${APP_DESCRIPTION}

${APP_NAME} reads and writes two kinds of architecture document as plain text:
C4 models and sequence diagrams. The text format is \`.alab\`; arch-lab JSON and
Mermaid (C4 and sequenceDiagram) are also accepted and converted. Everything
runs in the browser — there is no account, and nothing is uploaded.

## For agents

- MCP endpoint (${MCP_STATUS_LABEL}, Streamable HTTP, read-only): ${origin}${MCP_ENDPOINT_PATH}
- Tools: ${MCP_TOOLS.map((tool) => tool.name).join(", ")}
- How to connect: ${origin}/mcp
- The grammar, with every example verified against the real parser: ${origin}/syntax

Use the server for the two things a file editor cannot do alone: get the exact
grammar, and get the real parser's verdict on something you wrote. There is no
mutation API — you edit \`.alab\` files yourself.

## Full reference

- ${origin}/llms-full.txt — the whole grammar, every MCP tool, and what each
  format conversion drops, as one plain-text document

## Pages

- ${origin}/ — what this is, in one screen
- ${origin}/view — the playground: paste or write either kind and see it
  rendered live. \`?d=seq\` starts from a sequence example, \`?e=<id>\` opens a
  bundled one (ids are listed on /demo)
- ${origin}/syntax — the \`.alab\` grammar, every example parser-verified
- ${origin}/validate — paste a document, get a located verdict
- ${origin}/demo — finished examples of both kinds
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
