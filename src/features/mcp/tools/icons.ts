/**
 * `list_icons` — the `@icon` vocabulary, searchable.
 *
 * The one gap this closes: `@slug` is documented grammar, but its VOCABULARY
 * lived only in the browser's icon picker. An agent authoring `.alab` over
 * MCP had no way to learn a single legal slug, and `resolveIcon` falls back
 * SILENTLY on an unknown one — so a guessed `@postgres` renders the generic
 * container glyph instead of the elephant, and no validator ever says why.
 * A wrong icon that nothing reports is the worst kind of wrong; the fix is
 * to make the vocabulary discoverable, not to make the fallback loud (a
 * year-old document with a since-removed slug must keep rendering).
 *
 * Everything here is DERIVED from the registry the canvas itself draws from
 * (`editor/lib/icons/registry.ts`) — the same `searchIcons` the picker calls,
 * the same category tables. A new icon appears in this tool's output the
 * moment it is registered, with no list to remember; `scripts/mcp-check.mjs`
 * asserts the exposed vocabulary and the registry cannot drift.
 *
 * The registry lives in the editor feature. Reaching into it is the same
 * deep import the viewer, the sequence canvas and `components/ui` already
 * make for this exact module — the icon registry is de facto shared
 * vocabulary, and a second copy here would be the drift this tool exists to
 * prevent.
 */

import {
  ICON_CATEGORY_LABELS,
  ICON_CATEGORY_ORDER,
  type IconCategory,
} from "@/features/editor/lib/icons/categories";
import {
  DEFAULT_ICON_BY_TYPE,
  searchIcons,
  type IconDef,
} from "@/features/editor/lib/icons/registry";

import {
  errorResult,
  joinSections,
  textResult,
  type McpTextResult,
} from "../lib/render";

/**
 * The two facts every response carries, hit or miss, because they are the
 * contract around the vocabulary rather than part of it: the fallback is
 * silent (so guessing is never safe), and the registry is not a wall — a
 * document can carry its own artwork.
 */
const FALLBACK_NOTE =
  "A slug not in this registry never errors — the node silently falls back " +
  "to its type's generic icon — so use a listed slug rather than guessing.";

const CUSTOM_ICON_NOTE =
  "An icon this registry lacks can be supplied by the document itself with " +
  'a `customicon <slug> "Name" "<svg>…"` header line (see the header ' +
  "section of the syntax reference).";

/** `@postgresql — PostgreSQL (also: pg, postgres)`, the way a node cites it. */
function renderIcon(def: IconDef): string {
  const aliases =
    def.aliases.length > 0 ? ` (also: ${def.aliases.join(", ")})` : "";
  return `  @${def.slug} — ${def.name}${aliases}`;
}

/** The per-type defaults, so an agent knows what omitting `@` buys. */
function renderDefaults(): string {
  const rows = Object.entries(DEFAULT_ICON_BY_TYPE)
    .map(([type, slug]) => `${type} → @${slug}`)
    .join(", ");
  return `A node with no \`@\` gets its type's default: ${rows}.`;
}

export function listIcons(
  query: string | undefined,
  category: string | undefined,
): McpTextResult {
  if (
    category !== undefined &&
    !(ICON_CATEGORY_ORDER as readonly string[]).includes(category)
  ) {
    return errorResult(
      `Unknown category \`${category}\`. Available categories: ` +
        `${ICON_CATEGORY_ORDER.join(", ")} — or omit the argument to search ` +
        "all of them.",
    );
  }

  const total = searchIcons("").length;
  const matches = searchIcons(query ?? "").filter(
    (def) => category === undefined || def.category === category,
  );

  if (matches.length === 0) {
    return textResult(
      joinSections(
        `No icons match ${JSON.stringify(query ?? "")}` +
          (category === undefined ? "" : ` in category \`${category}\``) +
          `. Search matches name, slug and aliases, case-insensitively; ` +
          `omit the query to list all ${total} icons.`,
        joinSections(FALLBACK_NOTE, CUSTOM_ICON_NOTE),
      ),
    );
  }

  // Category-major, in picker order — searchIcons already returns registry
  // order, so grouping here only inserts the headings.
  const groups = ICON_CATEGORY_ORDER.map((id: IconCategory) => {
    const members = matches.filter((def) => def.category === id);
    if (members.length === 0) return null;
    return [
      `${ICON_CATEGORY_LABELS[id]} (${members.length})`,
      ...members.map(renderIcon),
    ].join("\n");
  });

  return textResult(
    joinSections(
      `${matches.length} of ${total} icons` +
        (query === undefined || query.trim() === ""
          ? ""
          : ` matching ${JSON.stringify(query)}`) +
        (category === undefined ? "" : ` in category \`${category}\``) +
        ". Cite one on a node line as `@slug`, e.g. " +
        '`api:container "API" @postgresql`.',
      ...groups,
      joinSections(renderDefaults(), FALLBACK_NOTE, CUSTOM_ICON_NOTE),
    ),
  );
}
