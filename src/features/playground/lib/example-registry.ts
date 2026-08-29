/**
 * ONE union over every bundled-example registry, in every notation.
 *
 * Nine registries exist — the C4 models in `viewer/service/model-service.ts`
 * and one `service/example-service.ts` per other kind — and until this module
 * existed, every consumer that wanted "all of them" wrote the list out again.
 * `exampleTextFor` did (nine loaders, in order), the MCP example tools did not
 * and asked only the C4 one, and `/demo` still does because each kind's card
 * shows that kind's own counts. Two hand-written lists of nine is two chances
 * to add a tenth notation and have it silently missing from one surface, which
 * is the failure `codebase.md` habit 4 is about and which this repo has
 * already shipped four times on this branch alone.
 *
 * WHY THE LIST IS STILL WRITTEN OUT ONCE, HERE, rather than discovered. A
 * registry is an ES module, and the only ways to enumerate modules are
 * bundler-specific (`require.context`, `import.meta.glob`) — none of which
 * Next's server bundle and the `check:*` scripts can both load. The check
 * scripts import this file through Node's plain type stripping, so any
 * bundler magic would take the MCP surface out of test entirely, which is a
 * worse trade than a list. Two things make the list safe instead:
 *
 *   1. `REGISTRIES` is a TOTAL `Record<SeedKind, …>`, so a tenth notation
 *      does not compile until it has an entry here; and
 *   2. `check:mcp` derives the expected set from the FILESYSTEM — every
 *      every `service/example-service.ts` under `src/features` — and fails
 *      if an id in
 *      one of them never reaches `list_example_models`.
 *
 * Every fact a consumer gets is COUNTED from the parsed document, never
 * written by hand, and a registered example that no longer parses stays in
 * the list as an `invalid` entry: a broken bundled document is a bug in this
 * repo, and filtering it out is how it stays one.
 */

import {
  serializeArchText,
  serializeDictText,
  serializeErText,
  serializeFlowchartText,
  serializeGanttText,
  serializeLifecycleText,
  serializeSequenceText,
  serializeTimelineText,
  serializeUseCaseText,
} from "@/features/archtext";
import {
  loadDictExample,
  listDictExamples,
} from "@/features/dict/service/example-service";
import {
  loadErExample,
  listErExamples,
} from "@/features/er/service/example-service";
import {
  loadFlowchartExample,
  listFlowchartExamples,
} from "@/features/flowchart/service/example-service";
import {
  loadGanttExample,
  listGanttExamples,
} from "@/features/gantt/service/example-service";
import {
  loadLifecycleExample,
  listLifecycleExamples,
} from "@/features/lifecycle/service/example-service";
import {
  loadSequenceExample,
  listSequenceExamples,
} from "@/features/sequence/service/example-service";
import {
  loadTimelineExample,
  listTimelineExamples,
} from "@/features/timeline/service/example-service";
import {
  loadUseCaseExample,
  listUseCaseExamples,
} from "@/features/usecase/service/example-service";
/* Deep imports rather than the `viewer` barrel, which re-exports `.tsx`
   components: this module is loaded server-side by `/api/mcp` and by the
   check scripts through Node's type stripping, and neither wants a canvas. */
import { canonicalJsonText } from "@/features/viewer/input/parse-input";
import { archLabFileFrom } from "@/features/viewer/lib/model";
import {
  listViewerModels,
  loadViewerModel,
} from "@/features/viewer/service/model-service";

import type { SeedKind } from "../input/parse";

/* -------------------------------------------------------------------------- */
/* Notation names                                                              */
/* -------------------------------------------------------------------------- */

/**
 * What to CALL each notation in prose, singular.
 *
 * Singular and free of the word "diagram" where the noun already carries it,
 * because these are read in a sentence ("Example gantt chart `store-migration`
 * …") rather than as a section label. `/demo`'s jump bar has plural forms of
 * its own; they are a UI legend beside a glyph and a colour, not this.
 */
export const EXAMPLE_NOTATION_LABEL: Record<SeedKind, string> = {
  c4: "C4 model",
  sequence: "sequence diagram",
  flowchart: "flowchart",
  usecase: "use-case diagram",
  er: "ER diagram",
  dict: "data dictionary",
  gantt: "gantt chart",
  timeline: "milestone timeline",
  lifecycle: "lifecycle",
};

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** One row of a C4 model's diagram table. Empty for the single-diagram kinds. */
export interface ExampleDiagramRow {
  id: string;
  title: string;
  level: string;
  nodeCount: number;
  edgeCount: number;
}

