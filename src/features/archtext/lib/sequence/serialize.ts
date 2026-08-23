/**
 * `SequenceLabFile` → `.alab` sequence text. Deterministic: fixed line
 * order, fixed attribute order, canonical omission rules mirrored exactly
 * by the parser's defaults, so the same model always yields byte-identical
 * text and `parse(serialize(file))` reproduces `file` losslessly.
 *
 * Canonical omission rules (each has the symmetric default in the parser):
 *   - `created`/`updated` lines are omitted when equal to the fixed
 *     sentinel (`DEFAULT_TIMESTAMP`, shared with the C4 grammar).
 *   - A participant's `:kind` is omitted when `kind` is absent — absent,
 *     `participant` and `actor` are three distinct states and all three
 *     survive the round trip.
 *   - `autonumber` is a line only when the field is present (true or false).
 *   - Activation suffixes are written only for `true` (the only value the
 *     parser's sugar produces); any other present value rides the raw `!`
 *     escape so nothing is silently normalised.
 *
 * Known optional fields with unexpected shapes, and unknown
 * forward-compatible fields, are carried by the same `!` escape lines the
 * C4 grammar uses (`bangLine` is imported, not copied), preserving value
 * and key position.
 *
 * Pure: no I/O, no DOM. Throws a plain `Error` only for models a sequence
 * validator would refuse anyway (missing required fields, wrong shapes).
 *
 * Imported by `scripts/sequence-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import { isMultiBranch, sequenceItemAt } from "@/types";
import type { SequenceItemPath, SequenceLabFile } from "@/types";

import { isNormalizedTint } from "@/lib/tint";

import { DEFAULT_TIMESTAMP } from "../defaults";
import { META_KEYS, splitUnknowns } from "../schema";
import { bangLine, isRecord, tagsLine, techBody } from "../serialize";
import { BARE_ID_RE, valueToken } from "../text";
import {
  ARROW_BY_MESSAGE_KIND,
  BOX_KEYWORD,
  BRANCH_KEYWORD_BY_KIND,
  FRAGMENT_KIND_BY_KEYWORD,
  PARTICIPANT_KIND_BY_KEYWORD,
  RESERVED_BODY_WORDS,
  SEQUENCE_BLOCK,
  SEQUENCE_HEADER_WORD,
  TINT_ATTRIBUTE,
} from "./keywords";
import {
  BOX_KEYS,
  BRANCH_KEYS,
  FRAGMENT_KEYS,
  MESSAGE_KEYS,
  NOTE_KEYS,
  PARTICIPANT_KEYS,
  SEQ_FILE_KEYS,
} from "./schema";

function invalid(what: string, value: unknown): never {
  throw new Error(
    `serializeSequenceText: ${what} is not serializable (${JSON.stringify(value) ?? typeof value}) — this model is not a valid sequence document`,
  );
}

/**
 * Id token for body lines. Same bare/quoted rule as the C4 grammar's
 * `idToken`, EXTENDED by the sequence grammar's reserved body words: a
 * participant literally named `loop` or `note` must be quoted or the parser
 * would read it as a keyword. One reservation set (`RESERVED_BODY_WORDS`)
 * feeds both the parser's dispatch and this quoting decision.
 */
function seqIdToken(id: string): string {
  return BARE_ID_RE.test(id) && !RESERVED_BODY_WORDS.has(id)
    ? id
    : JSON.stringify(id);
}

/* -------------------------------------------------------------------------- */
/* The serializer                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Serializes a `SequenceLabFile` to canonical `.alab` sequence text. Pure
 * and deterministic: identical models always produce identical bytes, and
 * `parseSequenceText(serializeSequenceText(file))` round-trips every field.
 */
