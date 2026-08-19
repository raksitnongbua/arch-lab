/**
 * `ErLabFile` → Mermaid `erDiagram` code: the reverse of `./er.ts`, sitting
 * beside `./usecase-emit.ts` as the emitting half of the fifth dialect. Both
 * directions read the SAME tables (`./er-mapping.ts` and, through it, the
 * `.alab` grammar's own cardinality tables), so what this writes is by
 * construction what the importer reads back.
 *
 * WHAT MERMAID CANNOT HOLD, and therefore what this drops — the same honesty
 * contract as the other export caveats, stated by
 * `MERMAID_ER_EXPORT_CAVEAT`:
 *
 *   - `[technology]` and `#tag`s on an entity, and the entity's own
 *     `description`. `erDiagram` has a comment slot on a COLUMN and none on
 *     an entity, so a column's description survives and an entity's does
 *     not.
 *   - Everything the `.alab` header carries beyond the title.
 *   - An absent relationship label becomes `: ""`. Mermaid REQUIRES a label
 *     where `.alab` makes it optional, so absent and empty collapse into one
 *     spelling on the way out — and `./er.ts` maps `""` back to absent, so
 *     the pair survives a round trip through Mermaid as absence rather than
 *     as a label nobody wrote.
 *
 * Nothing else is lost, which is what separates this dialect from the other
 * two flowchart-derived ones: both cardinalities, the identifying/
 * non-identifying line style, every column's name, type, key roles and
 * comment, and the order of everything all survive.
 *
 * THE ENTITY ALIAS carries the label. Mermaid's entity NAME is an id-shaped
 * token, so a label like "Order line item" cannot be the name; Mermaid 10.9
 * added `ID["Label"]` for exactly this. The alias is written only when the
 * label differs from the id, because writing `customer["customer"]` on every
 * line is noise the reader has to look past.
 *
 * Deterministic — identical models always produce identical text, and
 * iteration follows the model's own order.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable and type-only imports as `import type`.
 */

import type { ErAttribute, ErEntity, ErLabFile } from "@/types";

import { LEFT_CARDINALITY, RIGHT_CARDINALITY } from "@/features/archtext";

import { escapeMermaidString, mermaidSafeId } from "./text";
import {
  MERMAID_ER_HEADER_WORD,
  MERMAID_KEY_BY_ATTRIBUTE_KEY,
} from "./er-mapping";

export interface SerializeMermaidErOptions {
  /** Write the document title as YAML frontmatter. Default true — the same
   * spelling and the same default as the other flowchart-family emitters. */
  title?: boolean;
}

/**
 * Cardinality → glyph, per side, derived by inverting the grammar's own
 * tables rather than restating them.
 *
 * INVERTED HERE rather than imported as an inverse, because the `.alab`
 * serializer's `TOKEN_BY_CARDINALITY` is not exported past the archtext
 * barrel and the two glyph sets ARE the same set — inverting the exported
 * forward tables is what keeps this file honest about that. The per-side
 * split is not optional: "zero or more" is `}o` on the left and `o{` on the
 * right, so one table cannot serve both ends.
 */
const GLYPH_BY_CARDINALITY = {
  from: Object.fromEntries(
    Object.entries(LEFT_CARDINALITY).map(([glyph, name]) => [name, glyph]),
  ),
  to: Object.fromEntries(
    Object.entries(RIGHT_CARDINALITY).map(([glyph, name]) => [name, glyph]),
  ),
} as const;

/** Mermaid's two connectors, matching the `.alab` grammar's exactly. */
const CONNECTOR_BY_KIND: Readonly<Record<string, string>> = {
  identifying: "--",
  "non-identifying": "..",
};

/** An entity name Mermaid's tokenizer accepts. `e_` guards a leading digit,
 * matching the per-emitter prefix convention (`p_` participants, `n_`
 * flowchart nodes). */
const entityId = (id: string): string => mermaidSafeId(id, "e_");

