/**
 * Mermaid `erDiagram` code → `ErLabFile`. The fifth dialect, beside the C4
 * reader in `./parse.ts`, the sequence reader in `./sequence.ts`, the
 * flowchart reader in `./flowchart.ts` and the use-case reader in
 * `./usecase.ts`.
 *
 * THIS IS THE ONE DIALECT THAT NEEDS NO HEURISTIC. Mermaid has a real ER
 * document type with its own header word, so `detectMermaidEr` is an exact
 * test of the first meaningful word — there is no "might this flowchart
 * actually be something else" reasoning to get wrong, and none of the
 * caveats that reasoning forces on `./usecase.ts`.
 *
 * The grammar read here, which is Mermaid's own:
 *
 *   erDiagram
 *     CUSTOMER ||--o{ ORDER : places        relationship, label REQUIRED
 *     ORDER }o..|| ADDRESS : "ships to"     (quoted when it has a space)
 *     CUSTOMER["Customer"] {                alias carries the label
 *       string email UK "login identity"    type, name, keys, comment
 *       uuid id PK,FK                       composite keys, comma-separated
 *     }
 *     AUDIT_LOG                             a bare entity, no columns
 *
 * ORDER IS THE AUTHOR'S. Mermaid lets an entity be mentioned by a
 * relationship before its block appears, so entities are collected in
 * FIRST-MENTION order and a later block fills in the columns of an entity
 * already declared. That is the order `.alab` will write them in, which
 * makes the import stable: importing the same document twice produces the
 * same file, and a diff between two imports is a real diff.
 *
 * WHAT IT REFUSES BY NAME, rather than approximating: a cardinality glyph
 * outside the sixteen the grammar knows, a key role outside `PK`/`FK`/`UK`,
 * a second block for one entity, and a duplicate column. Each is a statement
 * the diagram would otherwise make wrongly — `.claude/rules/new-diagram-type.md`
 * requires the refusal to name what it refused.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable (no enums) and type-only imports as `import type`.
 */

import type {
  ErAttribute,
  ErAttributeKey,
  ErCardinality,
  ErEntity,
  ErLabFile,
  ErRelationship,
  ErRelationshipKind,
} from "@/types";

import { LEFT_CARDINALITY, RIGHT_CARDINALITY } from "@/features/archtext";

import { col, readIdToken, readQuoted, skipSpaces } from "./cursor";
import type { Cursor } from "./cursor";
import { MERMAID_IMPORT_TIMESTAMP } from "./defaults";
import { failAt } from "./errors";
import {
  alabSafeId,
  readMermaidFrontmatterTitle,
  stripMermaidFrontmatter,
} from "./text";
import {
  ATTRIBUTE_KEY_BY_MERMAID_KEY,
  MERMAID_ER_HEADER_WORD,
} from "./er-mapping";

export interface ParseMermaidErOptions {
  /** Title when the source carries no frontmatter. */
  title?: string;
}

const DEFAULT_TITLE = "Untitled ER diagram";

/** Mermaid's connector tokens, and the line style each names. */
const KIND_BY_CONNECTOR: Readonly<Record<string, ErRelationshipKind>> = {
  "--": "identifying",
  "..": "non-identifying",
};

/**
 * Whether `source` is a Mermaid ER document. EXACT: the first meaningful
 * word behind any frontmatter is `erDiagram` or it is not. Contrast
 * `detectMermaidUseCase`, which has to parse the whole document to answer,
 * because the convention it reads wears a flowchart's header.
 */
export function detectMermaidEr(source: string): boolean {
  const body = stripMermaidFrontmatter(source);
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("%%")) continue;
    return line === MERMAID_ER_HEADER_WORD;
  }
  return false;
}

interface PendEntity {
  id: string;
  label: string;
  attributes: ErAttribute[];
  /** True once a `{ … }` block has filled this entity in, so a second block
   * for the same entity can be refused rather than silently merged. */
  defined: boolean;
  /** Column names already taken, for the duplicate-column refusal. */
  names: Set<string>;
}

/**
 * Parses Mermaid `erDiagram` code into an `ErLabFile`. Pure and
 * deterministic. Throws `MermaidParseError` (line + column) on any problem.
 */
