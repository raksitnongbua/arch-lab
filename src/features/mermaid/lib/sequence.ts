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
 * declaration on first use), `create`/`destroy` lifecycle lines, ALL TEN
 * of Mermaid's arrow types (the table is `./sequence-mapping.ts`),
 * self-messages,
 * `activate`/`deactivate` and the `+`/`-` shorthand, `Note left of` /
 * `Note right of` / `Note over` (one or two participants),
 * `loop`/`alt`/`else`/`opt`/`par`/`and`/`critical`/`option`/`break`/`end`,
 * the two purely visual blocks `rect` and `box`, `autonumber` (including
 * `autonumber off`), `title` and `%%` comments.
 *
 * EVERY BLOCK MERMAID DRAWS IS A BLOCK ARCH-LAB DRAWS. `critical`/`option`,
 * `break` and `rect` are fragment kinds in the model (`SequenceFragmentKind`)
 * and `box` is a `SequenceBox`, so nothing here is flattened, approximated or
 * refused. Two earlier versions of this file did both and both were wrong:
 * refusing rejected a whole diagram over a background tint, and flattening
 * silently deleted a grouping the author drew on purpose. What survives an
 * import was a question about the ARROWS, and is no longer one either: the
 * arrow table is now the same two-axis grid in both directions, so the trip
 * is bijective for every arrow Mermaid can draw.
 *
 * The colours come too: `rect rgb(191, 223, 255)` and `box Aqua Name` are
 * normalised to `#rrggbb` (`@/lib/tint`) and drawn as a wash. A colour this
 * app cannot store is dropped — the ONE thing about a block that is still
 * lossy, and it is in the caveat.
 *
 * What is LOSSY is named, in full, by `MERMAID_SEQUENCE_CAVEAT` below —
 * the same honesty contract as the C4 importer's `MERMAID_CAVEAT`.
 *
 * Imported by `scripts/sequence-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  SequenceBox,
  SequenceBranch,
  SequenceFragment,
  SequenceFragmentKind,
  SequenceItem,
  SequenceLabFile,
  SequenceMessage,
  SequenceNote,
  SequenceParticipant,
} from "@/types";

import { normalizeTint } from "@/lib/tint";

import { MERMAID_IMPORT_TIMESTAMP } from "./defaults";
import {
  MERMAID_SEQUENCE_ARROW_LIST,
  MERMAID_SEQUENCE_ARROW_MATCH_ORDER,
} from "./sequence-mapping";
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
  "Mermaid sequenceDiagram imports with every arrow intact: all ten of " +
  `Mermaid's arrow types (${MERMAID_SEQUENCE_ARROW_LIST}) are the same two ` +
  "axes a .alab arrow is — solid or dotted, tipped with nothing, an " +
  "arrowhead, a cross, an open async head or a head at each end — so none " +
  "of them is approximated. What is still lossy: autonumber start/step " +
  "arguments are dropped, an activate/deactivate line that does not " +
  "bracket the message next to it is dropped, a rect or box colour that is " +
  "not a hex, rgb() or common named colour is dropped, and create/destroy " +
  "import the participant but not the moment its lifeline starts or ends. " +
  "Every block itself survives — loop, alt/else, opt, par/and, " +
  "critical/option, break, rect and box all import as themselves. Save as " +
  ".alab to keep everything else.";

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
 * The characters an arrow may START with, derived from the shared table. The
 * message scanner uses it to skip cheaply over the participant name without
 * hardcoding a guess about the alphabet of the operator set — see
 * `readMessage` for the bug that guess caused.
 */
const ARROW_FIRST_CHARS: ReadonlySet<string> = new Set(
  MERMAID_SEQUENCE_ARROW_MATCH_ORDER.map(([token]) => token.charAt(0)),
);

/**
 * Block keywords that OPEN a fragment. One-to-one with the model's kinds —
 * the Mermaid word and the arch-lab word are the same word for all seven,
 * which is what "no approximation" means in practice.
 */
const FRAGMENT_OPENERS: Readonly<Record<string, SequenceFragmentKind>> = {
  loop: "loop",
  opt: "opt",
  alt: "alt",
  par: "par",
  critical: "critical",
  break: "break",
  rect: "rect",
};

/** Continuation keyword → the fragment kind it may extend. */
const BRANCH_CONTINUATIONS: Readonly<Record<string, SequenceFragmentKind>> = {
  else: "alt",
  and: "par",
  option: "critical",
};

/* -------------------------------------------------------------------------- */
/* The importer                                                                */
/* -------------------------------------------------------------------------- */

