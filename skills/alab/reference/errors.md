# What errors look like

Part of the `alab` skill — open this when the parser rejected your file and you want to read its message.

## What errors look like

A parse is all-or-nothing and every failure is located:
`line <n>, column <n>: <message>`. Real examples, with the parser's
exact output:

**A node type the format does not know**

```
archlab 1.0
title "Broken"

@context ctx-root "Broken"
  api:blob "API"
```

→ `line 5, column 7: "blob" is not a node type — expected person, system, external, container, database, queue, component or code`

**A node type that is real, but illegal at this level**

```
archlab 1.0
title "Broken"

@context ctx-root "Broken"
  db:database "Orders DB"
```

→ `line 5, column 6: "database" is not valid at level "context" — valid types here: person, system, external`

**Indentation that is not 0, 2 or 4 spaces**

```
archlab 1.0
title "Broken"

@context ctx-root "Broken"
   api:person "API"
```

→ `line 5, column 4: inconsistent indentation of 3 spaces — expected 0 (header or "@" diagram), 2 (diagram body), 4 (node/edge continuation or "beat") or 6 (a beat's chain line)`

**An edge whose endpoint is not a node in this diagram**

```
archlab 1.0
title "Broken"

@context ctx-root "Broken"
  cust:person "Customer"

  cust -> ghost : "Uses"
```

→ `line 7, column 11: the target "ghost" does not resolve to a node in this diagram`

**A trailing comment — comments must be full lines**

```
archlab 1.0
title "Broken" // not allowed here
```

→ `line 2, column 16: unexpected text after the "title" line`

**A string that is never closed**

```
archlab 1.0
title "Broken"

@context ctx-root "Broken
```

→ `line 4, column 19: the string for the diagram title opened here is never closed — expected a closing '"'`

**A file without a title**

```
archlab 1.0

@context ctx-root "Untitled"
```

→ `line 1, column 1: the file has no title — add a line like: title "My System"`

---

*Generated from arch-lab's syntax reference — do not edit by hand.*
*Regenerate with `pnpm build:skill`.*
