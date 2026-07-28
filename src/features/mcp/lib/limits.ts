/**
 * Input limits for the MCP endpoint.
 *
 * `/api/mcp` is the one part of arch-lab that accepts text from an unknown
 * caller, and the `.alab` parser is a hand-written recursive grammar over
 * every line of it. A size ceiling is therefore the whole of the abuse story:
 * refuse absurd payloads up front, cheaply, with a message that tells an
 * honest caller what to do instead.
 *
 * The ceiling is generous on purpose — it is a guard against pathological
 * input, not a product limit. For scale: the ShopFlow demo model, the largest
 * thing the app ships, is well under 60 kB of `.alab` text.
 */

/**
 * Longest accepted model source, in UTF-16 code units (JS string length).
 * Roughly 250 kB of text — several times the biggest model anyone has
 * authored, and still far below what would make a single parse slow.
 */
export const MAX_SOURCE_CHARS = 256_000;

export type SizeGuard = { ok: true } | { ok: false; message: string };

/**
 * Checks a model source against `MAX_SOURCE_CHARS`. Returns a caller-facing
 * sentence rather than throwing, so tools can report it as a normal failure.
 */
export function guardSourceSize(source: string): SizeGuard {
  if (source.length <= MAX_SOURCE_CHARS) return { ok: true };
  return {
    ok: false,
    message:
      `This source is ${source.length.toLocaleString("en-US")} characters, ` +
      `over the ${MAX_SOURCE_CHARS.toLocaleString("en-US")}-character limit ` +
      `of the arch-lab MCP endpoint. Split the model across files with ` +
      `childRef (\`>>"./billing.archlab.json"\`), or run the checks locally ` +
      `with \`pnpm check:archtext\`.`,
  };
}
