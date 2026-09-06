# The sequence grammar

Part of the `alab` skill — open this when you are writing `archlab 1.0 sequence` — participants and messages.

## Sequence diagrams (a second document kind)

`.alab` describes TWO kinds of document, and the first line decides
which. Everything above is the C4 model grammar, opened by
`archlab 1.0`. A sequence diagram — participants and messages over
time — is opened by **`archlab 1.0 sequence`** and read by a different
parser. The two never mix: a C4 model has no messages, a sequence
document has no `@context`/`@container` levels, and feeding one to the
other's tool fails on line 1. Validate these with the
`validate_sequence` tool, not `validate_model`.

The body lives under a single `@sequence` block: participants first,
then the flow, in order.

```
archlab 1.0 sequence
title "Checkout"

@sequence
  autonumber
  cust:actor "Customer" @person
  web "Storefront" @nextjs [Next.js]
  api:participant "Order API" @golang [Go]

  cust -> web : "Clicks Place order"
  web ->+ api : "POST /orders" [HTTPS]
  api ..>- web : "201 Created"
```

Facts that are easy to get wrong:

- The label is introduced by **` : `** — `a -> b : "Label"`. A message
  without it does not parse.
- **An arrow is two independent choices**, not one name: a LINE STYLE
  (solid or dotted) and a HEAD STYLE (none, arrowhead, cross, open, or
  a head at each end). Ten arrows, one token each, and each converts
  to and from its Mermaid equivalent losslessly in both directions.
  The line says which way the step runs — `solid` is a call outward, `dotted` is a return or a callback — and the head says what happens when it arrives:

| Arrow | Line | Head | The head means | Mermaid |
| --- | --- | --- | --- | --- |
| `--` | solid | none | no direction claimed | `->` |
| `->` | solid | arrow | the sender waits on it | `->>` |
| `x>` | solid | cross | lost — it never arrives | `-x` |
| `~>` | solid | open | fire and forget | `-)` |
| `<->` | solid | bidirectional | both ways at once | `<<->>` |
| `..` | dotted | none | no direction claimed | `-->` |
| `..>` | dotted | arrow | the sender waits on it | `-->>` |
| `..x>` | dotted | cross | lost — it never arrives | `--x` |
| `..~>` | dotted | open | fire and forget | `--)` |
| `<..>` | dotted | bidirectional | both ways at once | `<<-->>` |

- **Activation rides the arrow**, not a separate line: `->+` opens the
  receiver's bar, `..>-` closes the sender's. So a call-and-return pair
  is `web ->+ api` … `api ..>- web`.
- A participant's kind is optional — `web "Storefront"` is a
  participant; `cust:actor "Customer"` draws the stick figure. Only
  `actor` and `participant` exist.
- `[Technology]` works on participants and on messages, same as C4.
- **A message takes a `desc "…"` continuation**, indented two spaces
  under it, exactly like a participant's. The label is the TITLE drawn
  on the arrow and should stay short; the `desc` holds the endpoint,
  payload or caveat, and the viewer shows it when the message is
  clicked. Prefer `"Call login API"` + a `desc` naming
  `POST /api/v1/basic/verify` over one long label. Notes take no
  `desc` — a note is already its own text.
- **A `desc` is a JSON string, so `\n` gives it several lines**, and the
  viewer renders it as a monospace block that keeps them. Write a
  request as method+path, then the body, then one line per status code
  — not as a paragraph. The escape keeps the source one physical line,
  so the file stays canonical. It can hold a whole runnable `curl`:
  escape `"` as `\"` and `\` as `\\`, or just JSON-stringify the
  command and paste the result. Budget: 500 characters.
- `autonumber` on its own line numbers every message.
- A message from a participant to itself draws a self-loop.

```
archlab 1.0 sequence
title "Message kinds"

