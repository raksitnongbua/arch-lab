/**
 * The forks this server can prove but must not settle.
 *
 * `lib/render.ts` owns the ENVELOPE — the `AskHuman` shape and the text it
 * renders as. This module owns the QUESTIONS: when each one fires, what its
 * options are, and what taking one costs. They are separate because the
 * envelope is presentation and these are policy, and the policy is the part
 * with a rule behind it:
 *
 *   **Ask only when the server can prove the fork FROM THE ARGUMENTS ALONE,
 *   and when the wrong branch cannot be undone by the agent later.**
 *
 * Everything an agent could fix after seeing a normal result stays a normal
 * result. That is why the review notes stay review notes (see
 * `ADVISORY_INSTRUCTIONS` in `render.ts`), why a call whose format is forced by
 * an explicit argument never asks about format — that argument IS the agent
 * saying it already chose — and why the target is that an agent on the happy
 * path (reference → draft → validate → format → share) sees no ask at all.
 * `check:mcp` holds that target: every bundled example through its own
 * `validate_*` must come back with no ask, because the bundled models are the
 * definition of an unambiguous document.
 *
 * WHAT IS DELIBERATELY NOT ASKED, each because the format cannot record the
 * answer, so asking would collect a preference and then drop it:
 *
 *   - **Theme.** `.alab` has no theme header and a share link carries none.
 *     The viewer chooses, per reader.
 *   - **Layout direction.** Reachable from the canvas and from a `direction`
 *     line, but not from any tool here: a tool sees text, and if the text says
 *     nothing about direction there is nothing for an answer to change.
 *   - **C4 level depth.** The `author_c4_model` PROMPT takes `levels`, because
 *     a prompt is invoked by the human. A tool cannot see the request behind
 *     the text it was handed.
 */

import type { AlabDocumentKind } from "@/features/archtext";
import { KIND_BLURB } from "@/features/playground/lib/kind-copy";
import type { ArchLabFile, C4Diagram } from "@/types";
import type { SequenceLabFile } from "@/types/sequence";
import { eachMessage } from "@/features/sequence/lib/collapse";

import type { AskHuman, AskOption } from "./render";

/** The escape every question ends with, in one place. */
const OWN_WORDS = "Or they can say what they meant in their own words.";

/**
 * The one repair an agent must NOT make, said in the result as well as in the
 * tool description (`NOT_A_HEADER_BUG` in `catalog.ts` — the same rule, for
 * the model reading before it acts rather than after).
 *
 * The failure is specific and was the likeliest one: told "the C4 tools cannot
 * read this", an agent's cheapest edit is to change `archlab 1.0 gantt` on
 * line 1 to `archlab 1.0` — the single change that makes every other line of a
 * gantt meaningless — and then to report the resulting parse errors as the
 * document's problem.
 */
const KEEP_THE_HEADER =
  'Do not "fix" line 1: the header names the notation the rest of the ' +
  "document is written in, and changing it converts nothing.";

/* -------------------------------------------------------------------------- */
/* The notation fork: this text is not the kind you called                     */
/* -------------------------------------------------------------------------- */

type OtherKind = Exclude<AlabDocumentKind, "c4">;

/** The tool that reads each kind, so the ask can name the one hop out. */
const KIND_VALIDATOR: Record<OtherKind, string> = {
  sequence: "validate_sequence",
  flowchart: "validate_flowchart",
  usecase: "validate_usecase",
  er: "validate_er",
  dict: "validate_dict",
  gantt: "validate_gantt",
  timeline: "validate_timeline",
  lifecycle: "validate_lifecycle",
};

/**
 * What rewriting each kind as C4 would DESTROY, named per kind.
 *
 * The consequence of "stay in C4" cannot be generic, because the whole reason
 * to ask is that the two branches lose different things: a gantt loses time, a
 * dictionary loses meanings, an ER schema loses its keys. A shared sentence
 * ("some detail would be lost") is the sentence that makes an agent pick for
 * the human, which is what this envelope exists to stop.
 */
