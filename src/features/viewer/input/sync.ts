/**
 * The two-pane sync engine for `/view/new`: arch-lab text (`.alab`) on one
 * side, arch-lab JSON on the other, one model behind both. Everything here
 * is a pure function over the REAL readers and writers — `parseArchText` /
 * `serializeArchText` from the archtext feature, `deserializeModel` /
 * `serializeModel` from the editor's io layer — so the panes can never
 * disagree with what a saved file would contain.
 *
 *   - `parsePane(pane, source)` — parse ONE pane's content and, on success,
 *     hand back the model plus the canonical text for the OTHER pane. The
 *     pane that was parsed is never reformatted here; canonicalising the
 *     user's own pane is an explicit action (`canonicalizePane`).
 *   - Errors keep their native precision and share one presentation shape:
 *     `.alab` failures carry line/column (plus the quoted offending line),
 *     JSON failures carry the validator's JSON-path issues, and content
 *     that is recognisably Mermaid C4 is routed to the import flow instead
 *     of a misleading parse error.
 *   - `importMermaid(source)` — the explicit, admittedly LOSSY one-way
 *     import: Mermaid C4 in, both panes out.
 *
 * Nothing leaves the browser; both directions run entirely in memory.
 */

import type { ArchLabFile } from "@/types";

import {
  ArchTextParseError,
  parseArchText,
  serializeArchText,
  type ArchTextIssue,
} from "@/features/archtext";
import { deserializeModel } from "@/features/editor/io/deserialize";
import {
  FileValidationError,
  type ValidationIssue,
} from "@/features/editor/io/validate";
import type { MermaidIssue } from "@/features/mermaid";

import type { ViewerModel } from "../lib/model";
import { detectFormat } from "./detect";
import {
  canonicalJsonText,
  fileFromEditorModel,
  parsePastedText,
  viewerModelFromFile,
} from "./parse-input";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** The two live panes. `aft` is the arch-lab text; `json` the JSON. */
export type PaneId = "aft" | "json";

export const PANE_LABEL: Record<PaneId, string> = {
  aft: "arch-lab text",
  json: "arch-lab JSON",
};

/** One successfully parsed model, in every representation the UI needs. */
export interface SyncedModel {
  file: ArchLabFile;
  model: ViewerModel;
  /** Canonical `.alab` text (deterministic archtext serializer). */
  aftText: string;
  /** Canonical `.archlab.json` text (editor's deterministic serializer). */
  jsonText: string;
}

/** An `.alab` failure — located to a line and column. */
export interface AftErrorDetail {
  kind: "aft";
  message: string;
  issues: readonly ArchTextIssue[];
  line: number;
  column: number;
  /** The offending source line, verbatim, when it exists. */
  lineText: string | null;
}

/** A JSON failure — the validator's JSON-path issues. */
export interface JsonPaneErrorDetail {
  kind: "json";
  message: string;
  issues: readonly ValidationIssue[];
}

/**
 * The pane's content is recognisably Mermaid C4, which is an import — not a
 * sync format. The UI offers the one-way conversion instead of a parse
 * error that would mislead ("line 1: expected `archlab`").
 */
export interface MermaidDetectedDetail {
  kind: "mermaid-detected";
  /** The Mermaid source, verbatim, ready for `importMermaid`. */
  source: string;
}

export type PaneErrorDetail =
  AftErrorDetail | JsonPaneErrorDetail | MermaidDetectedDetail;

export type PaneParseResult =
  | { status: "ok"; value: SyncedModel }
  | { status: "error"; error: PaneErrorDetail };

/** A Mermaid import failure — line/column plus the quoted line. */
export interface MermaidImportError {
  message: string;
  issues: readonly MermaidIssue[];
  line: number;
  column: number;
  lineText: string | null;
}

export type MermaidImportResult =
  | { status: "ok"; value: SyncedModel }
  | { status: "error"; error: MermaidImportError };

/* -------------------------------------------------------------------------- */
/* Parsing one pane                                                            */
/* -------------------------------------------------------------------------- */

function sourceLineAt(text: string, line: number): string | null {
  return text.split(/\r?\n/)[line - 1] ?? null;
}

function syncedFromFile(file: ArchLabFile): SyncedModel {
  return {
    file,
    model: viewerModelFromFile(file),
    aftText: serializeArchText(file),
    jsonText: canonicalJsonText(file),
  };
}

/**
 * Parses the content of one pane. Never throws; every failure comes back as
 * a typed, located error. On success the result carries the canonical text
 * of BOTH panes — the caller writes only the opposite one, which is the
 * structural guarantee against echo loops.
 */