/** A bundled example, identified and summarised, whatever notation it is in. */
export interface BundledExample {
  kind: SeedKind;
  /** Unique across ALL nine registries — `check:view-input` asserts it. */
  id: string;
  title: string;
  /**
   * Counted facts, already worded: `["3 diagrams", "24 nodes"]`. Derived from
   * the registry's own summary (see `countFacts`), so a kind that starts
   * counting one more thing says so here without this module being touched.
   */
  facts: readonly string[];
}

export type BundledExampleListing =
  | { status: "ok"; example: BundledExample }
  | { status: "invalid"; kind: SeedKind; id: string; message: string };

/** An example in full: both representations, plus its diagram rows if it has any. */
export interface BundledExampleDocument {
  example: BundledExample;
  /** Canonical `.alab` text — byte-identical to what `/live` renders. */
  alabText: string;
  /**
   * The document as JSON. For C4 this is the persisted `.archlab.json` file
   * format; for every other kind it is the `<Kind>LabFile` the parser
   * produces, which arch-lab does not read back — `.alab` is the input format
   * there. Callers that hand this to an agent must say so.
   */
  jsonText: string;
  diagrams: readonly ExampleDiagramRow[];
}

export type BundledExampleResult =
  | { status: "ok"; document: BundledExampleDocument }
  | { status: "invalid"; kind: SeedKind; id: string; message: string }
  | { status: "not-found" };

/* -------------------------------------------------------------------------- */
/* Counted facts                                                               */
/* -------------------------------------------------------------------------- */