export function parseMermaidEr(
  source: string,
  options: ParseMermaidErOptions = {},
): ErLabFile {
  const lines = source.split(/\r?\n/);

  /* ------------------------------ frontmatter ---------------------------- */
  let index = 0;
  let title: string | undefined;
  if (lines[0]?.trim() === "---") {
    let end = 1;
    while (end < lines.length && lines[end].trim() !== "---") end += 1;
    if (end >= lines.length) {
      failAt(1, 1, "the frontmatter fence is never closed", "---");
    }
    for (let i = 1; i < end; i += 1) {
      const match = /^\s*title\s*:\s*(.*)$/.exec(lines[i]);
      if (match !== null) title = readMermaidFrontmatterTitle(match[1]);
    }
    index = end + 1;
  }

  /* -------------------------------- header ------------------------------- */
  let sawHeader = false;
  const entities: PendEntity[] = [];
  const byId = new Map<string, PendEntity>();
  const usedIds = new Set<string>();
  const relationships: ErRelationship[] = [];
  /** Non-null while an entity's `{ … }` block is open. */
  let openEntity: PendEntity | null = null;

  for (; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const text = lines[index];
    const trimmed = text.trim();
    if (trimmed === "" || trimmed.startsWith("%%")) continue;

    if (!sawHeader) {
      if (trimmed !== MERMAID_ER_HEADER_WORD) {
        failAt(
          lineNo,
          text.indexOf(trimmed) + 1,
          `expected "${MERMAID_ER_HEADER_WORD}" — this reader only accepts Mermaid ER diagrams`,
          trimmed.slice(0, 20),
        );
      }
      sawHeader = true;
      continue;
    }

    /* ---------------------------- inside a block ------------------------- */
    if (openEntity !== null) {
      if (trimmed === "}") {
        openEntity = null;
        continue;
      }
      readAttribute(openEntity, text, lineNo);
      continue;
    }

    if (trimmed === "}") {
      failAt(
        lineNo,
        text.indexOf("}") + 1,
        'a "}" with no open entity block above it',
        "}",
      );
    }

    const cur: Cursor = { text, pos: text.indexOf(trimmed), line: lineNo };
    const nameCol = col(cur);
    const rawName = readIdToken(cur);
    if (rawName === "") {
      failAt(lineNo, nameCol, "expected an entity name", trimmed.slice(0, 20));
    }

    /* ------------------------------- an alias ---------------------------- */
    let alias: string | undefined;
    if (cur.text.charAt(cur.pos) === "[") {
      cur.pos += 1;
      if (cur.text.charAt(cur.pos) !== '"') {
        failAt(
          lineNo,
          col(cur),
          'an entity alias is quoted — write ENTITY["Label"]',
          cur.text.slice(cur.pos, cur.pos + 10),
        );
      }
      alias = readQuoted(cur);
      if (cur.text.charAt(cur.pos) !== "]") {
        failAt(
          lineNo,
          col(cur),
          'expected "]" after the entity alias',
          cur.text.slice(cur.pos, cur.pos + 10),
        );
      }
      cur.pos += 1;
    }

    skipSpaces(cur);

    /* --------------------------- an entity block ------------------------- */
    if (cur.text.charAt(cur.pos) === "{") {
      const entity = declare(rawName, alias);
      if (entity.defined) {
        failAt(
          lineNo,
          nameCol,
          `entity "${rawName}" already has a block — merge the two rather than declaring its columns twice`,
          rawName,
        );
      }
      entity.defined = true;
      openEntity = entity;
      const rest = cur.text.slice(cur.pos + 1).trim();
      if (rest !== "" && rest !== "}") {
        failAt(
          lineNo,
          col(cur) + 1,
          "an entity's columns go on their own lines, one per line",
          rest.slice(0, 20),
        );
      }
      /* `ENTITY { }` on one line: the block opens and closes here. */
      if (rest === "}") openEntity = null;
      continue;
    }

    /* --------------------------- a bare entity --------------------------- */
    if (cur.pos >= cur.text.length || cur.text.slice(cur.pos).trim() === "") {
      declare(rawName, alias);
      continue;
    }

    /* --------------------------- a relationship -------------------------- */
    const tokenCol = col(cur);
    const rest = cur.text.slice(cur.pos);
    const match = /^(\S\S)(--|\.\.)(\S\S)/.exec(rest);
    if (match === null) {
      failAt(
        lineNo,
        tokenCol,
        "expected a relationship token — a cardinality, a connector (-- or ..) and a mirrored cardinality, e.g. ||--o{",
        rest.slice(0, 10),
      );
    }
    const [token, leftGlyph, connector, rightGlyph] = match;
    const fromCardinality = LEFT_CARDINALITY[leftGlyph] as
      ErCardinality | undefined;
    const toCardinality = RIGHT_CARDINALITY[rightGlyph] as
      ErCardinality | undefined;
    if (fromCardinality === undefined || toCardinality === undefined) {
      failAt(
        lineNo,
        tokenCol,
        `"${token}" is not a cardinality pair — the left end is one of ${Object.keys(LEFT_CARDINALITY).join(" ")} and the right end one of ${Object.keys(RIGHT_CARDINALITY).join(" ")}`,
        token,
      );
    }
    cur.pos += token.length;
    skipSpaces(cur);

    const targetCol = col(cur);
    const rawTarget = readIdToken(cur);
    if (rawTarget === "") {
      failAt(
        lineNo,
        targetCol,
        "expected the target entity name",
        cur.text.slice(cur.pos, cur.pos + 10),
      );
    }
    let targetAlias: string | undefined;
    if (cur.text.charAt(cur.pos) === "[") {
      cur.pos += 1;
      if (cur.text.charAt(cur.pos) === '"') targetAlias = readQuoted(cur);
      if (cur.text.charAt(cur.pos) === "]") cur.pos += 1;
    }

    skipSpaces(cur);
    if (cur.text.charAt(cur.pos) !== ":") {
      failAt(
        lineNo,
        col(cur),
        'expected ":" and a relationship label — Mermaid requires one, and writes "" when there is nothing to say',
        cur.text.slice(cur.pos, cur.pos + 10),
      );
    }
    cur.pos += 1;
    skipSpaces(cur);
    const label =
      cur.text.charAt(cur.pos) === '"'
        ? readQuoted(cur)
        : cur.text.slice(cur.pos).trim();

    const from = declare(rawName, alias);
    const to = declare(rawTarget, targetAlias);
    const relationship: ErRelationship = {
      from: from.id,
      fromCardinality,
      to: to.id,
      toCardinality,
      kind: KIND_BY_CONNECTOR[connector],
    };
    /* Mermaid's required `""` maps back to ABSENT, not to an empty label —
       so a relationship that had no label in `.alab` survives a trip out to
       Mermaid and back as one that still has none. */
    if (label !== "") relationship.label = label;
    relationships.push(relationship);
  }

  if (!sawHeader) {
    failAt(
      1,
      1,
      `the source has no "${MERMAID_ER_HEADER_WORD}" line`,
      lines[0]?.trim().slice(0, 20),
    );
  }
  if (openEntity !== null) {
    failAt(lines.length, 1, `entity "${openEntity.id}" block is never closed`);
  }

  return {
    version: "1.0",
    kind: "er",
    metadata: {
      title: title ?? options.title ?? DEFAULT_TITLE,
      createdAt: MERMAID_IMPORT_TIMESTAMP,
      updatedAt: MERMAID_IMPORT_TIMESTAMP,
    },
    entities: entities.map((entity): ErEntity => ({
      id: entity.id,
      label: entity.label,
      ...(entity.attributes.length > 0
        ? { attributes: entity.attributes }
        : {}),
    })),
    relationships,
  };

  /* ---------------------------------------------------------------------- */

  /** First mention creates the entity; a later mention finds it. An alias
   * seen later fills in a label the first mention could not carry. */
  function declare(rawName: string, alias: string | undefined): PendEntity {
    const existing = byId.get(rawName);
    if (existing !== undefined) {
      if (alias !== undefined) existing.label = alias;
      return existing;
    }
    const entity: PendEntity = {
      id: alabSafeId(rawName, usedIds),
      label: alias ?? rawName,
      attributes: [],
      defined: false,
      names: new Set(),
    };
    entities.push(entity);
    byId.set(rawName, entity);
    return entity;
  }
}

