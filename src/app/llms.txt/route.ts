import {
  MCP_ENDPOINT_PATH,
  MCP_STATUS_LABEL,
  MCP_TOOLS,
} from "@/features/mcp/catalog";
import { publicOrigin } from "@/features/mcp/lib/origin";
import { CANVAS_EDITING_PASSAGE } from "@/features/playground/input/canvas-edit";
/* The gantt's, the timeline's and the lifecycle's one-line jobs, at the constant the home page,
   `/demo`, `/faq`, the MCP catalogue and the playground's starter row all read.
   An assistant quotes a passage rather than a page, so every surface that
   answers "what is a gantt for", "what is a timeline for" or "what is a
   lifecycle for" says it in one
   wording — the same argument the editing passage above won. */
import { KIND_BLURB } from "@/features/playground/lib/kind-copy";
import { listGanttExampleIds } from "@/features/gantt/service/example-service";
import { listTimelineExampleIds } from "@/features/timeline/service/example-service";
import { listLifecycleExampleIds } from "@/features/lifecycle/service/example-service";
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

${APP_NAME} reads and writes nine kinds of architecture document as plain
text: C4 models, UML-style sequence diagrams, flowcharts, use-case diagrams,
entity-relationship diagrams, data dictionaries, gantt charts, milestone
timelines and lifecycles. The text format is \`.alab\`; arch-lab JSON and
Mermaid (\`C4Context\`, \`sequenceDiagram\`, \`flowchart\`/\`graph\`,
\`erDiagram\`, \`gantt\`, \`timeline\`) are also accepted and converted. The ER,
timeline and gantt conversions run BOTH WAYS and are total over the diagram —
Mermaid has a real \`erDiagram\`, \`timeline\` and \`gantt\`, so nothing any of
those three pictures shows is lost in either direction. The one gantt that
cannot be exported is a plan with no \`starts\` date: Mermaid \`gantt\` has no
relative axis, and arch-lab refuses that document by name rather than
inventing a day 0. What no export carries is the COMPUTED critical path,
which Mermaid has no slot for and which is never faked with a typed
\`crit\` tag. The
lifecycle has NO Mermaid dialect in either direction and none was invented:
\`stateDiagram-v2\` is a state machine — every transition that could happen —
rather than one subject's ordered history.
Everything runs in the browser — there is no account, and nothing is uploaded.

## Gantt charts

${KIND_BLURB.gantt}

The seventh document kind, headed \`archlab 1.0 gantt\`, and the only one
whose x axis is a MEASURED quantity — a bar's length is its duration in days.
It draws tasks, zero-duration milestones, sections, and \`after\`
dependencies; the critical path and every item's float are COMPUTED from the
graph rather than declared, so the picture cannot contradict the arithmetic.
Write one at ${origin}/live?d=gt (\`?d=gantt\` works too). Finished ones:
${listGanttExampleIds()
  .map((id) => `${origin}/live/gantt/${id}`)
  .join("\n")}

\`validate_gantt\` reports the critical path, dependency cycles, and
\`after\` entries that constrain nothing; \`format_gantt\` rewrites the text
canonically.

## Milestone timelines

${KIND_BLURB.timeline}

The eighth document kind, headed \`archlab 1.0 timeline\`: events as points on
a spine, grouped into named periods. It is the notation next to the gantt and
the two must not be confused — a timeline has NO duration, NO dependency and
NO status, and each of those is refused by name with a message pointing at
\`archlab 1.0 gantt\`. Nothing here measures: a period's label is a string and
is never read as a date. The drawing runs down the page, because an event's
label is the whole element and every band is as tall as its events need.
Write one at ${origin}/live?d=tl (\`?d=timeline\` works too). Finished ones:
${listTimelineExampleIds()
  .map((id) => `${origin}/live/timeline/${id}`)
  .join("\n")}

\`validate_timeline\` reports the two things a parse cannot see: periods
written out of sequence (nothing else here reads a period label at all), and
events carrying a duration or a dependency in their label, which is the
document asking to be a gantt. \`format_timeline\` rewrites the text
canonically, and converts pasted Mermaid \`timeline\` both ways.

## Lifecycles

${KIND_BLURB.lifecycle}

The ninth document kind, headed \`archlab 1.0 lifecycle\`: ONE named subject,
the ordered states it passes through, and the branches that leave that track.
It is the notation next to the flowchart and the two must not be confused — a
lifecycle cannot express an arbitrary graph, and every construct that would is
refused by name with a message pointing at \`archlab 1.0 flowchart\`. The main
track is DECLARATION ORDER and carries no edges at all (no \`to\`, no
\`next\`); a branch belongs to exactly one state and either \`ends\` or
\`rejoins\` a state declared EARLIER, never a later one. The drawing runs
down the page: states on a spine with their text to the right, departures in
their own lane to the left, and a returning branch travelling in a reserved
channel back into the track.
Write one at ${origin}/live?d=lc (\`?d=lifecycle\` works too). Finished ones:
${listLifecycleExampleIds()
  .map((id) => `${origin}/live/lifecycle/${id}`)
  .join("\n")}

\`validate_lifecycle\` reports what a parse cannot see: a subject that never
terminates, states stranded after a final one, branches with no \`when\`
condition, states named as ACTIONS rather than conditions (a flowchart written
in this notation), and a document with no branches at all, which is a
milestone timeline. \`format_lifecycle\` rewrites the text canonically.

## Editing a diagram: as text, or on the canvas

${CANVAS_EDITING_PASSAGE}

## For agents

- MCP endpoint (${MCP_STATUS_LABEL}, Streamable HTTP, read-only): ${origin}${MCP_ENDPOINT_PATH}
- Tools: ${MCP_TOOLS.map((tool) => tool.name).join(", ")}
- How to connect: ${origin}/mcp
- The grammar, with every example verified against the real parser: ${origin}/syntax

Use the server for the two things a file editor cannot do alone: get the exact
grammar, and get the real parser's verdict on something you wrote — there is a
validate and a format tool for each of the nine document kinds. There is no
mutation API — you edit \`.alab\` files yourself.

## Full reference

- ${origin}/llms-full.txt — the whole grammar, every MCP tool, and what each
  format conversion drops, as one plain-text document

## Pages

- ${origin}/ — what this is, in one screen
- ${origin}/live — the playground: paste or write any of the nine kinds and
  see it rendered live, and the one page where a canvas gesture is available.
  \`?d=seq\` starts from a sequence example, \`?d=er\` from an ER one,
  \`?d=gt\` from a gantt, \`?d=tl\` from a milestone timeline and \`?d=lc\`
  from a lifecycle,
  \`?e=<id>\` opens a bundled one (ids are listed on /demo)
- ${origin}/syntax — the \`.alab\` grammar, every example parser-verified
- ${origin}/validate — paste a document, get a located verdict
- ${origin}/demo — finished examples of all nine kinds
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
