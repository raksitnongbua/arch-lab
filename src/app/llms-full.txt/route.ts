import {
  MCP_ENDPOINT_PATH,
  MCP_STATUS_LABEL,
  MCP_TOOLS,
} from "@/features/mcp/catalog";
import { syntaxReferenceMarkdown } from "@/features/mcp/content/syntax-sections";
import { publicOrigin } from "@/features/mcp/lib/origin";
import { CANVAS_EDITING_PASSAGE } from "@/features/playground/input/canvas-edit";
/* Both derived, for the reason this whole file is: the one-line job is the
   passage an assistant quotes and it is served in these exact words by the
   home page, `/demo`, the playground and `/llms.txt`; the example ids are the
   registry's, so a bundled plan renamed there cannot leave a dead URL here. */
import { KIND_BLURB } from "@/features/playground/lib/kind-copy";
import { listGanttExampleIds } from "@/features/gantt/service/example-service";
import { listTimelineExampleIds } from "@/features/timeline/service/example-service";
import { listLifecycleExampleIds } from "@/features/lifecycle/service/example-service";
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
 * THE EDITING SECTION IS THE ONE THING HERE THAT IS NOT GRAMMAR, and it is
 * here because it was nowhere: neither this document nor `/llms.txt` contained
 * the word "canvas", so an assistant asked "can I edit an arch-lab diagram by
 * dragging" had nothing to quote and would answer from the grammar — which
 * describes a text format and implies the answer is no. The passage is
 * `CANVAS_EDITING_PASSAGE`, derived from the capability grid and served in the
 * same words by the landing page, `/llms.txt` and `/faq`.
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
as plain text. It reads nine kinds of document — C4 models (context, container,
component and code levels), UML-style sequence diagrams, flowcharts, use-case
diagrams, entity-relationship diagrams, data dictionaries, gantt charts,
milestone timelines and lifecycles — and renders every
one of them live. Nothing is uploaded and no account is required: a document is
a file you keep, and git is the collaboration layer.

## Editing a diagram: as text, or on the canvas

${CANVAS_EDITING_PASSAGE}

A canvas gesture is not a second place the diagram lives: it derives new source
text, re-parses it and patches only the lines it concerns, so comments and
spacing elsewhere in the file survive. The notations that answer no gesture
solve their layout from the text itself, so there is no coordinate in those
grammars for a drag to write — ${origin}/faq answers that one in full, per
notation.

## Formats it reads

