# The timeline grammar

Part of the `alab` skill — open this when you are writing `archlab 1.0 timeline` — what happened, and when.

## Timelines (`archlab 1.0 timeline`)

What happened, when, and which period it happened in. Opened by
**`archlab 1.0 timeline`**, validated with `validate_timeline`.

```
archlab 1.0 timeline
title "How the platform grew"

@timeline
  period "2016"
    event "Two people and a prototype"
      desc "One Rails app on one box, deployed by hand on Friday afternoons."
  period "2018"
    event "First paying customer"
    event "Split the monolith into an API and a web app"
  period "2024"
    event "Opened the public API" #platform
    event "First region outside Europe"
```

The grammar is two keywords, `period` and `event`, and the one nested
`desc`. What has to be learned is not what it has but what it REFUSES,
because every refusal is something a reader arriving from a plan tool
reaches for first — and an absence is invisible in a working example:

```
archlab 1.0 timeline
title "What a timeline will not hold"

@timeline
  period "Any label — a year, a quarter, a phrase"
    // An event is a POINT. It carries its label and "#tag"s, nothing else.
    event "What happened"
      desc "The one nested slot: a note, drawn under the label."
    // Each of these is refused by name, and each points at the gantt:
    //   event "Migration" 5d          — no duration; a point has no length
    //   event "Cutover" after freeze  — no dependency; nothing waits here
    //   event "Rewrite" at 12         — no start; nothing is measured
    //   event "Rollout" active        — no state; this is what already happened
    // If the work has lengths and prerequisites, write "archlab 1.0 gantt".
    event "What happened next"
```

If the work has lengths and prerequisites, it is a gantt. The parser
says so by name rather than failing generically.

---

*Generated from arch-lab's syntax reference — do not edit by hand.*
*Regenerate with `pnpm build:skill`.*
