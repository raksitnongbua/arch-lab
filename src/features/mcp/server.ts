/**
 * Registration: the catalogue in `./catalog.ts` wired to the implementations
 * in `./tools/*`.
 *
 * This is the ONLY module in the feature that touches the MCP SDK. Everything
 * it calls is a pure function of its arguments returning text — no state, no
 * storage, no session affinity — which is what lets the endpoint run stateless
 * on serverless infrastructure and makes every tool directly unit-testable
 * without a protocol in the way.
 *
 * Tool descriptions and names come from the catalogue rather than being typed
 * here, so the `/mcp` page and this file cannot document different servers.
 * `pnpm check:mcp` enforces it.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CheckChoice } from "@/features/validate/lib/check";

import {
  MCP_PROMPTS,
  MCP_RESOURCES,
  MCP_TOOLS,
  type McpToolDoc,
} from "./catalog";
import { syntaxReferenceMarkdown } from "./content/syntax-sections";
import { convertModel, formatModel } from "./tools/convert";
import { describeModel } from "./tools/describe";
import { getExampleModel, listExampleModels } from "./tools/examples";
import { createShareLink } from "./tools/share";
import { getSyntaxReference, SYNTAX_SECTION_IDS } from "./tools/syntax";
import { validateModel } from "./tools/validate";

/* -------------------------------------------------------------------------- */
/* Shared input schemas                                                        */
/* -------------------------------------------------------------------------- */

const FORMAT_SCHEMA = z
  .enum(["auto", "alab", "json", "mermaid"])
  .default("auto")
  .describe(
    'Force how `source` is read. Defaults to "auto" (detect from the first ' +
      "meaningful line).",
  );

const SOURCE_SCHEMA = z
  .string()
  .describe("Model text: .alab, arch-lab JSON, or Mermaid C4.");

/**
 * Looks a tool's prose up by name so `registerTool` never carries a
 * hand-typed description. Throws at module load if the name is absent, which
 * turns a typo into an immediate boot failure rather than a silently
 * undocumented tool.
 */
function doc(name: string): McpToolDoc {
  const found = MCP_TOOLS.find((tool) => tool.name === name);
  if (found === undefined) {
    throw new Error(
      `mcp: no catalogue entry for tool "${name}" — add it to catalog.ts.`,
    );
  }
  return found;
}

/** Every tool is read-only and side-effect free; say so in the protocol. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * The catalogue half of a `registerTool` config. Spread it and add
 * `inputSchema` inline — passing the schema THROUGH a helper would widen it to
 * `ZodRawShape` and the SDK would infer every handler argument as `unknown`.
 */
function config(name: string) {
  const entry = doc(name);
  return {
    title: entry.title,
    description: entry.description,
    annotations: READ_ONLY,
  };
}

/* -------------------------------------------------------------------------- */
/* Registration                                                                */
/* -------------------------------------------------------------------------- */

