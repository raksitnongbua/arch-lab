/**
 * Mermaid `sequenceDiagram` → `SequenceLabFile`. One-way, like the C4
 * importer next door — Mermaid is an import format, not a storage format.
 *
 * Unlike the C4 grammar (function-call statements, brace blocks — handled
 * by `scanner.ts`/`parser.ts`), `sequenceDiagram` is line-oriented: one
 * statement per line, blocks closed by `end`. So this importer is its own
 * small line parser rather than a bolt-on to the C4 scanner; what it DOES
 * share is the error contract (`MermaidParseError` via `failAt`, so every
 * failure names a line and column) and the `<br/>` text codec.
 *
 * Supported: `participant`/`actor` (with `as` aliases and implicit
 * declaration on first use), `create`/`destroy` lifecycle lines, `->>` `-->>`
 * `->` `-->` `-x` `--x` `-)` `--)` arrows, self-messages,
 * `activate`/`deactivate` and the `+`/`-` shorthand, `Note left of` /
 * `Note right of` / `Note over` (one or two participants),
 * `loop`/`alt`/`else`/`opt`/`par`/`and`/`critical`/`option`/`break`/`end`,
 * the two purely visual blocks `rect` and `box`, `autonumber` (including
 * `autonumber off`), `title` and `%%` comments.
 *
 * Blocks arrive in three shapes, which is the whole reason this file has a
 * block table rather than one map:
 *
 *   - **Fragments** (`loop`, `opt`, `alt`, `par`) — a kind the model has.
 *   - **Fragments by approximation** (`critical` → `alt`, `break` → `opt`) —
 *     Mermaid draws more fragment kinds than UML's set we store. Both keep
 *     their labels and their nesting; only the kind word changes, and the
 *     caveat says so. Refusing them instead was tried and was wrong: it
 *     rejects a whole diagram over a label that has an obvious home.
 *   - **Transparent groups** (`rect`, `box`) — decoration, not structure.
 *     `rect` tints a region and `box` draws a bracket over lifelines;
 *     neither changes what happens, so their CONTENTS are imported into the
 *     enclosing branch and only the tint and the bracket are lost.
 *
 * What is LOSSY is named, in full, by `MERMAID_SEQUENCE_CAVEAT` below —
 * the same honesty contract as the C4 importer's `MERMAID_CAVEAT`.
 *
 * Imported by `scripts/sequence-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  SequenceBranch,
  SequenceFragment,
  SequenceFragmentKind,
  SequenceItem,
  SequenceLabFile,
  SequenceMessage,
  SequenceMessageKind,
  SequenceNote,
  SequenceParticipant,
} from "@/types";

import { MERMAID_IMPORT_TIMESTAMP } from "./defaults";
import { failAt } from "./errors";
import { decodeInlineBreaks } from "./text";

/* -------------------------------------------------------------------------- */
/* The caveat — what a Mermaid sequence import DROPS                           */
/* -------------------------------------------------------------------------- */

/**
 * Import is honest but not lossless. Named per item so the UI (phase 2) can
 * say exactly what changed, the way `MERMAID_CAVEAT` does for C4:
 */
export const MERMAID_SEQUENCE_CAVEAT =
  "Mermaid sequenceDiagram is an import format: converting it is one-way " +
  "and lossy — the eight arrowheads collapse to three kinds (->>, -> " +
  "become sync; -->>, --> become replies; -x, --x, -), --) become async, " +
  "losing the open, cross and async head shapes), autonumber start/step " +
  "arguments are dropped, an activate/deactivate line that does not " +
  "bracket the message next to it is dropped, critical becomes alt and " +
  "break becomes opt (labels and nesting survive, the kind word does not), " +
  "rect and box keep their contents but lose the tint and the bracket, and " +
  "create/destroy import the participant but not the moment its lifeline " +
  "starts or ends. Save as .alab to keep everything else.";

/* -------------------------------------------------------------------------- */
/* Options                                                                     */
/* -------------------------------------------------------------------------- */

export interface ParseMermaidSequenceOptions {
  /** Same contract as the C4 importer: a fixed default keeps parsing a pure
   * function; pass `new Date().toISOString()` if provenance matters more
   * than byte-stable output. */
  timestamp?: string;
}

const DEFAULT_TITLE = "Untitled sequence diagram";

/* -------------------------------------------------------------------------- */
/* Arrow table                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Mermaid arrow → message kind. LONGEST FIRST at any given position — the
 * only ordering that keeps `-->>` from being read as `--` + `>>` or `->`
 * from shadowing `->>`. The three-kind collapse is the documented loss:
 * solid+head is a call, dotted is a return, crosses and open async heads
 * are all fire-and-forget.
 */