const C4_REWRITE_COST: Record<OtherKind, string> = {
  sequence:
    "You would be rewriting a flow as structure: the participants become " +
    "nodes and the ORDER of the messages — the point of the document — has " +
    "nowhere to go.",
  flowchart:
    "You would be rewriting steps as structure: a decision's branches become " +
    "ordinary lines and the loops back stop reading as loops.",
  usecase:
    "You would be rewriting the system's edge as structure: actors become " +
    "nodes, and «include» and «extend» have no C4 counterpart.",
  er:
    "You would be rewriting a schema as structure: entities become " +
    "containers and every column, key and cardinality is lost.",
  dict:
    "You would be rewriting a dictionary as structure: no C4 element carries " +
    "a field's meaning, its source or its `pii` flag.",
  gantt:
    "You would be rewriting a plan as structure: tasks become containers and " +
    "every duration and prerequisite is lost.",
  timeline:
    "You would be rewriting a history as structure: events become nodes and " +
    "the periods they happened in are lost.",
  lifecycle:
    "You would be rewriting one subject's states as structure: `ends`, " +
    "`exit` and `when` have no C4 counterpart, so every branch becomes an " +
    "unlabelled line.",
};

/**
 * The C4 door met a document of another kind.
 *
 * This REPLACES three prose refusals that `lib/read.ts` carried for
 * flowchart, use-case and sequence, and extends the same treatment to the five
 * kinds that had none — those five used to come back as a C4 line-1 parse
 * error, which reads as "your syntax is wrong" when only the tool choice was.
 * It is a question rather than a redirect because the server genuinely does
 * not know which of the two the human wants: the text says one thing and the
 * tool call says another, and only a person knows which was the mistake.
 *
 * `defaultId` is the DETECTED kind, because the text is evidence and the tool
 * name is a guess: whoever wrote `archlab 1.0 gantt` on line 1 meant a gantt.
 */
export function notationFork(kind: OtherKind): AskHuman {
  return {
    reason:
      `This text is a \`${kind}\` document, not a C4 model, so the C4 tools ` +
      "cannot read it — and the C4 tools are what was called. Rewriting one " +
      "notation as another is not a conversion this server will do unasked. " +
      KEEP_THE_HEADER,
    question: "Which picture does your human actually want?",
    options: [
      {
        id: kind,
        label: KIND_BLURB[kind],
        consequence:
          `${KIND_VALIDATOR[kind]} reads this exact text. Nothing to ` +
          "rewrite, and no detail is lost.",
        next: { tool: KIND_VALIDATOR[kind], args: {} },
      },
      {
        id: "c4",
        label: KIND_BLURB.c4,
        consequence: C4_REWRITE_COST[kind],
      },
    ],
    otherwise: OWN_WORDS,
    defaultId: kind,
  };
}

/* -------------------------------------------------------------------------- */
/* The step-like fork: valid C4 that reads as a sequence of steps              */
/* -------------------------------------------------------------------------- */

/**
 * Words that turn a relationship label into a STEP NUMBER.
 *
 * ANCHORED AT THE START AND ON A WORD BOUNDARY, the same discipline
 * `validate_lifecycle`'s step-verb table states and for the same reason: a
 * pattern matched anywhere in the label would fire on "Reads orders after
 * checkout", which is a perfectly good relationship label describing when a
 * read happens rather than numbering a step. A TABLE rather than one regex so
 * the finding can quote the word it matched — "«then» opens three of these
 * labels" is actionable where "this looks like a sequence" is a verdict the
 * caller has to translate first.
 *
 * WHAT IS DELIBERATELY ABSENT, because a false positive costs more here than
 * a miss: `finally` and `first` are as often adverbs of emphasis as of order,
 * and `via`, `during` and `while` describe a relationship rather than order it.
 */
const ORDINAL_LABEL_WORDS: readonly { pattern: RegExp; word: string }[] = [
  { pattern: /^\d+[.)]/, word: "a step number" },
  { pattern: /^then\b/i, word: "then" },
  { pattern: /^next\b/i, word: "next" },
  { pattern: /^after\b/i, word: "after" },
];

