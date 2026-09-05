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

import type { ArchLabFile } from "@/types";
import type {
  CheckChoice,
  DiagramSummary,
} from "@/features/validate/lib/check";
import { MERMAID_CAVEAT } from "@/features/validate/lib/check";
import { boundsOf } from "@/features/viewer/lib/model";
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

/**
 * The summary rows with each diagram's drawn extent attached.
 *
 * WHY THE BIGGEST NOTATION WAS THE ONE WITHOUT A SIZE. Six of the nine kinds
 * report `Size: W x H px` because they SOLVE their geometry — the tool runs the
 * same layout the canvas does and reads the answer off it. C4 has no layout
 * module to run: the geometry is in the document, put there by the author or by
 * `defaultPositions` at parse time. So the measurement is a different shape here
 * (a box round what the file already says) and it simply never got written,
 * leaving an agent with no way to ask "will this fit on a slide?" about the
 * notation most likely to be presented.
 *
 * `boundsOf` RATHER THAN A LOCAL LOOP. That function's own note says every fit
 * the canvas performs must agree about what "the bounds of these nodes" means;
 * a second copy here would be free to drift, and then the size an agent is told
 * and the size the reader sees would differ with nothing to catch it.
 *
 * THE NODES ONLY. Edges are drawn between nodes they connect, and a frame is
 * derived from its members' box, so neither can enlarge the extent — except a
 * `via` waypoint routed outside it, which is rare enough that widening the
 * measurement for it would make the common answer wrong to protect the
 * uncommon one.
 */
function diagramTableRows(
  file: ArchLabFile,
  summaries: readonly DiagramSummary[],
): readonly (DiagramSummary & { size?: { width: number; height: number } })[] {
  const byId = new Map(file.diagrams.map((diagram) => [diagram.id, diagram]));
  return summaries.map((summary) => {
    const diagram = byId.get(summary.id);
    if (diagram === undefined || diagram.nodes.length === 0) return summary;
    const bounds = boundsOf(diagram.nodes);
    return { ...summary, size: { width: bounds.width, height: bounds.height } };
  });
}

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
    renderDiagramTable(diagramTableRows(file, summary.diagrams)),
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
