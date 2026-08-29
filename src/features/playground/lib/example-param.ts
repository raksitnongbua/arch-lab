import { loadBundledExample } from "./example-registry";

/**
 * `?e=` — open a BUNDLED EXAMPLE in the playground, by id.
 *
 * WHY A QUERY PARAM AND NOT THE FRAGMENT. `#m=` was the obvious-looking
 * choice and is already taken: it carries a COMPRESSED DOCUMENT, so
 * `#m=demo.atlas-shop` would be handed to the share decoder and refused. More
 * importantly a fragment never reaches the server, so the example could only
 * be fetched after hydration — the reader would watch the default seed appear
 * and be replaced. A query param is visible to the route, which renders the
 * example in the first byte.
 *
 * ONE FLAT NAMESPACE across all NINE registries: `?e=shopflow` is a C4 model,
 * `?e=checkout` a sequence flow, `?e=intake` a flowchart, `?e=food-delivery` a
 * use-case diagram, `?e=shop-orders` an ER diagram, `?e=customer-api` a data
 * dictionary, `?e=store-migration` a gantt, `?e=platform-history` a
 * milestone timeline and `?e=order-lifecycle` a lifecycle — and the reader
 * does not have to know which. The ids are unique across the nine;
 * `check:view-input` asserts that, because the day they collide this param
 * silently resolves the wrong one.
 *
 * WHICH REGISTRIES EXIST IS NO LONGER THIS MODULE'S PROBLEM. It used to ask
 * all nine by hand, and forgetting one was invisible in a specific way: the ER
 * and dictionary registries were added and this function was not, so every
 * "Open in the playground" link from a `/demo` card of either kind returned
 * `null` here — and `null` is the same answer an unknown id gives, which is
 * the deliberate fall-back-to-the-seed path. So the playground opened on the
 * C4 seed and nothing anywhere reported a problem: no error, no 404, just the
 * wrong document. The list now lives once, in `./example-registry`, which the
 * MCP example tools read too; `check:view-input` asserts it names every
 * registry on disk, and `check:mcp` asserts every id in one reaches an
 * agent.
 *
 * An UNKNOWN id falls back to the ordinary seed rather than erroring: the
 * param names content, not a route, and a link with a stale id should still
 * open a working playground. Same reasoning as an unknown icon slug drawing
 * nothing rather than throwing.
 */
export const VIEW_EXAMPLE_PARAM = "e";

/** Canonical `.alab` text for a bundled example, or null if there is no such id. */
export function exampleTextFor(
  value: string | string[] | undefined,
): string | null {
  const id = Array.isArray(value) ? value[0] : value;
  if (id === undefined || id === "") return null;
  const result = loadBundledExample(id);
  return result.status === "ok" ? result.document.alabText : null;
}