@sequence
  web "Storefront"
  api:participant "Order API"
  queue:participant "Events" [Kafka]

  web -> api : "Call login API" [HTTPS]
    desc "POST /api/v1/basic/verify\nbody { email, password }\n200 → { token } (15 min)\n401 → bad credentials"
  api -> api : "Validates the cart"
  api ~> queue : "order.created" [Avro]
  queue ..> api : "ack"
  api x> queue : "stale.event (dropped)"
  api <-> queue : "Health handshake"
  queue ..~> api : "replay.offer"
  web -- api : "Shares a session cookie"
  note right api : "Retries are idempotent"
  note over api queue : "Both sides are at-least-once"
```

A `desc` carrying a complete request — this is what the escaping looks
like in practice, and it round-trips byte for byte:

```
archlab 1.0 sequence
title "Order intake"

@sequence
  web "Storefront" [Next.js]
  api:participant "Order API" [Go]

  web ->+ api : "Place the order" [HTTPS]
    desc "curl https://api.shopflow.dev/v1/orders \\\n  --request POST \\\n  --header 'Content-Type: application/json' \\\n  --header 'Authorization: Bearer $SHOPFLOW_TOKEN' \\\n  --data '{\n    \"cart_id\": \"cart_8f21c3\",\n    \"address_id\": 4102,\n    \"coupon\": null\n  }'\n\n201 → { order_id }   409 → the cart changed under us"
  api ..>- web : "201 Created"
```

**Choosing between a `desc` and a `note`.** They are not
interchangeable, and picking wrong is the main way a valid document
renders badly:

- `desc` — belongs to ONE message, hidden until a reader clicks that
  message, and **never measured**, so any amount of detail costs no
  width. Use it for the endpoint, the payload, the status codes, the
  header names: everything true of that one step.
- `note` — always visible, wraps to a box, and costs VERTICAL space in
  the flow. Use it for what is true across several steps: an ordering
  hazard, a trap in the API, an invariant. A long note is fine — notes
  wrap — so write one note, not three.

**Keep labels shorter than their arrow.** Column gaps are capped, so a
label much wider than its own arrow is drawn OVER the neighbouring
lifelines. `validate_sequence` reports how many labels do this and
which are worst; the fix is always the same — verb phrase on the wire,
detail in the `desc`.

**Fragments nest by INDENTATION and there is no `end` keyword** — this
is the single biggest difference from Mermaid, whose `end` lines have
no equivalent here. `alt`/`else`, `par`/`and`, `critical`/`option`,
`opt`, `loop` and `break` open a block; what belongs to it is what is
indented under it.

```
archlab 1.0 sequence
title "Branching"

@sequence
  web "Storefront"
  api:participant "Order API"
  pay:participant "Payments"

  alt "card accepted"
    api ->+ pay : "Create charge" [REST]
    pay ..>- api : "charge.succeeded"
    par "receipt"
      api ~> web : "Emails the receipt"
    and "audit"
      api -> api : "Writes audit row"
  else "card declined"
    api ..> web : "402 Payment Required"
  opt "first purchase"
    web -> web : "Shows onboarding tips"
```

**Grouping without control flow.** `box` brackets a contiguous run of
lifelines and takes its members as the participant lines nested INSIDE
it; `rect` highlights a run of steps. Both take an optional
`tint=#rrggbb` (or `rgb(…)`, or a common colour name — all normalised
to one spelling). Neither changes what happens; both survive a Mermaid
import unchanged.

```
archlab 1.0 sequence
title "Grouped and highlighted"

@sequence
  box "Front of house" tint=#bfdfff
    cust:actor "Customer"
    web "Storefront"
  box "Payments" tint=#ffe4e1
    pay:participant "Payments"
    ledger:participant "Ledger"

  cust -> web : "Places the order"
  rect tint=#bfdfff
    web -> pay : "Create charge" [REST]
    pay -> ledger : "Post entry"
  critical "Capture the funds"
    pay ..> web : "charge.succeeded"
  option "gateway timeout"
    pay ..> web : "retry scheduled"
  break "card declined"
    pay ..> web : "402 Payment Required"
```

Mermaid `sequenceDiagram` code can be imported instead of authored —
pass it to `validate_sequence` or `format_sequence` and it is detected
automatically. That import is ONE-WAY and lossy; the response names
what was dropped.

---

*Generated from arch-lab's syntax reference — do not edit by hand.*
*Regenerate with `pnpm build:skill`.*
