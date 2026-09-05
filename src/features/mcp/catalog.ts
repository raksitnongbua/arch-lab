/**
 * The catalogue — what this MCP server offers, as pure data.
 *
 * This module is the SECOND public entry point of the `mcp` feature, and the
 * client-safe one. `./index.ts` pulls in the MCP SDK and must only ever be
 * imported by the route handler; the `/mcp` page and any other UI import this
 * file instead, so no page bundle drags a protocol server into the browser.
 *
 * It is also the single source of truth for tool names and prose:
 * `./server.ts` registers from it, the `/mcp` page documents from it, and
 * `scripts/mcp-check.mjs` asserts the two can never disagree — a documented
 * tool that isn't registered (or vice versa) fails the check.
 *
 * No React, no zod, no SDK — importable from anywhere. The one import is the
 * syntax section ids, so the `get_syntax_reference` argument documentation is
 * generated from the sections that actually exist.
 */

// All imports here stay on the pure-data side, so the "no React, no zod, no
// SDK" promise above still holds and the `/mcp` page's bundle is unaffected:
// `content/syntax-sections` reaches only the snippets module and, through it,
// `@/lib/constants` (plain values); `lib/limits` and the icon categories
// module import nothing at all. The category list is imported for the same
// reason the section ids are — so `list_icons`'s argument documentation is
// generated from the categories that actually exist. (The icon REGISTRY
// itself is not importable here: it carries the artwork, which is React
// components.) The gantt refusal tables are imported for the third time on
// the same terms: `format_gantt` must name what the importer refuses, and
// a hand-typed list would be a second source of truth for a set the parser
// already holds — the exact drift `dry.md` forbids in agent-facing prose. The
// tables are pure data with one type-only import; the mermaid BARREL is not
// importable here, because it carries the parsers and would put a Mermaid
// reader in the `/mcp` page's bundle.
import { ICON_CATEGORY_ORDER } from "@/features/editor/lib/icons/categories";
/* Deep-imported for the same reason `ICON_CATEGORY_ORDER` above is: this file
   must stay pure data, and the playground barrel pulls in the editor. The
   module is server-safe by its own contract — its header says so — so nothing
   client-side rides along. */
import { KIND_BLURB } from "@/features/playground/lib/kind-copy";
import {
  GANTT_DATE_FORMAT,
  REFUSED_GANTT_DURATION_UNITS,
  REFUSED_GANTT_KEYWORDS,
} from "@/features/mermaid/lib/gantt-mapping";
import { REFUSED_TIMELINE_CONSTRUCTS } from "@/features/mermaid/lib/timeline-mapping";

import { SYNTAX_SECTION_IDS } from "./content/syntax-sections";
import { MAX_SOURCE_CHARS } from "./lib/limits";

/**
 * The size ceiling as the tool descriptions state it.
 *
 * Interpolated rather than typed out: these descriptions ARE the contract every
 * agent reads, so a raised limit with a stale number here would have the server
 * advertising a rule it no longer enforces. Same formatting as the refusal in
 * `guardSourceSize`, so the number an agent is told matches the number it is
 * told off with.
 */
const MAX_SOURCE_CHARS_TEXT = `max ${MAX_SOURCE_CHARS.toLocaleString("en-US")} characters`;

/**
 * How many notations the product draws, for the prose below.
 *
 * COUNTED FROM `KIND_BLURB`, which is total over the document kinds, rather
 * than typed out: "four notations" survived in five places on this site long
 * after there were six, and a tool description is the one place a stale count
 * is read by something that cannot look around and notice.
 */
export const DOCUMENT_KIND_COUNT = Object.keys(KIND_BLURB).length;

/**
 * The notations `get_syntax_reference` does NOT teach.
 *
 * The reference used to present itself as "the .alab grammar", which is a
 * false signal with a cost: an agent told to read the grammar first before
 * writing a gantt got a ~22 KB wall of C4 and no mention of `gantt` anywhere
 * in it, which reads as "arch-lab does not draw those". Naming the gap is the
 * honest fix; extending the section list is a larger change.
 *
 * DERIVED, not listed. C4 is the reference's default subject — `header`,
 * `diagrams`, `nodes`, `edges`, `frames` and `paths` are all C4 productions —
 * and every OTHER kind that is taught has a section named after it, so
 * membership is "is there a section with this kind's name". Adding a `gantt`
 * section to `content/syntax-sections.ts` therefore fixes the tool's own
 * description in the same edit; `check:mcp` asserts the two agree.
 */
export const KINDS_WITHOUT_SYNTAX_SECTIONS = (
  Object.keys(KIND_BLURB) as (keyof typeof KIND_BLURB)[]
).filter(
  (kind) =>
    kind !== "c4" && !(SYNTAX_SECTION_IDS as readonly string[]).includes(kind),
);

/**
 * The complement — what the reference DOES teach, for the same description.
 *
 * BOTH HALVES DERIVED, and the second one is here because the first alone was
 * not enough. The description named its covered kinds in prose ("C4 AND
 * SEQUENCE DIAGRAMS ONLY") and its uncovered count as a word ("the other seven
 * notations") while interpolating the derived list beside them, so adding the
 * gantt, timeline and lifecycle sections would have left a sentence that
 * promised two notations, said seven were missing, and then listed four. A
 * derived list next to a hand-typed count is the failure mode in a nicer
 * costume.
 */
export const KINDS_WITH_SYNTAX_SECTIONS = (
  Object.keys(KIND_BLURB) as (keyof typeof KIND_BLURB)[]
).filter((kind) => !KINDS_WITHOUT_SYNTAX_SECTIONS.includes(kind));

/** Where the server lives, relative to the site root. */
export const MCP_ENDPOINT_PATH = "/api/mcp";

/** The name clients see in their server list. */
export const MCP_SERVER_NAME = "arch-lab";

export const MCP_SERVER_VERSION = "0.1.0";

