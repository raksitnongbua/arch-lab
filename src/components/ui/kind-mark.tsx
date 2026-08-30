import type { SeedKind } from "@/features/playground/input/parse";

/**
 * How each notation is MARKED — its glyph, its colour, and the order the nine
 * are listed in.
 *
 * IT LIVED IN `src/app/demo/page.tsx`, which was two rules broken at once:
 * `codebase.md` says a route file holds routes and route-level metadata only,
 * and `dry.md` says anything two surfaces need lives in `src/components/ui`.
 * The playground's sample-diagram menu needed exactly this table and, rather
 * than reach into a page, drew all nine of its rows with the SAME generic
 * file icon — nine identical marks in a list whose entire job is telling nine
 * things apart.
 *
 * WHY THESE SHAPES. Not icons chosen from a set: each is the thing the reader
 * is about to open, reduced until it still survives at 16px. Stacked frames
 * for C4's nesting, two lifelines and a message for a sequence, a rhombus for
 * a flowchart, an actor against an ellipse for a use case. The pair that most
 * needs care is the timeline and the lifecycle — both are one ordered spine,
 * and the returning branch is the only thing that separates them, so it is
 * drawn returning rather than ending.
 *
 * WHY THE COLOURS. Each is a token the kind's own canvas already paints with,
 * so a mark here and the diagram it opens agree without anything having to
 * keep them in step by hand. Where a kind assigns no meaning to colour, the
 * note on its entry says which of its canvas's marks the token was taken from
 * and why that one.
 *
 * `KIND_ORDER` is the ONE running order for the nine — the demo index's
 * sections and jump bar, and the playground's sample menu. A list written out
 * per surface is how the sample menu came to be missing the lifecycle for a
 * whole release: a hardcoded list cannot notice the thing it has never heard
 * of, which is the failure `codebase.md` names in so many words.
 */

export const KIND_MARK: Record<
  SeedKind,
  { short: string; accent: string; Glyph: () => React.JSX.Element }
> = {
  c4: { short: "C4 models", accent: "var(--primary)", Glyph: C4Glyph },
  sequence: {
    short: "Sequence diagrams",
    accent: "var(--accent)",
    Glyph: SequenceGlyph,
  },
  flowchart: {
    short: "Flowcharts",
    accent: "var(--flow-decision-border)",
    Glyph: FlowchartGlyph,
  },
  usecase: {
    short: "Use cases",
    accent: "var(--uc-actor-border)",
    Glyph: UseCaseGlyph,
  },
  er: {
    short: "ER diagrams",
    accent: "var(--node-database-border)",
    Glyph: ErGlyph,
  },
  dict: {
    short: "Data dictionaries",
    accent: "var(--node-queue-border)",
    Glyph: DictGlyph,
  },
  /* `--gantt-critical` rather than a state fill: the critical path is what the
     gantt canvas tints, so the section rule and the jump-bar mark wear the
     same colour a reader will meet inside the diagram. */
  gantt: {
    short: "Gantt charts",
    accent: "var(--gantt-critical)",
    Glyph: GanttGlyph,
  },
  /* `--primary` because that is what the timeline canvas rings every dot
     with, and it is the only accent that canvas has: this kind assigns no
     meaning to colour, so there is no state fill or role tint to borrow. */
  timeline: {
    short: "Milestone timelines",
    accent: "var(--primary)",
    Glyph: TimelineGlyph,
  },
  /* `--edge` rather than `--primary`, which the timeline above already takes:
     these two are the pair a reader is most likely to confuse (both are one
     ordered spine), so their marks must not also share a colour. And the
     lifecycle canvas's own second mark IS the connector — the returning
     branch is what it has that a timeline does not — so `--edge` is the token
     it actually wears rather than a colour picked to be different. */
  lifecycle: {
    short: "Lifecycles",
    accent: "var(--edge)",
    Glyph: LifecycleGlyph,
  },
};

/**
 * The one running order for the nine notations.
 *
 * `satisfies` rather than a `readonly SeedKind[]` annotation, so the tuple
 * keeps its literal member types and `KindsMissingFromOrder` below can see
 * which kinds are in it. Annotating it widens every member to `SeedKind` and
 * the guard silently becomes vacuous.
 */
export const KIND_ORDER = [
  "c4",
  "sequence",
  "flowchart",
  "usecase",
  "er",
  "dict",
  "gantt",
  "timeline",
  "lifecycle",
] as const satisfies readonly SeedKind[];

