/**
 * The catalogue — what this MCP server offers, as pure data.
 *
 * This module is the SECOND public entry point of the `mcp` feature, and the
 * client-safe one. `./index.ts` pulls in the MCP SDK and must only ever be
 * imported by the route handler; the `/mcp` page and any other UI import this
 * file instead, so no page bundle drags a protocol server into the browser.
 *
 * It is also the single source of truth for tool names and prose:
 * `./server.ts` registers from it, the `/mcp` page documents from it, and
 * `scripts/mcp-check.mjs` asserts the two can never disagree — a documented
 * tool that isn't registered (or vice versa) fails the check.
 *
 * No React, no zod, no SDK — importable from anywhere. The one import is the
 * syntax section ids, so the `get_syntax_reference` argument documentation is
 * generated from the sections that actually exist.
 */

// Both imports here stay on the pure-data side, so the "no React, no zod, no
// SDK" promise above still holds and the `/mcp` page's bundle is unaffected:
// `content/syntax-sections` reaches only the snippets module and, through it,
// `@/lib/constants` (plain values), while `lib/limits` imports nothing at all.
import { SYNTAX_SECTION_IDS } from "./content/syntax-sections";
import { MAX_SOURCE_CHARS } from "./lib/limits";

/**
 * The size ceiling as the tool descriptions state it.
 *
 * Interpolated rather than typed out: these descriptions ARE the contract every
 * agent reads, so a raised limit with a stale number here would have the server
 * advertising a rule it no longer enforces. Same formatting as the refusal in
 * `guardSourceSize`, so the number an agent is told matches the number it is
 * told off with.
 */
const MAX_SOURCE_CHARS_TEXT = `max ${MAX_SOURCE_CHARS.toLocaleString("en-US")} characters`;

/** Where the server lives, relative to the site root. */
export const MCP_ENDPOINT_PATH = "/api/mcp";

/** The name clients see in their server list. */
export const MCP_SERVER_NAME = "arch-lab";

export const MCP_SERVER_VERSION = "0.1.0";

