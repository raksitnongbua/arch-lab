/**
 * One reader for the merged playground: any supported text in, one rendered
 * document out. The nine shapes the pane accepts — C4 `.alab`, sequence
 * `.alab`, flowchart `.alab`, use-case `.alab`, arch-lab JSON, Mermaid C4,
 * Mermaid `sequenceDiagram`, Mermaid `flowchart`/`graph`, and a Mermaid
 * flowchart that reads as a USE-CASE diagram — are all AUTO-DETECTED; the
 * playground renders whichever canvas the text asks for.
 *
 * Nothing here parses anything itself. Every branch delegates to a reader a
 * playground already trusted — `parseSequenceInput` (sequence `.alab` and
 * Mermaid sequence), `parseFlowchartInput` (both flowchart dialects),
 * `parseUseCaseInput` (both use-case dialects), `parsePane` (C4 `.alab` and
 * arch-lab JSON) and `importMermaid` (Mermaid C4) — so the merged page
 * cannot disagree with what either predecessor, or a saved file, means by
 * the same text. The retired convert page composed the same readers the same
 * way (`features/convert/lib/convert.ts`, now only in git history).
 *
 * DETECTION ORDER, and why the sequence reader runs first: its own `detect`
 * already classifies every first line this pane accepts except arch-lab JSON
 * (`archlab 1.0 sequence`, `sequenceDiagram`, and — as its typed
 * `c4-detected` / `flowchart-detected` / `usecase-detected` errors — both C4
 * dialects, both flowchart dialects and the `.alab` use-case header).
 * Re-implementing that here would be a second heuristic to keep in step;
 * instead its verdicts are consumed as routing, and only the one shape it
 * cannot name (JSON, via the viewer's `detectFormat`) is resolved after it.
 *
 * THE ONE FORK INSIDE A VERDICT: Mermaid has no use-case grammar — the
 * use-case convention rides the flowchart header — so a `flowchart-detected`
 * verdict covers two canvases, and `detectMermaidUseCase` decides between
 * them. It is the strict use-case parser itself (true GUARANTEES the parse
 * succeeds, and a genuine flowchart fails its refusals), so this is not a
 * second sniff to drift; the fallback is the flowchart importer, exactly
 * what ran before the use-case canvas existed. Errors keep each parser's
 * native precision — line/column with the quotable source line, or the
 * validator's JSON-path issues — because the UI renders the same caret quote
 * the rest of the site uses.
 */

import type {
  DictLabFile,
  ErLabFile,
  FlowchartLabFile,
  SequenceLabFile,
  UseCaseLabFile,
} from "@/types";

import {
  ARCHTEXT_EXTENSION,
  serializeFlowchartText,
  serializeSequenceText,
  serializeUseCaseText,
  serializeErText,
  serializeDictText,
} from "@/features/archtext";
import {
  detectMermaidUseCase,
  serializeMermaidC4,
  serializeMermaidFlowchart,
  serializeMermaidSequence,
  serializeMermaidUseCase,
  serializeMermaidEr,
} from "@/features/mermaid";
/* PAST THE BARRELS, DELIBERATELY, and the same exception `dry.md` already
   tolerates for `validate/lib/check.ts`: both feature barrels export React
   components, and importing one here would drag a canvas into a module that
   must stay PURE. Pure is not an aesthetic here — every other format module
   in this repo is loaded by a `check:*` script through Node's type stripping,
   which cannot read `.tsx` at all, so a barrel import silently removes this
   file from the only test harness it could have. The input layers below are
   pure by construction. Keep new imports here pointed at those. */
import {
  parseSequenceInput,
  SEQUENCE_FORMAT_LABEL,
  type SequenceParseErrorDetail,
  type SequenceSourceFormat,
} from "@/features/sequence/input/parse";
import { SEQUENCE_EXAMPLE } from "@/features/sequence/input/example";
import {
  FLOWCHART_FORMAT_LABEL,
  parseFlowchartInput,
  type FlowchartParseErrorDetail,
  type FlowchartSourceFormat,
} from "@/features/flowchart/input/parse";
import { FLOWCHART_EXAMPLE } from "@/features/flowchart/input/example";
import {
  parseUseCaseInput,
  USECASE_FORMAT_LABEL,
  type UseCaseParseErrorDetail,
  type UseCaseSourceFormat,
} from "@/features/usecase/input/parse";
import { USECASE_EXAMPLE } from "@/features/usecase/input/example";
import {
  ER_FORMAT_LABEL,
  parseErInput,
  type ErParseErrorDetail,
  type ErSourceFormat,
} from "@/features/er/input/parse";
import { ER_EXAMPLE } from "@/features/er/input/example";
import {
  DICT_FORMAT_LABEL,
  parseDictInput,
  type DictParseErrorDetail,
  type DictSourceFormat,
} from "@/features/dict/input/parse";
import { DICT_EXAMPLE } from "@/features/dict/input/example";
import { detectFormat } from "@/features/viewer/input/detect";
import {
  importMermaid,
  parsePane,
  SEED_MODEL,
  type AftErrorDetail,
  type JsonPaneErrorDetail,
  type MermaidImportError,
  type SyncedModel,
} from "@/features/viewer/input/sync";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/** Which example seeds the pane — the ONLY thing `?d=` varies. */
export type SeedKind =
  "c4" | "sequence" | "flowchart" | "usecase" | "er" | "dict";