/**
 * How many labels must be ordinal before the document reads as steps. Three
 * fifths rather than a majority: two ordinal labels out of three is a
 * coincidence a reviewer would shrug at, and this finding has to be rare or it
 * is noise on every model whose author wrote "Then notifies".
 */
const ORDINAL_LABEL_SHARE = 0.6;

/** Fewer edges than this in one chain is a diagram, not a sequence. */
const MIN_CHAIN_EDGES = 3;

function labelsOf(diagram: C4Diagram): string[] {
  return diagram.edges
    .map((edge) => edge.label?.trim() ?? "")
    .filter((label) => label !== "");
}

/**
 * Is every relationship in this diagram a link in ONE chain — a -> b -> c -> d
 * with nothing branching off it? Proved by degree rather than by walking:
 * in a single open path every node has at most one edge in and at most one
 * out, and exactly one node has none in.
 */
function isSingleChain(diagram: C4Diagram): boolean {
  if (diagram.edges.length < MIN_CHAIN_EDGES) return false;
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  for (const edge of diagram.edges) {
    if (edge.source === edge.target) return false;
    out.set(edge.source, (out.get(edge.source) ?? 0) + 1);
    into.set(edge.target, (into.get(edge.target) ?? 0) + 1);
  }
  for (const degree of [...out.values(), ...into.values()]) {
    if (degree > 1) return false;
  }
  const endpoints = new Set([...out.keys(), ...into.keys()]);
  const starts = [...endpoints].filter((id) => (into.get(id) ?? 0) === 0);
  return starts.length === 1;
}

/**
 * Why this valid C4 model reads as an ordered flow rather than a structure —
 * or `null`, which is the answer for almost every model and must stay so.
 *
 * TWO STRUCTURAL VETOES COME FIRST, and they are what makes this rare enough
 * to ship. A model with FRAMES has an authored boundary, and a boundary is a
 * statement about structure that no sequence diagram can make. A model with
 * TWO OR MORE DIAGRAMS drills down, and drilling down is the other thing C4
 * has that a flow does not. Either one present means the author has already
 * said "this is structure", and the server has no business asking again.
 */
export function stepLikeReading(file: ArchLabFile): string | null {
  if (file.diagrams.length >= 2) return null;
  const root = file.diagrams.find(
    (diagram) => diagram.id === file.rootDiagramId,
  );
  if (root === undefined) return null;
  if ((root.frames ?? []).length > 0) return null;

  const labels = labelsOf(root);
  if (labels.length >= 2) {
    const matched = labels.flatMap((label) => {
      const hit = ORDINAL_LABEL_WORDS.find((entry) =>
        entry.pattern.test(label),
      );
      return hit === undefined ? [] : [hit.word];
    });
    if (matched.length / labels.length >= ORDINAL_LABEL_SHARE) {
      const words = [...new Set(matched)].map((word) =>
        word.startsWith("a ") ? word : `«${word}»`,
      );
      return (
        `${matched.length} of the ${labels.length} labelled relationships ` +
        `open with ${words.join(" or ")}. A relationship label says what ` +
        "flows; a step number says when it runs, which is a different " +
        "diagram."
      );
    }
  }

  if (isSingleChain(root)) {
    return (
      `All ${root.edges.length} relationships form one unbranched chain — ` +
      "every element has at most one line in and one out — which is the " +
      "shape of a call sequence rather than of a system's structure."
    );
  }
  return null;
}

/**
 * The step-like fork. Three options rather than two: "this is really a
 * sequence" and "this is really a flowchart" are genuinely different answers
 * (participants over time versus steps and decisions), and offering only one
 * of them would decide half the question for the human.
 *
 * `defaultId` is `null`. There is no safe default: the model is VALID C4, so
 * doing nothing is defensible, and so is every other branch — which is exactly
 * the case where a default would be the server making the call.
 */