/** The comma-separated key-role run (`PK,FK`), read whole. */
function readKeyRun(cur: Cursor): string {
  const start = cur.pos;
  while (cur.pos < cur.text.length) {
    if (!/[A-Za-z,]/.test(cur.text.charAt(cur.pos))) break;
    cur.pos += 1;
  }
  return cur.text.slice(start, cur.pos);
}

/**
 * A type or column name in Mermaid's attribute grammar: alphanumerics,
 * underscores, and `[]` for an array type.
 *
 * NOT `readIdToken`, which stops at `[` because a flowchart node's shape
 * opens with one. Here `string[]` is one token, and stopping early would
 * read the type as `string` and then fail asking for a name it can already
 * see.
 */
function readMermaidWord(cur: Cursor): string {
  const start = cur.pos;
  while (cur.pos < cur.text.length) {
    if (!/[A-Za-z0-9_[\]]/.test(cur.text.charAt(cur.pos))) break;
    cur.pos += 1;
  }
  return cur.text.slice(start, cur.pos);
}

/**
 * One column line inside an entity block: `type name KEYS "comment"`.
 *
 * TYPE BEFORE NAME is Mermaid's order and the reverse of `.alab`'s. The swap
 * happens here, in one place, which is what `parse.ts`'s "name before type"
 * decision costs — and it is cheaper than every other line in the `.alab`
 * family reading backwards for one document kind.
 */
