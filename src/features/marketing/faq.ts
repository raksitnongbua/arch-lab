import { MCP_TOOLS } from "@/features/mcp/catalog";
import { CANVAS_EDITING_PASSAGE } from "@/features/playground/input/canvas-edit";
import { KIND_BLURB } from "@/features/playground/lib/kind-copy";
import { APP_NAME } from "@/lib/constants";

/**
 * The questions `/faq` answers, and the single source both halves of that page
 * read from — the prose a person sees and the `FAQPage` JSON-LD a machine
 * parses. Two lists would be two answers to the same question, and the stale
 * one is always the one that gets quoted.
 *
 * WHY THIS PAGE EXISTS AT ALL, since the landing page deliberately shed its
 * reference sections and nothing here should creep back into it: this is
 * OBJECTION HANDLING, which is a different job from explaining the format. The
 * home page argues for the product to somebody who is willing to be persuaded;
 * these are the reasons a reader does NOT click — "I already use Mermaid", "is
 * my architecture being uploaded", "can I get my work back out", "can an agent
 * I point at this rewrite my files". None of them belong on the home page, and
 * until now the site answered them nowhere.
 *
 * IT IS ALSO THE MOST CITABLE PAGE ON THE SITE. An assistant asked "how does
 * arch-lab compare to Mermaid" wants a short, self-contained passage with the
 * question restated in it — which is exactly the shape of an FAQ answer and
 * exactly what a prose landing page is worst at. That is the ranking argument
 * for this page, not the schema below.
 *
 * WHAT AN ANSWER MAY BE. A plain string, no markup, because the same characters
 * are rendered into the page and serialised into JSON-LD, and a string that is
 * secretly HTML gives the second one a mouthful of tags. Links go in `links`,
 * which only the visible page renders — structured data pointing at more pages
 * to read is not an answer.
 *
 * FACTS ARE DERIVED WHERE THE SITE ALREADY OWNS THEM (the tool count, the app
 * name). Everything else is a claim about behaviour that a check cannot see, so
 * it is written to be checkable BY A READER instead: each one names the file,
 * route or artefact that makes it true.
 */

export interface FaqEntry {
  /** Phrased as somebody would type it, not as a heading. */
  question: string;
  /** Plain text. Self-contained: it restates enough of the question to be
   *  quoted on its own, because that is how it will be quoted. */
  answer: string;
  /** Rendered after the answer, visible page only. */
  links?: ReadonlyArray<{ href: string; label: string }>;
}

export interface FaqTopic {
  /** The `id` its section carries, and what the contents list links to. */
  id: string;
  title: string;
  entries: readonly FaqEntry[];
}