export function stepLikeFork(because: string): AskHuman {
  return {
    reason: `The model is valid C4 and can be shared as it stands. But ${because}`,
    question:
      "Did your human want a picture of the system's structure, or of what " +
      "happens in what order?",
    options: [
      {
        id: "c4",
        label: KIND_BLURB.c4,
        consequence:
          "Keep the document exactly as it is. Worth relabelling the " +
          "relationships to say what flows rather than when it runs.",
      },
      {
        id: "sequence",
        label: KIND_BLURB.sequence,
        consequence:
          "Rewrite as an `archlab 1.0 sequence` document: the elements " +
          "become participants and the order becomes the vertical axis, " +
          "which is where the ordering stops being prose.",
        next: { tool: "validate_sequence", args: {} },
      },
      {
        id: "flowchart",
        label: KIND_BLURB.flowchart,
        consequence:
          "Rewrite as an `archlab 1.0 flowchart` document: choose this when " +
          "the interesting part is the branching rather than who calls whom.",
        next: { tool: "validate_flowchart", args: {} },
      },
    ],
    otherwise: OWN_WORDS,
    defaultId: null,
  };
}

/* -------------------------------------------------------------------------- */
/* The hub-and-spoke fork: a sequence that reads as a context diagram          */
/* -------------------------------------------------------------------------- */

/** Four participants is where "everyone talks to one thing" starts to mean it. */
const MIN_HUB_PARTICIPANTS = 4;

/**
 * How concentrated the traffic must be. Nine tenths, not a majority: a flow
 * with a busy service in it is normal, and only a flow where essentially
 * NOTHING happens between the other participants is drawing a context diagram
 * on a time axis.
 */
const HUB_SHARE = 0.9;

/**
 * Why this valid sequence reads as a C4 context diagram — or `null`.
 *
 * SELF-MESSAGES ARE EXCLUDED from the denominator: a participant validating
 * its own cart is work, not a call to the hub, and counting it would let a
 * document with one busy self-loop tip over the threshold.
 */
export function hubAndSpokeReading(file: SequenceLabFile): string | null {
  if (file.participants.length < MIN_HUB_PARTICIPANTS) return null;
  const messages = eachMessage(file.items).filter(
    (message) => message.to !== message.from,
  );
  if (messages.length === 0) return null;

  const tally = new Map<string, number>();
  for (const message of messages) {
    tally.set(message.to, (tally.get(message.to) ?? 0) + 1);
  }
  const [hub, count] = [...tally].reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  );
  if (count / messages.length < HUB_SHARE) return null;

  return (
    `${count} of the ${messages.length} messages between participants are ` +
    `aimed at \`${hub}\`, and almost nothing passes between the other ` +
    `${file.participants.length - 1}. That is a context diagram — one thing ` +
    "in the middle and its neighbours around it — drawn on a time axis."
  );
}

/**
 * The hub-and-spoke fork. `defaultId` is `null` for the same reason the
 * step-like one is: the document is VALID, so no branch is a repair.
 */
export function hubAndSpokeFork(because: string): AskHuman {
  return {
    reason: `The diagram is valid and renders as it stands. But ${because}`,
    question:
      "Did your human want the order these calls happen in, or a picture of " +
      "which systems touch which?",
    options: [
      {
        id: "sequence",
        label: KIND_BLURB.sequence,
        consequence:
          "Keep the document as it is. Right when the ORDER is the point — " +
          "a handshake, a retry, a timeout.",
      },
      {
        id: "c4",
        label: KIND_BLURB.c4,
        consequence:
          "Rewrite as a C4 context diagram, where the hub sits in the middle " +
          "and each neighbour gets one labelled line. The order of the calls " +
          "is what that loses.",
        next: { tool: "validate_model", args: {} },
      },
    ],
    otherwise: OWN_WORDS,
    defaultId: null,
  };
}

/* -------------------------------------------------------------------------- */
/* The which-diagram fork                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Below this many diagrams, defaulting to the root is obviously right — there
 * is barely a choice to get wrong.
 */
const MIN_DIAGRAMS_TO_ASK = 3;

/**
 * A root this small is a SIGNPOST rather than a picture: three boxes saying
 * "a customer, the system, a payment provider". Emitting it as the answer to
 * "show me this model" hands over the one diagram that contains none of the
 * detail, which is the mistake this asks about. A root with real content in it
 * is a fine default and is not asked about.
 */
const MAX_SIGNPOST_ROOT_NODES = 3;

