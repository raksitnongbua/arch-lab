# The gantt grammar

Part of the `alab` skill — open this when you are writing `archlab 1.0 gantt` — durations and dependencies.

## Gantt charts (`archlab 1.0 gantt`)

A plan: how long each piece takes and what cannot start until
something else is done. Opened by **`archlab 1.0 gantt`**, read by its
own parser, validated with `validate_gantt`.

```
archlab 1.0 gantt
title "Order store migration"
starts 2026-09-07

@gantt
  section "Prepare"
    task audit "Schema audit" 5d done at 0
      desc "Read every column, write down what actually moves."
    task shadow "Shadow writes" 13d active after audit
    task verify "Verify parity" 6d at-risk after shadow
    milestone parity "Parity signed off" after verify
  section "Cut over"
    task cutover "Point traffic over" 3d after parity
```

What is easy to get wrong:

- **`starts <YYYY-MM-DD>` is the whole difference between a calendar
  axis and a relative one.** With it, bars are dated; without it they
  are numbered periods. Nothing else about the document changes:

```
archlab 1.0 gantt
title "Order store migration"

@gantt
  section "Prepare"
    task audit "Schema audit" 5d done at 0
    task shadow "Shadow writes" 13d active after audit
    task backfill "Historical backfill" 12d after audit
    milestone parity "Parity signed off" after shadow, backfill
```

- **There is no `crit` keyword.** The critical path is DERIVED — the
  chain with no float, computed from the durations and the `after`
  edges — so it cannot disagree with the plan. `validate_gantt` reports
  it back to you; declaring it is not possible and would not be true.
- `task` has a length, `milestone` is a point. A milestone with a
  duration does not parse.
- `after` takes a comma-separated list, and an item waits for all of
  them. `at <n>` pins a start instead.

---

*Generated from arch-lab's syntax reference — do not edit by hand.*
*Regenerate with `pnpm build:skill`.*