/** Absolute endpoint URL for a given site origin. */
export function mcpEndpointUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${MCP_ENDPOINT_PATH}`;
}

/* -------------------------------------------------------------------------- */
/* Release status                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The integration is in **beta**, and says so everywhere it is offered: the
 * navbar entry, the `/mcp` page, and the server's own `initialize`
 * instructions — so an agent that connects without a human ever visiting the
 * page still learns that tool names and response shapes may move under it.
 *
 * One constant, read by all three, because a status that is true in one place
 * and stale in another is worse than no status at all.
 */
export const MCP_STATUS_LABEL = "Beta";

/**
 * What beta actually means here, in commitments rather than adjectives. Vague
 * "this may change" wording tells a reader nothing they can plan around; this
 * separates what is safe to depend on from what is not.
 */
export const MCP_BETA_NOTICE =
  "This integration is in beta. The endpoint URL and the .alab format itself " +
  "are stable — the format's round-trip guarantees are proven on every build " +
  "— but tool names, arguments and the wording of responses may still change, " +
  "and there is no protocol-level versioning to smooth that over yet. Pin " +
  "nothing to the exact text of a response, and expect to re-read this page " +
  "after an upgrade.";

/** The same commitment, compressed for the server's `initialize` payload. */
export const MCP_BETA_NOTICE_SHORT =
  "This server is in beta: the endpoint URL is stable, but tool names, " +
  "arguments and response wording may change without a version bump.";

/* -------------------------------------------------------------------------- */
/* Tools                                                                       */
/* -------------------------------------------------------------------------- */

export interface McpArgDoc {
  name: string;
  required: boolean;
  /** What it does, and its default when optional. */
  description: string;
}

export interface McpToolDoc {
  /** The protocol name — must match `server.ts` exactly. */
  name: string;
  /** Human-facing title shown in client UIs. */
  title: string;
  /**
   * The description the MODEL reads when deciding whether to call it. Written
   * for that audience: what it does, when to reach for it, what it does not do.
   */
  description: string;
  args: readonly McpArgDoc[];
}

/** Shared by every tool that takes model text. */
const SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description: `The model text: .alab, arch-lab JSON, or Mermaid C4 (${MAX_SOURCE_CHARS_TEXT}).`,
};

/**
 * The sequence tools' source argument. Separate from SOURCE_ARG because the
 * accepted languages genuinely differ — a sequence document is `.alab`
 * sequence or Mermaid `sequenceDiagram`, never arch-lab JSON (there is no JSON
 * form for sequence documents yet) and never Mermaid C4. Reusing SOURCE_ARG
 * would advertise inputs these tools reject.
 */
const SEQUENCE_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    "The sequence diagram text: `.alab` sequence (first line " +
    "`archlab 1.0 sequence`) or Mermaid `sequenceDiagram` code " +
    `(${MAX_SOURCE_CHARS_TEXT}). The format is detected from the first ` +
    "meaningful line.",
};

/**
 * `create_share_link` reads BOTH document kinds — the codec packs arbitrary
 * text, and the route (`/view/c4` vs `/view/sequence`) is what makes a link a
 * C4 or a sequence one — so its source argument must advertise both input
 * languages where SOURCE_ARG and SEQUENCE_SOURCE_ARG each name only their own.
 */
const SHARE_SOURCE_ARG: McpArgDoc = {
  name: "source",
  required: true,
  description:
    `The document text (${MAX_SOURCE_CHARS_TEXT}). C4 models: .alab, arch-lab ` +
    "JSON, or Mermaid C4. Sequence diagrams: `.alab` sequence (first line " +
    "`archlab 1.0 sequence`) or Mermaid `sequenceDiagram`. The kind is " +
    "detected from the first meaningful line.",
};

const FORMAT_ARG: McpArgDoc = {
  name: "format",
  required: false,
  description:
    'Force a reading: "alab", "json" or "mermaid". Defaults to "auto", ' +
    "which reads the first meaningful line to decide.",
};

export const MCP_TOOLS: readonly McpToolDoc[] = [
  {
    name: "validate_model",
    title: "Validate a model",
    description:
      "Check whether model text is valid, and if not, exactly where it " +
      "breaks. Runs the real arch-lab parser and reports the line, column " +
      "and offending source line, so a failure can be fixed directly. On " +
      "success, reports what the model contains (diagrams, levels, counts) " +
      "rather than echoing it back, plus any C4 review notes — missing " +
      "technologies, unlabelled or vague relationships, bidirectional lines " +
      "— which do not affect validity but are what a reviewer will raise. " +
      "Use this after writing or editing any .alab file: it is the fastest " +
      "way to confirm the result is both loadable and worth reviewing.",
    args: [SOURCE_ARG, FORMAT_ARG],
  },
  {
    name: "format_model",
    title: "Format a model canonically",
    description:
      "Rewrite a model in its own format's canonical form — the exact bytes " +
      "arch-lab itself would write, so diffs stay minimal and reviewable. " +
      "Reports when the input was already canonical, so a no-op write can " +
      "be skipped. Refuses Mermaid, which has no canonical form here.",
    args: [SOURCE_ARG, FORMAT_ARG],
  },
  {
    name: "validate_sequence",
    title: "Validate a sequence diagram",
    description:
      "Check whether SEQUENCE diagram text is valid, and if not, exactly " +
      "where it breaks. Reads `.alab` sequence documents (first line " +
      "`archlab 1.0 sequence`) and pasted Mermaid `sequenceDiagram` code, " +
      "reporting the line, column and offending source line on failure. On " +
      "success it summarises what the flow contains — participants, messages " +
      "split by kind, self-messages, how many messages carry a `desc` detail, " +
      "fragments and their nesting depth, notes, and a FIT report — the " +
      "rendered pixel size plus any labels too wide for their own arrow, " +
      "which is the one defect a parse cannot see and a caller cannot look " +
      "at — rather than echoing the document back. Use this for message " +
      "flows over time; use `validate_model` for C4 structure diagrams. " +
      "Passing a C4 document here says so and points you at the right tool.",
    args: [SEQUENCE_SOURCE_ARG],
  },
  {
    name: "format_sequence",
    title: "Format a sequence diagram canonically",
    description:
      "Rewrite sequence text as canonical `.alab` sequence — the exact bytes " +
      "arch-lab would write, so diffs stay minimal. Also the way to turn a " +
      "pasted Mermaid `sequenceDiagram` into an `.alab` sequence document, " +
      "which is a one-way lossy import: the response names what was dropped. " +
      "Worth a call after writing a message `desc`, which is a JSON string and " +
      "therefore the one place hand-escaping goes wrong: this reports the bad " +
      "escape with a line and column, and returns the canonical single-line " +
      "form when it is right.",
    args: [SEQUENCE_SOURCE_ARG],
  },
  {
    name: "convert_model",
    title: "Convert between formats",
    description:
      "Convert a C4 model to .alab, arch-lab JSON, or Mermaid C4. .alab and " +
      "JSON are lossless in both directions. Mermaid is a one-way, lossy " +
      "export of a SINGLE diagram (geometry, tags, icons, drill-down links " +
      "and traceability are dropped) — good for embedding a picture in a " +
      "README, never as a source of truth. C4 models only: a sequence " +
      "document has no Mermaid export here (Mermaid sequenceDiagram is " +
      "import-only, via format_sequence) — sequence documents travel as " +
      ".alab text.",
    args: [
      SOURCE_ARG,
      FORMAT_ARG,
      {
        name: "to",
        required: true,
        description: 'Target format: "alab", "json" or "mermaid".',
      },
      {
        name: "diagram_id",
        required: false,
        description:
          'Which diagram to emit, for to="mermaid" only. Defaults to the ' +
          "model's root diagram.",
      },
    ],
  },
  {
    name: "describe_model",
    title: "Describe a model's structure",
    description:
      "Read the shape of a model without paying for its full text: " +
      "metadata, totals, and the drill-down hierarchy of diagrams. Use this " +
      "to orient in an unfamiliar model, or to find which diagram a change " +
      "belongs in, before fetching or editing anything.",
    args: [
      SOURCE_ARG,
      FORMAT_ARG,
      {
        name: "include_contents",
        required: false,
        description:
          "Also list every boundary, node and edge of every diagram, in " +
          ".alab form. Defaults to false, which returns the hierarchy only.",
      },
    ],
  },
  {
    name: "get_syntax_reference",
    title: "Get the .alab syntax reference",
    description:
      "The .alab grammar, generated from examples that are verified against " +
      "the real parser on every build. Read this BEFORE writing .alab by " +
      "hand — the format has significant indentation and order-free " +
      "attributes that are easy to guess wrong. Also available as the " +
      "resource archlab://syntax.",
    args: [
      {
        name: "section",
        required: false,
        // DERIVED from the section ids, never typed out. This list was
        // hand-written once and had already gone stale — it did not mention
        // `sequence` — which is the exact failure the catalogue exists to
        // prevent for tool names, and it is how a caller ends up being told a
        // section exists that the tool then rejects. Adding a section to
        // `syntax-sections.ts` now updates this sentence, the /mcp page and
        // the tool's own schema at once; `check:mcp` asserts the two agree.
        description:
          `One of: ${SYNTAX_SECTION_IDS.join(", ")}. ` +
          "Omit for the whole reference.",
      },
    ],
  },
  {
    name: "list_example_models",
    title: "List example models",
    description:
      "List the complete, real C4 models arch-lab ships, with their sizes. " +
      "Use one as a pattern for idiomatic structure rather than inventing a " +
      "shape.",
    args: [],
  },
  {
    name: "get_example_model",
    title: "Get an example model",
    description:
      "Fetch one bundled example model in full, as .alab or arch-lab JSON.",
    args: [
      {
        name: "id",
        required: true,
        description:
          'The example\'s id, from list_example_models (e.g. "shopflow").',
      },
      {
        name: "format",
        required: false,
        description: 'Either "alab" (default) or "json".',
      },
    ],
  },
  {
    name: "create_share_link",
    title: "Create a share link",
    description:
      "Turn a C4 model OR a sequence diagram into a URL that opens it in " +
      "the arch-lab viewer, so a human can see the diagram — C4 models open " +
      "the two-pane viewer, sequence documents the sequence playground. The " +
      "document is encoded into the URL fragment, which browsers never send " +
      "to a server — nothing is uploaded or stored. Refuses documents too " +
      "large to fit a link that would survive being pasted into chat or " +
      "mail. Can optionally expire after a number of days. The format " +
      "argument applies to the C4 readings; a sequence document is detected " +
      "from its first line.",
    args: [
      SHARE_SOURCE_ARG,
      FORMAT_ARG,
      {
        name: "diagram_id",
        required: false,
        description:
          "Open the link at this diagram (C4 models only — a sequence " +
          "document is a single flow with no diagrams). Defaults to the " +
          "root diagram.",
      },
      {
        name: "ttl_days",
        required: false,
        description:
          "Stop the link working after this many days (1-400). Omit for a " +
          "link that never expires. The expiry is signed so it cannot be " +
          "edited in the URL, but it is not access control — anyone holding " +
          "the link can read the model until it lapses.",
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Tool groups — the /mcp page's reading order                                 */
/* -------------------------------------------------------------------------- */

export interface McpToolGroup {
  id: string;
  title: string;
  /** One line on when a reader reaches for this group. */
  blurb: string;
  tools: readonly McpToolDoc[];
}

/**
 * Resolve group members against `MCP_TOOLS` by name, so a group can never
 * carry a tool document the server does not register — the tools themselves
 * stay defined exactly once, above. A name that does not resolve throws at
 * module load, which fails the build rather than shipping a page with a hole
 * in it.
 */
function toolsNamed(...names: readonly string[]): readonly McpToolDoc[] {
  return names.map((name) => {
    const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
    if (tool === undefined) {
      throw new Error(`MCP_TOOL_GROUPS names unknown tool "${name}"`);
    }
    return tool;
  });
}

/**
 * How the `/mcp` page presents the tools. Ten equal cards read as a wall; a
 * reader deciding whether to connect needs the jobs, not the alphabet. The
 * grouping lives HERE rather than in the component because the component is
 * forbidden from knowing tool names — that is the whole contract of this
 * module.
 */
export const MCP_TOOL_GROUPS: readonly McpToolGroup[] = [
  {
    id: "check",
    title: "Check and format C4 models",
    blurb:
      "The core loop: get the real parser's verdict on what your agent " +
      "wrote, then commit canonical bytes that diff cleanly.",
    tools: toolsNamed("validate_model", "format_model"),
  },
  {
    id: "sequence",
    title: "Sequence diagrams",
    blurb:
      "The same check-and-format loop, for message flows over time rather " +
      "than C4 structure — including the `desc` continuation that keeps a " +
      "message's endpoint and payload off the arrow.",
    tools: toolsNamed("validate_sequence", "format_sequence"),
  },
  {
    id: "inspect",
    title: "Convert and inspect",
    blurb:
      "Move a model between formats, or read its shape without paying for " +
      "its full text.",
    tools: toolsNamed("convert_model", "describe_model"),
  },
  {
    id: "learn",
    title: "Learn the format",
    blurb:
      "The grammar and real examples — read these before writing .alab, " +
      "not after the first failure.",
    tools: toolsNamed(
      "get_syntax_reference",
      "list_example_models",
      "get_example_model",
    ),
  },
  {
    id: "share",
    title: "Show a human",
    blurb:
      "Turn a finished C4 model or sequence flow into a link that opens " +
      "the diagram in the viewer.",
    tools: toolsNamed("create_share_link"),
  },
];

/*
 * Every tool must appear in exactly one group, checked at module load. This is
 * the drift `check:mcp` cannot see: it compares the catalogue to the SERVER,
 * so a tool registered and documented but left out of every group would pass
 * it while silently vanishing from the page.
 */
const GROUPED_NAMES = MCP_TOOL_GROUPS.flatMap((group) =>
  group.tools.map((tool) => tool.name),
);
if (
  GROUPED_NAMES.length !== new Set(GROUPED_NAMES).size ||
  MCP_TOOLS.some((tool) => !GROUPED_NAMES.includes(tool.name))
) {
  throw new Error(
    "MCP_TOOL_GROUPS must cover every tool in MCP_TOOLS exactly once",
  );
}

/* -------------------------------------------------------------------------- */
/* Resources & prompts                                                         */
/* -------------------------------------------------------------------------- */

export interface McpResourceDoc {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export const MCP_RESOURCES: readonly McpResourceDoc[] = [
  {
    uri: "archlab://syntax",
    name: "archlab-syntax",
    title: "The .alab syntax reference",
    description:
      "The complete .alab grammar as Markdown, every example verified " +
      "against the real parser. Pin this when authoring models.",
    mimeType: "text/markdown",
  },
];

export interface McpPromptDoc {
  name: string;
  title: string;
  description: string;
  args: readonly McpArgDoc[];
}

export const MCP_PROMPTS: readonly McpPromptDoc[] = [
  {
    name: "author_c4_model",
    title: "Author a C4 model",
    description:
      "A working procedure for producing a valid .alab model of a system: " +
      "read the grammar, draft the levels, validate, then share.",
    args: [
      {
        name: "system",
        required: true,
        description: "The system to model, in a sentence or two.",
      },
      {
        name: "levels",
        required: false,
        description:
          'How deep to go, e.g. "context and container". Defaults to ' +
          "context plus container.",
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* The skill — the same knowledge, without a server                            */
/* -------------------------------------------------------------------------- */

/**
 * Where the skill lands in the reader's project, and the one command that puts
 * it there.
 *
 * WHY `degit` AND NOT AN OWN PACKAGE. `npx <name>` needs something published to
 * npm, and nothing here is: the repo is private and unpublished, so a
 * `npx arch-lab-skills` in these docs would be a command that works for
 * precisely nobody — the exact failure this whole module exists to prevent.
 * `degit` copies a subdirectory straight out of the public GitHub repo, so the
 * command in the docs is one that actually runs today, with no release step
 * standing between the page and the truth. If a package is ever published this
 * becomes a one-line change, in one place.
 *
 * The skill itself is generated by `scripts/build-skill.mjs` from
 * `content/syntax-sections.ts` — the same source `get_syntax_reference` serves
 * — and `check:skill` asserts the committed file still matches. Two
 * hand-maintained copies of a grammar is one copy that is quietly wrong.
 */
export const SKILL_REPO = "raksitnongbua/arch-lab";
export const SKILL_SOURCE_DIR = "skills/alab";
export const SKILL_DESTINATION = ".claude/skills/alab/SKILL.md";

export const SKILL_INSTALL = `npx degit ${SKILL_REPO}/${SKILL_SOURCE_DIR} .claude/skills/alab`;

/* -------------------------------------------------------------------------- */
/* Connecting                                                                  */
/* -------------------------------------------------------------------------- */

export interface ConnectRecipe {
  /** Client this applies to. */
  client: string;
  /** How to read the snippet. */
  note: string;
  language: string;
  snippet: (endpoint: string) => string;
}

export const CONNECT_RECIPES: readonly ConnectRecipe[] = [
  {
    client: "Claude Code",
    /*
     * GLOBAL (`--scope user`), which is NOT the CLI's default and is a
     * deliberate departure. Someone following this page wants the server
     * available next time they open a terminal, not only in whichever
     * directory they happened to be standing in — and a local-scoped install
     * looks identical until you cd elsewhere and the tools have silently
     * vanished. The narrower scopes are one flag away and named in the note.
     *
     * The flag used to appear in the note while the command omitted it, so the
     * copyable thing did not do what the prose beside it described.
     * `check:mcp` now asserts that whatever scope the note names is the scope
     * the command actually passes.
     */
    note:
      "One command, once. --scope user installs it for every project on your " +
      "machine; use --scope project to commit it to a repo instead, or drop " +
      "the flag to keep it to the current directory.",
    language: "bash",
    snippet: (endpoint) =>
      `claude mcp add --transport http arch-lab --scope user ${endpoint}`,
  },
  {
    client: "Claude Desktop",
    note: "Settings → Connectors → Add custom connector, then paste the URL. Or edit claude_desktop_config.json directly:",
    language: "json",
    snippet: (endpoint) =>
      JSON.stringify(
        { mcpServers: { "arch-lab": { type: "http", url: endpoint } } },
        null,
        2,
      ),
  },
  {
    client: "Gemini CLI",
    // `httpUrl` is the streamable-HTTP key; `url` in the same file means SSE,
    // which this server does not speak. The CLI writes the right one for you,
    // which is why the command is the snippet and the file is only mentioned.
    note: "One command, or add it to ~/.gemini/settings.json by hand under mcpServers with the httpUrl key (url means SSE there, which this server does not speak).",
    language: "bash",
    snippet: (endpoint) =>
      `gemini mcp add --transport http arch-lab ${endpoint}`,
  },
  {
    client: "Codex CLI",
    // `codex mcp add` covers stdio servers only, so an HTTP server is a
    // config-file edit. No auth block: this server has none.
    note: "Add to ~/.codex/config.toml. There is no CLI shortcut for HTTP servers, and no auth key is needed — this server does not authenticate.",
    language: "toml",
    snippet: (endpoint) => `[mcp_servers.arch-lab]\nurl = "${endpoint}"`,
  },
  {
    client: "Cursor",
    /*
     * NOT the same shape as VS Code, which is why these are two entries now.
     * They were one, emitting VS Code's `servers` + `type` for both — a
     * config Cursor reads and silently ignores, so the server simply never
     * appeared and nothing said why. Cursor wants `mcpServers`, and a remote
     * server needs no `type` at all.
     */
    note: "Add to .cursor/mcp.json in your project, or ~/.cursor/mcp.json to get it everywhere.",
    language: "json",
    snippet: (endpoint) =>
      JSON.stringify(
        { mcpServers: { "arch-lab": { url: endpoint } } },
        null,
        2,
      ),
  },
  {
    client: "VS Code (Copilot)",
    note: "Add to .vscode/mcp.json in your workspace, or your user mcp.json to get it everywhere.",
    language: "json",
    snippet: (endpoint) =>
      JSON.stringify(
        { servers: { "arch-lab": { type: "http", url: endpoint } } },
        null,
        2,
      ),
  },
  {
    client: "Anything else",
    note: "Any client speaking MCP over Streamable HTTP. There is no authentication and no state — every call is a pure function of its arguments.",
    language: "text",
    snippet: (endpoint) => endpoint,
  },
];