/**
 * A column type as Mermaid spells it.
 *
 * MERMAID'S TYPE GRAMMAR IS NARROWER THAN SQL'S: an attribute type is
 * alphanumerics, underscores and `[]` for an array, and nothing else. A
 * space (`character varying`), a parenthesis or a comma (`numeric(10,2)`)
 * each produce a document Mermaid's own parser refuses — which is worse than
 * an approximation, because the export looks fine until someone pastes it
 * somewhere that renders it.
 *
 * So the unsupported characters are substituted and the result stays
 * readable: `numeric(10,2)` goes out as `numeric_10_2`. The column is never
 * dropped — a column missing from the box is a lie about the schema, where a
 * renamed type is a visible approximation — and `MERMAID_ER_EXPORT_CAVEAT`
 * says it happens. Narrow and deliberate, in the manner of `mermaidSafeId`.
 */
const typeToken = (type: string): string =>
  type
    .replace(/[^A-Za-z0-9_[\]]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "unknown";

function attributeLine(attribute: ErAttribute): string {
  let line = `    ${typeToken(attribute.type)} ${attribute.name}`;
  if (attribute.keys !== undefined && attribute.keys.length > 0) {
    /* Comma-separated, Mermaid's spelling for a column that is both a
       primary and a foreign key — the composite case the model exists to
       hold. Order follows the model's order, so `pk fk` and `fk pk` stay
       distinguishable through the trip. */
    line += ` ${attribute.keys.map((key) => MERMAID_KEY_BY_ATTRIBUTE_KEY[key]).join(",")}`;
  }
  if (attribute.description !== undefined && attribute.description !== "") {
    line += ` "${escapeMermaidString(attribute.description)}"`;
  }
  return line;
}

function entityBlock(entity: ErEntity): string[] {
  const name = entityId(entity.id);
  /* The alias only when it says something the name does not — see the file
     header. */
  const head =
    entity.label !== entity.id
      ? `${name}["${escapeMermaidString(entity.label)}"]`
      : name;
  const attributes = entity.attributes ?? [];
  if (attributes.length === 0) {
    /* A bare entity line: Mermaid draws the box with no rows, which is the
       overview diagram the model allows and `{}` would render identically
       with more noise. */
    return [`  ${head}`];
  }
  return [
    `  ${head} {`,
    ...attributes.map((attribute) => attributeLine(attribute)),
    "  }",
  ];
}

/**
 * Serializes an `ErLabFile` to Mermaid `erDiagram` code. Pure and
 * deterministic.
 */
export function serializeMermaidEr(
  file: ErLabFile,
  options: SerializeMermaidErOptions = {},
): string {
  const lines: string[] = [];
  const title = file.metadata?.title;
  if (options.title !== false && typeof title === "string" && title !== "") {
    lines.push("---", `title: ${JSON.stringify(title)}`, "---");
  }
  lines.push(MERMAID_ER_HEADER_WORD);

  for (const entity of file.entities) {
    lines.push(...entityBlock(entity));
  }

  for (const relationship of file.relationships) {
    const left = GLYPH_BY_CARDINALITY.from[relationship.fromCardinality];
    const right = GLYPH_BY_CARDINALITY.to[relationship.toCardinality];
    const connector = CONNECTOR_BY_KIND[relationship.kind];
    if (left === undefined || right === undefined || connector === undefined) {
      throw new Error(
        `serializeMermaidEr: no Mermaid glyph for ${relationship.fromCardinality}/${relationship.kind}/${relationship.toCardinality}`,
      );
    }
    /* The label is REQUIRED by Mermaid; absent becomes `""`, which the
       importer maps back to absent. */
    const label = relationship.label ?? "";
    lines.push(
      `  ${entityId(relationship.from)} ${left}${connector}${right} ${entityId(relationship.to)} : "${escapeMermaidString(label)}"`,
    );
  }

  return `${lines.join("\n")}\n`;
}
