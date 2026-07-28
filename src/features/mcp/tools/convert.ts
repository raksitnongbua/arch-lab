/**
 * `convert_model` and `format_model` — one model, whichever representation
 * the caller needs next.
 *
 * `.alab` ⇄ JSON is lossless in both directions (proved by
 * `pnpm check:archtext`), so those conversions are safe to automate. Mermaid
 * is NOT: it is a one-way, lossy export of a SINGLE diagram, and every
 * Mermaid result says so in the response rather than letting a caller
 * discover it after committing the output as a source of truth.
 *
 * `format_model` is the same machinery pointed at the caller's own format:
 * parse, re-emit canonically, and — the part that matters for a code agent —
 * say whether that changed anything, so it can skip a no-op write.
 */

import { serializeMermaidC4 } from "@/features/mermaid";
import type { CheckChoice } from "@/features/validate/lib/check";

import { readSource } from "../lib/read";
import {
  errorResult,
  fence,
  formatNote,
  joinSections,
  textResult,
  type McpTextResult,
} from "../lib/render";

/** The three shapes a model can be handed back as. */
export type ConvertTarget = "alab" | "json" | "mermaid";

const MERMAID_EXPORT_CAVEAT =
  "Mermaid is a one-way, LOSSY export of a single diagram: the C4 level, " +
  "names, descriptions, technologies and relationships carry over, but " +
  "geometry, viewports, tags, tag colours, icons, drill-down links, " +
  "`realizes` traceability and unknown fields do not. Keep .alab or " +
  "arch-lab JSON as the source of truth and treat Mermaid as output.";

export function convertModel(
  source: string,
  format: CheckChoice,
  to: ConvertTarget,
  diagramId: string | undefined,
): McpTextResult {
  const read = readSource(source, format);
  if (read.status === "error") return errorResult(read.message);

  const { file, aftText, jsonText, format: actual, autoDetected } = read.value;
  const from = formatNote(actual, autoDetected);

  if (to === "alab") {
    return textResult(
      joinSections(`Read as ${from}; converted to .alab.`, fence("", aftText)),
    );
  }

  if (to === "json") {
    return textResult(
      joinSections(
        `Read as ${from}; converted to arch-lab JSON.`,
        fence("json", jsonText),
      ),
    );
  }

  // Mermaid emits ONE diagram. An unknown id is the caller's most likely
  // mistake, so name the diagrams that do exist instead of just failing.
  const known = file.diagrams.map((diagram) => diagram.id);
  if (diagramId !== undefined && !known.includes(diagramId)) {
    return errorResult(
      `This model has no diagram \`${diagramId}\`. Known diagrams: ` +
        `${known.join(", ")}.`,
    );
  }

  const target = diagramId ?? file.rootDiagramId;
  return textResult(
    joinSections(
      `Read as ${from}; exported diagram \`${target}\` to Mermaid C4.`,
      fence("mermaid", serializeMermaidC4(file, { diagramId: target })),
      `Note: ${MERMAID_EXPORT_CAVEAT}`,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Canonical formatting                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Canonicalises the caller's source in its own format. Mermaid is refused
 * rather than silently answered in another language: there is no canonical
 * Mermaid form here, and returning `.alab` to a caller who asked for
 * formatting would corrupt the file it was about to write.
 */
export function formatModel(
  source: string,
  format: CheckChoice,
): McpTextResult {
  const read = readSource(source, format);
  if (read.status === "error") return errorResult(read.message);

  const { aftText, jsonText, format: actual, autoDetected } = read.value;

  if (actual === "mermaid") {
    return errorResult(
      "format_model does not format Mermaid — arch-lab has no canonical " +
        'Mermaid form. Use convert_model with to="alab" (or to="json") to ' +
        "turn this into a canonical arch-lab document instead.",
    );
  }

  const canonical = actual === "alab" ? aftText : jsonText;
  const changed = canonical !== source;

  return textResult(
    joinSections(
      changed
        ? `Reformatted as ${formatNote(actual, autoDetected)}.`
        : `Already canonical as ${formatNote(actual, autoDetected)} — ` +
            `no changes needed, nothing to write.`,
      changed ? fence(actual === "json" ? "json" : "", canonical) : null,
    ),
  );
}