/** `"useCaseCount"` → `"use case"`. */
function nounOf(key: string): string {
  return key
    .replace(/Count$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

/**
 * Every `…Count` on a registry summary, worded.
 *
 * DERIVED FROM THE SUMMARY rather than a per-kind list of fields, for the
 * reason the whole module exists: the nine summaries count nine different
 * things (`participantCount` here, `dayCount` there), and a table of which
 * fields to print would be a tenth place to forget a notation. The `…Count`
 * suffix is the convention all nine already follow.
 *
 * Past participles are not pluralised — a dictionary reports `12 described`
 * fields and a timeline `7 annotated` events, where "12 describeds" is not
 * English. Nor is "5 entitys": a noun ending in a consonant and `y` takes
 * `ies`. Both rules are here rather than in a table of per-field wordings for
 * the reason above — a table would be one more place a tenth notation can be
 * forgotten, and a wrong plural is a cosmetic defect where a missing example
 * is an invisible one.
 */
function pluralOf(noun: string): string {
  if (/(?:ed|ing)$/.test(noun)) return noun;
  if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh)$/.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

function countFacts(summary: object): string[] {
  const facts: string[] = [];
  for (const [key, value] of Object.entries(summary) as [string, unknown][]) {
    if (!key.endsWith("Count") || typeof value !== "number") continue;
    const noun = nounOf(key);
    facts.push(`${value} ${value === 1 ? noun : pluralOf(noun)}`);
  }
  return facts;
}

/* -------------------------------------------------------------------------- */
/* Registries                                                                  */
/* -------------------------------------------------------------------------- */

/** What every registry must be able to answer, in its own types' terms. */
interface KindRegistry {
  /** Summaries of every registered example, broken ones included. */
  list: () => readonly (
    | { status: "ok"; summary: { id: string; title: string } }
    | { status: "invalid"; id: string; message: string }
  )[];
  /** One example in full, or `null` when this registry does not hold the id. */
  read: (
    id: string,
  ) =>
    | { status: "ok"; document: Omit<BundledExampleDocument, "example"> }
    | { status: "invalid"; message: string }
    | null;
}

/** The eight text registries differ only in their parser and serializer. */
function textRegistry<File>(
  load: (
    id: string,
  ) =>
    | { status: "ok"; file: File }
    | { status: "invalid"; message: string }
    | { status: "not-found" },
  serialize: (file: File) => string,
  list: KindRegistry["list"],
): KindRegistry {
  return {
    list,
    read: (id) => {
      const result = load(id);
      if (result.status === "not-found") return null;
      if (result.status === "invalid") {
        return { status: "invalid", message: result.message };
      }
      return {
        status: "ok",
        document: {
          alabText: serialize(result.file),
          jsonText: JSON.stringify(result.file, null, 2),
          diagrams: [],
        },
      };
    },
  };
}

/**
 * TOTAL over `SeedKind`: a tenth notation does not compile until it is here,
 * which is the half of the completeness guarantee that does not need a check
 * script. The other half — that the entry actually reaches the MCP listing —
 * is `check:mcp`, derived from the filesystem.
 *
 * Declaration order is the order every consumer renders in: C4 first because
 * it is the kind most callers arrive looking for, then the other eight in the
 * order they were added, which is also `/demo`'s.
 */
const REGISTRIES: Record<SeedKind, KindRegistry> = {
  /* The C4 registry is the one that predates the `example-service` convention:
     its documents are `.archlab.json`, not `.alab`, so it serializes forward
     to `.alab` and its JSON is a real file format rather than a view of the
     parse. It is also the only kind whose document holds MORE THAN ONE
     diagram, which is why `diagrams` exists at all. */
  c4: {
    list: () =>
      listViewerModels().map((listing) =>
        listing.status === "ok"
          ? { status: "ok", summary: listing.summary }
          : listing,
      ),
    read: (id) => {
      const result = loadViewerModel(id);
      if (result.status === "not-found") return null;
      if (result.status === "invalid") {
        return { status: "invalid", message: result.message };
      }
      const file = archLabFileFrom(result.model);
      return {
        status: "ok",
        document: {
          alabText: serializeArchText(file),
          jsonText: canonicalJsonText(file),
          diagrams: file.diagrams.map((diagram) => ({
            id: diagram.id,
            title: diagram.title,
            level: diagram.level,
            nodeCount: diagram.nodes.length,
            edgeCount: diagram.edges.length,
          })),
        },
      };
    },
  },
  sequence: textRegistry(
    loadSequenceExample,
    serializeSequenceText,
    listSequenceExamples,
  ),
  flowchart: textRegistry(
    loadFlowchartExample,
    serializeFlowchartText,
    listFlowchartExamples,
  ),
  usecase: textRegistry(
    loadUseCaseExample,
    serializeUseCaseText,
    listUseCaseExamples,
  ),
  er: textRegistry(loadErExample, serializeErText, listErExamples),
  dict: textRegistry(loadDictExample, serializeDictText, listDictExamples),
  gantt: textRegistry(loadGanttExample, serializeGanttText, listGanttExamples),
  timeline: textRegistry(
    loadTimelineExample,
    serializeTimelineText,
    listTimelineExamples,
  ),
  lifecycle: textRegistry(
    loadLifecycleExample,
    serializeLifecycleText,
    listLifecycleExamples,
  ),
};

/** The notations, in the order every consumer of this module renders them. */
export const EXAMPLE_KINDS = Object.keys(REGISTRIES) as SeedKind[];

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every bundled example in every notation, grouped nowhere — the caller
 * groups. Broken documents are listed as `invalid` with the parser's own
 * message rather than dropped.
 */
export function listBundledExamples(): BundledExampleListing[] {
  return EXAMPLE_KINDS.flatMap((kind) =>
    REGISTRIES[kind].list().map((listing) =>
      listing.status === "ok"
        ? {
            status: "ok" as const,
            example: {
              kind,
              id: listing.summary.id,
              title: listing.summary.title,
              facts: countFacts(listing.summary),
            },
          }
        : {
            status: "invalid" as const,
            kind,
            id: listing.id,
            message: listing.message,
          },
    ),
  );
}

/**
 * One example by id, from whichever registry holds it.
 *
 * The id alone is enough because the nine namespaces are one flat namespace —
 * `check:view-input` asserts they never collide — so a caller never has to
 * know which notation an id belongs to. The registries are asked in order and
 * the first hit wins; a collision would therefore resolve the wrong document,
 * which is exactly why that check exists.
 */
export function loadBundledExample(id: string): BundledExampleResult {
  for (const kind of EXAMPLE_KINDS) {
    const result = REGISTRIES[kind].read(id);
    if (result === null) continue;
    if (result.status === "invalid") {
      return { status: "invalid", kind, id, message: result.message };
    }
    const summary = REGISTRIES[kind]
      .list()
      .find((listing) => listing.status === "ok" && listing.summary.id === id);
    return {
      status: "ok",
      document: {
        ...result.document,
        example: {
          kind,
          id,
          title: summary?.status === "ok" ? summary.summary.title : id,
          facts: summary?.status === "ok" ? countFacts(summary.summary) : [],
        },
      },
    };
  }
  return { status: "not-found" };
}