/** Absolute endpoint URL for a given site origin. */
export function mcpEndpointUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${MCP_ENDPOINT_PATH}`;
}

/* -------------------------------------------------------------------------- */
/* Release status                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The integration is in **beta**, and says so everywhere it is offered: the
 * navbar entry, the `/mcp` page, and the server's own `initialize`
 * instructions — so an agent that connects without a human ever visiting the
 * page still learns that tool names and response shapes may move under it.
 *
 * One constant, read by all three, because a status that is true in one place
 * and stale in another is worse than no status at all.
 */
export const MCP_STATUS_LABEL = "Beta";

/**
 * What beta actually means here, in commitments rather than adjectives. Vague
 * "this may change" wording tells a reader nothing they can plan around; this
 * separates what is safe to depend on from what is not.
 */
export const MCP_BETA_NOTICE =
  "This integration is in beta. The endpoint URL and the .alab format itself " +
  "are stable — the format's round-trip guarantees are proven on every build " +
  "— but tool names, arguments and the wording of responses may still change, " +
  "and there is no protocol-level versioning to smooth that over yet. Pin " +
  "nothing to the exact text of a response, and expect to re-read this page " +
  "after an upgrade.";

/** The same commitment, compressed for the server's `initialize` payload. */
export const MCP_BETA_NOTICE_SHORT =
  "This server is in beta: the endpoint URL is stable, but tool names, " +
  "arguments and response wording may change without a version bump.";

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

export interface McpArgDoc {
  name: string;
  required: boolean;
  /** What it does, and its default when optional. */
  description: string;
}

export interface McpToolDoc {
  /** The protocol name — must match `server.ts` exactly. */
  name: string;
  /** Human-facing title shown in client UIs. */
  title: string;
  /**
   * The description the MODEL reads when deciding whether to call it. Written
   * for that audience: what it does, when to reach for it, what it does not do.
   */
  description: string;
  /**
   * When this tool stops and puts a question to the human, in one sentence —
   * or absent, for the tools that never do.
   *
   * SEPARATE FROM `description` so the `/mcp` page can show it as its own row
   * ("may ask your human when…") and `check:mcp` can read the same field:
   * every tool that can raise an ask must set it, and every tool that cannot
   * must leave it undefined, so the page never advertises a question a tool is
   * incapable of raising. The alternative — grepping the description for the
   * phrase — would pass on a tool that merely mentions asking.
   */
  asks?: string;
  args: readonly McpArgDoc[];
}

/**
 * The standing rule, in one sentence, appended to every `validate_<kind>`
 * description.
 *
 * All nine already end "use X for Y", which answers "which TOOL for this
 * document" and leaves "which DOCUMENT for this request" unanswered — and the
 * second is the question an agent handed a sentence of English actually faces.
 * One constant rather than nine copies, for the reason the blurbs are
 * interpolated: nine copies is eight that go stale.
 */
/**
 * The one repair an agent must NOT make, said in the words of the tools that
 * provoke it.
 *
 * The failure is specific and was the likeliest one: told "the C4 tools cannot
 * read this", an agent's cheapest edit is to change `archlab 1.0 gantt` on
 * line 1 to `archlab 1.0` — the single change that makes every other line of a
 * gantt meaningless — and then to report the resulting parse errors as the
 * document's problem. Twin of `KEEP_THE_HEADER` in `lib/ask.ts`, which says it
 * in the result; this says it in the description, which the model reads first.
 */
const NOT_A_HEADER_BUG =
  'do not "fix" line 1 of a document whose header names another kind. The ' +
  "header names the notation the rest of the document is written in; " +
  "changing it converts nothing.";

/**
 * What the four C4 doors say about text of another notation, in one place.
 *
 * All four go through `lib/read.ts`, so all four behave identically here, and
 * four hand-written versions of one behaviour is three that go stale — the
 * `dry.md` rule that matters most in agent-facing prose, which is a contract.
 */
const ANOTHER_NOTATION_ASKS =
  "Text of another notation is not a failure here: it comes back as a " +
  "question naming the tool that reads it, and asks your human which " +
  "picture they meant — so " +
  NOT_A_HEADER_BUG;

const CHOOSE_THE_NOTATION =
  "If the request could reasonably be any of those, ask the human which " +
  "picture they want before writing; `list_example_models` shows one real " +
  "document per notation to show them.";

/** Shared by every tool that takes model text. */
const SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description: `The model text: .alab, arch-lab JSON, or Mermaid C4 (${MAX_SOURCE_CHARS_TEXT}).`,
};

/**
 * The sequence tools' source argument. Separate from SOURCE_ARG because the
 * accepted languages genuinely differ — a sequence document is `.alab`
 * sequence or Mermaid `sequenceDiagram`, never arch-lab JSON (there is no JSON
 * form for sequence documents yet) and never Mermaid C4. Reusing SOURCE_ARG
 * would advertise inputs these tools reject.
 */
const SEQUENCE_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    "The sequence diagram text: `.alab` sequence (first line " +
    "`archlab 1.0 sequence`) or Mermaid `sequenceDiagram` code " +
    `(${MAX_SOURCE_CHARS_TEXT}). The format is detected from the first ` +
    "meaningful line.",
};

const FLOWCHART_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    "The flowchart text: `.alab` flowchart (first line " +
    "`archlab 1.0 flowchart`) or Mermaid `flowchart` / `graph` code " +
    `(${MAX_SOURCE_CHARS_TEXT}). The format is detected from the first ` +
    "meaningful line.",
};

const USECASE_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    "The use-case diagram text: `.alab` usecase (first line " +
    "`archlab 1.0 usecase`) or Mermaid using the actor/use-case convention " +
    `(circle actors, stadium use cases, a subgraph boundary) (${MAX_SOURCE_CHARS_TEXT}). ` +
    "The format is detected from the first meaningful line.",
};

const ER_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    "The ER diagram text: `.alab` er (first line `archlab 1.0 er`) or " +
    `Mermaid \`erDiagram\` code (${MAX_SOURCE_CHARS_TEXT}). The format is ` +
    "detected from the first meaningful line — both dialects have a real " +
    "header, so nothing here is guessed.",
};

const DICT_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    "The data dictionary text: `.alab` dict (first line `archlab 1.0 dict`) " +
    `(${MAX_SOURCE_CHARS_TEXT}). There is no Mermaid dialect for this kind — ` +
    "Mermaid has no dictionary notation, so none was invented.",
};

/**
 * The gantt tools' source argument.
 *
 * IT NAMES WHAT THE IMPORT NORMALISES, not just the dialects, because that is
 * the fact about the tool an agent cannot discover by calling it: a caller
 * that pastes Mermaid and gets `.alab` back has had its dates collapsed onto
 * one origin and its ids slugged, and nothing in the response would say so.
 * (The conversion itself runs both ways in the app; this SERVER canonicalises
 * to `.alab` for every kind, so what an agent gets back here is `.alab`
 * whatever it sent — see the header of `tools/gantt.ts`.)
 */
const GANTT_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    "The gantt text: `.alab` gantt (first line `archlab 1.0 gantt`) " +
    `or Mermaid \`gantt\` code (${MAX_SOURCE_CHARS_TEXT}). The format is ` +
    "detected from the first meaningful line — both dialects have a real " +
    "header, so nothing here is guessed. The import is lossy in named ways: " +
    "the earliest date becomes the document origin and every other position " +
    "becomes a whole number of days from it, and Mermaid's `crit` tag reads " +
    "as the `at-risk` state (arch-lab computes the critical path, so no tag " +
    "declares it). This tool always answers in `.alab`.",
};

/** The gantt keywords the importer refuses by name, derived from the table the
 * parser refuses them with — see the import block at the top of this file. */
const REFUSED_GANTT_TEXT = REFUSED_GANTT_KEYWORDS.map(
  (entry) => `\`${entry.keyword}\``,
).join(", ");

/** The sub-day units, same derivation, same reason. */
const REFUSED_GANTT_UNITS_TEXT = [...REFUSED_GANTT_DURATION_UNITS]
  .map((unit) => `\`${unit}\``)
  .join(", ");

/**
 * The timeline tools' source argument.
 *
 * SHAPED LIKE THE GANTT'S NEXT DOOR, and deliberately with no contrast drawn
 * between them any more: both kinds convert both ways in the app, and both
 * tools here answer in `.alab`. The sentence this used to carry ("unlike
 * `gantt`, this conversion is TWO-WAY") was true when it was written and is
 * now the opposite of the truth — an agent-facing description is a contract,
 * and a stale one is worse than a terse one.
 */
const TIMELINE_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    "The timeline text: `.alab` timeline (first line " +
    "`archlab 1.0 timeline`) or Mermaid `timeline` code " +
    `(${MAX_SOURCE_CHARS_TEXT}). The format is detected from the first ` +
    "meaningful line — both dialects have a real header, so nothing here is " +
    "guessed. The import keeps every period and event; this tool answers in " +
    "`.alab`.",
};