/** Never more than five options — see `AskHuman.options`. */
const MAX_DIAGRAM_OPTIONS = 5;

/** What `renderDiagramTable` renders, which is what this asks over. */
export interface DiagramFacts {
  id: string;
  title: string;
  level: string;
  nodeCount: number;
  edgeCount: number;
}

/**
 * One diagram had to be picked and the caller did not pick it.
 *
 * FIRES ONLY WHEN ALL THREE HOLD: no `diagram_id` was given, the model has
 * enough diagrams for the choice to be real, and the root is too thin to be
 * what anyone meant. An explicit `diagram_id` never asks — that argument is
 * the agent telling the server it already chose, and second-guessing it would
 * make the tool unusable in a loop.
 *
 * `defaultId` is the root, which is what the tools have always silently used.
 * The ask does not change the fallback; it makes the fallback visible.
 */
export function diagramFork(
  /** The tool raising it, so the option's consequence can name the effect. */
  tool: "convert_model" | "create_share_link",
  diagrams: readonly DiagramFacts[],
  rootDiagramId: string,
  requestedDiagramId: string | undefined,
): AskHuman | null {
  if (requestedDiagramId !== undefined) return null;
  if (diagrams.length < MIN_DIAGRAMS_TO_ASK) return null;
  const root = diagrams.find((diagram) => diagram.id === rootDiagramId);
  if (root === undefined) return null;
  if (root.nodeCount > MAX_SIGNPOST_ROOT_NODES) return null;

  // Root first: it is the default, and option 1 is where a reader looks for it.
  const ordered = [root, ...diagrams.filter((d) => d.id !== rootDiagramId)];
  const effect =
    tool === "convert_model"
      ? "Emits this diagram alone"
      : "Opens the link at this diagram";

  return {
    reason:
      `This model has ${diagrams.length} diagrams and no \`diagram_id\` was ` +
      `given, so the root \`${rootDiagramId}\` would be used — and the root ` +
      `holds only ${root.nodeCount} element(s), which is a signpost rather ` +
      "than the picture anybody asked to see.",
    question: "Which diagram does your human want to look at?",
    options: ordered
      .slice(0, MAX_DIAGRAM_OPTIONS)
      .map((diagram): AskOption => ({
        id: diagram.id,
        label: `@${diagram.level} ${JSON.stringify(diagram.title)}`,
        consequence:
          `${effect}: ${diagram.nodeCount} node(s), ` +
          `${diagram.edgeCount} edge(s).`,
        next: { tool, args: { diagram_id: diagram.id } },
      })),
    otherwise:
      `Or they can name any of the ${diagrams.length} diagrams by id, or say ` +
      "in their own words which part of the system they mean.",
    defaultId: rootDiagramId,
  };
}

/* -------------------------------------------------------------------------- */
/* The which-icon fork                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Between these many matches a search is a question, not an answer.
 *
 * The lower bound is where a list stops being a lookup. The upper bound is
 * `AskHuman.options`' own ceiling rather than a separate judgement: a query
 * with six or more hits is a browse, and it comes back as the plain list it
 * always did — truncating the options to five would have hidden a candidate
 * behind a question that claimed to enumerate them.
 */
const MIN_ICON_CANDIDATES = 2;

/** What "an exact hit" means: the query IS one of the things the icon is called. */
export interface IconCandidate {
  slug: string;
  name: string;
  aliases: readonly string[];
  categoryLabel: string;
}

/**
 * Several plausible marks and nothing the query names outright.
 *
 * `postgres` must resolve silently — it is a declared alias of `postgresql`,
 * so the caller has already named the icon and a question would be an
 * obstruction. `sql` names nothing: it matches several unrelated marks
 * through their descriptions, and picking the first is how a diagram ends up
 * with the wrong database on it. A wrong `@slug` is the ONE authoring mistake
 * no validator will ever report (`tools/icons.ts` says why), which is what
 * puts this over the "the agent could fix it later" bar — nothing downstream
 * will ever tell it.
 *
 * `defaultId` is `null`: there is no defensible first choice among marks that
 * are all equally distant from what was typed.
 */
