/**
 * `SequenceLabFile` → Mermaid `sequenceDiagram` code: the reverse of
 * `./sequence.ts`, and the half that did not exist.
 *
 * WHY IT EXISTS NOW AND NOT BEFORE. Mermaid was an import format here, so the
 * arrow pointed one way and a `.alab` author had no way back out — which made
 * "switch between .alab and Mermaid" an unanswerable request in the
 * playground, however well the import worked. It became WRITABLE the moment
 * the model grew the blocks Mermaid actually draws (`critical`, `break`,
 * `rect`, `SequenceBox`): before that, emitting would have had to invent a
 * spelling for constructs the model could not hold.
 *
 * WHAT MERMAID CANNOT HOLD, and therefore what this drops — the same honesty
 * contract the import caveat has, stated by `MERMAID_SEQUENCE_EXPORT_CAVEAT`:
 *
 *   - `desc` — the detail behind a message's title. Mermaid has no
 *     equivalent construct at all (the import notes this too, from the other
 *     side), and folding it into the label would put a paragraph on a wire.
 *   - `[technology]` on participants and messages. Mermaid's participant and
 *     message text is one string; appending "[Go]" to a name would turn a
 *     structured field into a naming convention, which is how it stops being
 *     data.
 *   - `@icon` on a participant. Mermaid's sequence renderer draws no icons at
 *     all, so there is nothing to map onto — and folding the slug into the
 *     displayed name would put the word "postgresql" on a lifeline that
 *     already says "Orders DB".
 *   - Everything the `.alab` HEADER carries beyond the title: description,
 *     owner, tags, timestamps, and any `!` forward-compatible field. Mermaid
 *     has a `title` and nothing else.
 *   - A participant's UNSTATED kind. The model keeps "neither said" apart
 *     from "said participant" (see `SequenceParticipantKind`); Mermaid has
 *     only the two words, so an unstated lifeline comes back stated.
 *   - The LABEL of a rect that also has a tint — Mermaid reads the first word
 *     after `rect` as the colour and has nowhere else to put a name.
 *
 * Nothing else is lost: participants keep their kind and alias, boxes keep
 * their label and colour, every fragment kind maps to its own keyword, notes
 * keep placement and span, activation bars keep their brackets, and
 * `autonumber` survives.
 *
 * Deterministic — identical models always produce identical text, iteration
 * follows the model's own order, and `parseMermaidSequence(serialize(file))`
 * reproduces everything above the loss line (`scripts/sequence-check.mjs`
 * pins that round trip).
 *
 * Imported by `scripts/sequence-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type {
  SequenceBox,
  SequenceItem,
  SequenceLabFile,
  SequenceMessage,
  SequenceMessageKind,
  SequenceNote,
  SequenceParticipant,
} from "@/types";

import { encodeInlineBreaks, mermaidSafeId } from "./text";

/** What an EXPORT to Mermaid drops. The mirror of
 * `MERMAID_SEQUENCE_CAVEAT`, which describes the trip the other way. */
export const MERMAID_SEQUENCE_EXPORT_CAVEAT =
  "Mermaid sequenceDiagram cannot hold everything a .alab sequence can: a " +
  "message's desc detail, [technology] on participants and messages, and " +
  "every header field except the title (description, owner, tags, " +
  "timestamps) have no Mermaid equivalent and are left behind, a participant " +
  "icon has nowhere to go (Mermaid draws no icons), " +
  "whose kind is unstated comes back as a participant (Mermaid has only " +
  "participant and actor), and a rect that carries both a label and a tint " +
  "keeps the tint. Everything else survives: participants, boxes, messages, " +
  "activation bars, notes, autonumber and every fragment — loop, alt/else, " +
  "opt, par/and, critical/option, break and rect.";

const INDENT = "    ";

/** Message kind → the Mermaid arrow this writes. The IMPORT table maps eight
 * arrows onto three kinds; going out there is one canonical arrow per kind,
 * chosen as the one Mermaid's own docs lead with. */
const ARROW_BY_KIND: Readonly<Record<SequenceMessageKind, string>> = {
  sync: "->>",
  async: "-)",
  reply: "-->>",
};

/** The shared substitution rule (see `mermaidSafeId`); `p_` = participant. */
function mermaidId(id: string): string {
  return mermaidSafeId(id, "p_");
}

/**
 * One line of message, note or label text: newlines become `<br/>`, which is
 * the codec the importer reads back.
 *
 * NOTHING ELSE IS SUBSTITUTED, and an earlier version that swapped `;` for
 * `,` was wrong: `sequenceDiagram` reads message text to end of line, so the
 * semicolon needed no escaping — and the swap silently rewrote a note in the
 * bundled Checkout flow ("holds; only the capture" → "holds, only the
 * capture"). Quietly editing an author's punctuation to dodge a problem the
 * grammar does not have is worse than the problem.
 */