export function parsePane(pane: PaneId, source: string): PaneParseResult {
  if (detectFormat(source) === "mermaid") {
    return { status: "error", error: { kind: "mermaid-detected", source } };
  }

  if (pane === "aft") {
    try {
      return { status: "ok", value: syncedFromFile(parseArchText(source)) };
    } catch (error) {
      if (error instanceof ArchTextParseError) {
        return {
          status: "error",
          error: {
            kind: "aft",
            message: error.message,
            issues: error.issues,
            line: error.line,
            column: error.column,
            lineText: sourceLineAt(source, error.line),
          },
        };
      }
      throw error;
    }
  }

  try {
    const file = fileFromEditorModel(deserializeModel(source));
    return { status: "ok", value: syncedFromFile(file) };
  } catch (error) {
    if (error instanceof FileValidationError) {
      return {
        status: "error",
        error: { kind: "json", message: error.message, issues: error.issues },
      };
    }
    throw error;
  }
}

/**
 * The canonical text for a pane's own content — the explicit "Format"
 * action, never applied automatically while the user is typing. Returns
 * `null` when the content does not currently parse (the pane's live error
 * already says why).
 */
export function canonicalizePane(pane: PaneId, source: string): string | null {
  const result = parsePane(pane, source);
  if (result.status !== "ok") return null;
  return pane === "aft" ? result.value.aftText : result.value.jsonText;
}

/* -------------------------------------------------------------------------- */
/* Mermaid — a one-way, lossy import                                           */
/* -------------------------------------------------------------------------- */

/**
 * What the Mermaid conversion drops, stated once, honestly, at the point of
 * import — not discovered in the render.
 */
export const MERMAID_LOSSY_NOTICE =
  "Mermaid import is one-way and lossy: Enterprise/System boundaries become " +
  "tags on their members and are not drawn as frames, and SystemDb / " +
  "SystemQueue at Context level lose their database and queue styling. " +
  "Everything else — names, descriptions, technologies, relationships — " +
  "carries over.";

/** Converts Mermaid C4 source into a synced model for both panes. */
export function importMermaid(source: string): MermaidImportResult {
  const result = parsePastedText(source, "mermaid");
  if (result.status === "ok") {
    return { status: "ok", value: syncedFromFile(result.value.file) };
  }
  const error = result.error;
  if (error.kind === "mermaid") {
    return {
      status: "error",
      error: {
        message: error.message,
        issues: error.issues,
        line: error.line,
        column: error.column,
        lineText: error.lineText,
      },
    };
  }
  // `parsePastedText` with an explicit "mermaid" choice only ever fails
  // with a Mermaid error; anything else is a programming error.
  throw new Error(`viewer: unexpected import failure — ${error.message}`);
}

/* -------------------------------------------------------------------------- */
/* Seed & filenames                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The example the page opens with — small but demonstrating every headline
 * feature of the text format: two C4 levels, drill-down (`>d-cnt`), icons
 * (`@golang!`), technology (`[Go]`), tags (`#demo`), descriptions, and
 * dashed edges. Hand-written, then canonicalised through the real parser
 * and serializer at module load so it can never drift from the grammar.
 */
const SEED_SOURCE = `archlab 1.0
title "Coffee Shop"
description "A tiny two-level example — edit either pane and the other follows."
tags #demo

@context d-ctx "Coffee Shop — Context"
  desc "Who talks to the system."
  customer:person "Customer" #demo
    desc "Orders and pays for coffee."
  shop:system "Coffee Shop System" @service! #demo >d-cnt
    desc "Takes orders and brews coffee."
  payments:external "Payment Provider" [Stripe]

  customer -> shop : "Places orders with" [HTTPS]
  shop ..> payments : "Charges cards via" [REST]

@container d-cnt "Coffee Shop System — Containers" owner=shop
  desc "Deployable units inside the coffee shop system."
  app:container "Ordering App" @nextjs! [Next.js] #demo
  api:container "Order API" @golang! [Go]
  db:database "Order Store" @postgresql! [PostgreSQL]

  app -> api : "Calls" [JSON/HTTPS]
  api -> db : "Reads and writes" [SQL]
`;

/** The synced model the page opens with. */
export const SEED_MODEL: SyncedModel = syncedFromFile(
  parseArchText(SEED_SOURCE),
);

/** `"Coffee Shop"` → `"coffee-shop"` — the stem both downloads share. */
export function downloadStem(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "model" : slug;
}