function readAttribute(entity: PendEntity, text: string, lineNo: number): void {
  const trimmed = text.trim();
  const cur: Cursor = { text, pos: text.indexOf(trimmed), line: lineNo };

  const typeCol = col(cur);
  const type = readMermaidWord(cur);
  if (type === "") {
    failAt(lineNo, typeCol, "expected a column type", trimmed.slice(0, 20));
  }
  skipSpaces(cur);
  const nameCol = col(cur);
  const name = readMermaidWord(cur);
  if (name === "") {
    failAt(
      lineNo,
      nameCol,
      `expected a column name after the type "${type}" — Mermaid writes the type first`,
      trimmed.slice(0, 20),
    );
  }
  if (entity.names.has(name)) {
    failAt(
      lineNo,
      nameCol,
      `duplicate column "${name}" in entity "${entity.id}"`,
      name,
    );
  }

  const attribute: ErAttribute = { name, type };

  skipSpaces(cur);
  /* Key roles: bare, comma-separated, before any comment. */
  if (cur.pos < cur.text.length && cur.text.charAt(cur.pos) !== '"') {
    const keyCol = col(cur);
    /* Read the WHOLE comma-separated run, not one word: `readIdToken` stops
       at a comma, which silently turned `PK,FK` into `PK` and dropped the
       foreign key half of every composite key — the exact case the model
       carries an array for. */
    const word = readKeyRun(cur);
    if (word !== "") {
      const keys: ErAttributeKey[] = [];
      for (const part of word.split(",")) {
        const piece = part.trim();
        if (piece === "") continue;
        const key = ATTRIBUTE_KEY_BY_MERMAID_KEY[piece.toUpperCase()];
        if (key === undefined) {
          failAt(
            lineNo,
            keyCol,
            `"${piece}" is not a key role — Mermaid's vocabulary is ${Object.keys(ATTRIBUTE_KEY_BY_MERMAID_KEY).join(", ")}`,
            piece,
          );
        }
        if (keys.includes(key)) {
          failAt(
            lineNo,
            keyCol,
            `"${piece}" is listed twice on column "${name}"`,
            piece,
          );
        }
        keys.push(key);
      }
      if (keys.length > 0) attribute.keys = keys;
    }
  }

  skipSpaces(cur);
  if (cur.text.charAt(cur.pos) === '"') {
    const comment = readQuoted(cur);
    /* Mermaid's column comment IS `.alab`'s column description — the one
       piece of prose both formats have a home for. */
    if (comment !== "") attribute.description = comment;
  }

  entity.attributes.push(attribute);
  entity.names.add(name);
}