export function registerArchLabMcp(server: McpServer): void {
  /* ---- validate ---------------------------------------------------------- */

  server.registerTool(
    "validate_model",
    {
      ...config("validate_model"),
      inputSchema: { source: SOURCE_SCHEMA, format: FORMAT_SCHEMA },
    },
    ({ source, format }) => validateModel(source, format as CheckChoice),
  );

  /* ---- format ------------------------------------------------------------ */

  server.registerTool(
    "format_model",
    {
      ...config("format_model"),
      inputSchema: { source: SOURCE_SCHEMA, format: FORMAT_SCHEMA },
    },
    ({ source, format }) => formatModel(source, format as CheckChoice),
  );

  /* ---- convert ----------------------------------------------------------- */

  server.registerTool(
    "convert_model",
    {
      ...config("convert_model"),
      inputSchema: {
        source: SOURCE_SCHEMA,
        format: FORMAT_SCHEMA,
        to: z
          .enum(["alab", "json", "mermaid"])
          .describe(
            "Target format. .alab ⇄ json is lossless; mermaid is a one-way, " +
              "lossy export of one diagram.",
          ),
        diagram_id: z
          .string()
          .optional()
          .describe(
            'Which diagram to emit, for to="mermaid". Defaults to the root.',
          ),
      },
    },
    ({ source, format, to, diagram_id }) =>
      convertModel(source, format as CheckChoice, to, diagram_id),
  );

  /* ---- describe ---------------------------------------------------------- */

  server.registerTool(
    "describe_model",
    {
      ...config("describe_model"),
      inputSchema: {
        source: SOURCE_SCHEMA,
        format: FORMAT_SCHEMA,
        include_contents: z
          .boolean()
          .default(false)
          .describe("Also list every node and edge of every diagram."),
      },
    },
    ({ source, format, include_contents }) =>
      describeModel(source, format as CheckChoice, include_contents),
  );

  /* ---- syntax ------------------------------------------------------------ */

  server.registerTool(
    "get_syntax_reference",
    {
      ...config("get_syntax_reference"),
      inputSchema: {
        section: z
          .enum(SYNTAX_SECTION_IDS)
          .optional()
          .describe("One section only. Omit for the whole reference."),
      },
    },
    ({ section }) => getSyntaxReference(section),
  );

  /* ---- examples ---------------------------------------------------------- */

  server.registerTool(
    "list_example_models",
    config("list_example_models"),
    () => listExampleModels(),
  );

  server.registerTool(
    "get_example_model",
    {
      ...config("get_example_model"),
      inputSchema: {
        id: z.string().describe("The example's id, from list_example_models."),
        format: z.enum(["alab", "json"]).default("alab"),
      },
    },
    ({ id, format }) => getExampleModel(id, format),
  );

  /* ---- share ------------------------------------------------------------- */

  server.registerTool(
    "create_share_link",
    {
      ...config("create_share_link"),
      inputSchema: {
        source: SOURCE_SCHEMA,
        format: FORMAT_SCHEMA,
        diagram_id: z
          .string()
          .optional()
          .describe("Open the link at this diagram. Defaults to the root."),
        ttl_days: z
          .number()
          .int()
          .min(1)
          .max(400)
          .optional()
          .describe(
            "Make the link stop working after this many days. Omit for a link " +
              "that never expires (the default). The expiry is signed, so it " +
              "cannot be edited in the URL — but it is NOT access control: " +
              "anyone holding the link can read the model until it lapses. " +
              "Requires a share signing key on the deployment.",
          ),
      },
    },
    async ({ source, format, diagram_id, ttl_days }) =>
      createShareLink(source, format as CheckChoice, diagram_id, ttl_days),
  );

  registerResources(server);
  registerPrompts(server);
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                   */
/* -------------------------------------------------------------------------- */

function registerResources(server: McpServer): void {
  const syntax = MCP_RESOURCES.find(
    (resource) => resource.name === "archlab-syntax",
  );
  if (syntax === undefined) {
    throw new Error(
      "mcp: the archlab-syntax resource is missing from catalog.ts.",
    );
  }

  server.registerResource(
    syntax.name,
    syntax.uri,
    {
      title: syntax.title,
      description: syntax.description,
      mimeType: syntax.mimeType,
    },
    () => ({
      contents: [
        {
          uri: syntax.uri,
          mimeType: syntax.mimeType,
          text: syntaxReferenceMarkdown(),
        },
      ],
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Prompts                                                                     */
/* -------------------------------------------------------------------------- */

function registerPrompts(server: McpServer): void {
  const authoring = MCP_PROMPTS.find(
    (prompt) => prompt.name === "author_c4_model",
  );
  if (authoring === undefined) {
    throw new Error(
      "mcp: the author_c4_model prompt is missing from catalog.ts.",
    );
  }

  server.registerPrompt(
    authoring.name,
    {
      title: authoring.title,
      description: authoring.description,
      argsSchema: {
        system: z.string().describe("The system to model."),
        levels: z
          .string()
          .optional()
          .describe('How deep to go, e.g. "context and container".'),
      },
    },
    ({ system, levels }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Produce an arch-lab C4 model of: ${system}`,
              "",
              `Levels to cover: ${levels ?? "context and container"}.`,
              "",
              "Work in this order — it is the order that avoids rework:",
              "",
              "1. Call `get_syntax_reference` first. Do not write .alab from",
              "   memory; the format has significant indentation and",
              "   order-free attributes that are easy to get subtly wrong.",
              "2. Call `list_example_models` and read one with",
              "   `get_example_model` to see what idiomatic structure looks",
              "   like at this scale.",
              "3. Draft the model as .alab text. Start at @context with the",
              "   people and external systems, then drill into @container",
              "   with `>` child-diagram pointers from the owning node.",
              "   Omit geometry — the defaults are deterministic and lossless.",
              "   Give every container and component a technology in [square",
              "   brackets], a one-line desc, and a relationship label that",
              '   says what flows — never "Uses".',
              "   Reach for a `frame` where the diagram has a real boundary to",
              "   show (an owned-vs-third-party split, a network or trust",
              "   boundary, a deployment region). Do not wrap everything in",
              '   one "Internal" frame out of habit — a boundary nothing sits',
              "   outside of tells the reader nothing.",
              "4. Call `validate_model` on the draft. Fix every reported line",
              "   and column and call it again until it is valid. Do not",
              "   present an unvalidated model. It also returns C4 review",
              "   notes on a valid model — those do not block anything, but",
              "   they are what a reviewer would raise, so fix them too.",
              "5. Call `format_model` so the output is canonical and diffs",
              "   cleanly, then `create_share_link` so a human can look at",
              "   the diagram.",
              "",
              "Model what the system actually is, and say plainly what you",
              "were unsure about rather than inventing components to fill a",
              "level out.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