export function serializeSequenceText(file: SequenceLabFile): string {
  if (!isRecord(file)) invalid("the file", file);
  const lines: string[] = [];

  /* ------------------------------- header ------------------------------- */
  const version = file.version;
  if (typeof version !== "string" || !/^\d+\.\d+$/.test(version)) {
    invalid("version", version);
  }
  if (file.kind !== "sequence") invalid("kind", file.kind);
  lines.push(`archlab ${version} ${SEQUENCE_HEADER_WORD}`);

  const schemaValue = file.$schema;
  if (typeof schemaValue === "string") {
    lines.push(`schema ${JSON.stringify(schemaValue)}`);
  }

  const metadata = file.metadata;
  if (!isRecord(metadata)) invalid("metadata", metadata);
  if (typeof metadata.title !== "string" || metadata.title === "") {
    invalid("metadata.title", metadata.title);
  }
  lines.push(`title ${JSON.stringify(metadata.title)}`);

  const metaFallback: [string, unknown][] = [];
  const stringLine = (key: string, keyword: string): void => {
    const value = metadata[key];
    if (typeof value === "string") {
      lines.push(`${keyword} ${JSON.stringify(value)}`);
    } else if (value !== undefined) {
      metaFallback.push([key, value]);
    }
  };
  stringLine("description", "description");
  stringLine("owner", "owner");

  const metaTags = tagsLine(metadata.tags);
  if (metaTags !== undefined) lines.push(`tags ${metaTags}`);
  else if (metadata.tags !== undefined) {
    metaFallback.push(["tags", metadata.tags]);
  }

  for (const [key, keyword] of [
    ["createdAt", "created"],
    ["updatedAt", "updated"],
  ] as const) {
    const value = metadata[key];
    if (typeof value !== "string" || value === "") {
      invalid(`metadata.${key}`, value);
    }
    if (value !== DEFAULT_TIMESTAMP) {
      lines.push(`${keyword} ${valueToken(value)}`);
    }
  }

  const reviewed = metadata.lastReviewedAt;
  if (typeof reviewed === "string") {
    lines.push(`reviewed ${valueToken(reviewed)}`);
  } else if (reviewed !== undefined) {
    metaFallback.push(["lastReviewedAt", reviewed]);
  }

  /* No dedicated sequence lines for these three (see SEQ_META_RAW for why):
     present means the raw escape, whatever the shape. */
  for (const key of ["tagColors", "customIcons", "generator"]) {
    if (metadata[key] !== undefined) metaFallback.push([key, metadata[key]]);
  }

  for (const [key, value] of metaFallback) {
    lines.push(bangLine(["meta", key], null, value));
  }
  for (const u of splitUnknowns(metadata, META_KEYS)) {
    lines.push(bangLine(["meta", u.key], u.after, u.value));
  }

  if (schemaValue !== undefined && typeof schemaValue !== "string") {
    lines.push(bangLine(["$schema"], null, schemaValue));
  }
  for (const u of splitUnknowns(file, SEQ_FILE_KEYS)) {
    lines.push(bangLine([u.key], null, u.value));
  }

  /* -------------------------------- body -------------------------------- */
  lines.push("");
  lines.push(SEQUENCE_BLOCK);

  const autonumber = file.autonumber;
  if (autonumber === true) lines.push("  autonumber");
  else if (autonumber === false) lines.push("  autonumber false");
  else if (autonumber !== undefined) invalid("autonumber", autonumber);

  const participants = file.participants;
  if (!Array.isArray(participants)) invalid("participants", participants);
  emitParticipants(lines, participants, file.boxes);

  const items = file.items;
  if (!Array.isArray(items)) invalid("items", items);
  if (participants.length > 0 && items.length > 0) lines.push("");
  emitItems(lines, items, 1);

  return `${lines.join("\n")}\n`;
}

/* -------------------------------------------------------------------------- */
/* Canonical blocks — one element's own lines, for a text patch               */
/* -------------------------------------------------------------------------- */

/**
 * WHY THESE TWO EXIST. A canvas edit to a sequence document used to mean
 * re-serialising the whole file, which is a different file from the author's:
 * the parser drops `//` comments and blank lines with no capture, and any
 * field written out that canonical form omits at its default (`updated`,
 * `:participant`, `autonumber false`) is normalised away. So one edit deleted
 * every comment in the file, silently. An edit is now a splice of the changed
 * element's OWN lines into the author's own text, and these are where the
 * replacement lines come from — derived from `emitParticipant` / `emitMessage`
 * rather than assembled a second time, so a patched block cannot be
 * non-canonical. `playground/input/sequence-edit.ts` is the caller; the C4
 * grammar's `canonicalNodeLine` is the same idea one file over.
 *
 * A BLOCK, NOT A LINE, and this is the one place the sequence side differs
 * from C4. A drag changes a node's position, which lives on the declaration
 * line alone, so C4 patches one line. The sequence gestures change `desc` —
 * a CONTINUATION line, which may be added, removed or replaced — so the unit
 * has to be the element's whole block. The cost is real and bounded: `!`
 * escape lines and `desc` inside the edited block come back in canonical
 * ORDER even if the author wrote them the other way round. Every byte outside
 * the block is untouched, which is the guarantee that matters.
 */

/**
 * The canonical lines for one participant — declaration plus its `desc` and
 * `!` continuations — at `pad` indentation, or `null` when `participantId` is
 * not in `file`.
 *
 * `pad` IS THE CALLER'S, deliberately: a participant nested in a `box` sits at
 * four spaces and one outside a box at two, and this function cannot tell
 * which from the model alone without re-deriving the box walk. The caller
 * takes it from the leading whitespace of the block it is replacing, so the
 * patched block keeps the indentation the file already had.
 */