/** The languages a C4 document can sit in the pane as. */
export type C4SourceFormat = "alab" | "json" | "mermaid";

export const C4_FORMAT_LABEL: Record<C4SourceFormat, string> = {
  alab: ".alab",
  json: "arch-lab JSON",
  mermaid: "Mermaid C4",
};

/** The last GOOD parse — everything any of the four canvases needs. */
export type ViewDocument =
  | { kind: "c4"; format: C4SourceFormat; synced: SyncedModel }
  | { kind: "sequence"; format: SequenceSourceFormat; file: SequenceLabFile }
  | {
      kind: "flowchart";
      format: FlowchartSourceFormat;
      file: FlowchartLabFile;
    }
  | { kind: "usecase"; format: UseCaseSourceFormat; file: UseCaseLabFile }
  | { kind: "er"; format: ErSourceFormat; file: ErLabFile }
  | { kind: "dict"; format: DictSourceFormat; file: DictLabFile };

/**
 * Every way the pane's text can fail, each in its native reader's shape.
 * `mermaid-c4` wraps `importMermaid`'s error (which carries no discriminant
 * of its own) so one switch can render all of them.
 */
export type ViewSourceError =
  | AftErrorDetail
  | JsonPaneErrorDetail
  | ({ kind: "mermaid-c4" } & MermaidImportError)
  | SequenceParseErrorDetail
  // Same `kind: "parse"` shape as the sequence detail, on purpose: the UI's
  // caret-quote branch renders all of them without caring which grammar
  // located the failure.
  | FlowchartParseErrorDetail
  | UseCaseParseErrorDetail
  | ErParseErrorDetail
  | DictParseErrorDetail
  | { kind: "unknown-format"; message: string };

export type ViewParseResult =
  | { status: "ok"; value: ViewDocument }
  | { status: "error"; error: ViewSourceError };

/** The pane's format toggle values. JSON is deliberately not one of them:
 * the JSON twin has its own pane, and a three-way toggle would give the
 * on-disk form equal billing with the format people are asked to write. */
export type ToggleFormat = "alab" | "mermaid";

/* -------------------------------------------------------------------------- */
/* Detection + parsing, composed                                               */
/* -------------------------------------------------------------------------- */