interface OpenBlock {
  /** The Mermaid word that opened it, quoted verbatim by every error about
   * it. Now always equal to the model kind, except for `box`. */
  opener: string;
  /** `null` for a `box`, which groups lifelines rather than steps. */
  fragment: SequenceFragment | null;
  /** Where the lines below this opener land. A `box` contributes no items,
   * so it passes the ENCLOSING target through unchanged. */
  items: SequenceItem[];
  /** Non-null inside a `box`: participants declared below join it. */
  box: SequenceBox | null;
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
    /* Inside a `box`, a newly declared lifeline joins it — including one
       auto-declared by first USE, which is how Mermaid itself behaves. */
    stack[stack.length - 1]?.box?.participants.push(id);
  };

  const rootItems: SequenceItem[] = [];
  const boxes: SequenceBox[] = [];
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
    if (word === "box") {
      /* `box <colour?> <label>` — Mermaid's colour is an optional FIRST word
         and the label is everything after it, with no punctuation between
         them. So the colour is only a colour when the rest is non-empty:
         `box Payments` names a box, it does not tint an unnamed one. */
      const rest = statement.slice(word.length).trim();
      const [firstWord, ...restWords] = rest.split(/\s+/);
      const leadingTint =
        restWords.length > 0 && firstWord !== undefined
          ? normalizeTint(firstWord)
          : null;
      const label = decodeInlineBreaks(
        leadingTint === null && firstWord !== "transparent"
          ? rest
          : restWords.join(" "),
      ).trim();
      if (label === "") {
        failAt(
          lineNo,
          startCol,
          '"box" needs a name — write "box Payments" or "box Aqua Payments"',
          "box",
        );
      }
      const box: SequenceBox = {
        label,
        ...(leadingTint !== null ? { tint: leadingTint } : {}),
        participants: [],
      };
      boxes.push(box);
      stack.push({
        opener: word,
        fragment: null,
        /* A box holds lifelines, not steps. Mermaid allows nothing but
           participant lines inside one, so passing the enclosing target
           through costs nothing and keeps `currentItems()` total. */
        items: currentItems(),
        box,
        line: lineNo,
        column: startCol,
      });
      continue;
    }
    const opener = FRAGMENT_OPENERS[word];
    if (opener !== undefined) {
      /* `rect rgb(191, 223, 255)` puts a COLOUR where every other fragment
         puts a label, so the tail is read as one or the other by kind —
         never as both, which would make `rect Payments` ambiguous. */
      const tail = statement.slice(word.length).trim();
      const tint = opener === "rect" ? normalizeTint(tail) : null;
      const label =
        opener === "rect" && (tint !== null || tail === "")
          ? ""
          : decodeInlineBreaks(tail);
      /* `label` before `items`: the model's canonical key order
         (BRANCH_KEYS), so an imported model is byte-for-byte the same JSON
         a `.alab` parse of its own serialization would produce. */
      const branch: SequenceBranch =
        label === "" ? { items: [] } : { label, items: [] };
      const fragment: SequenceFragment = {
        step: "fragment",
        kind: opener,
        ...(tint !== null ? { tint } : {}),
        branches: [branch],
      };
      currentItems().push(fragment);
      stack.push({
        opener: word,
        fragment,
        items: branch.items,
        box: null,
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
         `box` is never one of them — but the type does not know that, and
         asserting it here beats widening the field. */
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
    /* An empty box is dropped rather than kept: Mermaid allows `box X / end`
       with nothing between, and a bracket over no lifelines has no drawing —
       the `.alab` grammar refuses to spell one for the same reason. */
    ...(boxes.some((box) => box.participants.length > 0)
      ? { boxes: boxes.filter((box) => box.participants.length > 0) }
      : {}),
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
     the wrong place and `-->>` is never read as `-->`.

     THE CANDIDATE-START TEST IS DERIVED, and that is the whole reason the two
     bidirectional arrows now import. This loop used to skip every character
     that was not `-`, which is true of eight of Mermaid's ten arrows and
     false of `<<->>` and `<<-->>`: they were unreachable, so a diagram using
     one failed as "not a recognised statement" naming the SOURCE
     PARTICIPANT rather than the arrow. A hand-written set of first characters
     is the same bug waiting for the eleventh arrow, so the set comes from the
     table. */
  let arrowAt = -1;
  let arrow: (typeof MERMAID_SEQUENCE_ARROW_MATCH_ORDER)[number] | undefined;
  for (let i = 0; i < text.length && arrow === undefined; i += 1) {
    if (!ARROW_FIRST_CHARS.has(text.charAt(i))) continue;
    for (const candidate of MERMAID_SEQUENCE_ARROW_MATCH_ORDER) {
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
    lineStyle: arrow[1].lineStyle,
    headStyle: arrow[1].headStyle,
    label: decodeInlineBreaks(rest.slice(colonAt + 1).trim()),
  };
  if (activate) message.activate = true;
  if (deactivate) message.deactivate = true;
  return message;
}
