---
paths:
  - "src/**/*.{ts,tsx}"
  - "src/**/*.css"
  - "scripts/**/*.mjs"
---

# Comment Rules

This codebase comments unusually heavily and deliberately. Match that register — comments here carry DECISIONS, not narration.

## Write why, not what

- Explain the reason, the constraint, or the alternative rejected. The code already says what it does.
- Record what was tried and failed. "Marching them was tried and was wrong: giving a solid arrow a dasharray makes it read as async-or-reply" is worth more than any restatement.
- Name the failure mode a rule prevents, so a future reader can weigh it: what breaks if this is "simplified" back.
- Do not restate a type or a signature that TypeScript already states.

## A comment is not a substitute for a name

- If a comment exists only because a value or step is unnamed, name the thing and delete the comment. A magic number with an explanatory comment should be a named constant; a commented block inside a long function should be an extracted function.
- If a comment exists to apologise for duplication, remove the duplication instead (see `dry.md`).
- Positional tuples documented by a comment (`/** [from, to, y] */`) should be an object with named fields.

## Comments must stay true

- When you change code, update every comment that describes it — including ones in other files that reference it. Reordering the navbar means rewriting the ordering rationale, not leaving it.
- Never let a comment assert a coupling that nothing enforces. Either make it real (import the shared value), or pin it with a `check:*` script, or say plainly that it is maintained by hand and where the twin lives.
- Delete comments describing behaviour that no longer exists, rather than leaving them as history.
- A doc comment must sit directly above the declaration it describes — check this after moving code.

## Where each kind of comment goes

- **File header** (`/** … */` at the top): what this module is for, the model it implements, and the decisions a reader must not undo. Most modules here have one; new modules should too.
- **Doc comment** (`/** … */` on an export): the contract — what a caller may rely on, defaults, and units. State units when a number has them (`ms`, px, a multiplier vs a pixel width).
- **Inline** (`//`): a local surprise — why this branch, why this order, why not the obvious alternative.
- **Section banner**: only for genuinely separate concerns within a file. If a file needs many, that is a signal to split it, not to add more banners.

## Specific to this repo

- Cite the decision or story ID where one exists (`AF-E1-S3`, `D20`, `§4.2`, `dev-handoff.md`) so a reader can find the full rationale.
- When a value is duplicated across TypeScript and CSS because CSS cannot import, say so and name the `check:*` script that pins them together.
- When motion or animation is involved, state the reduced-motion behaviour and whether it is handled in JS or by media query — first-paint animations cannot rely on JS-written custom properties.
- User-facing and agent-facing strings are contracts. Comment on why the wording is what it is when it is load-bearing, and never leave prose that contradicts the constant behind it.

## Do not

- Do not add commented-out code. Delete it; git has it.
- Do not add `TODO` without context — say what, why, and what unblocks it, or leave it out.
- Do not narrate obvious operations (`// increment the counter`).
- Do not write a comment you would have to update on every unrelated edit nearby.