export function parseViewSource(text: string): ViewParseResult {
  /* ER GOES FIRST, and it is the only kind that may. The other three arrive
     as typed verdicts from the sequence detector because their headers are
     things that detector already has to recognise; ER's two dialects each
     have an EXACT header no other reader here claims (`archlab 1.0 er` and
     `erDiagram`), so testing them costs two string comparisons and cannot
     steal a document from another canvas. Teaching the sequence detector a
     fifth header would have bought nothing and given it one more grammar to
     stay in step with. */
  /* The dictionary reader runs beside the ER one and for the same reason:
     `archlab 1.0 dict` is an exact header no other reader here claims, so the
     test is one string comparison and cannot steal a document. */
  const dict = parseDictInput(text);
  if (dict.status === "ok") {
    return {
      status: "ok",
      value: { kind: "dict", format: dict.value.format, file: dict.value.file },
    };
  }
  if (dict.error.kind === "parse") {
    return { status: "error", error: dict.error };
  }

  const er = parseErInput(text);
  if (er.status === "ok") {
    return {
      status: "ok",
      value: { kind: "er", format: er.value.format, file: er.value.file },
    };
  }
  if (er.error.kind === "parse") {
    /* Detected as ER and failed INSIDE an ER grammar — located where that
       parser located it. Anything else means "not ER at all", which is not an
       error yet: the readers below still get their turn. */
    return { status: "error", error: er.error };
  }

  const sequence = parseSequenceInput(text);
  if (sequence.status === "ok") {
    return {
      status: "ok",
      value: {
        kind: "sequence",
        format: sequence.value.format,
        file: sequence.value.file,
      },
    };
  }

  const detail = sequence.error;
  if (detail.kind === "parse") {
    // The text IS sequence-shaped and failed inside the sequence grammar —
    // located where that parser located it.
    return { status: "error", error: detail };
  }

  if (detail.kind === "usecase-detected") {
    // The `.alab` use-case header. Routing, exactly as the other verdicts —
    // the use-case reader parses with the real grammar.
    const usecase = parseUseCaseInput(text);
    if (usecase.status === "ok") {
      return {
        status: "ok",
        value: {
          kind: "usecase",
          format: usecase.value.format,
          file: usecase.value.file,
        },
      };
    }
    if (usecase.error.kind !== "parse") {
      // The sequence detector said "usecase" from the same header word the
      // use-case reader sniffs, so a non-parse failure here is a programming
      // error (two detectors disagreeing), not an input to explain.
      throw new Error(
        `playground: unexpected use-case failure kind "${usecase.error.kind}"`,
      );
    }
    return { status: "error", error: usecase.error };
  }

  if (detail.kind === "flowchart-detected") {
    // Either flowchart dialect — or the use-case CONVENTION riding the
    // Mermaid flowchart header, which is one verdict covering two canvases.
    // `detectMermaidUseCase` is the fork: it is the strict use-case parser
    // itself (true guarantees the parse succeeds, and it returns false for
    // `.alab` flowchart text, whose header it refuses), so a genuine
    // flowchart cannot be stolen — everything the detector declines keeps
    // the flowchart reading it always had.
    if (detectMermaidUseCase(text)) {
      const usecase = parseUseCaseInput(text);
      if (usecase.status !== "ok") {
        // detector-true guarantees the parse — see the reader's header.
        throw new Error(
          "playground: detectMermaidUseCase accepted text its parser refused",
        );
      }
      return {
        status: "ok",
        value: {
          kind: "usecase",
          format: usecase.value.format,
          file: usecase.value.file,
        },
      };
    }
    const flow = parseFlowchartInput(text);
    if (flow.status === "ok") {
      return {
        status: "ok",
        value: {
          kind: "flowchart",
          format: flow.value.format,
          file: flow.value.file,
        },
      };
    }
    if (flow.error.kind !== "parse") {
      // The sequence detector said "flowchart" from the same first line the
      // flowchart reader sniffs, so a non-parse failure here is a programming
      // error (two detectors disagreeing), not an input to explain.
      throw new Error(
        `playground: unexpected flowchart failure kind "${flow.error.kind}"`,
      );
    }
    return { status: "error", error: flow.error };
  }

  if (detail.kind === "c4-detected") {
    // Either C4 dialect. `detectFormat` splits them (Mermaid header vs not);
    // there is no "redirect to the other playground" any more — this pane IS
    // both playgrounds, so a C4 verdict is a route into a reader, not an error.
    if (detectFormat(text) === "mermaid") {
      const imported = importMermaid(text);
      return imported.status === "ok"
        ? {
            status: "ok",
            value: { kind: "c4", format: "mermaid", synced: imported.value },
          }
        : { status: "error", error: { kind: "mermaid-c4", ...imported.error } };
    }
    const parsed = parsePane("aft", text);
    if (parsed.status === "ok") {
      return {
        status: "ok",
        value: { kind: "c4", format: "alab", synced: parsed.value },
      };
    }
    if (parsed.error.kind !== "aft") {
      // `parsePane("aft", …)` can only fail as "aft" or "mermaid-detected",
      // and the Mermaid case was routed above — anything else is a
      // programming error, not an input to explain to the user.
      throw new Error(
        `playground: unexpected .alab failure kind "${parsed.error.kind}"`,
      );
    }
    return { status: "error", error: parsed.error };
  }

  // The sequence reader could not name the shape. The one language its
  // detector does not know is arch-lab JSON.
  if (detectFormat(text) === "json") {
    const parsed = parsePane("json", text);
    if (parsed.status === "ok") {
      return {
        status: "ok",
        value: { kind: "c4", format: "json", synced: parsed.value },
      };
    }
    if (parsed.error.kind !== "json") {
      throw new Error(
        `playground: unexpected JSON failure kind "${parsed.error.kind}"`,
      );
    }
    return { status: "error", error: parsed.error };
  }

  return {
    status: "error",
    error: {
      kind: "unknown-format",
      // Two messages, as `parseSequenceInput` distinguishes for its own pane:
      // an empty pane needs an invitation, an unrecognised one needs the list
      // of first lines that would have worked.
      message:
        text.trim() === ""
          ? "Nothing to render yet — write .alab text (`archlab 1.0`, `archlab 1.0 sequence`, `archlab 1.0 flowchart`, `archlab 1.0 usecase`, `archlab 1.0 er` or `archlab 1.0 dict`), paste arch-lab JSON, or paste Mermaid (C4, a sequenceDiagram, a flowchart, or an erDiagram)."
          : "Could not detect the format: the first line is not `archlab 1.0`, `archlab 1.0 sequence`, `archlab 1.0 flowchart`, `archlab 1.0 usecase`, `archlab 1.0 er`, `archlab 1.0 dict`, `{` (arch-lab JSON), a Mermaid C4 header, `sequenceDiagram`, `flowchart`, `graph` or `erDiagram`.",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Canonical text, conversions, and per-document lookups                       */
/* -------------------------------------------------------------------------- */

/**
 * The canonical text of a parsed document IN ITS OWN pane format — what the
 * Format button writes, and what a JSON-pane edit regenerates the source pane
 * as. Regenerating in the pane's CURRENT format (not always `.alab`) is what
 * keeps the format toggle honest: syncing must never silently flip the
 * language the user chose to look at.
 */
export function sourceTextFor(doc: ViewDocument): string {
  if (doc.kind === "sequence") {
    return doc.format === "mermaid"
      ? serializeMermaidSequence(doc.file)
      : serializeSequenceText(doc.file);
  }
  if (doc.kind === "flowchart") {
    return doc.format === "mermaid"
      ? serializeMermaidFlowchart(doc.file)
      : serializeFlowchartText(doc.file);
  }
  if (doc.kind === "usecase") {
    return doc.format === "mermaid"
      ? serializeMermaidUseCase(doc.file)
      : serializeUseCaseText(doc.file);
  }
  if (doc.kind === "er") {
    return doc.format === "mermaid"
      ? serializeMermaidEr(doc.file)
      : serializeErText(doc.file);
  }
  /* One dialect, so no format fork — Mermaid has no dictionary notation. */
  if (doc.kind === "dict") return serializeDictText(doc.file);
  switch (doc.format) {
    case "alab":
      return doc.synced.aftText;
    case "json":
      return doc.synced.jsonText;
    case "mermaid":
      // Default target diagram (the file's `x-mermaid.sourceDiagramId`, else
      // the root) — the emit contract's own resolution, not a choice made here.
      return serializeMermaidC4(doc.synced.file);
  }
}

/** The document rewritten in the other toggle format. */
export function convertedSourceText(
  doc: ViewDocument,
  to: ToggleFormat,
): string {
  if (doc.kind === "sequence") {
    return to === "mermaid"
      ? serializeMermaidSequence(doc.file)
      : serializeSequenceText(doc.file);
  }
  if (doc.kind === "flowchart") {
    return to === "mermaid"
      ? serializeMermaidFlowchart(doc.file)
      : serializeFlowchartText(doc.file);
  }
  if (doc.kind === "usecase") {
    return to === "mermaid"
      ? serializeMermaidUseCase(doc.file)
      : serializeUseCaseText(doc.file);
  }
  if (doc.kind === "er") {
    return to === "mermaid"
      ? serializeMermaidEr(doc.file)
      : serializeErText(doc.file);
  }
  if (doc.kind === "dict") return serializeDictText(doc.file);
  return to === "mermaid"
    ? serializeMermaidC4(doc.synced.file)
    : doc.synced.aftText;
}

/**
 * What converting a C4 document TO Mermaid drops. Stated at the moment of
 * conversion, in the announcement and the caveat disclosure — the emit layer
 * documents the loss (`mermaid/lib/emit.ts`, "Known lossy spots") but exports
 * no user-facing sentence for it, so this is that sentence.
 */
export const MERMAID_C4_EXPORT_CAVEAT =
  "Mermaid C4 holds a single diagram, so a multi-level model keeps only one " +
  "level, and geometry, drill-down links, icons, tag colours and technology " +
  "on people/systems are dropped. The .alab keeps everything.";

/** "a C4 model (arch-lab JSON)" — for parse announcements. */
export function describeDocument(doc: ViewDocument): string {
  switch (doc.kind) {
    case "c4":
      return `a C4 model (${C4_FORMAT_LABEL[doc.format]})`;
    case "sequence":
      return `a sequence diagram (${SEQUENCE_FORMAT_LABEL[doc.format]})`;
    case "flowchart":
      return `a flowchart (${FLOWCHART_FORMAT_LABEL[doc.format]})`;
    case "usecase":
      return `a use-case diagram (${USECASE_FORMAT_LABEL[doc.format]})`;
    case "er":
      return `an ER diagram (${ER_FORMAT_LABEL[doc.format]})`;
    case "dict":
      return `a data dictionary (${DICT_FORMAT_LABEL[doc.format]})`;
  }
}

/** The document's own title — file stems and the Web Share sheet. */
export function documentTitle(doc: ViewDocument): string {
  return doc.kind === "c4" ? doc.synced.model.title : doc.file.metadata.title;
}

/** Download extension for the pane's current format. */
export function sourceExtension(doc: ViewDocument): string {
  if (doc.format === "mermaid") return ".mmd";
  return doc.kind === "c4" && doc.format === "json"
    ? JSON_EXTENSION
    : ARCHTEXT_EXTENSION;
}

export const JSON_EXTENSION = ".archlab.json";

/* -------------------------------------------------------------------------- */
/* Seeds                                                                       */
/* -------------------------------------------------------------------------- */

/** The example text each route opens with — the routes' only difference. */
/**
 * A blank page with the walls marked out — what the "Start from" buttons at the
 * foot of the source pane replace the pane with.
 *
 * NOT THE SEED EXAMPLES. Those are finished documents chosen to show what the
 * format can do; these are the smallest thing that parses and still says where
 * the next line goes. A reader who has seen enough and wants to write their
 * own is stopped by the header they cannot remember, not by a shortage of
 * examples — `/demo` has six of those.
 *
 * Each one is deliberately valid on its own, so the canvas draws something the
 * moment it lands rather than greeting a new document with a parse error.
 */
export const VIEW_STARTER_TEXT: Record<SeedKind, string> = {
  c4: `archlab 1.0
title "Your system"

@context ctx-root "Your system"
  user:person "Customer"
  app:system "Your system"
  user -> app : "Uses"
`,
  sequence: `archlab 1.0 sequence
title "Your flow"

@sequence
  user:actor "Customer"
  api:participant "Your API"

  user -> api : "Asks for something"
  api ..> user : "Answers"
`,
  flowchart: `archlab 1.0 flowchart
title "Your flowchart"

@flowchart
  start s "Start"
  step work "Do the thing"
  decision ok "Did it work?"
  end done "Done"

  s -> work
  work -> ok
  ok -> done : "yes"
  ok -> work : "no"
`,
  usecase: `archlab 1.0 usecase
title "Your system"

@usecase
  actor user "Customer"
  boundary "Your system"
    usecase act "Do the thing"
    usecase pay "Pay for it"

  user -- act
  act ..> pay : include
`,
  er: `archlab 1.0 er
title "Your schema"

@er
  entity customer "Customer"
    attr id uuid pk
    attr email string uk
  entity order "Order"
    attr id uuid pk
    attr customer_id uuid fk

  customer ||--o{ order : places
`,
  dict: `archlab 1.0 dict
title "Your fields"

@dict
  section "Customer"
    field id uuid required unique
      desc "What this field means, and why it exists"
      source "where the value comes from"
    field email string required pii
`,
};

export const VIEW_SEED_TEXT: Record<SeedKind, string> = {
  c4: SEED_MODEL.aftText,
  sequence: SEQUENCE_EXAMPLE,
  flowchart: FLOWCHART_EXAMPLE,
  usecase: USECASE_EXAMPLE,
  er: ER_EXAMPLE,
  dict: DICT_EXAMPLE,
};

function mustParse(text: string): ViewDocument {
  const result = parseViewSource(text);
  if (result.status !== "ok") {
    // A failing seed is a build break, not a user state — both examples are
    // parser-verified here at module load, exactly as SEED_MODEL is.
    throw new Error("playground: a seed example does not parse");
  }
  return result.value;
}

/** The parsed seed documents. The C4 one reuses `SEED_MODEL` directly rather
 * than re-deriving it, so the two constants cannot disagree. */
export const VIEW_SEED_DOCUMENT: Record<SeedKind, ViewDocument> = {
  c4: { kind: "c4", format: "alab", synced: SEED_MODEL },
  sequence: mustParse(SEQUENCE_EXAMPLE),
  flowchart: mustParse(FLOWCHART_EXAMPLE),
  usecase: mustParse(USECASE_EXAMPLE),
  er: mustParse(ER_EXAMPLE),
  dict: mustParse(DICT_EXAMPLE),
};