const MERMAID_SEQ_ARROWS: readonly (readonly [string, SequenceMessageKind])[] =
  [
    ["-->>", "reply"],
    ["--x", "async"],
    ["--)", "async"],
    ["-->", "reply"],
    ["->>", "sync"],
    ["-x", "async"],
    ["-)", "async"],
    ["->", "sync"],
  ];

/**
 * Block keywords that OPEN a fragment, and the model kind each becomes.
 * `critical` and `break` are the approximations named in the caveat: the
 * value is what we store, the KEY stays the word the author wrote so every
 * error message can quote their source rather than our translation of it.
 */
const FRAGMENT_OPENERS: Readonly<Record<string, SequenceFragmentKind>> = {
  loop: "loop",
  opt: "opt",
  alt: "alt",
  par: "par",
  critical: "alt",
  break: "opt",
};

/**
 * Block keywords that open a group with no model counterpart: their contents
 * belong to the enclosing branch and the decoration is dropped. Listed with
 * what is lost, because that is the only thing this table is for.
 */
const TRANSPARENT_GROUPS: Readonly<Record<string, string>> = {
  rect: "background tint",
  box: "participant bracket",
};

/**
 * Continuation keywords → the opener each one may follow. Keyed on the
 * MERMAID word rather than the model kind so `option` after a plain `alt` is
 * still refused, even though `critical` and `alt` store the same kind.
 */
const BRANCH_CONTINUATIONS: Readonly<Record<string, string>> = {
  else: "alt",
  and: "par",
  option: "critical",
};

/* -------------------------------------------------------------------------- */
/* The importer                                                                */
/* -------------------------------------------------------------------------- */

interface OpenBlock {
  /** The Mermaid word that opened it, quoted verbatim by every error about
   * it — an author who wrote `critical` must not be told about `alt`. */
  opener: string;
  /** `null` for a transparent group (`rect`, `box`). */
  fragment: SequenceFragment | null;
  /** Where the lines below this opener land. For a transparent group it is
   * the ENCLOSING target — which is all that flattening is. */
  items: SequenceItem[];
  line: number;
  column: number;
}

/**
 * Parses Mermaid `sequenceDiagram` source into a `SequenceLabFile`.
 * Deterministic: the same source (and options) always yields the same
 * model. Throws `MermaidParseError` with line/column on malformed input,
 * never returning a partial model.
 */
