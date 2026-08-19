/**
 * The mapping tables of the Mermaid `erDiagram` dialect, shared by the
 * importer (`./er.ts`) and the emitter (`./er-emit.ts`) — the ER counterpart
 * of `./flowchart-mapping.ts` and `./usecase-mapping.ts`, kept as one module
 * for the same reason: a table used by both directions cannot let import and
 * export disagree about what a glyph means.
 *
 * MERMAID HAS A REAL ER DIAGRAM, and this is the first dialect here that can
 * say that. The flowchart convention had to be inferred and the use-case
 * convention had to be detected by heuristic, because Mermaid has no
 * use-case diagram at all. `erDiagram` is a first-class Mermaid document
 * type with its own header word, so:
 *
 *   - DETECTION IS EXACT. The first meaningful word is `erDiagram` or it is
 *     not; there is no heuristic to get wrong, and therefore none of the
 *     "this might steal a real flowchart" reasoning `./usecase-mapping.ts`
 *     has to carry.
 *   - CONVERSION IS TWO-WAY AND TOTAL over the diagram's substance. Every
 *     cardinality, every line style, every column with its type, its key
 *     roles and its comment survives in both directions. What export drops
 *     is listed in `MERMAID_ER_EXPORT_CAVEAT` and is metadata, not diagram.
 *
 * THE CARDINALITY GLYPHS ARE NOT RESTATED HERE. They are imported from the
 * `.alab` ER grammar, because the `.alab` grammar ADOPTED Mermaid's — that
 * was the reason for choosing crow's-foot tokens over invented words. A
 * second copy in this file would be two tables that must agree forever with
 * nothing enforcing it, which is exactly the duplication `dry.md` names.
 * The one place they genuinely differ is the key vocabulary's case, and that
 * difference gets a table of its own below.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable (no enums) and type-only imports as `import type`.
 */

import type { ErAttributeKey } from "@/types";

import { ATTRIBUTE_KEYS } from "@/features/archtext";

/** The Mermaid header word that opens an ER document. Exact, not sniffed. */
export const MERMAID_ER_HEADER_WORD = "erDiagram";

/**
 * `.alab` key role → Mermaid key role. The only real difference between the
 * two spellings of this vocabulary is case: `.alab` is lowercase because
 * every closed vocabulary in that format is (`include`, `extend`), and
 * Mermaid writes `PK` / `FK` / `UK`.
 *
 * DERIVED from `ATTRIBUTE_KEYS` rather than written out, so a fourth key
 * role added to the grammar cannot be silently missing here — it would
 * appear in this table the moment it appears in that one.
 */
export const MERMAID_KEY_BY_ATTRIBUTE_KEY: Readonly<
  Record<ErAttributeKey, string>
> = Object.fromEntries(
  ATTRIBUTE_KEYS.map((key) => [key, key.toUpperCase()]),
) as Record<ErAttributeKey, string>;

/** Mermaid key role → `.alab` key role (the inverse). Keyed on the uppercase
 * spelling; the importer uppercases before the lookup so `pk` written by
 * hand still lands. */
export const ATTRIBUTE_KEY_BY_MERMAID_KEY: Readonly<
  Record<string, ErAttributeKey>
> = Object.fromEntries(
  ATTRIBUTE_KEYS.map((key) => [key.toUpperCase(), key]),
) as Record<string, ErAttributeKey>;

/**
 * What an IMPORT from Mermaid cannot know. Short, because `erDiagram` is a
 * real ER notation and carries nearly everything — this is the one dialect
 * whose caveat is about what Mermaid never had rather than what the reading
 * had to guess.
 */
export const MERMAID_ER_CAVEAT =
  "Mermaid's erDiagram carries no [technology], no #tags and no entity " +
  "description, so an imported entity has only its name, its label and its " +
  "columns. Everything the diagram itself draws — both cardinalities, the " +
  "solid/dashed distinction, every column with its type, key roles and " +
  "comment — is imported exactly.";

/** What an EXPORT to Mermaid drops. The mirror of `MERMAID_ER_CAVEAT`. */
export const MERMAID_ER_EXPORT_CAVEAT =
  "Export to Mermaid keeps the whole diagram — both cardinalities, the " +
  "solid/dashed line, and every column with its type, key roles and " +
  "comment — and drops what erDiagram has nowhere to put: an entity's " +
  "[technology], its #tags, its description, and the .alab header beyond " +
  'the title. An unlabelled relationship writes as `: ""`, because ' +
  "Mermaid requires a label where .alab makes it optional. Mermaid's type " +
  "grammar is alphanumerics and [] only, so a SQL type it cannot spell is " +
  "substituted rather than dropped: numeric(10,2) exports as numeric_10_2.";
