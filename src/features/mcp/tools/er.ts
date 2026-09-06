/**
 * `validate_er` and `format_er` — the ER document's half of the
 * write-then-check loop.
 *
 * WHY A FIFTH PAIR rather than a `kind` argument: the argument `tools/
 * sequence.ts` makes, holding for the fourth time. The C4 tools return
 * diagrams with C4 levels, the sequence tools return participants and ordered
 * messages, the flowchart tools a directed graph with guards, the use-case
 * tools actors and their reach — and an ER document is none of those. It is a
 * statement about WHAT IS STORED and HOW ONE RECORD FINDS ANOTHER, so the
 * facts worth reporting are tables, their keys, and whether the joins between
 * them are actually spelled out.
 *
 * The reader is `parseErInput` — the SAME one the `/live?d=er` playground
 * uses, itself a thin shell over `parseErText` and `parseMermaidEr`. So "the
 * MCP server accepted it" means the playground renders it too, which is the
 * guarantee `lib/read.ts` makes for C4 and the reason no second grammar is
 * allowed to exist here either.
 */

import type { ErLabFile } from "@/types/er";

import { serializeErText } from "@/features/archtext";
/* THE VIEWER'S OWN LAYOUT, called server-side — pure, no DOM, so the check
   scripts can run it and this tool can answer "how big will it be?" with the
   geometry the browser will draw. Imported from `lib/layout` rather than the
   feature barrel, exactly as `tools/usecase.ts` imports `layoutUseCase`: the
   barrel re-exports `.tsx` components and `scripts/mcp-check.mjs` loads this
   module through Node's type stripping, which cannot resolve one. */
import { layoutEr } from "@/features/er/lib/layout";
import {
  ER_FORMAT_LABEL,
  MERMAID_ER_CAVEAT,
  parseErInput,
  type ErInputError,
  type ErSourceFormat,
} from "@/features/er/input/parse";

import { guardSourceSize } from "../lib/limits";
import {
  errorResult,
  fence,
  joinSections,
  renderKindParseFailure,
  textResult,
  type McpTextResult,
} from "../lib/render";

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export type ReadErResult =
  | { status: "ok"; file: ErLabFile; format: ErSourceFormat }
  | { status: "error"; kind: ErInputError["kind"] | "size"; message: string };

export function readEr(source: string): ReadErResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", kind: "size", message: size.message };

  const result = parseErInput(source);
  if (result.status === "error") {
    const { error } = result;
    return {
      status: "error",
      kind: error.kind,
      message:
        error.kind === "parse"
          ? renderKindParseFailure(ER_FORMAT_LABEL[error.format], error, source)
          : error.message,
    };
  }
  return { status: "ok", file: result.value.file, format: result.value.format };
}

/* -------------------------------------------------------------------------- */
/* Summarising                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The facts an agent writing a schema it cannot see has no other way to learn.
 * Every one describes a document that PARSES — the grammar already rejects a
 * duplicate column, an undeclared entity and a malformed cardinality — yet
 * still says something a reviewer would call wrong:
 *
 *   - `keyless`      — an entity with columns but no `pk`. Every row in it is
 *     indistinguishable from every other; in a schema diagram that is almost
 *     always an omission rather than a decision.
 *   - `strayEntities`— an entity in no relationship at all. Either a missing
 *     join or a table that does not belong in this diagram.
 *   - `unjoinedForeignKeys` — an entity carrying an `fk` column with no
 *     relationship line leaving or entering it. THE MOST USEFUL ONE: the
 *     column says "this points somewhere" and the diagram never says where,
 *     which is exactly the mistake an agent makes when it writes the columns
 *     first and forgets the lines.
 *   - `emptyEntities`— an entity with no columns. Legal, and deliberate in an
 *     overview, so it is reported as a note rather than a fault.
 *   - `selfJoins`    — a relationship from an entity to itself. Legal and
 *     sometimes right (a tree), but worth naming because it is also what a
 *     copy-pasted line looks like.
 */
interface ErAudit {
  keyless: string[];
  strayEntities: string[];
  unjoinedForeignKeys: string[];
  emptyEntities: string[];
  selfJoins: string[];
}

function auditEr(file: ErLabFile): ErAudit {
  const joined = new Set<string>();
  const selfJoins: string[] = [];
  for (const relationship of file.relationships) {
    joined.add(relationship.from);
    joined.add(relationship.to);
    if (relationship.from === relationship.to)
      selfJoins.push(relationship.from);
  }

  const keyless: string[] = [];
  const strayEntities: string[] = [];
  const unjoinedForeignKeys: string[] = [];
  const emptyEntities: string[] = [];

  for (const entity of file.entities) {
    const attributes = entity.attributes ?? [];
    if (attributes.length === 0) {
      emptyEntities.push(entity.id);
    } else if (!attributes.some((a) => a.keys?.includes("pk"))) {
      keyless.push(entity.id);
    }
    if (!joined.has(entity.id)) strayEntities.push(entity.id);
    else if (
      attributes.some((a) => a.keys?.includes("fk")) &&
      !file.relationships.some(
        (r) => r.from === entity.id || r.to === entity.id,
      )
    ) {
      unjoinedForeignKeys.push(entity.id);
    }
  }

  /* An `fk` on a STRAY entity is the same defect and a worse one — the column
     points somewhere and the entity is joined to nothing at all — so it is
     folded in here rather than being invisible because the branch above only
     runs for joined entities. */
  for (const entity of file.entities) {
    const attributes = entity.attributes ?? [];
    if (
      !joined.has(entity.id) &&
      attributes.some((a) => a.keys?.includes("fk")) &&
      !unjoinedForeignKeys.includes(entity.id)
    ) {
      unjoinedForeignKeys.push(entity.id);
    }
  }

  return {
    keyless,
    strayEntities,
    unjoinedForeignKeys,
    emptyEntities,
    selfJoins,
  };
}

