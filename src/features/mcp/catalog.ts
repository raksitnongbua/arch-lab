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
 * No React, no zod, no SDK — importable from anywhere.
 */

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
  description:
    "The model text: .alab, arch-lab JSON, or Mermaid C4 (max 256,000 characters).",
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
      "rather than echoing it back. Use this after writing or editing any " +
      ".alab file — it is the fastest way to confirm the result is loadable.",
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
    name: "convert_model",
    title: "Convert between formats",
    description:
      "Convert a model to .alab, arch-lab JSON, or Mermaid C4. .alab and " +
      "JSON are lossless in both directions. Mermaid is a one-way, lossy " +
      "export of a SINGLE diagram (geometry, tags, icons, drill-down links " +
      "and traceability are dropped) — good for embedding a picture in a " +
      "README, never as a source of truth.",
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
          "Also list every node and edge of every diagram. Defaults to " +
          "false, which returns the hierarchy only.",
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
        description:
          "One of: overview, example, layout, header, diagrams, nodes, " +
          "edges, unknown-fields, errors. Omit for the whole reference.",
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
      "Turn a model into a URL that opens it in the arch-lab viewer, so a " +
      "human can see the diagram. The model is encoded into the URL " +
      "fragment, which browsers never send to a server — nothing is " +
      "uploaded or stored. Refuses models too large to fit a link that " +
      "would survive being pasted into chat or mail.",
    args: [
      SOURCE_ARG,
      FORMAT_ARG,
      {
        name: "diagram_id",
        required: false,
        description:
          "Open the link at this diagram. Defaults to the root diagram.",
      },
    ],
  },
];

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
    note: "One command, in any project. Add --scope user to make it available everywhere.",
    language: "bash",
    snippet: (endpoint) =>
      `claude mcp add --transport http arch-lab ${endpoint}`,
  },
  {
    client: "Claude Desktop",
    note: "Settings → Connectors → Add custom connector, then paste the URL. Or edit the config file directly:",
    language: "json",
    snippet: (endpoint) =>
      JSON.stringify(
        { mcpServers: { "arch-lab": { type: "http", url: endpoint } } },
        null,
        2,
      ),
  },
  {
    client: "Cursor / VS Code",
    note: "Add to .cursor/mcp.json or .vscode/mcp.json in your project.",
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
