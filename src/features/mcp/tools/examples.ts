/**
 * `list_example_models` / `get_example_model` — real models, not toy ones.
 *
 * A grammar reference tells an agent what is legal; a worked example tells it
 * what is *idiomatic* — how deep a real hierarchy goes, how drill-downs are
 * wired, what descriptions and technologies look like when a human wrote
 * them. The three models arch-lab ships in view mode are exactly that, so
 * they are served here rather than inventing fixtures that would drift.
 *
 * They come from the viewer's own registry (`listViewerModelSources`) and go
 * through the same reader as caller input, so what an agent is shown is
 * byte-identical to what `/view/<id>` renders — and a broken example would
 * fail here loudly instead of being served as a good pattern to copy.
 */

import { listViewerModelSources } from "@/features/viewer/service/model-service";

import { readSource } from "../lib/read";
import {
  errorResult,
  fence,
  joinSections,
  renderDiagramTable,
  textResult,
  type McpTextResult,
} from "../lib/render";

/** The representation an example can be fetched in. */
export type ExampleFormat = "alab" | "json";

function knownIds(): string[] {
  return listViewerModelSources().map((source) => source.id);
}

export function listExampleModels(): McpTextResult {
  const entries = listViewerModelSources().map((source) => {
    const read = readSource(JSON.stringify(source.document), "json");
    if (read.status === "error") {
      // A registered example that no longer parses is a real defect — say so
      // rather than quietly shortening the list.
      return `  ${source.id} — BROKEN: ${read.message.split("\n")[0]}`;
    }
    const { summary } = read.value;
    return (
      `  ${source.id} — ${JSON.stringify(summary.title)}: ` +
      `${summary.diagrams.length} diagram(s), ${summary.nodeCount} node(s), ` +
      `${summary.edgeCount} edge(s)`
    );
  });

  return textResult(
    joinSections(
      "Example models bundled with arch-lab (each also viewable at " +
        "/view/<id> on the deployed site):",
      entries.join("\n"),
      'Fetch one with get_example_model, e.g. { "id": "shopflow", ' +
        '"format": "alab" }.',
    ),
  );
}

export function getExampleModel(
  id: string,
  format: ExampleFormat,
): McpTextResult {
  const source = listViewerModelSources().find(
    (candidate) => candidate.id === id,
  );
  if (source === undefined) {
    return errorResult(
      `No example model \`${id}\`. Available: ${knownIds().join(", ")}.`,
    );
  }

  const read = readSource(JSON.stringify(source.document), "json");
  if (read.status === "error") {
    return errorResult(
      `The bundled example \`${id}\` failed to load — this is a bug in ` +
        `arch-lab, not in your request.\n\n${read.message}`,
    );
  }

  const { summary, aftText, jsonText } = read.value;

  return textResult(
    joinSections(
      `Example model \`${id}\` — ${JSON.stringify(summary.title)}, ` +
        `${summary.diagrams.length} diagram(s), ${summary.nodeCount} node(s), ` +
        `${summary.edgeCount} edge(s).`,
      renderDiagramTable(summary.diagrams),
      format === "alab" ? fence("", aftText) : fence("json", jsonText),
    ),
  );
}
