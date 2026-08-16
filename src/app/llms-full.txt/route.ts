import {
  MCP_ENDPOINT_PATH,
  MCP_STATUS_LABEL,
  MCP_TOOLS,
} from "@/features/mcp/catalog";
import { syntaxReferenceMarkdown } from "@/features/mcp/content/syntax-sections";
import { publicOrigin } from "@/features/mcp/lib/origin";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

/**
 * `/llms-full.txt` — the whole thing, in one plain-text read.
 *
 * `/llms.txt` is the INDEX: what this site is and where to go. This is the
 * CONTENT an assistant would otherwise have to crawl four pages and a syntax
 * reference to assemble — the format's grammar, every MCP tool with what it
 * answers, and the facts about the product that are easy to get wrong.
 *
 * WHY IT EXISTS RATHER THAN "the pages are already server-rendered". They
 * are, and that is not the same thing. An assistant answering "how do I write
 * a C4 diagram as text" has to find `/syntax`, decide it is the right page,
 * and extract a grammar out of a React page's prose. Here the same grammar
 * arrives as one document with headings, which is the shape that gets quoted
 * accurately rather than paraphrased into something that will not parse — and
 * a wrong grammar in an answer is worse for a reader than no answer.
 *
 * NOTHING IS WRITTEN TWICE. The grammar is `syntaxReferenceMarkdown()`, the
 * exact document the MCP server hands agents through `archlab://syntax` and
 * the one `check:syntax-docs` verifies example by example against the real
 * parser. The tools come from the catalogue the server registers from. A
 * hand-maintained copy of either would be a second version to keep true, and
 * the one thing worse than no machine-readable grammar is a stale one.
 */

export const dynamic = "force-static";

/**
 * The shared syntax reference, DEMOTED one heading level to sit under this
 * document's own `##` sections.
 *
 * Without it the reference's `## Nodes` becomes a sibling of `## What
 * arch-lab is` and the outline goes flat — which is precisely the structure
 * an extractor reads to decide what a passage is ABOUT. A flat outline says
 * every section is a peer topic; nested says "these are all parts of the
 * grammar". The reference is authored standalone (it is also served whole to
 * MCP clients), so the shift belongs here, at the point of embedding, rather
 * than in the document itself.
 */
function syntaxRef(): string {
  return syntaxReferenceMarkdown().replace(/^# /, "").replace(/^## /gm, "### ");
}

export function GET(): Response {
  const origin = publicOrigin();

  const body = `# ${APP_NAME} — full reference for assistants

> ${APP_DESCRIPTION}

Source: ${origin} · Index: ${origin}/llms.txt

## What ${APP_NAME} is

${APP_NAME} is a browser-based tool for writing software architecture diagrams
as plain text. It reads two kinds of document — C4 models (context, container,
component and code levels) and UML-style sequence diagrams — and renders both
live. Nothing is uploaded and no account is required: a document is a file you
keep, and git is the collaboration layer.

## Formats it reads

- \`.alab\` — the text format this tool defines. Human-readable, diff-friendly,
  and lossless in both directions against the JSON form. The grammar is below.
- \`.archlab.json\` — the same C4 model as JSON, for tools that would rather not
  implement a grammar. Converts losslessly to and from \`.alab\`.
- Mermaid \`C4Context\`/\`C4Container\`/\`C4Component\` and \`sequenceDiagram\` —
  imported, and exported back. Import and export are each lossy in their own
  direction, and the app states exactly what each drops.

Paste any of the five into ${origin}/view and the format is detected for you —
one page for both document kinds. \`?d=seq\` chooses which example it starts
from, and \`?e=<id>\` opens a bundled one.

## Using it from an AI agent (MCP)

Endpoint (${MCP_STATUS_LABEL}, Streamable HTTP, stateless, unauthenticated,
read-only): ${origin}${MCP_ENDPOINT_PATH}

Connect with, for example: \`claude mcp add --transport http arch-lab ${origin}${MCP_ENDPOINT_PATH}\`

There is deliberately NO mutation API. An agent already has file tools and
\`.alab\` is text precisely so it can edit one directly; the server exists for
the two things it cannot do alone — know the grammar exactly, and get the real
parser's verdict on what it just wrote.

Tools:

${MCP_TOOLS.map((tool) => `- \`${tool.name}\` — ${tool.title}`).join("\n")}

## ${syntaxRef()}
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