function text(value: string): string {
  return encodeInlineBreaks(value);
}

export function serializeMermaidSequence(file: SequenceLabFile): string {
  const lines: string[] = ["sequenceDiagram"];

  const title = file.metadata.title;
  if (typeof title === "string" && title !== "") {
    /* Mermaid's `title` runs to end of line and takes no quotes. */
    lines.push(`${INDENT}title ${text(title).replace(/\n/g, " ")}`);
  }
  if (file.autonumber === true) lines.push(`${INDENT}autonumber`);

  /* ---------------------------- participants ---------------------------- */
  /* Walked in model order with boxes opened as their first member is reached
     — the same drive-from-the-array rule the `.alab` serializer follows, and
     for the same reason: `participants` IS the lifeline order, and emitting
     boxes first then the leftovers would reorder the diagram. */
  const boxByMember = new Map<string, SequenceBox>();
  for (const box of file.boxes ?? []) {
    for (const id of box.participants) boxByMember.set(id, box);
  }
  let openBox: SequenceBox | null = null;
  for (const participant of file.participants) {
    const box = boxByMember.get(participant.id) ?? null;
    if (box !== openBox) {
      if (openBox !== null) lines.push(`${INDENT}end`);
      openBox = box;
      if (box !== null) {
        /* `box <colour> <label>`: the colour is an optional first WORD, so a
           tint only goes out when there is a label after it to keep them
           apart — which `SequenceBox` guarantees by requiring the label. */
        const tint = typeof box.tint === "string" ? `${box.tint} ` : "";
        lines.push(`${INDENT}box ${tint}${text(box.label)}`);
      }
    }
    lines.push(
      `${INDENT}${box === null ? "" : INDENT}${participantLine(participant)}`,
    );
  }
  if (openBox !== null) lines.push(`${INDENT}end`);

  /* -------------------------------- items -------------------------------- */
  emitItems(lines, file.items, 1);

  return `${lines.join("\n")}\n`;
}

function participantLine(participant: SequenceParticipant): string {
  const keyword = participant.kind === "actor" ? "actor" : "participant";
  const id = mermaidId(participant.id);
  /* `as` only when the display name differs from the id Mermaid would show
     anyway — a document whose ids are already names stays readable. */
  return participant.name === id
    ? `${keyword} ${id}`
    : `${keyword} ${id} as ${text(participant.name)}`;
}

function emitItems(
  lines: string[],
  items: readonly SequenceItem[],
  depth: number,
): void {
  const pad = INDENT.repeat(depth);
  for (const item of items) {
    if (item.step === "message") {
      lines.push(pad + messageLine(item));
      continue;
    }
    if (item.step === "note") {
      lines.push(pad + noteLine(item));
      continue;
    }

    item.branches.forEach((branch, index) => {
      const label = branch.label === undefined ? "" : ` ${text(branch.label)}`;
      if (index === 0) {
        /* `rect` takes a COLOUR where the others take a guard, and Mermaid
           reads the first word after `rect` as that colour — so a tinted rect
           emits its tint and an untinted one emits its label, never both.
           A labelled tinted rect loses the label here; there is nowhere in
           Mermaid's grammar to put it. */
        if (item.kind === "rect") {
          const tint = typeof item.tint === "string" ? ` ${item.tint}` : label;
          lines.push(`${pad}rect${tint === "" ? " rgb(0,0,0)" : tint}`);
        } else {
          lines.push(`${pad}${item.kind}${label}`);
        }
      } else {
        lines.push(
          `${pad}${CONTINUATION_BY_KIND[item.kind] ?? "else"}${label}`,
        );
      }
      emitItems(lines, branch.items, depth + 1);
    });
    /* One `end` per fragment, not per branch: `else`/`and`/`option` continue
       the same block. */
    lines.push(`${pad}end`);
  }
}

/** The keyword that opens a 2nd+ branch, by fragment kind. Only the
 * multi-branch kinds appear; the rest can never reach it. */
const CONTINUATION_BY_KIND: Readonly<Record<string, string>> = {
  alt: "else",
  par: "and",
  critical: "option",
};

function messageLine(message: SequenceMessage): string {
  const arrow = ARROW_BY_KIND[message.kind];
  /* `+`/`-` ride the arrow, exactly as the importer reads them. */
  const activation =
    (message.activate === true ? "+" : "") +
    (message.deactivate === true ? "-" : "");
  return `${mermaidId(message.from)}${arrow}${activation}${mermaidId(message.to)}: ${text(message.label)}`;
}

function noteLine(note: SequenceNote): string {
  const ids = note.participants.map(mermaidId).join(",");
  const placement = note.placement === "over" ? "over" : `${note.placement} of`;
  return `Note ${placement} ${ids}: ${text(note.text)}`;
}
