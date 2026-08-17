/**
 * The mapping tables of the Mermaid USE-CASE convention, shared by the
 * importer (`./usecase.ts`) and the emitter (`./usecase-emit.ts`) — the
 * use-case counterpart of `./flowchart-mapping.ts`, kept as one module for
 * the same reason: a table used by both directions cannot let import and
 * export disagree about what a bracket means.
 *
 * MERMAID HAS NO USE-CASE DIAGRAM. What it has is a convention people
 * actually write: a `flowchart` whose `((circles))` are actors, whose
 * `([stadiums])` are use cases, and whose `subgraph` is the system boundary.
 * Read as a flowchart, that document is silently MIS-MODELLED — the actors
 * become `start` terminators, the use cases become `end` terminators, and a
 * participant diagram renders as a meaningless flow. That concrete bug (a
 * real user's Thai food-delivery document, kept verbatim as a fixture in
 * `scripts/mermaid-check.mjs`) is why this dialect exists.
 *
 * THE DETECTION DECISION. Deciding that a `flowchart` header hides a
 * use-case diagram is a heuristic, and a wrong guess would steal a genuine
 * flowchart — the exact class of silent mis-modelling this dialect exists to
 * fix, so the heuristic must not recreate it in the other direction. The
 * choice here is a NARROW, documented heuristic with `flowchart` as the
 * fallback whenever ANY condition fails (chosen over an explicit-only
 * import, which would make the user's document fail its first paste and
 * need a second step). `detectMermaidUseCase` in `./usecase.ts` says
 * use-case only when BOTH of these hold:
 *
 *   1. `parseMermaidUseCase` accepts the whole document. The parser is
 *      deliberately strict, so acceptance itself carries most of the
 *      narrowing: any flowchart-only shape (`[step]`, `{decision}`,
 *      `[[call]]`, `[/io/]`, and the refused forms), any labelled solid
 *      arrow outside the closed `|generalizes|` vocabulary, any thick or
 *      cross/circle-head link, any dashed arrow without an
 *      `|include|`/`|extend|` stereotype, an actor declared inside a
 *      subgraph, and any edge whose endpoint kinds break the UML rules (an
 *      association must join an actor and a use case; a dependency joins
 *      two use cases; a generalization joins a same-kind pair) each throw,
 *      and the detector answers "flowchart".
 *   2. The parsed model actually READS as a use-case diagram
 *      (`readsAsUseCase` below): at least one circle actor, at least one
 *      use case, and at least one subgraph boundary.
 *
 *   Detection calls the parser rather than re-scanning the text so the two
 *   can never disagree: detector-true implies parser-success by
 *   construction, and there is no second grammar to drift.
 *
 * WHY THIS CANNOT STEAL A REAL FLOWCHART, argued rather than hoped: a
 * flowchart is a FLOW, so its non-terminator steps chain into one another —
 * and under this reading a chain between two round nodes is a use-case–to–
 * use-case association, which rule 1 refuses. A flowchart survives detection
 * only if it draws NOTHING but unlabelled lines from circles to terminators
 * inside a subgraph, with no step, no decision, no branch label and no
 * terminator-to-terminator edge — i.e. only if it already depicts
 * participants against a system box, which IS the use-case reading. That
 * residual assumption is named by `MERMAID_USECASE_CAVEAT`, together with
 * the way out: import the document as a flowchart to get the other reading.
 *
 * Imported by `scripts/mermaid-check.mjs` through Node's type stripping:
 * keep the syntax erasable (no enums) and type-only imports as `import type`.
 */

import type {
  UseCaseDependencyStereotype,
  UseCaseElementKind,
  UseCaseLabFile,
} from "@/types";

import { MERMAID_NODE_FORMS, REFUSED_NODE_FORMS } from "./flowchart-mapping";

/* -------------------------------------------------------------------------- */
/* Element shapes                                                              */
/* -------------------------------------------------------------------------- */

export interface MermaidUseCaseForm {
  /** The bracket that opens the shape, directly after the element id. */
  open: string;
  /** The bracket that closes it. */
  close: string;
  /** The element kind the convention assigns this shape. */
  kind: UseCaseElementKind;
}

/**
 * Mermaid bracket → element kind, LONGEST OPEN FIRST — the only ordering
 * that keeps `((` from being read as `(` and `([` from being read as `(`
 * (the same rule `MERMAID_NODE_FORMS` follows). The round `(...)` maps to a
 * use case alongside the stadium because both draw Mermaid's rounded shape
 * and real documents use them interchangeably for the ellipse.
 */
