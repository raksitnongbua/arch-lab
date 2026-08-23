import {
  MCP_ENDPOINT_PATH,
  MCP_STATUS_LABEL,
  MCP_TOOLS,
} from "@/features/mcp/catalog";
import { publicOrigin } from "@/features/mcp/lib/origin";
import { CANVAS_EDITING_PASSAGE } from "@/features/playground/input/canvas-edit";
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
 * THE EDITING PASSAGE IS DERIVED TOO, from the capability grid in
 * `playground/input/canvas-edit.ts`, and it is the same string the landing
 * page, `/llms-full.txt` and `/faq` serve. An assistant asked "can I edit an
 * arch-lab diagram by dragging" quotes one passage rather than a page, so the
 * four surfaces that answer it say it in one wording — and neither this file nor
 * the full reference mentioned a canvas at all until they did.
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

${APP_NAME} reads and writes six kinds of architecture document as plain text:
C4 models, UML-style sequence diagrams, flowcharts, use-case diagrams,
entity-relationship diagrams and data dictionaries. The text format is \`.alab\`; arch-lab JSON and
Mermaid (\`C4Context\`, \`sequenceDiagram\`, \`flowchart\`/\`graph\`,
\`erDiagram\`) are also accepted and converted. The ER conversion is the only
one that is two-way and total over the diagram — Mermaid has a real
\`erDiagram\`, so nothing the picture shows is lost in either direction.
Everything runs in the browser — there is no account, and nothing is uploaded.

## Editing a diagram: as text, or on the canvas

${CANVAS_EDITING_PASSAGE}

## For agents

- MCP endpoint (${MCP_STATUS_LABEL}, Streamable HTTP, read-only): ${origin}${MCP_ENDPOINT_PATH}
- Tools: ${MCP_TOOLS.map((tool) => tool.name).join(", ")}
- How to connect: ${origin}/mcp
- The grammar, with every example verified against the real parser: ${origin}/syntax

Use the server for the two things a file editor cannot do alone: get the exact
grammar, and get the real parser's verdict on something you wrote — there is a
validate and a format tool for each of the six document kinds. There is no
mutation API — you edit \`.alab\` files yourself.

## Full reference

- ${origin}/llms-full.txt — the whole grammar, every MCP tool, and what each
  format conversion drops, as one plain-text document

## Pages

- ${origin}/ — what this is, in one screen
- ${origin}/live — the playground: paste or write any of the six kinds and see
  it rendered live, and the one page where a canvas gesture is available.
  \`?d=seq\` starts from a sequence example and \`?d=er\` from an ER one,
  \`?e=<id>\` opens a bundled one (ids are listed on /demo)
- ${origin}/syntax — the \`.alab\` grammar, every example parser-verified
- ${origin}/validate — paste a document, get a located verdict
- ${origin}/demo — finished examples of all six kinds
- ${origin}/faq — what this is, what it exports, what leaves the browser, and
  what an agent may do over MCP, as short self-contained answers
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