export function canonicalParticipantBlock(
  file: SequenceLabFile,
  participantId: string,
  pad: string,
): string[] | null {
  if (!isRecord(file)) invalid("the file", file);
  const participants = file.participants;
  if (!Array.isArray(participants)) invalid("participants", participants);
  const participant = participants.find(
    (candidate) => isRecord(candidate) && candidate.id === participantId,
  );
  if (participant === undefined) return null;
  const lines: string[] = [];
  emitParticipant(lines, participant, pad);
  return lines;
}

/**
 * The canonical lines for one message — declaration plus its `desc` and `!`
 * continuations — at `pad` indentation, or `null` when `path` does not land on
 * a message in `file`.
 *
 * `pad` is the caller's for the same reason as above, and here it carries more:
 * a message's indentation is its fragment DEPTH, and getting it wrong moves
 * the message into or out of a fragment. Reading it off the block being
 * replaced is the only source that cannot be wrong about depth.
 */
export function canonicalMessageBlock(
  file: SequenceLabFile,
  path: SequenceItemPath,
  pad: string,
): string[] | null {
  if (!isRecord(file)) invalid("the file", file);
  if (!Array.isArray(file.items)) invalid("items", file.items);
  /* `sequenceItemAt` rather than a defensive walk of its own: a second path
     walker is exactly the "two halves, each self-consistent, that disagree"
     failure, and it already answers `undefined` for every path that does not
     land — which is the answer this function needs. */
  const item = sequenceItemAt(file.items, path);
  if (item === undefined || item.step !== "message") return null;
  const lines: string[] = [];
  emitMessage(lines, item as unknown as Record<string, unknown>, pad);
  return lines;
}

/* -------------------------------------------------------------------------- */
/* Participants                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The participant block, with `box` brackets restored around their members.
 *
 * Driven by walking `participants` IN ORDER and opening a box when its first
 * member is reached — not by emitting the boxes and then the leftovers. The
 * array is the lifeline order and the text has to reproduce it exactly, so
 * the order the members appear in a box's own `participants` list is never
 * consulted; a box is only ever a bracket around a run of the real order.
 *
 * A box whose members are NOT such a run is unrepresentable in this text, so
 * it is refused here rather than written as something the parser would read
 * back differently. That is the same contract every other `invalid` call in
 * this file has: a model this serializer cannot spell is a model no reader
 * should have produced.
 */
function emitParticipants(
  lines: string[],
  participants: unknown[],
  boxesValue: unknown,
): void {
  if (boxesValue === undefined) {
    for (const value of participants) emitParticipant(lines, value, "  ");
    return;
  }
  if (!Array.isArray(boxesValue) || boxesValue.length === 0) {
    invalid("boxes", boxesValue);
  }

  /** participant id → the box that claims it, and which claimed it first. */
  const boxByMember = new Map<string, { box: Record<string, unknown> }>();
  for (const boxValue of boxesValue) {
    if (!isRecord(boxValue)) invalid("a box", boxValue);
    const members = boxValue.participants;
    if (
      !Array.isArray(members) ||
      members.length === 0 ||
      !members.every((id) => typeof id === "string" && id !== "")
    ) {
      invalid("a box participants list", members);
    }
    for (const id of members as string[]) {
      if (boxByMember.has(id)) {
        invalid(`participant "${id}" claimed by two boxes`, boxesValue);
      }
      boxByMember.set(id, { box: boxValue });
    }
  }

  const emitted = new Set<Record<string, unknown>>();
  let open: Record<string, unknown> | null = null;
  for (const value of participants) {
    if (!isRecord(value)) invalid("a participant", value);
    const id = value.id;
    if (typeof id !== "string") invalid("a participant id", id);
    const claim = boxByMember.get(id);
    const box = claim?.box ?? null;

    if (box !== open) {
      open = box;
      if (box !== null) {
        if (emitted.has(box)) {
          invalid(
            `a box whose members are not neighbours in participants ("${id}" is outside its run)`,
            box,
          );
        }
        emitted.add(box);
        emitBoxOpener(lines, box);
      }
    }
    emitParticipant(lines, value, box === null ? "  " : "    ");
  }

  for (const boxValue of boxesValue) {
    if (isRecord(boxValue) && !emitted.has(boxValue)) {
      invalid("a box whose participants are not in the document", boxValue);
    }
  }
}