export const MERMAID_USECASE_NODE_FORMS: readonly MermaidUseCaseForm[] = [
  { open: "((", close: "))", kind: "actor" },
  { open: "([", close: "])", kind: "usecase" },
  { open: "(", close: ")", kind: "usecase" },
];

/**
 * Element kind → the bracket pair the emitter writes. `usecase` writes the
 * stadium (the round form reads back as the same kind, so one canonical
 * spelling goes out — the flowchart tables' `io` argument, unchanged).
 * Every pair here appears in `MERMAID_USECASE_NODE_FORMS`; the round-trip
 * assertions in `scripts/mermaid-check.mjs` pin the two tables together.
 */
export const BRACKETS_BY_ELEMENT_KIND: Readonly<
  Record<UseCaseElementKind, readonly [string, string]>
> = {
  actor: ["((", "))"],
  usecase: ["([", "])"],
};

const USECASE_OPENS = new Set(
  MERMAID_USECASE_NODE_FORMS.map((form) => form.open),
);

/**
 * Bracket openers that mean FLOWCHART, tried before (and ordered against)
 * the use-case forms: every opener the flowchart dialect reads or refuses
 * that is not a use-case shape. DERIVED from the flowchart tables rather
 * than retyped, so a shape added to the flowchart dialect is automatically
 * a use-case disqualifier — a hand-kept copy would let a new flowchart
 * bracket slip through detection and steal the document it appears in.
 * Sorted longest-first so `{{` is not read as `{` and `[[` / `[(` / `[/`
 * are not read as `[`.
 */
export const FLOWCHART_ONLY_OPENERS: readonly string[] = [
  ...MERMAID_NODE_FORMS.map((form) => form.open),
  ...REFUSED_NODE_FORMS.map((form) => form.open),
]
  .filter((open) => !USECASE_OPENS.has(open))
  .sort((a, b) => b.length - a.length);

/* -------------------------------------------------------------------------- */
/* Edges                                                                       */
/* -------------------------------------------------------------------------- */

/** The undirected line the emitter writes for an association — Mermaid's one
 * arrowless link, which is exactly what a UML association draws. The
 * importer also reads an UNLABELLED `-->` as an association with the
 * arrowhead dropped (the caveat names that loss), because the convention in
 * the wild points arrows at use cases. */
export const MERMAID_ASSOCIATION_LINK = "---";

/** The dashed arrow that carries an «include»/«extend» stereotype as its
 * `|label|` — Mermaid's dashed link, matching UML's dashed dependency. */
export const MERMAID_DEPENDENCY_ARROW = "-.->";

/** The solid arrow a generalization rides (UML draws generalization solid;
 * the hollow triangle has no Mermaid spelling, so the label below stands in
 * for it — a named loss in both caveats). */
export const MERMAID_GENERALIZATION_ARROW = "-->";

/**
 * The one word a solid arrow's `|label|` may carry: it marks the edge as a
 * generalization. A closed one-word vocabulary, not free text, because any
 * other labelled solid arrow is the signature of a genuine flowchart and
 * must fail the use-case reading rather than be absorbed into it.
 */
export const MERMAID_GENERALIZATION_LABEL = "generalizes";

/**
 * The closed `|label|` vocabulary of the dashed arrow, verbatim. Typed
 * against the model's own stereotype union so a drift here fails
 * `pnpm typecheck` rather than shipping a word the `.alab` grammar refuses.
 */
export const MERMAID_DEPENDENCY_STEREOTYPES: readonly UseCaseDependencyStereotype[] =
  ["include", "extend"];

/* -------------------------------------------------------------------------- */
/* Detection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Condition 2 of the detection decision (file header): does a model that
 * PARSED under the use-case reading actually read as a use-case diagram?
 * All three signals are required — an actor (some `((circle))`), a use case,
 * and a system boundary (some `subgraph`). A document missing any of them is
 * left to the flowchart importer, which handles it today and stays the
 * fallback.
 */
export function readsAsUseCase(file: UseCaseLabFile): boolean {
  return (
    file.elements.some((element) => element.kind === "actor") &&
    file.elements.some((element) => element.kind === "usecase") &&
    (file.boundaries?.length ?? 0) > 0
  );
}
