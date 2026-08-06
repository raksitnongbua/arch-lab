"use client";

/**
 * The searchable icon picker (T2-A — AF-E4-S2). Exported signature is the
 * frozen dev-handoff §4.6 contract; T2-D's inspector imports exactly this.
 *
 * Opens as a modal over the frozen `Dialog` primitive (built for this, per
 * its header comment). Typing filters on name, slug and aliases — "pg" and
 * "postgres" both find PostgreSQL. Results are grouped by the six categories
 * and arrow-key navigable from the search field; `Enter` selects, `Escape`
 * closes (handled by the Dialog). The current icon is highlighted; no match
 * offers "use generic <type> icon".
 */

import { useEffect, useMemo, useRef, useState } from "react";

import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { C4NodeType } from "@/types";

import { SHAPE_LABEL } from "@/features/viewer/lib/labels";

import {
  ICON_CATEGORY_LABELS,
  ICON_CATEGORY_ORDER,
  type IconCategory,
} from "../lib/icons/categories";
import {
  DEFAULT_ICON_BY_TYPE,
  ICONS,
  searchIcons,
  type IconDef,
} from "../lib/icons/registry";

/** Grid columns — arrow Up/Down move by one visual row. */
const GRID_COLUMNS = 5;

// The generic-icon affordance names the SILHOUETTE, not the C4 abstraction:
// the user is picking a picture here, and "use generic container icon" for a
// queue would hand them the wrong one.

/** T2-D imports exactly this (dev-handoff §4.6 — frozen). */
export function IconPicker(props: {
  value?: string;
  nodeType: C4NodeType;
  onChange: (slug: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { value, nodeType, onChange, onClose } = props;

  const [query, setQuery] = useState("");
  const results = useMemo(() => searchIcons(query), [query]);

  // Keyboard cursor over the flat result order (category-major).
  const [activeSlug, setActiveSlug] = useState<string | null>(
    value !== undefined && ICONS[value] !== undefined ? value : null,
  );
  const listRef = useRef<HTMLDivElement>(null);

  const activeIndex = useMemo(() => {
    const index = results.findIndex((def) => def.slug === activeSlug);
    return index === -1 ? (results.length > 0 ? 0 : -1) : index;
  }, [results, activeSlug]);

  // Keep the active option visible (including the initial highlight).
  useEffect(() => {
    if (activeIndex < 0) return;
    const slug = results[activeIndex].slug;
    listRef.current
      ?.querySelector(`[data-slug="${slug}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [results, activeIndex]);

  const groups = useMemo(() => {
    const byCategory = new Map<IconCategory, IconDef[]>();
    for (const def of results) {
      const group = byCategory.get(def.category);
      if (group === undefined) byCategory.set(def.category, [def]);
      else group.push(def);
    }
    return ICON_CATEGORY_ORDER.filter((category) =>
      byCategory.has(category),
    ).map((category) => ({
      category,
      defs: byCategory.get(category) as IconDef[],
    }));
  }, [results]);

  const select = (slug: string) => {
    onChange(slug);
    onClose();
  };

  const moveActive = (delta: number) => {
    if (results.length === 0) return;
    const from = activeIndex < 0 ? 0 : activeIndex;
    const next = Math.min(Math.max(from + delta, 0), results.length - 1);
    setActiveSlug(results[next].slug);
  };

  const genericSlug = DEFAULT_ICON_BY_TYPE[nodeType];

  return (
    <Dialog
      open
      onClose={onClose}
      title="Choose an icon"
      description="Search by name or alias — icons are stored by slug, never by SVG data."
      className="max-w-lg"
    >
      <Input
        role="combobox"
        aria-expanded="true"
        aria-controls="icon-picker-listbox"
        aria-label="Search icons"
        placeholder='Search icons — try "pg" or "postgres"'
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          switch (event.key) {
            case "ArrowRight":
              event.preventDefault();
              moveActive(1);
              break;
            case "ArrowLeft":
              event.preventDefault();
              moveActive(-1);
              break;
            case "ArrowDown":
              event.preventDefault();
              moveActive(GRID_COLUMNS);
              break;
            case "ArrowUp":
              event.preventDefault();
              moveActive(-GRID_COLUMNS);
              break;
            case "Enter":
              event.preventDefault();
              if (activeIndex >= 0) select(results[activeIndex].slug);
              break;
            default:
              break;
          }
        }}
      />

      <div
        ref={listRef}
        id="icon-picker-listbox"
        role="listbox"
        aria-label="Icons"
        className="flex max-h-80 flex-col gap-3 overflow-y-auto pr-1"
      >
        {groups.map(({ category, defs }) => (
          <section key={category} aria-label={ICON_CATEGORY_LABELS[category]}>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground">
              {ICON_CATEGORY_LABELS[category]}
            </h3>
            <div className="grid grid-cols-5 gap-1">
              {defs.map((def) => {
                const isCurrent = def.slug === value;
                const isActive =
                  activeIndex >= 0 && results[activeIndex].slug === def.slug;
                return (
                  <button
                    key={def.slug}
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    data-slug={def.slug}
                    title={def.name}
                    onClick={() => select(def.slug)}
                    onMouseEnter={() => setActiveSlug(def.slug)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border border-transparent p-2 text-foreground",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      isActive && "border-border bg-secondary",
                      isCurrent && "border-ring bg-selection",
                    )}
                  >
                    <def.Svg className="size-6" />
                    <span className="w-full truncate text-[10px] leading-tight">
                      {def.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              No icon matches &ldquo;{query}&rdquo;.
            </p>
            <button
              type="button"
              onClick={() => select(genericSlug)}
              className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm text-secondary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Use generic {SHAPE_LABEL[nodeType].toLowerCase()} icon
            </button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