/** Every entity as a row, with its column count and its keys — the shape a
 * caller needs to decide what to edit next. */
function renderEntities(file: ErLabFile): string {
  const rows = file.entities.map((entity) => {
    const attributes = entity.attributes ?? [];
    const keys = attributes
      .filter((a) => a.keys !== undefined)
      .map((a) => `${a.name} (${a.keys?.join(" ").toUpperCase()})`)
      .join(", ");
    return `| \`${entity.id}\` | ${entity.label} | ${attributes.length} | ${keys === "" ? "—" : keys} |`;
  });
  return [
    "| Id | Label | Columns | Keys |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** The relationships as `.alab` lines, so a caller sees the exact syntax to
 * edit — including the crow's-foot token, which is the part hardest to
 * reconstruct from a prose description. */
function renderRelationships(file: ErLabFile): string {
  if (file.relationships.length === 0) return "";
  /* Serialize the whole document and lift the relationship lines out of it,
     rather than re-spelling the token here. Re-spelling would be a second
     implementation of `TOKEN_BY_CARDINALITY`'s per-side lookup — the one
     thing in this grammar most likely to be got backwards — and it would be
     invisible when it drifted. */
  const text = serializeErText(file);
  const lines = text
    .split("\n")
    .filter((line) => /^ {2}\S.*(--|\.\.)/.test(line) && !line.includes('"'))
    .map((line) => line.trim());
  const body =
    lines.length === file.relationships.length
      ? lines.join("\n")
      : /* A label with a space quotes the line, which the filter above drops.
           Fall back to the whole body rather than showing a partial list that
           silently omits exactly the most descriptive relationships. */
        text.slice(text.indexOf("@er")).trim();
  return fence("", body);
}

function renderSummary(file: ErLabFile): string {
  const columns = file.entities.reduce(
    (sum, entity) => sum + (entity.attributes?.length ?? 0),
    0,
  );
  const identifying = file.relationships.filter(
    (r) => r.kind === "identifying",
  ).length;
  const layout = layoutEr(file);
  return [
    `Title: ${file.metadata.title}`,
    `Entities: ${file.entities.length}`,
    `Columns: ${columns}`,
    `Relationships: ${identifying} identifying, ${file.relationships.length - identifying} non-identifying`,
    `Size: ${Math.round(layout.width)} x ${Math.round(layout.height)} px, ${layout.columns} column${layout.columns === 1 ? "" : "s"} deep.`,
  ].join("\n");
}

/**
 * The audit, rendered only when it has something to say, and worded as the
 * REMEDY rather than the complaint — the caller is a model about to edit the
 * document, and "give this table a pk" is actionable where "keyless" is a
 * label it must translate first.
 */
function renderAudit(audit: ErAudit): string | null {
  const ids = (list: string[]): string =>
    list.map((id) => `\`${id}\``).join(", ");
  const notes: string[] = [];
  if (audit.unjoinedForeignKeys.length > 0) {
    notes.push(
      `Foreign keys that point nowhere: ${ids(audit.unjoinedForeignKeys)} — ` +
        "each carries an `fk` column, but no relationship line says which " +
        "table it references. Add the line, e.g. `parent ||--o{ child : has`.",
    );
  }
  if (audit.keyless.length > 0) {
    notes.push(
      `No primary key: ${ids(audit.keyless)} — every row is ` +
        "indistinguishable from every other. Mark the identifying column " +
        "`pk`, e.g. `attr id uuid pk`.",
    );
  }
  if (audit.strayEntities.length > 0) {
    notes.push(
      `Joined to nothing: ${ids(audit.strayEntities)} — no relationship ` +
        "touches them, so the diagram says they are unrelated to everything " +
        "else. Either draw the join or drop the table.",
    );
  }
  if (audit.selfJoins.length > 0) {
    notes.push(
      `Self-joins: ${ids(audit.selfJoins)} — legal, and right for a tree or ` +
        "a linked list. Worth a second look, because it is also what a " +
        "copy-pasted relationship line looks like.",
    );
  }
  if (audit.emptyEntities.length > 0) {
    notes.push(
      `No columns: ${ids(audit.emptyEntities)} — legal and deliberate in an ` +
        "overview that shows only tables and the lines between them. Add " +
        "`attr` lines if this one was meant to be detailed.",
    );
  }
  return notes.length === 0 ? null : notes.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

export function validateEr(source: string): McpTextResult {
  const read = readEr(source);
  if (read.status === "error") return errorResult(read.message);

  return textResult(
    joinSections(
      `VALID as ${ER_FORMAT_LABEL[read.format]}.`,
      renderSummary(read.file),
      renderEntities(read.file),
      renderRelationships(read.file),
      renderAudit(auditEr(read.file)),
      // Stated on success, not only on the import path: a caller that
      // validated Mermaid and then saved the `.alab` has silently accepted the
      // loss, and this is the last place it can still act on it.
      read.format === "mermaid" ? MERMAID_ER_CAVEAT : null,
      read.file.relationships.length === 0
        ? "No relationships: the document parses, but an ER diagram with no " +
            "lines is a list of tables. Add lines like " +
            "`customer ||--o{ order : places`."
        : null,
    ),
  );
}

export function formatEr(source: string): McpTextResult {
  const read = readEr(source);
  if (read.status === "error") return errorResult(read.message);

  return textResult(
    joinSections(
      `Canonical .alab er text, read as ${ER_FORMAT_LABEL[read.format]}.`,
      fence("", serializeErText(read.file)),
      read.format === "mermaid" ? MERMAID_ER_CAVEAT : null,
    ),
  );
}
