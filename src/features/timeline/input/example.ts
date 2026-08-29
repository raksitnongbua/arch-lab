/**
 * The timeline the playground opens with.
 *
 * KEPT AS `.alab` TEXT, not as a built model object, for the reason
 * `features/gantt/input/example.ts` is: the seed then goes through the real
 * parser on its way to the canvas, so a grammar change that breaks this
 * document breaks the playground's first screen rather than sitting undetected
 * behind a hand-built object nothing validates.
 *
 * WHY THIS HISTORY. A company's own story, because it is the shape of thing an
 * architecture tool's reader actually keeps a timeline of — the "how did we
 * get here" slide at the front of a review — and because it exercises the two
 * properties the layout is built for without being contrived:
 *
 *   - PERIODS OF VERY DIFFERENT SIZES. One event in the first band, five in
 *     the fourth. The bands' heights are solved from their events, so a reader
 *     can see at a glance that more happened later — which a fixed row pitch
 *     would flatten into the opposite claim.
 *   - LABELS OF VERY DIFFERENT LENGTHS, including one that wraps and several
 *     with descriptions under them. That is the case the vertical
 *     layout exists for; a horizontal one would have about eight characters
 *     per event to draw them in.
 *
 * There is deliberately nothing in it that a gantt would draw better: no
 * durations, no dependencies, nothing in flight. If a future edit adds one,
 * the seed has stopped demonstrating this notation and started demonstrating
 * the case for the other one.
 */

export const TIMELINE_EXAMPLE = `archlab 1.0 timeline
title "How the platform grew"
description "Ten years of the product, and the order it happened in"

@timeline
  period "2016"
    event "Two people and a prototype"
      desc "A single Rails app on one box, deployed by hand on Friday afternoons."
  period "2018"
    event "First paying customer"
    event "Split the monolith into an API and a web app"
      desc "The first time anything was called a service. Nothing was extracted for another two years."
  period "2021"
    event "Moved the order store off the shared database"
    event "Hired the first platform engineer"
    event "The Friday deploy freeze ended"
      desc "Continuous delivery landed, and with it the first real staging environment."
  period "2024"
    event "Opened the public API"
      desc "Three customers built on it in the first month, which set the compatibility policy the team still keeps to."
    event "Acquired the reporting team, and with them a second data pipeline that counted every one of the same numbers slightly differently"
      desc "Reconciled over the following year, which is how long it takes two teams to agree what an order is."
    event "First region outside Europe" #infra
    event "Rewrote the billing service"
    event "Ten million orders in a single month"
`;
