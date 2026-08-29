/**
 * `list_example_models` / `get_example_model` — real documents, not toy ones.
 *
 * A grammar reference tells an agent what is legal; a worked example tells it
 * what is *idiomatic* — how deep a real hierarchy goes, how drill-downs are
 * wired, what descriptions and technologies look like when a human wrote
 * them. Everything arch-lab ships in view mode is exactly that, so it is
 * served here rather than inventing fixtures that would drift.
 *
 * They come from the app's OWN registries, through the same readers and
 * serializers `/live` uses, so what an agent is shown is byte-identical to
 * what the site renders — and a broken example fails here loudly instead of
 * being served as a good pattern to copy.
 *
 * ALL NINE NOTATIONS, NOT JUST C4. This file used to read
 * `listViewerModelSources()` alone, so an agent asking arch-lab for an example
 * was told the product draws C4 models and nothing else — eight registries of
 * worked documents were invisible to the one audience that cannot browse
 * `/demo` to find them. The union lives in
 * `playground/lib/example-registry.ts` (deep-imported for the reason
 * `catalog.ts` deep-imports `kind-copy`: the playground barrel is a client
 * component), and it is a TOTAL record over the document kinds — so a tenth
 * notation appears in both tools below without this file being edited, and
 * `check:mcp` proves from the filesystem that no registry is missing.
 */

import {
  EXAMPLE_KINDS,
  EXAMPLE_NOTATION_LABEL,
  listBundledExamples,
  loadBundledExample,
  type BundledExample,
} from "@/features/playground/lib/example-registry";
import { KIND_BLURB } from "@/features/playground/lib/kind-copy";

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

/** `  atlas-shop — "Atlas Shop": 4 diagrams, 22 nodes, 20 edges` */
function entryLine(example: BundledExample): string {
  return (
    `  ${example.id} — ${JSON.stringify(example.title)}: ` +
    example.facts.join(", ")
  );
}

export function listExampleModels(): McpTextResult {
  const listings = listBundledExamples();

  /* GROUPED BY NOTATION, with each kind's own one-line job above it. An agent
     reading this list is choosing a NOTATION as much as an example — it may
     not know arch-lab draws gantts at all — and one flat list of every id
     answers the second question while hiding the first. The blurbs are
     `KIND_BLURB`, the same sentences `/demo` and the playground's starter row
     show, because two wordings of "what is a lifecycle for" on one product is
     how they drift. */
  const sections = EXAMPLE_KINDS.map((kind) => {
    const rows = listings
      .filter((listing) =>
        listing.status === "ok"
          ? listing.example.kind === kind
          : listing.kind === kind,
      )
      .map((listing) =>
        listing.status === "ok"
          ? entryLine(listing.example)
          : // A registered example that no longer parses is a real defect —
            // say so rather than quietly shortening the list.
            `  ${listing.id} — BROKEN: ${listing.message.split("\n")[0]}`,
      );
    return (
      `${EXAMPLE_NOTATION_LABEL[kind].toUpperCase()} (kind: ${kind}) — ` +
      `${KIND_BLURB[kind]}.\n${rows.join("\n")}`
    );
  });

  const total = listings.length;

  return textResult(
    joinSections(
      `The ${total} example documents bundled with arch-lab, in all ` +
        `${EXAMPLE_KINDS.length} notations. Every count below is counted from ` +
        "the parsed document. Any of them opens on the deployed site at " +
        "/live?e=<id>.",
      ...sections,
      "Ids are unique across every notation, so get_example_model needs the " +
        'id alone: { "id": "shopflow", "format": "alab" }. It reports which ' +
        "notation it found.",
    ),
  );
}

/** Every id there is, for the "no such example" message. */
function knownIds(): string[] {
  return listBundledExamples().map((listing) =>
    listing.status === "ok" ? listing.example.id : listing.id,
  );
}

export function getExampleModel(
  id: string,
  format: ExampleFormat,
): McpTextResult {
  const result = loadBundledExample(id);

  if (result.status === "not-found") {
    return errorResult(
      `No bundled example \`${id}\`. Available: ${knownIds().join(", ")}.`,
    );
  }
  if (result.status === "invalid") {
    return errorResult(
      `The bundled ${EXAMPLE_NOTATION_LABEL[result.kind]} \`${id}\` failed ` +
        "to load — this is a bug in arch-lab, not in your request.\n\n" +
        result.message,
    );
  }

  const { example, alabText, jsonText, diagrams } = result.document;

  /* NAMES THE NOTATION IT FOUND. One flat id namespace spans nine registries,
     so "give me `checkout`" is answered without the caller ever having said
     which kind it meant — and an agent that then writes `validate_model`
     against a sequence document gets a refusal it cannot explain. Saying
     `sequence diagram` here is what makes the next tool call the right one. */
  const headline =
    `Example ${EXAMPLE_NOTATION_LABEL[example.kind]} \`${id}\` — ` +
    `${JSON.stringify(example.title)}, ${example.facts.join(", ")}.`;

  return textResult(
    joinSections(
      headline,
      diagrams.length > 0 ? renderDiagramTable(diagrams) : null,
      format === "alab" ? null : jsonNote(example),
      format === "alab" ? fence("", alabText) : fence("json", jsonText),
    ),
  );
}

/**
 * What `format: "json"` means for the kind in hand.
 *
 * The C4 JSON is a FILE FORMAT — `.archlab.json`, which every reader here
 * accepts and the editor writes. The other eight kinds have no JSON dialect:
 * what is served is the `<Kind>LabFile` their parser produces, which is
 * genuinely useful to inspect and is NOT something arch-lab reads back. An
 * agent that saved it and expected to reopen it would find that out at the
 * worst moment, so the response says it up front rather than letting the
 * fence imply an input format.
 */
function jsonNote(example: BundledExample): string | null {
  if (example.kind === "c4") return null;
  return (
    `This JSON is the parsed document — the shape the ` +
    `${EXAMPLE_NOTATION_LABEL[example.kind]} parser produces — for reading, ` +
    `not for feeding back. arch-lab has no JSON input dialect for this ` +
    `notation: .alab is what you write, and format: "alab" is what to fetch ` +
    `if you mean to edit it.`
  );
}