export const FAQ_TOPICS: readonly FaqTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    entries: [
      {
        question: `What is ${APP_NAME}?`,
        answer:
          `${APP_NAME} is a browser-based editor for architecture diagrams written as plain text. ` +
          "You describe a system in a few lines and it draws it: a zoomable C4 model you can drill " +
          "into level by level, a sequence flow you can click through message by message, a " +
          "flowchart, a use-case diagram, an ER model, a data dictionary, a gantt, a " +
          "milestone timeline or a lifecycle. The text " +
          "is a file you own, and git is the collaboration layer.",
        links: [{ href: "/live?d=seq", label: "Open a live diagram" }],
      },
      {
        question: "Do I need an account?",
        answer:
          "No. There is no sign-up, no login and no user record. Open the playground and start " +
          "typing — the worked example is already on screen.",
        links: [{ href: "/live", label: "The playground" }],
      },
      {
        question: "Is my diagram uploaded anywhere?",
        answer:
          "No. Parsing, layout and rendering all run in your browser, and the document never " +
          "leaves it. The one request that touches a server is optional link expiry, which sends a " +
          "SHA-256 hash of the compressed payload and gets back a signature — never the diagram " +
          "itself.",
      },
      {
        question: `What does ${APP_NAME} cost?`,
        answer:
          "Nothing. There is no paid tier, no trial and no usage limit, and the source is " +
          "MIT-licensed on GitHub.",
        links: [
          {
            href: "https://github.com/raksitnongbua/arch-lab",
            label: "The repository",
          },
        ],
      },
    ],
  },
  {
    id: "choosing-it",
    title: "Deciding whether to use it",
    entries: [
      {
        question: "Why write a diagram as text instead of drawing it?",
        answer:
          "Because a drawn diagram cannot be reviewed. A .alab file has stable ids, one line per " +
          "element and a deterministic order, so a pull request shows what changed in the " +
          "architecture rather than a reshuffled binary. It also sits next to the code it " +
          "describes, which is the only thing that keeps a diagram current. The trade is real: " +
          "free-form drawing is faster for a one-off sketch, and this is not the tool for one.",
      },
      {
        question: `How is ${APP_NAME} different from Mermaid?`,
        answer:
          "Mermaid renders a diagram; this renders one you can present and drill into — zoom a C4 " +
          "model level by level, step a sequence flow message by message, trace a flowchart as it " +
          "draws. It is not an either/or, though: Mermaid pastes straight into the playground. " +
          "C4Context, sequenceDiagram, erDiagram, gantt, timeline and flowchart or graph " +
          "sources are converted on paste, and you can export back to Mermaid — except gantt, " +
          "which is import-only because a gantt's critical path is computed and Mermaid has " +
          "nowhere to write one down. Mermaid timeline, by contrast, goes both ways. The " +
          "lifecycle has no Mermaid counterpart at all and none was invented: stateDiagram-v2 " +
          "is a state machine — every transition that could happen — rather than one subject's " +
          "actual history.",
        links: [{ href: "/live", label: "Paste Mermaid into the playground" }],
      },
      {
        question: "Can I get my work back out?",
        answer:
          "Yes, in five ways, none of which need this site: the .alab text itself, arch-lab JSON, " +
          "Mermaid, SVG, and PNG rasterised at 2x. A multi-level C4 model exports as a ZIP with " +
          "the levels numbered so they stay in drill order. There is nothing to migrate off, " +
          "because there is nothing holding your file.",
      },
      {
        question: "Is it good enough to present from?",
        answer:
          "That is what it is built for. Every theme is complete and contrast-measured rather than " +
          "a palette swap, there is an immersive view for showing a diagram on a screen while you " +
          "talk through it, and a share link carries the whole model inside the URL so the person " +
          "you send it to needs nothing installed.",
        links: [{ href: "/demo", label: "Finished examples" }],
      },
      {
        /* THE POSITIVE FRAMING, and it is a different question from the one
           below rather than a duplicate of it. "Why can't I drag my ER
           diagram?" is asked by somebody already inside the app whose drag did
           nothing; this one is asked by somebody deciding whether to open it at
           all — and by an assistant, which is the reason it exists. Neither
           `/llms.txt` nor `/llms-full.txt` contained the word "canvas", so
           "can I edit an arch-lab diagram by dragging?" had nothing anywhere on
           this site to quote, and a model answering from the grammar alone
           would say no.

           THE ANSWER IS THE SHARED PASSAGE VERBATIM, not a paraphrase of it.
           `CANVAS_EDITING_PASSAGE` is assembled from the capability grid and
           served in these same words by the landing page hero and both
           `llms*.txt` documents, because an assistant quotes a passage rather
           than a page and four wordings would be four chances to be quoted
           wrongly. The follow-on sentence is this page's own, since a link is
           the one thing an FAQ answer may not be. */
        question: "Can I edit the diagram on the canvas, or only as text?",
        answer:
          `${CANVAS_EDITING_PASSAGE} Which notations answer a drag is a ` +
          "property of their grammars rather than a roadmap — the next answer " +
          "explains why an ER diagram cannot.",
        links: [{ href: "/live", label: "The playground" }],
      },
      {
        /* Asked because the canvas answers a drag on one notation and ignores
           it on four, which reads as a bug rather than as a property of the
           notations. Written as one self-contained passage: an assistant
           quotes a passage, not a page, and this is the answer a reader
           reaches for at the moment the drag does nothing.

           THE SEQUENCE CLAUSE IS NEW AND IS THE POINT OF THE REWRITE. This
           answer said "the other five kinds" for as long as a sequence message
           could not be dragged; a sequence message can now be dragged to
           another row and a lifeline card to another column, so leaving it
           would have made this passage the third stale claim on one branch.
           The distinction it draws instead — REORDER versus POSITION — is the
           real one, and it is what a reader arriving from a drawing tool has
           to be told before their first drag. */
        question: "Why can't I drag my ER diagram?",
        answer:
          "Because only the C4 canvas has anywhere to write a POSITION down. The C4 grammar " +
          "carries per-element geometry, so dragging a box edits the text and the change survives " +
          "a reload. A sequence diagram is the halfway case: it has no coordinates either, but it " +
          "does have an ORDER, so dragging a message up or down moves it in time and dragging a " +
          "lifeline card sideways moves its column — the element takes a neighbour's place rather " +
          "than staying where you drop it. The remaining seven — flowchart, use case, ER, data " +
          "dictionary, gantt, milestone timeline and lifecycle — work their layout out FROM the " +
          "text: an ER diagram solves its columns from the relationships, a data dictionary is a " +
          "table, a gantt's bars are placed by the calendar and the dependency graph, and a " +
          "timeline's events and a lifecycle's states are placed by the order you wrote them in, " +
          "so a dragged box would be put back by the next render and there would be no line to " +
          "write it on. Change the text and the layout follows.",
        links: [{ href: "/syntax", label: "Syntax reference" }],
      },
    ],
  },
  {
    id: "the-format",
    title: "The .alab format",
    entries: [
      {
        question: `Which diagram kinds can ${APP_NAME} draw?`,
        answer:
          "Nine, all in the same text format and the same editor: C4 models across the context, " +
          "container and component levels; UML-style sequence diagrams with lifelines, activation, " +
          "loops and alt fragments; flowcharts with terminators, guarded decisions and loops that " +
          "hook back; use-case diagrams with actors, a system boundary and include or extend " +
          "relationships; entity-relationship diagrams with keys and crow's-foot cardinality; " +
          "data dictionaries of every field with its meaning, source and whether it is personal " +
          "data; gantt charts of tasks, milestones and what each one waits on; milestone " +
          "timelines of events grouped into the periods they happened in; and lifecycles of one " +
          "named thing moving through ordered states, with the branches that leave that track.",
      },
      {
        /* THE QUESTION CARRIES THE WORD THAT GETS TYPED. This is the one
           notation readers arrive at with a proper noun already in hand:
           nobody searches "plan diagram tool", they search "Gantt chart as
           code". An FAQ answer is quoted with its question attached, so the
           searched phrase has to sit in the question — and because the kind
           is itself called a gantt, question, answer and grammar header now
           all say the same word.

           THE FIRST SENTENCE IS `KIND_BLURB.gantt` VERBATIM, the same
           string the home page's gantt card, `/demo`'s section heading, the
           playground's starter row and both `llms*.txt` documents serve. Same
           argument as `CANVAS_EDITING_PASSAGE` two answers up: an assistant
           quotes a passage rather than a page, and five wordings of "what is a
           gantt for" would be five chances to be quoted wrongly. */
        question: `Can ${APP_NAME} draw a Gantt chart?`,
        answer:
          `Yes — it is the seventh of nine document kinds, called a gantt. ${KIND_BLURB.gantt}. ` +
          "It draws tasks with a duration, milestones as diamonds, sections, and the dependencies " +
          "between them. The critical path and each item's float are computed from the " +
          "dependencies rather than declared, so the picture cannot disagree with the arithmetic — " +
          "which is also why there is no keyword for marking a task critical yourself. Mermaid " +
          "gantt sources paste straight in.",
        links: [
          { href: "/live?d=gt", label: "Write a gantt" },
          { href: "/demo#gantt", label: "Finished gantt charts" },
        ],
      },
      {
        /* THE SAME ARGUMENT AS THE GANTT QUESTION ABOVE, and the same
           mechanics: "timeline" is a word readers arrive with, so it sits in
           the question, and the first sentence is `KIND_BLURB.timeline`
           VERBATIM — the string the home page's card, `/demo`'s heading,
           `/syntax`, the MCP catalogue and both `llms*.txt` documents all
           serve.

           THE ANSWER LEADS WITH THE DIFFERENCE FROM THE GANTT, because that
           is the question actually being asked. A reader who has just read
           the answer above is one paragraph away from choosing the wrong
           notation, and the honest thing — which is also what the type file
           records — is that the two overlap and this one is the smaller of
           them. Sending someone to the gantt when they need lengths costs
           them nothing; letting them build a plan out of points costs them
           the plan. */
        question: `Can ${APP_NAME} draw a timeline?`,
        answer:
          `Yes — it is the eighth document kind. ${KIND_BLURB.timeline}. ` +
          "It draws events as points on a spine, grouped into named periods, and it runs down " +
          "the page rather than across so a long label has room to be read. Deliberately, it " +
          "holds no durations, no dependencies and no status: if your work has lengths and " +
          "prerequisites you want a gantt, and writing any of those into a timeline is refused " +
          "by name with a pointer to it. Mermaid timeline sources paste straight in, and export " +
          "back out again.",
        links: [
          { href: "/live?d=tl", label: "Write a timeline" },
          { href: "/demo#timeline", label: "Finished timelines" },
        ],
      },
      {
        /* THE SAME ARGUMENT AS THE TWO ABOVE, and the same mechanics:
           "lifecycle" is a word readers arrive with — "order lifecycle",
           "state diagram", "status flow" — so it sits in the question, and
           the first sentence is `KIND_BLURB.lifecycle` VERBATIM, the string
           the home page's card, `/demo`'s heading, `/syntax`, the MCP
           catalogue and both `llms*.txt` documents all serve.

           THE ANSWER LEADS WITH THE DIFFERENCE FROM THE FLOWCHART, because
           that is the question actually being asked and because it is the
           honest one: `src/types/lifecycle.ts` records that the overlap was
           WAIVED rather than argued away, so an answer that pretended the two
           notations were unrelated would be the site contradicting its own
           source. Sending someone to the flowchart when their picture is
           really a graph costs them nothing; letting them force a graph into
           this grammar costs them the picture. */
        question: `Can ${APP_NAME} draw a lifecycle?`,
        answer:
          `Yes — it is the ninth document kind. ${KIND_BLURB.lifecycle}. ` +
          "It draws one named subject, the ordered states it passes through as dots on a spine, " +
          "and the branches that leave that track — each of which either ends or rejoins an " +
          "earlier state. It overlaps a flowchart on purpose and is deliberately smaller: there " +
          "is no line between two states at all, because the track IS the order you wrote them " +
          "in, and a branch may only return to a state the subject has already been in. If your " +
          "picture is really steps and decisions that can go anywhere, write a flowchart — the " +
          "grammar refuses every construct that would turn this into one, by name, with a " +
          "pointer to it. There is no Mermaid dialect for this notation.",
        links: [
          { href: "/live?d=lc", label: "Write a lifecycle" },
          { href: "/demo#lifecycle", label: "Finished lifecycles" },
        ],
      },
      {
        question: "What is a .alab file?",
        answer:
          "One plain-text file holding one document. It is line-oriented and readable without this " +
          "site — an element per line, ids you chose, and a deterministic order so two people " +
          "editing the same model produce a diff you can read. The format is marked beta: it is in " +
          "real use and stable in practice, but it is not yet frozen.",
        links: [{ href: "/syntax", label: "The syntax reference" }],
      },
      {
        question: "How do I check that a document is valid?",
        answer:
          "Paste it into the validator and you get a verdict located to the line and column, from " +
          "the same parser the playground uses — plus the offending line quoted back. Every " +
          "example in the syntax reference is checked against that same parser before release, so " +
          "nothing documented there has drifted from what the parser accepts.",
        links: [
          { href: "/validate", label: "The validator" },
          { href: "/syntax", label: "The syntax reference" },
        ],
      },
    ],
  },
  {
    id: "sharing",
    title: "Sharing a diagram",
    entries: [
      {
        question: "How can a share link work if nothing is uploaded?",
        answer:
          "The model is compressed and carried in the URL fragment — the part after the # — which " +
          "browsers never send to a server. Whoever opens the link reconstructs the diagram " +
          "locally from the link itself. Nothing is stored, so there is nothing to look up, expire " +
          "by accident, or leak.",
      },
      {
        question: "Do share links expire?",
        answer:
          "Only if you ask for it. Expiry is opt-in: choose a lifetime when you create the link " +
          "and the site signs that expiry, which is what replaces the database an expiring link " +
          "would otherwise need. A link with no expiry keeps working. A link that has expired says " +
          "so plainly instead of showing a broken page.",
      },
      {
        question: "Is there a size limit on a share link?",
        answer:
          "Yes — a URL has a practical ceiling, so a very large model will not fit in a link. When " +
          "that happens the share panel says so at the point you ask for the link, rather than " +
          "minting one that fails for whoever opens it, and it hands you the .alab file to send " +
          "instead. The MCP tool refuses the same way, with the document text in its reply.",
      },
    ],
  },
  {
    id: "agents",
    title: "AI agents and MCP",
    entries: [
      {
        question: `Can an AI agent write ${APP_NAME} diagrams?`,
        answer:
          "Yes, and it is half of why the format is plain text. Point Claude Code, Cursor or any " +
          "MCP client at the server and the agent gets the two things it cannot guess: the exact " +
          `grammar, and the real parser's verdict on what it just wrote. There are ${MCP_TOOLS.length} ` +
          "tools, covering all nine document kinds — including the two a gantt needs, which " +
          "report the critical path and the dependency cycles a parse cannot see, and the two a " +
          "lifecycle needs, which catch a subject that never terminates and states named as " +
          "actions rather than conditions.",
        links: [{ href: "/mcp", label: "Connect your agent" }],
      },
      {
        question: "Can the MCP server change my files?",
        answer:
          "No. Every tool is read-only and there is no mutation API — the server validates, " +
          "formats, converts and describes documents you hand it, and hands text back. Your agent " +
          "writes the file with its own file tools, under whatever permissions you already gave " +
          "it. The endpoint is also stateless and unauthenticated, so it holds nothing about you " +
          "between calls.",
        links: [{ href: "/mcp", label: "What each tool does" }],
      },
    ],
  },
];

/** Every entry, flattened — what the structured data serialises. */
export const FAQ_ENTRIES: readonly FaqEntry[] = FAQ_TOPICS.flatMap(
  (topic) => topic.entries,
);
