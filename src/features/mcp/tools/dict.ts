/**
 * `validate_dict` and `format_dict` — the data dictionary's half of the
 * write-then-check loop.
 *
 * A SIXTH PAIR, for the reason the previous four exist: the facts worth
 * reporting about a dictionary are none of the other kinds'. It is not a
 * structure, a flow or a schema graph — it is a CONTRACT ON DATA, so what a
 * reviewer wants to know is how much of it is actually documented.
 *
 * The reader is `parseDictInput` — the same one `/live?d=dict` uses — so "the
 * MCP server accepted it" means the playground renders it too.
 */

import type { DictLabFile } from "@/types/dict";

import { serializeDictText } from "@/features/archtext";
/* The viewer's own layout, called server-side — pure, no DOM. Imported from
   `lib/layout` rather than the barrel, which re-exports `.tsx`. */
import { layoutDict } from "@/features/dict/lib/layout";
import {
  DICT_FORMAT_LABEL,
  parseDictInput,
  type DictInputError,
  type DictSourceFormat,
} from "@/features/dict/input/parse";

import { guardSourceSize } from "../lib/limits";
import {
  errorResult,
  fence,
  joinSections,
  renderKindParseFailure,
  textResult,
  type McpTextResult,
} from "../lib/render";

export type ReadDictResult =
  | { status: "ok"; file: DictLabFile; format: DictSourceFormat }
  | { status: "error"; kind: DictInputError["kind"] | "size"; message: string };

export function readDict(source: string): ReadDictResult {
  const size = guardSourceSize(source);
  if (!size.ok) return { status: "error", kind: "size", message: size.message };
  const result = parseDictInput(source);
  if (result.status === "error") {
    const { error } = result;
    return {
      status: "error",
      kind: error.kind,
      message:
        error.kind === "parse"
          ? renderKindParseFailure(DICT_FORMAT_LABEL[error.format], error)
          : error.message,
    };
  }
  return { status: "ok", file: result.value.file, format: result.value.format };
}

/**
 * The audit, and it is a COVERAGE report rather than a defect list — which is
 * the honest shape for this document type. Every other kind's audit names
 * things that are wrong (an unreachable step, a cycle, a foreign key pointing
 * nowhere). A dictionary cannot be wrong in that sense; it can only be
 * INCOMPLETE, and incompleteness is exactly what its readers hit:
 *
 *   - `undescribed` — a field with no `desc`. THE ONE THAT MATTERS: a
 *     dictionary whose fields have no meanings is a schema dump wearing a
 *     dictionary's name, and it is the commonest thing an agent produces when
 *     it transcribes a table definition.
 *   - `unsourced`   — no `source`. Half of what a dictionary is for is saying
 *     where a value comes from.
 *   - `pii` — reported as a LIST, not a fault. Someone reviewing a dictionary
 *     wants the personal-data fields enumerated, and no other tool here will
 *     do it.
 *   - `deprecatedWithoutNote` — marked deprecated with no description saying
 *     what to use instead, which is the one case where a missing description
 *     actively misleads.
 */
interface DictAudit {
  undescribed: string[];
  unsourced: string[];
  pii: string[];
  deprecatedWithoutNote: string[];
  fieldCount: number;
}

function auditDict(file: DictLabFile): DictAudit {
  const undescribed: string[] = [];
  const unsourced: string[] = [];
  const pii: string[] = [];
  const deprecatedWithoutNote: string[] = [];
  let fieldCount = 0;

  for (const section of file.sections) {
    for (const field of section.fields) {
      fieldCount += 1;
      const path = `${section.label}.${field.name}`;
      if (field.description === undefined) undescribed.push(path);
      if (field.source === undefined) unsourced.push(path);
      if (field.flags?.includes("pii")) pii.push(path);
      if (
        field.flags?.includes("deprecated") &&
        field.description === undefined
      ) {
        deprecatedWithoutNote.push(path);
      }
    }
  }
  return { undescribed, unsourced, pii, deprecatedWithoutNote, fieldCount };
}

function renderSections(file: DictLabFile): string {
  const rows = file.sections.map((section) => {
    const documented = section.fields.filter(
      (field) => field.description !== undefined,
    ).length;
    const tech = section.technology === undefined ? "—" : section.technology;
    return `| ${section.label} | ${tech} | ${section.fields.length} | ${documented} |`;
  });
  return [
    "| Section | Technology | Fields | Described |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function renderSummary(file: DictLabFile, audit: DictAudit): string {
  const layout = layoutDict(file);
  const described = audit.fieldCount - audit.undescribed.length;
  const coverage =
    audit.fieldCount === 0
      ? 0
      : Math.round((described / audit.fieldCount) * 100);
  return [
    `Title: ${file.metadata.title}`,
    `Sections: ${file.sections.length}`,
    `Fields: ${audit.fieldCount}`,
    /* The headline number, because it is the one a reviewer asks for and the
       one an agent transcribing a schema will have got wrong. */
    `Documented: ${described} of ${audit.fieldCount} (${coverage}%)`,
    `Size: ${Math.round(layout.width)} x ${Math.round(layout.height)} px.`,
  ].join("\n");
}

function renderAudit(audit: DictAudit): string | null {
  const ids = (list: string[]): string =>
    list.map((id) => `\`${id}\``).join(", ");
  const notes: string[] = [];
  if (audit.undescribed.length > 0) {
    notes.push(
      `No meaning given: ${ids(audit.undescribed)} — a field with a name and ` +
        "a type and no description is a schema dump, not a dictionary. Add a " +
        "`desc` line saying what the value MEANS, not what it is.",
    );
  }
  if (audit.deprecatedWithoutNote.length > 0) {
    notes.push(
      `Deprecated with no replacement named: ${ids(audit.deprecatedWithoutNote)} — ` +
        "a reader is told to stop using it and not what to use instead, which " +
        "is worse than not marking it at all.",
    );
  }
  if (audit.unsourced.length > 0) {
    notes.push(
      `No provenance: ${ids(audit.unsourced)} — no \`source\` line, so the ` +
        "dictionary says what the field means but not where the value comes " +
        "from. Half of what this document is for.",
    );
  }
  if (audit.pii.length > 0) {
    notes.push(
      `Personal data (\`pii\`): ${ids(audit.pii)} — listed rather than ` +
        "flagged as a fault. Worth checking the set is complete, because " +
        "nothing else here can check it for you.",
    );
  }
  return notes.length === 0 ? null : notes.join("\n\n");
}

export function validateDict(source: string): McpTextResult {
  const read = readDict(source);
  if (read.status === "error") return errorResult(read.message);
  const audit = auditDict(read.file);
  return textResult(
    joinSections(
      `VALID as ${DICT_FORMAT_LABEL[read.format]}.`,
      renderSummary(read.file, audit),
      renderSections(read.file),
      renderAudit(audit),
    ),
  );
}

export function formatDict(source: string): McpTextResult {
  const read = readDict(source);
  if (read.status === "error") return errorResult(read.message);
  return textResult(
    joinSections(
      "Canonical .alab dictionary text.",
      fence("", serializeDictText(read.file)),
    ),
  );
}