export function iconFork(
  query: string,
  candidates: readonly IconCandidate[],
): AskHuman | null {
  const wanted = query.trim().toLowerCase();
  if (wanted === "") return null;
  if (
    candidates.length < MIN_ICON_CANDIDATES ||
    candidates.length > MAX_DIAGRAM_OPTIONS
  ) {
    return null;
  }
  const exact = candidates.some(
    (candidate) =>
      candidate.slug.toLowerCase() === wanted ||
      candidate.name.toLowerCase() === wanted ||
      candidate.aliases.some((alias) => alias.toLowerCase() === wanted),
  );
  if (exact) return null;

  return {
    reason:
      `${candidates.length} icons match ${JSON.stringify(query)} and none of ` +
      "them is called that. An `@slug` that names nothing never errors — the " +
      "canvas falls back to the node type's generic icon — so guessing here " +
      "renders the wrong picture and nothing ever reports it.",
    question: "Which mark does your human mean?",
    options: candidates.map((candidate): AskOption => ({
      id: candidate.slug,
      label: candidate.name,
      consequence:
        `Writes \`@${candidate.slug}\` on the node, which draws the ` +
        `${candidate.name} mark from the ${candidate.categoryLabel} ` +
        "category.",
    })),
    otherwise:
      "Or they can name the product in their own words, or supply their own " +
      'artwork with a `customicon <slug> "Name" "<svg>…"` header line.',
    defaultId: null,
  };
}

/* -------------------------------------------------------------------------- */
/* The too-big-to-link fork                                                    */
/* -------------------------------------------------------------------------- */

/** A measured, fitting, diagram-scoped link — `tools/share.ts` builds these. */
export interface ScopedLinkOffer {
  diagramId: string;
  title: string;
  url: string;
}

/** The one option that is not a diagram, so the check can find it by id. */
export const SEND_THE_FILE_OPTION_ID = "file";

/**
 * The model does not fit in a URL.
 *
 * ALREADY AN ASK IN PROSE before this existed — the refusal listed the scoped
 * links that fit and the canonical text to send instead, and then left the
 * agent to choose between them. Re-emitting it through the envelope changes
 * nothing about what is offered; it gives the offer the header that tells the
 * agent to stop, and takes `isError` off a result that had done all its work.
 *
 * Returns `null` when no scoped link fits: there is then ONE thing to do (send
 * the file), and one option is not a fork — the plain refusal is the honest
 * shape for it.
 */
export function oversizeShareFork(
  urlLength: number,
  ceiling: number,
  offers: readonly ScopedLinkOffer[],
): AskHuman | null {
  if (offers.length === 0) return null;
  return {
    reason:
      `The whole model encodes to a ${urlLength.toLocaleString("en-US")}-` +
      `character URL, over the ${ceiling.toLocaleString("en-US")}-character ` +
      "ceiling past which enough carrier apps truncate that the link would " +
      "fail silently for whoever receives it. So it does not fit in a share " +
      "link, and what to send instead is a choice about what they need to see.",
    question: "What should your human send?",
    options: [
      ...offers
        // One fewer than the ceiling: the file option always gets a seat, and
        // it is the only one that loses nothing.
        .slice(0, MAX_DIAGRAM_OPTIONS - 1)
        .map((offer): AskOption => ({
          id: offer.diagramId,
          label: `Just ${JSON.stringify(offer.title)}`,
          consequence:
            `A measured ${offer.url.length.toLocaleString("en-US")}-` +
            "character link carrying this diagram and the ancestors it " +
            `drills down from, and nothing else: ${offer.url}`,
        })),
      {
        id: SEND_THE_FILE_OPTION_ID,
        label: "The whole model, as a file",
        consequence:
          "Save the canonical `.alab` text below as a `.alab` file and send " +
          "that. Nothing is dropped, and /live accepts it by paste or drop — " +
          "but it is an attachment rather than a link.",
      },
    ],
    otherwise:
      "Or they can say in their own words which part of the system the " +
      "reader actually needs, and a link can be scoped to it.",
    defaultId: null,
  };
}