export function parseMermaidSequence(
  source: string,
  options?: ParseMermaidSequenceOptions,
): SequenceLabFile {
  const timestamp = options?.timestamp ?? MERMAID_IMPORT_TIMESTAMP;

  let title: string | null = null;
  let autonumber = false;
  const participants: SequenceParticipant[] = [];
  const participantIds = new Set<string>();
  /* Mermaid auto-declares a lifeline on first use; matching that keeps
     every real-world snippet importable. First-USE order is the lifeline
     order, exactly as Mermaid renders it. */
  const declare = (id: string, explicit?: SequenceParticipant): void => {
    if (participantIds.has(id)) return;
    participantIds.add(id);
    participants.push(explicit ?? { id, name: id });
  };

  const rootItems: SequenceItem[] = [];
  const stack: OpenBlock[] = [];
  const currentItems = (): SequenceItem[] =>
    stack.length === 0 ? rootItems : stack[stack.length - 1].items;
  /* For folding standalone activate/deactivate onto the message they
     bracket (see the caveat for the unfoldable case). */
  let lastMessage: SequenceMessage | null = null;

  let seenHeader = false;
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const raw = lines[index].endsWith("\r")
      ? lines[index].slice(0, -1)
      : lines[index];
    const startCol = raw.length - raw.trimStart().length + 1;
    const text = raw.trim();
    if (text === "" || text.startsWith("%%")) continue;

    if (!seenHeader) {
      if (text !== "sequenceDiagram") {
        failAt(
          lineNo,
          startCol,
          `"${text.split(/\s/, 1)[0]}" is not a sequence diagram header — the first line must be exactly "sequenceDiagram"`,
          text.slice(0, 40),
        );
      }
      seenHeader = true;
      continue;
    }

    /* `create participant X as Y` is a participant line with a lifeline
       start time we have nowhere to keep, so the prefix is peeled off and
       the rest re-dispatched — one declaration path, not two. `destroy X`
       is the same loss with nothing left over, so it is simply dropped. */
    let statement = text;
    if (statement === "destroy" || statement.startsWith("destroy ")) continue;
    if (statement.startsWith("create ")) {
      statement = statement.slice("create ".length).trim();
      const created = statement.split(/[\s:]/, 1)[0];
      if (created !== "participant" && created !== "actor") {
        failAt(
          lineNo,
          startCol,
          '"create" introduces a participant — write "create participant X" or "create actor X"',
          text.slice(0, 40),
        );
      }
    }
    const word = statement.split(/[\s:]/, 1)[0];
    const lower = word.toLowerCase();

    /* ----------------------------- keywords ----------------------------- */
    if (word === "title") {
      title = decodeInlineBreaks(
        text.slice("title".length).replace(/^\s*:?\s*/, ""),
      ).trim();
      if (title === "") {
        failAt(lineNo, startCol, '"title" is missing its text', "title");
      }
      continue;
    }
    if (word === "autonumber") {
      /* Start/step arguments (`autonumber 10 10`) are dropped — named in
         the caveat. The flag itself survives, and `autonumber off` turns it
         back off: Mermaid lets a later line withdraw an earlier one, so the
         LAST word wins rather than the first. */
      autonumber = statement.slice(word.length).trim() !== "off";
      continue;
    }
    if (word === "participant" || word === "actor") {
      const rest = statement.slice(word.length).trim();
      if (rest === "") {
        failAt(lineNo, startCol, `"${word}" is missing its name`, word);
      }
      const asIndex = rest.search(/\s+as\s+/);
      const id = (asIndex === -1 ? rest : rest.slice(0, asIndex)).trim();
      const name =
        asIndex === -1
          ? id
          : decodeInlineBreaks(rest.replace(/^.*?\s+as\s+/, "")).trim();
      if (name === "") {
        failAt(
          lineNo,
          startCol,
          `participant "${id}" has an empty alias name`,
          id,
        );
      }
      if (participantIds.has(id)) {
        failAt(
          lineNo,
          startCol,
          `duplicate participant "${id}" — it was already declared or used above`,
          id,
        );
      }
      declare(id, { id, kind: word, name });
      continue;
    }
    if (word === "activate" || word === "deactivate") {
      const id = text.slice(word.length).trim();
      if (id === "") {
        failAt(lineNo, startCol, `"${word}" is missing its participant`, word);
      }
      declare(id);
      /* Fold onto the adjacent message — an activation bar starts when a
         message arrives (`activate X` after a message TO X) and ends when
         one leaves (`deactivate X` after a message FROM X). Anything else
         has no message to anchor to in our model and is dropped (caveat). */
      if (lastMessage !== null) {
        if (
          word === "activate" &&
          lastMessage.to === id &&
          lastMessage.activate !== true
        ) {
          lastMessage.activate = true;
        } else if (
          word === "deactivate" &&
          lastMessage.from === id &&
          lastMessage.deactivate !== true
        ) {
          lastMessage.deactivate = true;
        }
      }
      continue;
    }
    if (lower === "note") {
      currentItems().push(parseNote(text, lineNo, startCol, declare));
      continue;
    }
    if (TRANSPARENT_GROUPS[word] !== undefined) {
      /* Contents land in the ENCLOSING branch, so nothing about this line
         reaches the model — but the group still owns an `end`, which is why
         it goes on the stack at all. */
      stack.push({
        opener: word,
        fragment: null,
        items: currentItems(),
        line: lineNo,
        column: startCol,
      });
      continue;
    }
    const opener = FRAGMENT_OPENERS[word];
    if (opener !== undefined) {
      const label = decodeInlineBreaks(statement.slice(word.length).trim());
      /* `label` before `items`: the model's canonical key order
         (BRANCH_KEYS), so an imported model is byte-for-byte the same JSON
         a `.alab` parse of its own serialization would produce. */
      const branch: SequenceBranch =
        label === "" ? { items: [] } : { label, items: [] };
      const fragment: SequenceFragment = {
        step: "fragment",
        kind: opener,
        branches: [branch],
      };
      currentItems().push(fragment);
      stack.push({
        opener: word,
        fragment,
        items: branch.items,
        line: lineNo,
        column: startCol,
      });
      continue;
    }
    const continues = BRANCH_CONTINUATIONS[word];
    if (continues !== undefined) {
      const top = stack[stack.length - 1];
      if (top === undefined || top.opener !== continues) {
        failAt(
          lineNo,
          startCol,
          `"${word}" without an open "${continues}" block${top !== undefined ? ` — the innermost block is "${top.opener}"` : ""}`,
          word,
        );
      }
      /* `fragment` is non-null for every opener a continuation names — a
         transparent group is never one of them — but the type does not know
         that, and asserting it here beats widening the field. */
      const fragment = top.fragment;
      if (fragment === null) continue;
      const label = decodeInlineBreaks(statement.slice(word.length).trim());
      const branch: SequenceBranch =
        label === "" ? { items: [] } : { label, items: [] };
      fragment.branches.push(branch);
      top.items = branch.items;
      continue;
    }
    if (word === "end") {
      if (stack.length === 0) {
        failAt(
          lineNo,
          startCol,
          'unmatched "end" — there is no open loop/alt/opt/par/critical/break/rect/box block to close',
          "end",
        );
      }
      stack.pop();
      continue;
    }

    /* ----------------------------- messages ----------------------------- */
    const message = parseMessage(statement, lineNo, startCol, declare);
    currentItems().push(message);
    lastMessage = message;
  }

  if (!seenHeader) {
    failAt(
      1,
      1,
      'the source is empty — expected "sequenceDiagram" on the first line',
    );
  }
  const open = stack[stack.length - 1];
  if (open !== undefined) {
    failAt(
      open.line,
      open.column,
      `the "${open.opener}" block opened here is never closed — expected "end"`,
      open.opener,
    );
  }

  return {
    version: "1.0",
    kind: "sequence",
    metadata: {
      title: title ?? DEFAULT_TITLE,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    participants,
    ...(autonumber ? { autonumber: true } : {}),
    items: rootItems,
  };
}

