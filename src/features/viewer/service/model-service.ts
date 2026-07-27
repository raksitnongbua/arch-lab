/**
 * The viewer's model service — the single place view-mode gets models from.
 *
 * Every model lives here as hard-coded JSON in the persisted
 * `.archlab.json` format (see `docs/product/data-model.md`) and is parsed
 * through the editor's REAL reader (`io/deserialize.ts`), never a bespoke
 * parser: the viewer renders anything that conforms to the file format, and
 * the ShopFlow demo is merely the first registered instance.
 *
 * Parse failures are surfaced honestly: `loadViewerModel` returns the
 * validator's own message (with the offending JSON path named) instead of
 * swallowing it, and `listViewerModels` lists the broken entry with its
 * error rather than silently dropping it.
 *
 * Pure and side-effect free apart from a module-level memo of parse results
 * — safe to call from Server Components and client code alike.
 */

import type { C4Level } from "@/types";

import { deserializeModel } from "@/features/editor/io/deserialize";
import {
  FileValidationError,
  type ValidationIssue,
} from "@/features/editor/io/validate";

import type { ViewerModel } from "../lib/model";

import atlasShopFile from "./data/atlas-shop.archlab.json";
import orderShopFile from "./data/order-shop.archlab.json";
import shopflowFile from "./data/shopflow.archlab.json";

/* -------------------------------------------------------------------------- */
/* Registry                                                                    */
/* -------------------------------------------------------------------------- */

interface ModelSource {
  /** Stable id — doubles as the `/view/[modelId]` route segment. */
  id: string;
  /**
   * The raw `.archlab.json` document. Typed `unknown` on purpose: nothing
   * downstream trusts its shape until `deserializeModel` has validated it.
   */
  document: unknown;
}

const SOURCES: readonly ModelSource[] = [
  { id: "atlas-shop", document: atlasShopFile },
  { id: "order-shop", document: orderShopFile },
  { id: "shopflow", document: shopflowFile },
];

/* -------------------------------------------------------------------------- */
/* Results                                                                     */
/* -------------------------------------------------------------------------- */

export type ViewerModelResult =
  | { status: "ok"; model: ViewerModel }
  | {
      /** The JSON exists but failed the schema's load-time validation. */
      status: "invalid";
      id: string;
      /** The validator's own message, offending JSON path included. */
      message: string;
      issues: readonly ValidationIssue[];
    }
  | { status: "not-found" };

export interface ViewerModelSummary {
  id: string;
  title: string;
  description: string;
  /** Distinct C4 levels present, in C4 order — real, counted, not prose. */
  levels: readonly C4Level[];
  diagramCount: number;
  nodeCount: number;
  edgeCount: number;
}

export type ViewerModelListing =
  | { status: "ok"; summary: ViewerModelSummary }
  | { status: "invalid"; id: string; message: string };

/* -------------------------------------------------------------------------- */
/* Parsing (memoized — the sources are static)                                 */
/* -------------------------------------------------------------------------- */

const parseCache = new Map<string, ViewerModelResult>();

function parseSource(source: ModelSource): ViewerModelResult {
  const cached = parseCache.get(source.id);
  if (cached !== undefined) return cached;

  let result: ViewerModelResult;
  try {
    // Through the editor's reader, exactly as an opened file would be:
    // full schema validation, all eight load-time hard errors included.
    const parsed = deserializeModel(JSON.stringify(source.document));
    result = {
      status: "ok",
      model: {
        id: source.id,
        title: parsed.metadata.title,
        description: parsed.metadata.description ?? "",
        rootDiagramId: parsed.rootDiagramId,
        diagrams: parsed.diagrams,
      },
    };
  } catch (error) {
    if (error instanceof FileValidationError) {
      result = {
        status: "invalid",
        id: source.id,
        message: error.message,
        issues: error.issues,
      };
    } else {
      throw error;
    }
  }
  parseCache.set(source.id, result);
  return result;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

const C4_ORDER: readonly C4Level[] = [
  "context",
  "container",
  "component",
  "code",
];

function summarize(model: ViewerModel): ViewerModelSummary {
  const diagrams = Object.values(model.diagrams);
  const present = new Set(diagrams.map((diagram) => diagram.level));
  return {
    id: model.id,
    title: model.title,
    description: model.description,
    levels: C4_ORDER.filter((level) => present.has(level)),
    diagramCount: diagrams.length,
    nodeCount: diagrams.reduce((total, d) => total + d.nodes.length, 0),
    edgeCount: diagrams.reduce((total, d) => total + d.edges.length, 0),
  };
}

/** Every registered model id — used by the route's static params. */
export function listViewerModelIds(): string[] {
  return SOURCES.map((source) => source.id);
}

/**
 * Summaries of all registered models for the demo index page. Broken JSON is
 * listed with its validation message, never silently hidden.
 */
export function listViewerModels(): ViewerModelListing[] {
  return SOURCES.map((source) => {
    const result = parseSource(source);
    if (result.status === "ok") {
      return { status: "ok", summary: summarize(result.model) };
    }
    // parseSource never returns "not-found" for a registered source.
    return {
      status: "invalid",
      id: source.id,
      message: result.status === "invalid" ? result.message : "unknown error",
    };
  });
}

/** One model by id — `not-found` for unknown ids, `invalid` for broken JSON. */
export function loadViewerModel(id: string): ViewerModelResult {
  const source = SOURCES.find((candidate) => candidate.id === id);
  if (source === undefined) return { status: "not-found" };
  return parseSource(source);
}