/** The Mermaid timeline constructs the importer refuses by name, derived from
 * the table the parser refuses them with — the same derivation
 * `REFUSED_GANTT_TEXT` uses, so a construct added there names itself here. */
const REFUSED_TIMELINE_TEXT = REFUSED_TIMELINE_CONSTRUCTS.map(
  (entry) => `\`${entry.keyword}\``,
).join(", ");

/**
 * The lifecycle tools' source argument.
 *
 * IT NAMES THE ABSENCE, which is the interesting fact here: this is the only
 * kind in the catalogue with ONE input language, and a caller who has just
 * read the timeline's "TWO-WAY" note would otherwise assume a Mermaid dialect
 * exists and go looking for it.
 */
const LIFECYCLE_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    "The lifecycle text: `.alab` lifecycle (first line " +
    `\`archlab 1.0 lifecycle\`) — the only dialect (${MAX_SOURCE_CHARS_TEXT}). ` +
    "There is NO Mermaid equivalent and none was invented: " +
    "`stateDiagram-v2` is a state MACHINE (every transition that could " +
    "happen, from anywhere to anywhere), not one subject's ordered history " +
    "with a main track, and `journey` scores satisfaction. Importing either " +
    "would mean inventing a track its author never wrote.",
};

/**
 * `create_share_link` reads EVERY document kind — the codec packs arbitrary
 * text and nothing in a link says which grammar wrote it, so its source
 * argument must advertise all five input languages where SOURCE_ARG,
 * SEQUENCE_SOURCE_ARG, FLOWCHART_SOURCE_ARG and USECASE_SOURCE_ARG each name
 * only their own.
 */
const SHARE_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    `The document text (${MAX_SOURCE_CHARS_TEXT}). C4 models: .alab, arch-lab ` +
    "JSON, or Mermaid C4. Sequence diagrams: `.alab` sequence (first line " +
    "`archlab 1.0 sequence`) or Mermaid `sequenceDiagram`. Flowcharts: " +
    "`.alab` flowchart (first line `archlab 1.0 flowchart`) or Mermaid " +
    "`flowchart` / `graph`. Use-case diagrams: `.alab` usecase (first line " +
    "`archlab 1.0 usecase`) or Mermaid in the actor/use-case convention. " +
    "ER diagrams: `.alab` er (first line `archlab 1.0 er`) or Mermaid " +
    "`erDiagram`. Data dictionaries: `.alab` dict (first line " +
    "`archlab 1.0 dict`). Gantt charts: `.alab` gantt (first line " +
    "`archlab 1.0 gantt`) or Mermaid `gantt`. Milestone timelines: `.alab` " +
    "timeline (first line `archlab 1.0 timeline`) or Mermaid `timeline`. " +
    "Lifecycles: `.alab` lifecycle (first line `archlab 1.0 lifecycle`) — " +
    "no Mermaid dialect exists for that one. " +
    "The kind is detected from the first meaningful line.",
};

const FORMAT_ARG: McpArgDoc = {
  name: "format",
  required: false,
  description:
    'Force a reading: "alab", "json" or "mermaid". Defaults to "auto", ' +
    "which reads the first meaningful line to decide.",
};