- \`.alab\` — the text format this tool defines. Human-readable, diff-friendly,
  and lossless in both directions against the JSON form. The grammar is below.
- \`.archlab.json\` — the same C4 model as JSON, for tools that would rather not
  implement a grammar. Converts losslessly to and from \`.alab\`.
- Mermaid \`C4Context\`/\`C4Container\`/\`C4Component\`, \`sequenceDiagram\`,
  \`erDiagram\`, \`gantt\`, \`timeline\`, and \`flowchart\`/\`graph\` (which also
  carries the actor-and-use-case convention) — imported, and exported back.
  Import and export are each lossy in their own
  direction, and the app states exactly what each drops. A Mermaid shape with no
  arch-lab counterpart is refused by name rather than approximated. \`gantt\`
  runs both ways: Mermaid's \`crit\` tag is arch-lab's \`at-risk\` state in
  either direction, since both are an author saying a bar is in trouble. What
  an export never carries is the COMPUTED critical path and float — Mermaid
  has no slot for a derived chain, and writing one out as a typed \`crit\`
  would be indistinguishable from a claim somebody made, so the numbers stay
  where they are computed: \`validate_gantt\` and the canvas. A plan with NO
  \`starts\` date cannot be exported at all, because Mermaid \`gantt\` has no
  relative axis and no date is invented. \`timeline\`
  runs BOTH WAYS with nothing carved out: a milestone timeline computes nothing
  and has no status vocabulary, so Mermaid holds everything it says — an
  event's description and its tags, which are notes around the diagram rather
  than claims it makes. Mermaid's \`section\`, which groups periods a level
  above the period, is refused by name rather than flattened. The LIFECYCLE
  has no Mermaid dialect at all, in either direction, and none was invented:
  \`stateDiagram-v2\` draws a state MACHINE — every transition that could
  happen, from anywhere to anywhere — which is the arbitrary graph a lifecycle
  exists without, and \`journey\` scores satisfaction against tasks. Importing
  one would mean inventing a main track its author never wrote; exporting one
  would present a subtraction as a superset.

Paste any of them into ${origin}/live and the format is detected for you — one
page for all nine document kinds, and the one page a canvas gesture is
available
on. \`?d=\` chooses which example it starts from (\`c4\`, \`seq\`, \`flow\`, \`uc\`,
\`er\`, \`dict\`, \`gt\`, \`tl\`, \`lc\`), and \`?e=<id>\` opens a bundled one.

## Gantt charts, the seventh kind

${KIND_BLURB.gantt}

A gantt is the only document here whose x axis is a MEASURED quantity: a
bar's length is its duration in days, so a two-day plan and a two-year plan
read the same way and an exported PNG cannot disagree with the app about where
a bar ends. It holds tasks with a duration, zero-duration MILESTONES drawn as
diamonds, sections that band the rail, and \`after\` dependencies drawn as
connectors. There is deliberately no \`crit\` keyword: the CRITICAL PATH and
every item's FLOAT are computed by a forward and a backward pass over the
dependency graph, because a declared critical path can contradict the
arithmetic and then the picture is simply wrong. The header line is
\`archlab 1.0 gantt\`; \`starts <date>\` is optional and only decides whether
the axis reads as dates or as \`W1, W2, W3\`.

Finished ones, server-rendered and crawlable:

${listGanttExampleIds()
  .map((id) => `- ${origin}/live/gantt/${id}`)
  .join("\n")}

## Milestone timelines, the eighth kind

${KIND_BLURB.timeline}

A timeline is the notation NEXT TO the gantt, and the whole of the difference
is what it refuses. There is no duration, no dependency, no start and no
status word: an event is a POINT carrying a label, any number of \`#tag\`s and
one optional \`desc\`. Each of those four is refused BY NAME, with a message
pointing at \`archlab 1.0 gantt\` — which is where a document with lengths and
prerequisites belongs. Nothing here measures: a \`period\` label is an opaque
string (\`"2024"\`, \`"Before the rewrite"\`), never parsed as a date, so the
layout can never be asked where between two labels a third belongs.

The drawing runs DOWN THE PAGE rather than across, and that is decided by the
content: an event's label is the whole element, so it gets the full width and
the diagram pays in height. Every event's height is solved from its own
wrapped text and every period's from its events', so the bands' relative sizes
say how much happened in each — a fixed row pitch would say the opposite. The
header line is \`archlab 1.0 timeline\`; there is no optional header line,
because there is no axis to configure.

Finished ones, server-rendered and crawlable:

${listTimelineExampleIds()
  .map((id) => `- ${origin}/live/timeline/${id}`)
  .join("\n")}

## Lifecycles, the ninth kind

${KIND_BLURB.lifecycle}

A lifecycle is the notation NEXT TO the flowchart, and the whole of the
difference is what it refuses. It cannot express an arbitrary graph, and every
construct that would is refused BY NAME with a message pointing at
\`archlab 1.0 flowchart\`:

- There is ONE \`subject\`, declared once, before any state. A lifecycle
  follows one thing; two would be a graph of two things.
- The main track is DECLARATION ORDER and carries no edges. There is no
  \`to\`, no \`next\`, no \`then\` — one edge keyword and an author could skip
  a state, and a set of arbitrary state-to-state edges IS a flowchart.
- A branch is an \`exit\` nested under exactly one state, with an optional
  \`when\` condition, and it either \`ends\` or \`rejoins\` a state declared
  EARLIER. A forward rejoin is refused: that is a shortcut along the track,
  the same arbitrary edge under another keyword. An \`exit\` cannot open
  inside another \`exit\`, so branch depth is always one.
- A state is a place the subject can BE ("Paid"), not something somebody does
  ("Take payment"). The grammar cannot enforce that, so \`validate_lifecycle\`
  reports it.

The drawing runs DOWN THE PAGE: states are dots on one spine with their label
and description to the right, departures hang in their own lane to the left at
a smaller size, and a returning branch travels in a reserved channel and
re-enters the track in the gap above the state it rejoins — so it crosses no
state it does not touch. A final state and a terminal branch carry a stop BAR
rather than a colour, which is why this kind has no palette: every distinction
it draws is structural, so a shape says it in greyscale and in a screenshot.
The header line is \`archlab 1.0 lifecycle\`; there is no optional header
line, because there is no axis to configure.

Finished ones, server-rendered and crawlable:

${listLifecycleExampleIds()
  .map((id) => `- ${origin}/live/lifecycle/${id}`)
  .join("\n")}

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