function emitBoxOpener(lines: string[], box: Record<string, unknown>): void {
  const label = box.label;
  if (typeof label !== "string" || label === "") invalid("a box label", label);
  const fallback: [string, unknown][] = [];
  let line = `  ${BOX_KEYWORD} ${JSON.stringify(label)}`;
  const tint = box.tint;
  if (isNormalizedTint(tint)) line += ` ${TINT_ATTRIBUTE}=${tint}`;
  else if (tint !== undefined) fallback.push(["tint", tint]);
  lines.push(line);
  for (const [key, raw] of fallback) {
    lines.push(`    ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(box, BOX_KEYS)) {
    lines.push(`    ${bangLine([u.key], u.after, u.value)}`);
  }
}

function emitParticipant(lines: string[], value: unknown, pad: string): void {
  if (!isRecord(value)) invalid("a participant", value);
  const id = value.id;
  if (typeof id !== "string" || id === "") invalid("a participant id", id);
  const name = value.name;
  if (typeof name !== "string" || name === "") {
    invalid(`participant "${id}".name`, name);
  }

  const fallback: [string, unknown][] = [];
  let line = `${pad}${seqIdToken(id)}`;

  const kind = value.kind;
  if (typeof kind === "string" && PARTICIPANT_KIND_BY_KEYWORD[kind] === kind) {
    line += `:${kind}`;
  } else if (kind !== undefined) {
    fallback.push(["kind", kind]);
  }
  line += ` ${JSON.stringify(name)}`;

  /* Between the name and the technology, mirroring the C4 node line and the
     model's key order. A non-string icon (a newer minor's shape) rides the
     `!` escape rather than being coerced into a slug. */
  const icon = value.icon;
  if (typeof icon === "string" && icon !== "") line += ` @${icon}`;
  else if (icon !== undefined) fallback.push(["icon", icon]);

  const technology = value.technology;
  if (typeof technology === "string") {
    line += ` [${techBody(technology)}]`;
  } else if (technology !== undefined) {
    fallback.push(["technology", technology]);
  }
  lines.push(line);

  const description = value.description;
  if (typeof description === "string") {
    lines.push(`${pad}  desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    fallback.push(["description", description]);
  }

  for (const [key, raw] of fallback) {
    lines.push(`${pad}  ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(value, PARTICIPANT_KEYS)) {
    lines.push(`${pad}  ${bangLine([u.key], u.after, u.value)}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Items (recursive — depth follows the fragment tree)                        */
/* -------------------------------------------------------------------------- */

function emitItems(lines: string[], items: unknown[], depth: number): void {
  const pad = "  ".repeat(depth);
  for (const value of items) {
    if (!isRecord(value)) invalid("an item", value);
    switch (value.step) {
      case "message":
        emitMessage(lines, value, pad);
        break;
      case "note":
        emitNote(lines, value, pad);
        break;
      case "fragment":
        emitFragment(lines, value, depth);
        break;
      default:
        /* An unknown STEP kind is not key-level forward tolerance — a new
           item type is a new grammar production, i.e. a major change. Throw
           rather than guess a spelling the parser would reject. */
        invalid("an item step", value.step);
    }
  }
}

function emitMessage(
  lines: string[],
  message: Record<string, unknown>,
  pad: string,
): void {
  const from = message.from;
  const to = message.to;
  if (typeof from !== "string" || from === "")
    invalid("a message source", from);
  if (typeof to !== "string" || to === "") invalid("a message target", to);
  const kind = message.kind;
  const arrow =
    typeof kind === "string"
      ? ARROW_BY_MESSAGE_KIND[kind as keyof typeof ARROW_BY_MESSAGE_KIND]
      : undefined;
  if (arrow === undefined) invalid(`message "${from} → ${to}".kind`, kind);
  const label = message.label;
  if (typeof label !== "string")
    invalid(`message "${from} → ${to}".label`, label);

  const fallback: [string, unknown][] = [];
  /* Canonical suffix order is `+-`; only literal `true` earns the sugar. */
  let suffix = "";
  if (message.activate === true) suffix += "+";
  else if (message.activate !== undefined) {
    fallback.push(["activate", message.activate]);
  }
  if (message.deactivate === true) suffix += "-";
  else if (message.deactivate !== undefined) {
    fallback.push(["deactivate", message.deactivate]);
  }

  let line = `${pad}${seqIdToken(from)} ${arrow}${suffix} ${seqIdToken(to)} : ${JSON.stringify(label)}`;
  const technology = message.technology;
  if (typeof technology === "string") {
    line += ` [${techBody(technology)}]`;
  } else if (technology !== undefined) {
    fallback.push(["technology", technology]);
  }
  lines.push(line);

  /* The detail, on its own continuation line at pad + 2 — same shape and
     same position as a participant's `desc`, so one indentation rule covers
     both and the message line stays the short title it is drawn as. */
  const description = message.description;
  if (typeof description === "string") {
    lines.push(`${pad}  desc ${JSON.stringify(description)}`);
  } else if (description !== undefined) {
    fallback.push(["description", description]);
  }

  for (const [key, raw] of fallback) {
    lines.push(`${pad}  ${bangLine([key], null, raw)}`);
  }
  for (const u of splitUnknowns(message, MESSAGE_KEYS)) {
    lines.push(`${pad}  ${bangLine([u.key], u.after, u.value)}`);
  }
}

function emitNote(
  lines: string[],
  note: Record<string, unknown>,
  pad: string,
): void {
  const placement = note.placement;
  if (placement !== "left" && placement !== "right" && placement !== "over") {
    invalid("a note placement", placement);
  }
  const participants = note.participants;
  const max = placement === "over" ? 2 : 1;
  if (
    !Array.isArray(participants) ||
    participants.length === 0 ||
    participants.length > max ||
    !participants.every((id) => typeof id === "string" && id !== "")
  ) {
    invalid(`a "note ${placement}" participants list`, participants);
  }
  const text = note.text;
  if (typeof text !== "string") invalid("a note text", text);
  lines.push(
    `${pad}note ${placement} ${(participants as string[])
      .map((id) => seqIdToken(id))
      .join(" ")} : ${JSON.stringify(text)}`,
  );
  for (const u of splitUnknowns(note, NOTE_KEYS)) {
    lines.push(`${pad}  ${bangLine([u.key], u.after, u.value)}`);
  }
}

function emitFragment(
  lines: string[],
  fragment: Record<string, unknown>,
  depth: number,
): void {
  const pad = "  ".repeat(depth);
  const kind = fragment.kind;
  if (
    typeof kind !== "string" ||
    FRAGMENT_KIND_BY_KEYWORD[kind] === undefined
  ) {
    invalid("a fragment kind", kind);
  }
  const branches = fragment.branches;
  if (!Array.isArray(branches) || branches.length === 0) {
    invalid(`a "${kind}" fragment's branches`, branches);
  }
  if (branches.length > 1 && !isMultiBranch(FRAGMENT_KIND_BY_KEYWORD[kind])) {
    invalid(`a "${kind}" fragment with ${branches.length} branches`, branches);
  }

  /* Only `rect` spells a tint; on any other kind a present one would be a
     field the parser cannot read back, so it rides the `!` escape instead. */
  const tint = fragment.tint;
  const tintAttribute =
    kind === "rect" && isNormalizedTint(tint)
      ? ` ${TINT_ATTRIBUTE}=${tint}`
      : "";
  const tintFallback = tint !== undefined && tintAttribute === "";

  branches.forEach((branchValue, index) => {
    if (!isRecord(branchValue)) invalid(`a "${kind}" branch`, branchValue);
    const keyword =
      index === 0
        ? kind
        : (BRANCH_KEYWORD_BY_KIND[FRAGMENT_KIND_BY_KEYWORD[kind]] ?? kind);
    const fallback: [string, unknown][] = [];
    let line = `${pad}${keyword}`;
    const label = branchValue.label;
    if (typeof label === "string") line += ` ${JSON.stringify(label)}`;
    else if (label !== undefined) fallback.push(["label", label]);
    if (index === 0) line += tintAttribute;
    lines.push(line);
    if (index === 0 && tintFallback) {
      lines.push(`${pad}  ${bangLine(["frag", "tint"], null, tint)}`);
    }

    /* Fragment-scope unknowns ride the FIRST branch's block, right after
       the opener, spelled `! frag.<key>` so the parser can tell them from
       branch-scope keys at the same indent. */
    if (index === 0) {
      for (const u of splitUnknowns(fragment, FRAGMENT_KEYS)) {
        lines.push(`${pad}  ${bangLine(["frag", u.key], u.after, u.value)}`);
      }
    }
    for (const [key, raw] of fallback) {
      lines.push(`${pad}  ${bangLine([key], null, raw)}`);
    }
    for (const u of splitUnknowns(branchValue, BRANCH_KEYS)) {
      lines.push(`${pad}  ${bangLine([u.key], u.after, u.value)}`);
    }

    const items = branchValue.items;
    if (!Array.isArray(items)) invalid(`a "${kind}" branch's items`, items);
    emitItems(lines, items, depth + 1);
  });
}
