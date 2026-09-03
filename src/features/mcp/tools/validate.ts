/**
 * `validate_model` — the tool that closes the loop.
 *
 * An agent writing `.alab` from a grammar summary will get details wrong; the
 * fix is not a better summary but a fast, precise verdict it can iterate
 * against. This returns the real parser's own line, column and quoted source
 * line, which is everything needed to repair the file without a round trip
 * back to the human.
 *
 * On success it deliberately does NOT echo the model back — that would cost
 * context to prove something the caller already has. It reports what the
 * model turned out to contain, which is the part the caller cannot see.
 *
 * A valid verdict also carries the C4 review notes
 * (`validate/lib/advisories.ts`). An agent authoring a model from the grammar
 * is precisely the caller that will emit fourteen relationships labelled
 * "Uses" and no technologies — it has the grammar but not the review
 * checklist, and a bare "VALID" tells it the diagram is finished when it is
 * merely parseable.
 */

import type { CheckChoice } from "@/features/validate/lib/check";
import { MERMAID_CAVEAT } from "@/features/validate/lib/check";
import { stepLikeFork, stepLikeReading } from "../lib/ask";
import { readFailureResult, readSource } from "../lib/read";
import {
  askHumanResult,
  formatNote,
  joinSections,
  renderAdvisories,
  renderDiagramTable,
  textResult,
  type McpTextResult,
} from "../lib/render";

export function validateModel(
  source: string,
  format: CheckChoice,
): McpTextResult {
  const read = readSource(source, format);
  if (read.status !== "ok") return readFailureResult(read);

  const {
    file,
    summary,
    format: actual,
    autoDetected,
    advisories,
  } = read.value;

  const verdict = joinSections(
    `VALID as ${formatNote(actual, autoDetected)}.`,
    [
      `Title:    ${summary.title}`,
      `Version:  ${summary.version}`,
      summary.description === null ? null : `Summary:  ${summary.description}`,
      `Totals:   ${summary.diagrams.length} diagram(s), ` +
        `${summary.nodeCount} node(s), ${summary.edgeCount} edge(s)`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
    renderDiagramTable(summary.diagrams),
    renderAdvisories(advisories, "model"),
    actual === "mermaid" ? `Note: ${MERMAID_CAVEAT}` : null,
  );

  /*
   * A VALID MODEL CAN STILL CARRY A QUESTION, and the verdict travels as the
   * ask's `doneSoFar` rather than being replaced: nothing about this document
   * is wrong, and a caller that wanted the counts still gets them.
   *
   * ONLY ON `auto`. An explicit `format` is the caller saying which C4 dialect
   * this is, which is not quite the same as saying "and it is C4 rather than a
   * sequence" — but it is close enough to be a deliberate choice, and a tool
   * that second-guesses an explicit argument is one an agent cannot use in a
   * loop. The notation REDIRECT in `lib/read.ts` is unconditional by contrast,
   * because there the alternative is a misleading line-1 parse error rather
   * than a correct answer with a question attached.
   */
  const stepLike = format === "auto" ? stepLikeReading(file) : null;
  if (stepLike !== null) {
    return askHumanResult(stepLikeFork(stepLike), verdict);
  }

  return textResult(verdict);
}