/**
 * A NOTATION LEFT OUT OF `KIND_ORDER` IS A TYPE ERROR, not a page that quietly
 * stops offering it.
 *
 * `KIND_MARK` is a total `Record`, so a new kind cannot be added to `SeedKind`
 * without giving it a glyph — the compiler already insists. The running order
 * had no such guard: it is an array, and an array that is one short of a union
 * is a perfectly good array. That is exactly how the playground's sample menu
 * came to be missing the lifecycle, and how this list would have gone the same
 * way the moment a tenth notation shipped.
 *
 * The constraint on `AssertNoneMissing` is what does the work, and the obvious
 * spelling does NOT: `const x: Missing[] = []` was written here first and
 * passed with the lifecycle deleted, because an empty array is assignable to
 * `"lifecycle"[]`. A guard that cannot fail is worse than none — it reports
 * coverage it does not have — so this one was proved by deleting a kind and
 * watching `pnpm typecheck` go red before it was trusted.
 */
type AssertNoneMissing<T extends never> = T;
type KindsMissingFromOrder = Exclude<SeedKind, (typeof KIND_ORDER)[number]>;
export type EveryKindIsOrdered = AssertNoneMissing<KindsMissingFromOrder>;
/** C4's nesting: a frame holding a frame. */
function C4Glyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="1.2" y="2.6" width="13.6" height="10.8" rx="2.2" />
      <rect x="4.4" y="5.6" width="7.2" height="4.8" rx="1.4" />
    </svg>
  );
}

/** A sequence: two lifelines and the message between them. */
function SequenceGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M3.4 2v12M12.6 2v12" strokeDasharray="2 2" />
      <path d="M3.4 7.4h9.2M10.6 5.6l2 1.8-2 1.8" />
    </svg>
  );
}

/** A use case: a stick figure beside an ellipse. The pairing is the whole
 * tell — an actor against the system's edge is what no other kind draws. */
/** An ER diagram: two tables, ruled under their headers, and the line
 * between them ending in a crow's foot. */
/** A dictionary: a heading rule and three ruled rows — a table of text. */
function DictGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M2 3.5h12M2 6.6h5M9.6 6.6h4.4M2 9.5h5M9.6 9.5h4.4M2 12.4h5M9.6 12.4h4.4" />
    </svg>
  );
}

/** A gantt: two bars on a measured rail, the second starting where the
 * first ends, and the elbow that says it could not start sooner. The offset
 * pair is the whole tell — a single bar is a progress meter. */
function GanttGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M1.4 3.2h13.2" strokeDasharray="0.1 3.3" />
      <rect x="1.4" y="5.4" width="6.6" height="2.8" rx="1" />
      <path d="M8 6.8h1v4.6h1" />
      <rect x="10" y="10" width="4.6" height="2.8" rx="1" />
    </svg>
  );
}

/** A milestone timeline: a vertical spine with three dots on it and a label
 * beside each. Vertical is the whole tell — every other glyph here runs
 * across, and so does the gantt's, which is the one this must not be mistaken
 * for. The dots are evenly spaced but the labels are not the same length,
 * because the bands are sized by their content. */
function TimelineGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M4 2.4v11.2" />
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="4" cy="8" r="1.5" />
      <circle cx="4" cy="12" r="1.5" />
      <path d="M7.4 4h7.2M7.4 8h4.4M7.4 12h6" />
    </svg>
  );
}

/** A lifecycle: a vertical spine of three dots with ONE branch leaving it and
 * curving back. The branch is the whole tell — it is what separates this from
 * the timeline glyph directly above, which is the same spine without one, and
 * it is drawn returning rather than ending so the mark says "goes back" at
 * 16px. */
function LifecycleGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 2.6v10.8" />
      <circle cx="11" cy="4" r="1.4" />
      <circle cx="11" cy="8" r="1.4" />
      <circle cx="11" cy="12" r="1.4" />
      <path d="M11 12H4.2V6H11" />
    </svg>
  );
}

function ErGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <rect x="1" y="3" width="5.2" height="6" rx="1" />
      <path d="M1 5.2h5.2" />
      <rect x="9.8" y="7" width="5.2" height="6" rx="1" />
      <path d="M9.8 9.2h5" />
      <path d="M6.2 6.1h1.8v3.9h1.8M8 8.6l1.8 1.4M8 11.4l1.8-1.4" />
    </svg>
  );
}

function UseCaseGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <circle cx="4.2" cy="3.4" r="1.5" />
      <path d="M4.2 4.9v3.4M2.2 6.6h4M4.2 8.3l-1.7 3.2M4.2 8.3l1.7 3.2" />
      <ellipse cx="11.4" cy="8" rx="3.4" ry="2.4" />
    </svg>
  );
}

/** A flowchart: a step, a decision below it, and the branch leaving the
 * diamond. The rhombus is the whole tell — it is what no other kind draws. */
function FlowchartGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <rect x="4.6" y="1.6" width="6.8" height="3.4" rx="0.8" />
      <path d="M8 5v2.2" />
      <path d="M8 7.6l3 2.6-3 2.6-3-2.6z" />
      <path d="M8 12.8v1.6" />
    </svg>
  );
}
