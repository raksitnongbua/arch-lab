/**
 * What a connection drag will do if released right now — the ONE table every
 * part of the gesture reads from.
 *
 * The bug this exists to prevent is the one that made the gesture confusing in
 * the first place: the preview line, the target highlight, the caption, the
 * screen-reader announcement and the commit path each decided for themselves
 * what was about to happen, so they could disagree — and they did. Releasing
 * on a node's body produced a "create a new element" menu while the line under
 * the cursor said nothing at all. One verdict, derived once per target change,
 * drives all five.
 *
 * Deliberately NOT a boolean. "Can I drop here?" has four different answers
 * that deserve four different treatments, and collapsing them to valid/invalid
 * is what forces every consumer to re-derive the nuance it actually needs:
 *
 *   - `relate`    — a new relationship. The common case.
 *   - `duplicate` — legal, and sometimes right (A "reads" B alongside A
 *                   "writes" B), but far more often a second attempt at a
 *                   connection the user thought had failed. A caution, never a
 *                   refusal: `edge-geometry.ts` deliberately supports parallel
 *                   edges, and blocking them here would remove a real feature
 *                   to paper over a discoverability problem.
 *   - `create`    — released over empty canvas; the quick-add menu takes over.
 *   - `cancel`    — released back on the source. Returning to where a gesture
 *                   started is the universal abort, so it is styled as a
 *                   neutral escape hatch and NOT as an error. Painting it
 *                   `--destructive` would teach people that backing out is a
 *                   mistake.
 *
 * Colour roles are chosen to stay out of the way of what the canvas already
 * says. `--primary` and `--ring` resolve to the same value and already mean
 * "selected" and "hovered", so a `--primary` valid-target highlight is
 * invisible next to a selected node. Hence `--success` for the target.
 *
 * Every verdict also carries a dash pattern, because colour is never the only
 * carrier of meaning (WCAG 1.4.1) — and because a static dash reads as
 * "provisional" in both motion modes, where a marching-ants animation would
 * have no honest frame to park on under `prefers-reduced-motion`.
 *
 * Pure: no React, no DOM, no store. Takes the facts, returns the verdict.
 */

import type { C4Diagram } from "@/types";

export type ConnectVerdict = "relate" | "duplicate" | "create" | "cancel";

export interface ConnectVerdictStyle {
  /** CSS custom property the preview line and caption are painted with. */
  token: string;
  /** `stroke-dasharray` for the preview line. `null` ⇒ solid. */
  dash: string | null;
  /** Whether the preview carries the arrowhead the committed edge would. */
  arrow: boolean;
}

export const CONNECT_VERDICT: Readonly<
  Record<ConnectVerdict, ConnectVerdictStyle>
> = {
  relate: { token: "var(--success)", dash: null, arrow: true },
  duplicate: { token: "var(--warning)", dash: "6 4", arrow: true },
  create: { token: "var(--accent)", dash: "6 4", arrow: false },
  cancel: { token: "var(--muted-foreground)", dash: "2 4", arrow: false },
};

export interface VerdictInput {
  sourceNodeId: string;
  /** The node under the pointer, or null over empty canvas. */
  targetNodeId: string | null;
  diagram: Pick<C4Diagram, "edges">;
}

export function verdictFor({
  sourceNodeId,
  targetNodeId,
  diagram,
}: VerdictInput): ConnectVerdict {
  if (targetNodeId === null) return "create";
  if (targetNodeId === sourceNodeId) return "cancel";
  // Unordered: A→B already existing makes a new B→A a duplicate too. The two
  // draw as parallel curves on the same pair, which is exactly the thing the
  // reader would need warning about.
  const related = diagram.edges.some(
    (edge) =>
      (edge.source === sourceNodeId && edge.target === targetNodeId) ||
      (edge.source === targetNodeId && edge.target === sourceNodeId),
  );
  return related ? "duplicate" : "relate";
}

/**
 * The one sentence shown in the hint AND announced to a screen reader.
 *
 * Deliberately one string for both. They were two, and they drifted: the
 * visible hint said "release on another element to connect" while the toast on
 * an invalid drop talked about self-relationships. A caption that cannot
 * disagree with its own announcement is worth the small awkwardness of writing
 * it for two audiences at once.
 */
export function captionFor(
  verdict: ConnectVerdict,
  sourceName: string,
  targetName: string | null,
): string {
  switch (verdict) {
    case "relate":
      return `Relate ${sourceName} to ${targetName ?? "this element"}`;
    case "duplicate":
      return (
        `${sourceName} and ${targetName ?? "this element"} are already ` +
        "related — this adds a second relationship"
      );
    case "create":
      return `Release to add a new element related to ${sourceName}`;
    case "cancel":
      return "Release to cancel";
  }
}
