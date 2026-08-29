/**
 * The gantt the playground opens with.
 *
 * KEPT AS `.alab` TEXT, not as a built model object, for the reason
 * `features/er/input/example.ts` is: the seed then goes through the real
 * parser on its way to the canvas, so a grammar change that breaks this
 * document breaks the playground's first screen rather than sitting undetected
 * behind a hand-built object nothing validates.
 *
 * WHY THIS PLAN. A store migration, because it is the shape of work an
 * architecture tool's reader actually schedules — and because it exercises
 * every part of the notation without being contrived:
 *
 *   - Two items depend on one (`shadow` and `backfill` both wait on `audit`),
 *     which is what makes the topological row solve visible rather than
 *     theoretical.
 *   - One item has FLOAT. `backfill` finishes a day before `verify` can start,
 *     so it is not on the critical chain and its connector draws in the slack
 *     weight — a reader can see the distinction the float pass computed.
 *   - `archive` is DECLARED before nothing and depends only on `cutover`, so
 *     the row solve sinks it below `drop`. That is the sort doing real work,
 *     and it is what keeps its connector from crossing the dual-read chain.
 *   - All four states appear, so the palette is complete on the first screen
 *     rather than only in a document nobody opens.
 *   - Two milestones, one per phase boundary.
 *
 * `starts` is present, so the axis opens on real dates. Removing that one line
 * is the whole of switching to a relative axis, which is a thing worth being
 * able to demonstrate by deleting a line in front of someone.
 */

export const GANTT_EXAMPLE = `archlab 1.0 gantt
title "Order store migration"
description "Moving orders off the legacy store, and what blocks what"
starts 2026-09-07

@gantt
  section "Prepare"
    task audit "Schema audit" 5d done at 0
      desc "Read every column, write down what actually moves and what is dead."
    task shadow "Shadow writes" 13d active after audit
      desc "Write to both stores. The long pole, and the reason the cut-over date is what it is."
    task backfill "Historical backfill" 12d active after audit
      desc "Copy the history across. Has a day of float, so a slip here costs nothing."
    task verify "Verify parity" 6d at-risk after shadow, backfill
      desc "Compare both stores row by row. At risk: the comparison tool is not written yet."
    milestone parity "Parity signed off" after verify
  section "Cut over"
    task freeze "Freeze writes" 2d after verify
      desc "Reject writes to the legacy store. The only irreversible step."
    task cutover "Point traffic over" 3d after freeze
    milestone live "Traffic on new store" after cutover
  section "Retire"
    task dualread "Dual-read off" 4d after cutover
    task drop "Drop legacy tables" 6d after dualread
      desc "The end of the chain, and the date the whole plan is measured against."
    task archive "Archive dumps" 5d after cutover
      desc "Independent of the retirement chain, so it carries float and sinks below it."
`;