/* -------------------------------------------------------------------------- */
/* Statement parsers                                                           */
/* -------------------------------------------------------------------------- */

function parseNote(
  text: string,
  line: number,
  column: number,
  declare: (id: string) => void,
): SequenceNote {
  const match = /^[Nn]ote\s+(left\s+of|right\s+of|over)\s+([^:]+):(.*)$/.exec(
    text,
  );
  if (match === null) {
    failAt(
      line,
      column,
      'a note reads "Note left of X: text", "Note right of X: text" or "Note over X[,Y]: text"',
      text.slice(0, 40),
    );
  }
  const placement = match[1].startsWith("left")
    ? "left"
    : match[1].startsWith("right")
      ? "right"
      : "over";
  const ids = match[2]
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  const max = placement === "over" ? 2 : 1;
  if (ids.length === 0 || ids.length > max) {
    failAt(
      line,
      column,
      placement === "over"
        ? `"Note over" names one or two participants, got ${ids.length}`
        : `"Note ${match[1]}" names exactly one participant, got ${ids.length}`,
      match[2].trim().slice(0, 40),
    );
  }
  for (const id of ids) declare(id);
  return {
    step: "note",
    placement,
    participants: ids,
    text: decodeInlineBreaks(match[3].trim()),
  };
}

function parseMessage(
  text: string,
  line: number,
  column: number,
  declare: (id: string) => void,
): SequenceMessage {
  /* Find the EARLIEST arrow occurrence, matching longest-first at that
     position, so a `-` inside a participant name cannot split the line in
     the wrong place and `-->>` is never read as `-->`. */
  let arrowAt = -1;
  let arrow: (typeof MERMAID_SEQ_ARROWS)[number] | undefined;
  for (let i = 0; i < text.length && arrow === undefined; i += 1) {
    if (text.charAt(i) !== "-") continue;
    for (const candidate of MERMAID_SEQ_ARROWS) {
      if (text.startsWith(candidate[0], i)) {
        arrowAt = i;
        arrow = candidate;
        break;
      }
    }
  }
  if (arrow === undefined || arrowAt <= 0) {
    failAt(
      line,
      column,
      `"${text.split(/\s/, 1)[0]}" is not a recognised sequenceDiagram statement — expected a message (A->>B: text), participant, actor, create/destroy, Note, activate/deactivate, loop/alt/else/opt/par/and/critical/option/break/rect/box/end, autonumber or title`,
      text.slice(0, 40),
    );
  }

  const from = text.slice(0, arrowAt).trim();
  if (from === "") {
    failAt(
      line,
      column,
      "the message has no source participant",
      text.slice(0, 40),
    );
  }
  let rest = text.slice(arrowAt + arrow[0].length);

  /* `+`/`-` shorthand: `A->>+B` activates the target, `B-->>-A` ends the
     bar on the source — the same anchoring rule as standalone
     activate/deactivate, just spelled inline. */
  let activate = false;
  let deactivate = false;
  if (rest.startsWith("+")) {
    activate = true;
    rest = rest.slice(1);
  } else if (rest.startsWith("-")) {
    deactivate = true;
    rest = rest.slice(1);
  }

  const colonAt = rest.indexOf(":");
  if (colonAt === -1) {
    failAt(
      line,
      column + arrowAt,
      'the message is missing ":" before its text — e.g. A->>B: Hello',
      rest.trim().slice(0, 40),
    );
  }
  const to = rest.slice(0, colonAt).trim();
  if (to === "") {
    failAt(
      line,
      column + arrowAt,
      "the message has no target participant",
      rest.trim().slice(0, 40),
    );
  }
  declare(from);
  declare(to);

  const message: SequenceMessage = {
    step: "message",
    from,
    to,
    kind: arrow[1],
    label: decodeInlineBreaks(rest.slice(colonAt + 1).trim()),
  };
  if (activate) message.activate = true;
  if (deactivate) message.deactivate = true;
  return message;
}