export const MCP_TOOLS: readonly McpToolDoc[] = [
  {
    name: "validate_model",
    title: "Validate a model",
    description:
      "Check whether model text is valid, and if not, exactly where it " +
      "breaks. Runs the real arch-lab parser and reports the line, column " +
      "and offending source line, so a failure can be fixed directly. On " +
      "success, reports what the model contains (diagrams, levels, counts) " +
      "rather than echoing it back, plus any C4 review notes — missing " +
      "technologies, unlabelled or vague relationships, bidirectional lines " +
      "— which do not affect validity but are what a reviewer will raise. " +
      "Use this after writing or editing any .alab file: it is the fastest " +
      "way to confirm the result is both loadable and worth reviewing. " +
      // The three things a caller could not learn from "check whether it is
      // valid", each of which produced a wrong next move before it was said.
      `Hand it text of another notation and it does not fail: it says which ` +
      `of the ${DOCUMENT_KIND_COUNT} notations the text is, names the tool ` +
      "that reads it, and asks the human which picture they meant — so " +
      NOT_A_HEADER_BUG +
      " A VALID model can also come back with a notation question appended, " +
      "when the relationships read as numbered steps rather than as " +
      "structure; the verdict and the counts still travel with it, and " +
      "nothing about the document is wrong.",
    asks:
      "the text turns out to be one of the other eight notations, or a valid " +
      "C4 model reads as an ordered sequence of steps rather than as " +
      "structure.",
    args: [SOURCE_ARG, FORMAT_ARG],
  },
  {
    name: "format_model",
    title: "Format a model canonically",
    description:
      "Rewrite a model in its own format's canonical form — the exact bytes " +
      "arch-lab itself would write, so diffs stay minimal and reviewable. " +
      "Reports when the input was already canonical, so a no-op write can " +
      "be skipped. Refuses Mermaid, which has no canonical form here. " +
      ANOTHER_NOTATION_ASKS,
    asks: "the text turns out to be one of the other eight notations.",
    args: [SOURCE_ARG, FORMAT_ARG],
  },
  {
    name: "validate_sequence",
    title: "Validate a sequence diagram",
    description:
      "Check whether SEQUENCE diagram text is valid, and if not, exactly " +
      "where it breaks. Reads `.alab` sequence documents (first line " +
      "`archlab 1.0 sequence`) and pasted Mermaid `sequenceDiagram` code, " +
      "reporting the line, column and offending source line on failure. On " +
      "success it summarises what the flow contains — participants, messages " +
      "split by line style (solid/dotted) and by head style (none, arrowhead, " +
      "cross, open, bidirectional), self-messages, how many messages carry a " +
      "`desc` detail, " +
      "fragments and their nesting depth, notes, and a FIT report — the " +
      "rendered pixel size plus any labels too wide for their own arrow, " +
      "which is the one defect a parse cannot see and a caller cannot look " +
      "at — rather than echoing the document back. Use this for message " +
      "flows over time; use `validate_model` for C4 structure diagrams. " +
      "Passing a C4 document here says so and points you at the right tool. " +
      CHOOSE_THE_NOTATION,
    asks:
      "a valid flow turns out to be hub-and-spoke — four or more participants " +
      "and almost every message aimed at one of them, which is a C4 context " +
      "diagram drawn on a time axis.",
    args: [SEQUENCE_SOURCE_ARG],
  },
  {
    name: "format_sequence",
    title: "Format a sequence diagram canonically",
    description:
      "Rewrite sequence text as canonical `.alab` sequence — the exact bytes " +
      "arch-lab would write, so diffs stay minimal. Also the way to turn a " +
      "pasted Mermaid `sequenceDiagram` into an `.alab` sequence document. " +
      "ALL TEN of Mermaid's arrow types survive that trip in both directions " +
      "(`->` `->>` `-x` `-)` `<<->>` and their dotted twins) — an arrow is " +
      "two axes here too, a line style and a head style, so nothing is " +
      "approximated. The import is still lossy in other ways and the " +
      "response names what was dropped. " +
      "Worth a call after writing a message `desc`, which is a JSON string and " +
      "therefore the one place hand-escaping goes wrong: this reports the bad " +
      "escape with a line and column, and returns the canonical single-line " +
      "form when it is right.",
    args: [SEQUENCE_SOURCE_ARG],
  },
  {
    name: "validate_flowchart",
    title: "Validate a flowchart",
    description:
      "Check whether FLOWCHART text is valid, and if not, exactly where it " +
      "breaks. Reads `.alab` flowchart documents (first line " +
      "`archlab 1.0 flowchart`) and pasted Mermaid `flowchart` / `graph` " +
      "code, reporting the line, column and offending source line on " +
      "failure. On success it summarises the graph — nodes by shape, how many " +
      "arrows carry a guard, how many loop back, groups, the rendered pixel " +
      "size — and audits the three defects a parse cannot see: decisions " +
      "whose branches are unguarded (a diamond that asks a question and will " +
      "not say which exit is which), nodes no arrow reaches, and nodes no " +
      "arrow leaves that are not an `end`. Use this for step-by-step " +
      "processes; use `validate_model` for C4 structure and " +
      "`validate_sequence` for message flows over time. " +
      CHOOSE_THE_NOTATION,
    args: [FLOWCHART_SOURCE_ARG],
  },
  {
    name: "format_flowchart",
    title: "Format a flowchart canonically",
    description:
      "Rewrite flowchart text as canonical `.alab` flowchart — the exact " +
      "bytes arch-lab would write, so diffs stay minimal. Also the way to " +
      "turn pasted Mermaid `flowchart` / `graph` code into an `.alab` " +
      "flowchart document, which is a one-way lossy import: the response " +
      "names what was dropped, including the direction (`LR` and friends are " +
      "layout, not model) and any node shape with no arch-lab counterpart.",
    args: [FLOWCHART_SOURCE_ARG],
  },
  {
    name: "validate_usecase",
    title: "Validate a use-case diagram",
    description:
      "Check whether UML USE-CASE text is valid, and if not, exactly where " +
      "it breaks. Reads `.alab` use-case documents (first line " +
      "`archlab 1.0 usecase`) and pasted Mermaid written in the actor/" +
      "use-case convention, reporting the line, column and offending source " +
      "line on failure. On success it summarises who can do what — actors, " +
      "use cases, associations, «include»/«extend» dependencies, " +
      "generalizations, each boundary's contents and the rendered pixel size " +
      "— then audits the defects a parse cannot see: actors with no " +
      "association at all, use cases nothing can reach, capabilities sitting " +
      "outside every boundary, empty boundaries, and include/extend or " +
      "generalization CYCLES, which UML forbids. Use this for who-may-do-what " +
      "at a system's edge; use `validate_model` for C4 structure, " +
      "`validate_sequence` for message flows and `validate_flowchart` for " +
      "step-by-step processes. " +
      CHOOSE_THE_NOTATION,
    args: [USECASE_SOURCE_ARG],
  },
  {
    name: "format_usecase",
    title: "Format a use-case diagram canonically",
    description:
      "Rewrite use-case text as canonical `.alab` usecase — the exact bytes " +
      "arch-lab would write, so diffs stay minimal. Also the way to turn " +
      "pasted Mermaid into an `.alab` use-case document, which is a one-way " +
      "lossy import: the response names what was dropped, including the " +
      "arrowheads Mermaid draws on lines that are undirected associations in " +
      "UML.",
    args: [USECASE_SOURCE_ARG],
  },
  {
    name: "validate_er",
    title: "Validate an ER diagram",
    description:
      "Parse an entity-relationship diagram and report what a schema " +
      "reviewer would: the tables, their column counts and their keys, the " +
      "cardinality on every relationship, and the rendered size. Then the " +
      "audit a parse cannot do — foreign-key columns with no relationship " +
      "line saying what they reference, tables with no primary key, tables " +
      "joined to nothing, and self-joins. Reads `.alab` er documents (first " +
      "line `archlab 1.0 er`) and pasted Mermaid `erDiagram` code. Use " +
      "`validate_model` for C4 structure, `validate_sequence` for message " +
      "flows, `validate_flowchart` for processes and `validate_usecase` for " +
      "actors at a system's edge. " +
      CHOOSE_THE_NOTATION,
    args: [ER_SOURCE_ARG],
  },
  {
    name: "format_er",
    title: "Format an ER diagram canonically",
    description:
      "Rewrite ER text as canonical `.alab` er — the exact bytes arch-lab " +
      "would write, so diffs stay minimal. Also the way to turn pasted " +
      "Mermaid `erDiagram` code into an `.alab` document. UNLIKE the " +
      "flowchart and use-case imports, this conversion is TWO-WAY AND TOTAL " +
      "over the diagram: Mermaid has a real erDiagram, so both " +
      "cardinalities, the solid/dashed line and every column with its type, " +
      "key roles and comment all survive. Only metadata is dropped, and the " +
      "response says which.",
    args: [ER_SOURCE_ARG],
  },
  {
    name: "validate_dict",
    title: "Validate a data dictionary",
    description:
      "Parse a data dictionary and report what a reviewer would: the " +
      "sections, how many fields each holds, and — the headline number — how " +
      "many of those fields actually carry a description. Then the coverage " +
      "audit: fields with no meaning given (a name and a type and no " +
      "description is a schema dump, not a dictionary), fields with no " +
      "`source`, fields marked deprecated without saying what replaces them, " +
      "and an enumeration of every field flagged `pii`. Reads `.alab` dict " +
      "documents (first line `archlab 1.0 dict`). " +
      CHOOSE_THE_NOTATION,
    args: [DICT_SOURCE_ARG],
  },
  {
    name: "format_dict",
    title: "Format a data dictionary canonically",
    description:
      "Rewrite dictionary text as canonical `.alab` dict — the exact bytes " +
      "arch-lab would write, so diffs stay minimal. There is no Mermaid " +
      "import for this kind: Mermaid has no dictionary notation.",
    args: [DICT_SOURCE_ARG],
  },
  {
    name: "validate_gantt",
    title: "Validate a gantt",
    description:
      "Parse a GANTT CHART and report what a planner would: how long " +
      "the plan runs, the calendar dates it spans when it has a `starts` " +
      "line, and — the number nobody can read off their own text — the " +
      "CRITICAL PATH, the chain of items that decides the end date. Then the " +
      "audit a parse cannot do: dependency CYCLES (a waits on b waits on a), " +
      "which the parser deliberately does not look for and which make the " +
      "schedule meaningless; `after` entries that constrain nothing because a " +
      "sibling already waits for them; sections holding only milestones, so " +
      "the band draws no bar at all; and, as information rather than a fault, " +
      "items whose float exceeds their own duration. Reads `.alab` gantt " +
      "documents (first line `archlab 1.0 gantt`) and pasted Mermaid " +
      "`gantt` code, naming on success what that import normalised. " +
      /* The one-line job, INTERPOLATED rather than retyped. An assistant
         quotes one passage, not a page, so this sentence has to be
         word-identical with the home page, `/demo`, `/syntax` and both
         `llms*.txt` — and the way to guarantee that is to have one copy.
         A near-miss paraphrase ("how long work takes and what blocks what")
         stood here first and is exactly the drift this prevents. */
      `${KIND_BLURB.gantt}. Use ` +
      "`validate_flowchart` for the " +
      "order of steps with no duration, and `validate_sequence` for messages " +
      "over time. " +
      CHOOSE_THE_NOTATION,
    args: [GANTT_SOURCE_ARG],
  },
  {
    name: "format_gantt",
    title: "Format a gantt canonically",
    description:
      "Rewrite gantt text as canonical `.alab` gantt — the exact bytes " +
      "arch-lab would write, so diffs stay minimal. Also the way to turn " +
      "pasted Mermaid `gantt` code into an `.alab` gantt. That import is " +
      "LOSSY IN NAMED WAYS and the response lists them; this tool always " +
      "answers in `.alab`, as every `format_*` tool here does. Mermaid's " +
      "`crit` tag imports as the `at-risk` STATE — in Mermaid it is a " +
      "decoration the author types, which is what `at-risk` is here — and " +
      "NOT as a critical path: arch-lab computes that from durations and " +
      "dependencies, so no tag declares it and `validate_gantt` is where the " +
      "chain is reported. `crit` on a task already tagged `done` loses the " +
      "`crit`, since a finished task is no longer at risk. Refused BY NAME " +
      "rather than approximated, " +
      "each because it would make the chart mean something else: " +
      `${REFUSED_GANTT_TEXT} (a working week, an axis granularity or an ` +
      "end-date meaning arch-lab derives or fixes itself), `until` (an item " +
      "here has a length, not an end tied to another task), sub-day " +
      `durations (${REFUSED_GANTT_UNITS_TEXT}), and a \`dateFormat\` other ` +
      `than \`${GANTT_DATE_FORMAT}\`. Gantt charts travel as \`.alab\` text, as ` +
      "Mermaid (a plan needs a `starts` date to become one — Mermaid `gantt` " +
      "has no relative axis), or as a share link.",
    args: [GANTT_SOURCE_ARG],
  },
  {
    name: "validate_timeline",
    title: "Validate a milestone timeline",
    description:
      "Parse a MILESTONE TIMELINE — events as points, grouped into named " +
      "periods — and report the audit a parse cannot do. Two of its findings " +
      "exist nowhere else in arch-lab. PERIODS OUT OF ORDER: this notation " +
      "never reads a period label as a date, so nothing else notices that " +
      "`2024, 2019, 2025` is written out of sequence, and the diagram draws " +
      "declaration order confidently. EVENTS CARRYING A DURATION OR A " +
      'DEPENDENCY in their label ("three weeks", "after the freeze") — ' +
      "these parse perfectly and are the sign the document wants to be a " +
      "gantt. Then: the same event label twice inside one period, labels that " +
      "wrap past three lines when drawn, and — as information rather than a " +
      "fault — periods holding a single event. Reads `.alab` timeline (first " +
      "line `archlab 1.0 timeline`) and pasted Mermaid `timeline` code. " +
      /* The one-line job, INTERPOLATED rather than retyped, for the reason
         the gantt entry gives: an assistant quotes one passage, not a page,
         so this sentence must be word-identical with the home page, `/demo`,
         `/syntax`, `/faq` and both `llms*.txt`. */
      `${KIND_BLURB.timeline}. Use ` +
      "`validate_gantt` when the work has lengths and prerequisites, and " +
      "`validate_sequence` for messages between participants over time. " +
      CHOOSE_THE_NOTATION,
    args: [TIMELINE_SOURCE_ARG],
  },
  {
    name: "format_timeline",
    title: "Format a milestone timeline canonically",
    description:
      "Rewrite timeline text as canonical `.alab` timeline — the exact bytes " +
      "arch-lab would write, so diffs stay minimal. Also the way to turn " +
      "pasted Mermaid `timeline` code into an `.alab` timeline. Mermaid " +
      "holds everything a timeline says — a period is a label and an event " +
      "is a label — so nothing about the diagram is approximated in either " +
      "direction. Import normalises two spellings rather than losing them — a " +
      "continuation row (a line beginning `:`) folds into the period above " +
      "it, and `<br>` becomes a real newline — and refuses BY NAME " +
      `${REFUSED_TIMELINE_TEXT} (Mermaid groups periods one level above the ` +
      "period; arch-lab has only the period itself, so flattening would " +
      "either strand the period labels or merge bands you separated) and a " +
      "period row listing no events. Export drops what `timeline` has " +
      "nowhere to put: an event's `desc` and its `#tag`s. Timelines travel " +
      "as `.alab` text, as Mermaid, or as a share link.",
    args: [TIMELINE_SOURCE_ARG],
  },
  {
    name: "validate_lifecycle",
    title: "Validate a lifecycle",
    description:
      "Parse a LIFECYCLE — one named subject, the ordered states it passes " +
      "through, and the branches that leave that track — and report the " +
      "audit a parse cannot do. Every finding describes a document that " +
      "parses and is still wrong. THE SUBJECT NEVER TERMINATES: nothing " +
      "carries `ends`, so the document says the subject reaches the last " +
      "state and stays there. UNREACHABLE STATES: `ends` means the subject " +
      "stops, so anything declared after a final state is stranded — each " +
      "line is valid alone and only the pair is wrong. BRANCHES NOBODY KNOWS " +
      "HOW TO TAKE: an `exit` with no `when` draws a departure and refuses " +
      "to say what causes it. STATES THAT READ AS STEPS: a state is a place " +
      'the subject can BE ("Paid"), not something somebody does ("Take ' +
      'payment") — a document of imperatives is a flowchart written in this ' +
      "notation, and this is the only place that will say so. And, when " +
      "there are no branches at all, that the document is a milestone " +
      "timeline. Reads `.alab` lifecycle only. " +
      /* The one-line job, INTERPOLATED rather than retyped, for the reason
         the gantt and timeline entries give: an assistant quotes one passage,
         not a page, so this sentence must be word-identical with the home
         page, `/demo`, `/syntax`, `/faq` and both `llms*.txt`. */
      `${KIND_BLURB.lifecycle}. Use ` +
      "`validate_flowchart` when the picture is steps and decisions rather " +
      "than one thing moving, and `validate_timeline` when nothing branches. " +
      CHOOSE_THE_NOTATION,
    args: [LIFECYCLE_SOURCE_ARG],
  },
  {
    name: "format_lifecycle",
    title: "Format a lifecycle canonically",
    description:
      "Rewrite lifecycle text as canonical `.alab` lifecycle — the exact " +
      "bytes arch-lab would write, so diffs stay minimal. ONE DIALECT IN AND " +
      "ONE OUT: there is no Mermaid lifecycle to convert from or to, for the " +
      "reason `validate_lifecycle` gives. What the grammar refuses BY NAME, " +
      "each because accepting it would make this an arbitrary graph — which " +
      "is the flowchart: an edge between two states (`to`, `next`, `then`, " +
      "`goes`, `after` — the track IS the order the states are written in), " +
      "a `rejoins` naming a state declared LATER (a forward shortcut along " +
      "the track), an `exit` nested inside another (branch depth is one), " +
      "and a second `subject`. Lifecycles travel as `.alab` text or as a " +
      "share link.",
    args: [LIFECYCLE_SOURCE_ARG],
  },
  {
    name: "convert_model",
    title: "Convert between formats",
    description:
      "Convert a C4 model to .alab, arch-lab JSON, or Mermaid C4. .alab and " +
      "JSON are lossless in both directions. Mermaid is a one-way, lossy " +
      "export of a SINGLE diagram (geometry, tags, icons, drill-down links " +
      "and traceability are dropped) — good for embedding a picture in a " +
      "README, never as a source of truth. C4 models only: a sequence " +
      "document has no Mermaid export here (Mermaid sequenceDiagram is " +
      "import-only, via format_sequence) — sequence documents travel as " +
      ".alab text. " +
      ANOTHER_NOTATION_ASKS,
    asks:
      "the text turns out to be one of the other eight notations, or a " +
      "Mermaid export was asked for on a model with several diagrams whose " +
      "root is too thin to be the one anybody meant.",
    args: [
      SOURCE_ARG,
      FORMAT_ARG,
      {
        name: "to",
        required: true,
        description: 'Target format: "alab", "json" or "mermaid".',
      },
      {
        name: "diagram_id",
        required: false,
        description:
          'Which diagram to emit, for to="mermaid" only. Omitting it is safe ' +
          "when the model has one or two diagrams, or when its root holds " +
          "the picture you mean: the root is then used. On a model with " +
          "three or more diagrams whose root is a bare signpost, the tool " +
          "STOPS and lists the diagrams with their counts rather than " +
          "emitting the one that contains none of the detail. Naming an id " +
          "never asks — it is taken as the choice already made.",
      },
    ],
  },
  {
    name: "describe_model",
    title: "Describe a model's structure",
    description:
      "Read the shape of a model without paying for its full text: " +
      "metadata, totals, and the drill-down hierarchy of diagrams. Use this " +
      "to orient in an unfamiliar model, or to find which diagram a change " +
      "belongs in, before fetching or editing anything. " +
      ANOTHER_NOTATION_ASKS,
    asks: "the text turns out to be one of the other eight notations.",
    args: [
      SOURCE_ARG,
      FORMAT_ARG,
      {
        name: "include_contents",
        required: false,
        description:
          "Also list every boundary, node and edge of every diagram, in " +
          ".alab form. Defaults to false, which returns the hierarchy only.",
      },
    ],
  },
  {
    name: "get_syntax_reference",
    title: "Get the .alab grammar",
    description:
      `The .alab grammar for ${KINDS_WITH_SYNTAX_SECTIONS.join(", ")} ` +
      "documents, generated from examples verified against the real parser " +
      "on every build. Read it BEFORE writing one of those by hand — " +
      "significant indentation and order-free attributes are easy to guess " +
      `wrong. It does NOT cover the other ` +
      `${KINDS_WITHOUT_SYNTAX_SECTIONS.length} notations ` +
      `(${KINDS_WITHOUT_SYNTAX_SECTIONS.join(", ")}): for those, fetch a ` +
      "bundled document with list_example_models and get_example_model, " +
      "which is the parser-verified reference for their grammar. Also " +
      "available as the resource archlab://syntax.",
    args: [
      {
        name: "section",
        required: false,
        // DERIVED from the section ids, never typed out. This list was
        // hand-written once and had already gone stale — it did not mention
        // `sequence` — which is the exact failure the catalogue exists to
        // prevent for tool names, and it is how a caller ends up being told a
        // section exists that the tool then rejects. Adding a section to
        // `syntax-sections.ts` now updates this sentence, the /mcp page and
        // the tool's own schema at once; `check:mcp` asserts the two agree.
        description:
          `One of: ${SYNTAX_SECTION_IDS.join(", ")}. ` +
          "Omit for the whole reference.",
      },
    ],
  },
  {
    name: "list_icons",
    title: "List node icons",
    description:
      "The vocabulary the `@icon` token draws from — every slug a node can " +
      "cite, searchable by name, slug or alias. Call this BEFORE writing an " +
      "`@slug` on a node line, because a wrong slug is the one authoring " +
      "mistake no validator will ever report: an unknown slug does not fail " +
      "anywhere — the canvas silently falls back to the node type's generic " +
      "icon — so a guessed `@postgres` quietly renders the wrong picture " +
      '(searching "postgres" finds the real slug, `postgresql`). Icons this ' +
      "registry lacks can be supplied by the document itself with a " +
      '`customicon <slug> "Name" "<svg>…"` header line — see the header ' +
      "section of the syntax reference. A query with several plausible " +
      "matches and nothing actually CALLED that comes back as a question for " +
      "you to ask your human, not a list: do not take the first. " +
      '("postgres" is a declared alias and resolves silently; "sql" names ' +
      "nothing and asks.)",
    asks:
      "a query matches two to five icons and none of them is called that — " +
      "a wrong `@slug` never errors anywhere, so nothing downstream would " +
      "ever report the guess.",
    args: [
      {
        name: "query",
        required: false,
        description:
          "Case-insensitive substring, matched against each icon's name, " +
          'slug and aliases — "pg" and "postgres" both find PostgreSQL. ' +
          "Omit for the full vocabulary.",
      },
      {
        name: "category",
        required: false,
        // DERIVED from the category table the icon picker renders, never
        // typed out — the same rule as `get_syntax_reference`'s section list
        // above, and for the same reason: a hand-written list here would go
        // stale the day a category is added, and the caller would be offered
        // a vocabulary the tool then rejects (or denied one it accepts).
        // `check:mcp` asserts every real category is named here.
        description:
          `Restrict to one category: ${ICON_CATEGORY_ORDER.join(", ")}. ` +
          "Omit to search all of them.",
      },
    ],
  },
  {
    name: "list_example_models",
    title: "List example documents",
    description:
      "Every complete, real document arch-lab ships, grouped by notation — " +
      `all ${DOCUMENT_KIND_COUNT} of them, not just C4 — each with what it ` +
      "holds, counted from the parsed document. THE TOOL TO CALL WHEN A " +
      "REQUEST FITS MORE THAN ONE NOTATION: the grouping says what each kind " +
      "is for and each entry is a real document, so it is what to show a " +
      "human who has to choose — and what stops an agent that only knows " +
      "arch-lab draws C4 from writing a plan, a schema or a lifecycle as " +
      "boxes and lines. Ids are unique across every notation, so an id alone " +
      "names a document.",
    args: [],
  },
  {
    name: "get_example_model",
    title: "Get an example document",
    description:
      "Fetch one bundled example in full, in any notation — the tool " +
      "resolves the id across every registry and says which notation it " +
      "found, so use one as a pattern for idiomatic structure rather than " +
      "inventing a shape.",
    args: [
      {
        name: "id",
        required: true,
        description:
          'The example\'s id, from list_example_models (e.g. "shopflow", a ' +
          'C4 model, or "store-migration", a gantt). One flat namespace: no ' +
          "notation argument is needed or accepted.",
      },
      {
        name: "format",
        required: false,
        description:
          '"alab" (default) — the .alab text, in the notation\'s own ' +
          "grammar, which is what to edit and what every writer tool reads. " +
          '"json" — the parsed document. For a C4 model that is ' +
          "arch-lab JSON, a file format the readers accept; for the other " +
          "kinds it is the parser's own shape, good for inspecting and NOT " +
          "an input format, which the response says on every such fetch.",
      },
    ],
  },
  {
    name: "create_share_link",
    title: "Create a share link",
    description:
      "Turn a C4 model OR a sequence diagram into a URL that opens it in " +
      "the arch-lab viewer, so a human can see the diagram — C4 models open " +
      "the two-pane viewer, sequence documents the sequence playground. The " +
      "document is encoded into the URL fragment, which browsers never send " +
      "to a server — nothing is uploaded or stored. Refuses documents too " +
      "large to fit a link that would survive being pasted into chat or " +
      "mail — and when a smaller, diagram-scoped link does fit, it offers " +
      "those and asks your human which the reader actually needs rather " +
      "than choosing for them. " +
      "Can optionally expire after a number of days. The format " +
      "argument applies to the C4 readings; a sequence document is detected " +
      "from its first line.",
    asks:
      "a model with several diagrams has no `diagram_id` and a root too thin " +
      "to be the picture anybody meant, or the whole model is too big for a " +
      "link and a scoped one would fit instead.",
    args: [
      SHARE_SOURCE_ARG,
      FORMAT_ARG,
      {
        name: "diagram_id",
        required: false,
        description:
          "Open the link at this diagram (C4 models only — a sequence " +
          "document is a single flow with no diagrams). Omitting it is safe " +
          "when the model has one or two diagrams, or when its root holds " +
          "the picture you mean: the root is then used. On a model with " +
          "three or more diagrams whose root is a bare signpost, the tool " +
          "STOPS and lists the diagrams with their counts, because a link " +
          "that opens on three boxes is a mistake the sender only learns " +
          "about from the reply. Naming an id never asks.",
      },
      {
        name: "ttl_days",
        required: false,
        description:
          "Stop the link working after this many days (1-400). Omit for a " +
          "link that never expires. The expiry is signed so it cannot be " +
          "edited in the URL, but it is not access control — anyone holding " +
          "the link can read the model until it lapses.",
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Tool groups — the /mcp page's reading order                                 */
/* -------------------------------------------------------------------------- */

export interface McpToolGroup {
  id: string;
  title: string;
  /** One line on when a reader reaches for this group. */
  blurb: string;
  tools: readonly McpToolDoc[];
}

/**
 * Resolve group members against `MCP_TOOLS` by name, so a group can never
 * carry a tool document the server does not register — the tools themselves
 * stay defined exactly once, above. A name that does not resolve throws at
 * module load, which fails the build rather than shipping a page with a hole
 * in it.
 */
function toolsNamed(...names: readonly string[]): readonly McpToolDoc[] {
  return names.map((name) => {
    const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
    if (tool === undefined) {
      throw new Error(`MCP_TOOL_GROUPS names unknown tool "${name}"`);
    }
    return tool;
  });
}

/**
 * The three tools `/mcp`'s social card draws, each with the one word its call
 * comes back with.
 *
 * WHICH THREE, AND WHY THESE. The card has room for three rows and the reader
 * has one second, so they show the three VERBS rather than the three most-used
 * tools — check a document, write one, hand a human the link. A card listing
 * three validators would say the server does one thing.
 *
 * THE OUTCOME WORD IS PAIRED HERE, not chosen by the drawing, because it has to
 * be true of the specific tool beside it: `create_share_link` does not answer
 * "valid", and a card that says it does is a lie told to everyone who sees the
 * link preview. Names resolve through `toolsNamed` for the same reason the
 * groups do — a rename fails the build instead of advertising a tool nobody can
 * call.
 */
export const MCP_CARD_TOOLS: readonly { name: string; result: string }[] = [
  { name: "validate_model", result: "valid" },
  { name: "format_sequence", result: "formatted" },
  { name: "create_share_link", result: "shared" },
].map(({ name, result }) => ({ name: toolsNamed(name)[0].name, result }));

/**
 * How the `/mcp` page presents the tools. Ten equal cards read as a wall; a
 * reader deciding whether to connect needs the jobs, not the alphabet. The
 * grouping lives HERE rather than in the component because the component is
 * forbidden from knowing tool names — that is the whole contract of this
 * module.
 */
export const MCP_TOOL_GROUPS: readonly McpToolGroup[] = [
  {
    id: "check",
    title: "Check and format C4 models",
    blurb:
      "The core loop: get the real parser's verdict on what your agent " +
      "wrote, then commit canonical bytes that diff cleanly.",
    tools: toolsNamed("validate_model", "format_model"),
  },
  {
    id: "sequence",
    title: "Sequence diagrams",
    blurb:
      "The same check-and-format loop, for message flows over time rather " +
      "than C4 structure — including the `desc` continuation that keeps a " +
      "message's endpoint and payload off the arrow.",
    tools: toolsNamed("validate_sequence", "format_sequence"),
  },
  {
    id: "flowchart",
    title: "Flowcharts",
    blurb:
      "The same check-and-format loop for step-by-step processes — plus the " +
      "audit a parse cannot do: decisions whose branches carry no guard, " +
      "nodes nothing reaches, and flows that stop without ending.",
    tools: toolsNamed("validate_flowchart", "format_flowchart"),
  },
  {
    id: "usecase",
    title: "Use-case diagrams",
    blurb:
      "The same check-and-format loop for who may do what at a system's " +
      "edge — plus the audit UML cares about: actors that can do nothing, " +
      "capabilities nothing reaches, and include/extend cycles.",
    tools: toolsNamed("validate_usecase", "format_usecase"),
  },
  {
    id: "er",
    title: "ER diagrams",
    blurb:
      "The same check-and-format loop for what a system stores — plus the " +
      "audit a parse cannot do: foreign keys with no line saying what they " +
      "reference, tables with no primary key, and tables joined to nothing. " +
      "The one kind whose Mermaid conversion is two-way and total.",
    tools: toolsNamed("validate_er", "format_er"),
  },
  {
    id: "dict",
    title: "Data dictionaries",
    blurb:
      "The same check-and-format loop for what a field MEANS and where its " +
      "value comes from — plus the number no other tool here reports: how " +
      "many of your fields are actually documented.",
    tools: toolsNamed("validate_dict", "format_dict"),
  },
  {
    id: "gantt",
    title: "Gantt charts",
    blurb:
      "The same check-and-format loop for how long work takes and what " +
      "blocks what — plus the two answers only arithmetic can give: the " +
      "critical path, and the dependency cycles that would make it a " +
      "fiction. Mermaid `gantt` converts both ways in the app; these tools " +
      "answer in `.alab`.",
    tools: toolsNamed("validate_gantt", "format_gantt"),
  },
  {
    id: "timeline",
    title: "Milestone timelines",
    blurb:
      "The same check-and-format loop for what happened and in what order — " +
      "plus the two findings only this tool can make: periods written out of " +
      "sequence, which nothing else here reads a period label closely enough " +
      "to notice, and events carrying a duration or a dependency in their " +
      "label, which is the document asking to be a gantt. Mermaid " +
      "`timeline` goes both ways.",
    tools: toolsNamed("validate_timeline", "format_timeline"),
  },
  {
    id: "lifecycle",
    title: "Lifecycles",
    blurb:
      "The same check-and-format loop for one thing moving through states — " +
      "plus the findings only this tool can make: a subject that never " +
      "terminates, states stranded after a final one, branches with no " +
      "condition on them, and states named as ACTIONS, which is a flowchart " +
      "written in the wrong notation. No Mermaid dialect exists for this " +
      "one, and none was invented.",
    tools: toolsNamed("validate_lifecycle", "format_lifecycle"),
  },
  {
    id: "inspect",
    title: "Convert and inspect",
    blurb:
      "Move a model between formats, or read its shape without paying for " +
      "its full text.",
    tools: toolsNamed("convert_model", "describe_model"),
  },
  {
    id: "learn",
    title: "Learn the format",
    blurb:
      "The grammar, the icon vocabulary and real examples — read these " +
      "before writing .alab, not after the first failure.",
    tools: toolsNamed(
      "get_syntax_reference",
      "list_icons",
      "list_example_models",
      "get_example_model",
    ),
  },
  {
    id: "share",
    title: "Show a human",
    blurb:
      "Turn a finished C4 model or sequence flow into a link that opens " +
      "the diagram in the viewer.",
    tools: toolsNamed("create_share_link"),
  },
];

/*
 * Every tool must appear in exactly one group, checked at module load. This is
 * the drift `check:mcp` cannot see: it compares the catalogue to the SERVER,
 * so a tool registered and documented but left out of every group would pass
 * it while silently vanishing from the page.
 */
const GROUPED_NAMES = MCP_TOOL_GROUPS.flatMap((group) =>
  group.tools.map((tool) => tool.name),
);
if (
  GROUPED_NAMES.length !== new Set(GROUPED_NAMES).size ||
  MCP_TOOLS.some((tool) => !GROUPED_NAMES.includes(tool.name))
) {
  throw new Error(
    "MCP_TOOL_GROUPS must cover every tool in MCP_TOOLS exactly once",
  );
}

/* -------------------------------------------------------------------------- */
/* Resources & prompts                                                         */
/* -------------------------------------------------------------------------- */

export interface McpResourceDoc {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export const MCP_RESOURCES: readonly McpResourceDoc[] = [
  {
    uri: "archlab://syntax",
    name: "archlab-syntax",
    title: "The .alab syntax reference",
    description:
      "The complete .alab grammar as Markdown, every example verified " +
      "against the real parser. Pin this when authoring models.",
    mimeType: "text/markdown",
  },
];

export interface McpPromptDoc {
  name: string;
  title: string;
  description: string;
  args: readonly McpArgDoc[];
}

export const MCP_PROMPTS: readonly McpPromptDoc[] = [
  {
    name: "author_c4_model",
    title: "Author a C4 model",
    description:
      "A working procedure for producing a valid .alab model of a system: " +
      "read the grammar, draft the levels, validate, then share.",
    args: [
      {
        name: "system",
        required: true,
        description: "The system to model, in a sentence or two.",
      },
      {
        name: "levels",
        required: false,
        description:
          'How deep to go, e.g. "context and container". Defaults to ' +
          "context plus container.",
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* The skill — the same knowledge, without a server                            */
/* -------------------------------------------------------------------------- */

/**
 * Where the skill lands in the reader's project, and the one command that puts
 * it there.
 *
 * WHY `degit` AND NOT AN OWN PACKAGE. `npx <name>` needs something published to
 * npm, and nothing here is: the repo is private and unpublished, so a
 * `npx arch-lab-skills` in these docs would be a command that works for
 * precisely nobody — the exact failure this whole module exists to prevent.
 * `degit` copies a subdirectory straight out of the public GitHub repo, so the
 * command in the docs is one that actually runs today, with no release step
 * standing between the page and the truth. If a package is ever published this
 * becomes a one-line change, in one place.
 *
 * The skill itself is generated by `scripts/build-skill.mjs` from
 * `content/syntax-sections.ts` — the same source `get_syntax_reference` serves
 * — and `check:skill` asserts the committed file still matches. Two
 * hand-maintained copies of a grammar is one copy that is quietly wrong.
 */
export const SKILL_REPO = "raksitnongbua/arch-lab";
export const SKILL_SOURCE_DIR = "skills/alab";
export const SKILL_DESTINATION = ".claude/skills/alab/SKILL.md";

export const SKILL_INSTALL = `npx degit ${SKILL_REPO}/${SKILL_SOURCE_DIR} .claude/skills/alab`;

/* -------------------------------------------------------------------------- */
/* Connecting                                                                  */
/* -------------------------------------------------------------------------- */

export interface ConnectRecipe {
  /** Client this applies to. */
  client: string;
  /** How to read the snippet. */
  note: string;
  language: string;
  snippet: (endpoint: string) => string;
}

export const CONNECT_RECIPES: readonly ConnectRecipe[] = [
  {
    client: "Claude Code",
    /*
     * GLOBAL (`--scope user`), which is NOT the CLI's default and is a
     * deliberate departure. Someone following this page wants the server
     * available next time they open a terminal, not only in whichever
     * directory they happened to be standing in — and a local-scoped install
     * looks identical until you cd elsewhere and the tools have silently
     * vanished. The narrower scopes are one flag away and named in the note.
     *
     * The flag used to appear in the note while the command omitted it, so the
     * copyable thing did not do what the prose beside it described.
     * `check:mcp` now asserts that whatever scope the note names is the scope
     * the command actually passes.
     */
    note:
      "One command, once. --scope user installs it for every project on your " +
      "machine; use --scope project to commit it to a repo instead, or drop " +
      "the flag to keep it to the current directory.",
    language: "bash",
    snippet: (endpoint) =>
      `claude mcp add --transport http arch-lab --scope user ${endpoint}`,
  },
  {
    client: "Claude Desktop",
    note: "Settings → Connectors → Add custom connector, then paste the URL. Or edit claude_desktop_config.json directly:",
    language: "json",
    snippet: (endpoint) =>
      JSON.stringify(
        { mcpServers: { "arch-lab": { type: "http", url: endpoint } } },
        null,
        2,
      ),
  },
  {
    client: "Gemini CLI",
    // `httpUrl` is the streamable-HTTP key; `url` in the same file means SSE,
    // which this server does not speak. The CLI writes the right one for you,
    // which is why the command is the snippet and the file is only mentioned.
    note: "One command, or add it to ~/.gemini/settings.json by hand under mcpServers with the httpUrl key (url means SSE there, which this server does not speak).",
    language: "bash",
    snippet: (endpoint) =>
      `gemini mcp add --transport http arch-lab ${endpoint}`,
  },
  {
    client: "Codex CLI",
    // `codex mcp add` covers stdio servers only, so an HTTP server is a
    // config-file edit. No auth block: this server has none.
    note: "Add to ~/.codex/config.toml. There is no CLI shortcut for HTTP servers, and no auth key is needed — this server does not authenticate.",
    language: "toml",
    snippet: (endpoint) => `[mcp_servers.arch-lab]\nurl = "${endpoint}"`,
  },
  {
    client: "Cursor",
    /*
     * NOT the same shape as VS Code, which is why these are two entries now.
     * They were one, emitting VS Code's `servers` + `type` for both — a
     * config Cursor reads and silently ignores, so the server simply never
     * appeared and nothing said why. Cursor wants `mcpServers`, and a remote
     * server needs no `type` at all.
     */
    note: "Add to .cursor/mcp.json in your project, or ~/.cursor/mcp.json to get it everywhere.",
    language: "json",
    snippet: (endpoint) =>
      JSON.stringify(
        { mcpServers: { "arch-lab": { url: endpoint } } },
        null,
        2,
      ),
  },
  {
    client: "VS Code (Copilot)",
    note: "Add to .vscode/mcp.json in your workspace, or your user mcp.json to get it everywhere.",
    language: "json",
    snippet: (endpoint) =>
      JSON.stringify(
        { servers: { "arch-lab": { type: "http", url: endpoint } } },
        null,
        2,
      ),
  },
  {
    client: "Anything else",
    note: "Any client speaking MCP over Streamable HTTP. There is no authentication and no state — every call is a pure function of its arguments.",
    language: "text",
    snippet: (endpoint) => endpoint,
  },
];
