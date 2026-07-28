/**
 * The SERVER surface of the `mcp` feature.
 *
 * Importing this module pulls in the MCP SDK, so only `src/app/api/mcp/route.ts`
 * should do it. Anything rendering UI — the `/mcp` page included — imports
 * `@/features/mcp/catalog` instead, which is pure data with no SDK and no
 * React and is safe in a client bundle.
 *
 * The tools themselves live in `./tools/*` and are plain functions from
 * arguments to text; `./server.ts` is only the wiring. See `./README.md`.
 */

export { registerArchLabMcp } from "./server";
export { MAX_SOURCE_CHARS } from "./lib/limits";
export { publicOrigin, DEFAULT_PUBLIC_ORIGIN } from "./lib/origin";
export { syntaxReferenceMarkdown } from "./content/syntax-sections";
