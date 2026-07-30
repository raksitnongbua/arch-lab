"use client";

/**
 * "Reference an element…" — the `^ref` authoring surface.
 *
 * Lives behind one button rather than as a list in the palette rail. A list
 * grows with the model; a search field does not. On a busy context diagram the
 * inline version pushed the type palette off-screen, and the fix for "too many
 * rows" is search, not scrolling.
 *
 * Only ancestor nodes are offered, filtered by `selectReferenceableNodes` —
 * level rules still apply, placeholders are never referenced, and anything
 * already referenced here is gone from the list.
 *
 * Keyboard-first, like the quick-add menu: type to filter, arrows to rove,
 * Enter to place, Escape to close. The `Dialog` primitive stops keydown
 * propagation at the panel, so typing here cannot reach the canvas shortcut
 * registry — no accidental nudge, rename or delete.
 */

import { useCallback, useMemo, useState } from "react";
import { ArrowUp, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
  selectReferenceableNodes,
  useEditorStore,
  type ReferenceableNode,
} from "../state";
import { NODE_TYPE_META } from "./palette-item";

export interface RefPickerDialogProps {
  onPlace: (sourceDiagramId: string, sourceNodeId: string) => void;
}

export function RefPickerDialog({
  onPlace,
}: RefPickerDialogProps): React.JSX.Element | null {
  const entries = useEditorStore(selectReferenceableNodes);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const filtered = useMemo<ReferenceableNode[]>(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return entries;
    return entries.filter((entry) => {
      const typeLabel = NODE_TYPE_META[entry.node.type].label.toLowerCase();
      return (
        entry.node.name.toLowerCase().includes(needle) ||
        typeLabel.includes(needle) ||
        entry.sourceLevel.includes(needle)
      );
    });
  }, [entries, query]);

  const close = useCallback(() => {
    setOpen(false);
    // Reset so reopening is never haunted by the last search.
    setQuery("");
    setActive(0);
  }, []);

  const place = useCallback(
    (entry: ReferenceableNode) => {
      onPlace(entry.sourceDiagramId, entry.node.id);
      close();
    },
    [close, onPlace],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (filtered.length === 0) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((index) => (index + 1) % filtered.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((index) => (index - 1 + filtered.length) % filtered.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const entry = filtered[Math.min(active, filtered.length - 1)];
        if (entry !== undefined) place(entry);
      }
    },
    [active, filtered, place],
  );

  // Nothing to reference (the root diagram, or everything eligible is already
  // placed) ⇒ no button at all. A disabled control here would just raise a
  // question the user cannot act on.
  if (entries.length === 0) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        // `min-w-0` on the flex child is what lets `truncate` engage; without
        // it the label refuses to shrink and shoves the count out of the rail.
        className="w-full justify-start"
        onClick={() => setOpen(true)}
        title={`Reference an element from another level (${entries.length} available)`}
      >
        <Plus aria-hidden="true" className="shrink-0" />
        {/* Short enough to fit the rail at its narrowest without truncating —
            "Reference an element…" ellipsised to "Reference elem…", which is
            worse than a shorter honest label. Echoes the panel's existing
            "Add containers inside" phrasing. */}
        <span className="min-w-0 flex-1 truncate text-left">Add reference</span>
        <span className="shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] leading-none font-medium text-secondary-foreground">
          {entries.length}
        </span>
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title="Reference an element"
        description="Elements from levels above, shown here as read-only placeholders. Edit the original at its own level."
      >
        <div onKeyDown={onKeyDown}>
          <input
            // A picker whose whole purpose is search should be typeable the
            // instant it opens; the Dialog primitive has already moved focus
            // into the panel, so this only refines where inside it lands.
            autoFocus
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="Search by name, type, or level…"
            aria-label="Search elements to reference"
            aria-controls="ref-picker-list"
            className="mb-2 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />

          {filtered.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">
              Nothing matches “{query.trim()}”.
            </p>
          ) : (
            <ul
              id="ref-picker-list"
              // Bounded height so a huge model scrolls inside the dialog
              // instead of growing it past the viewport.
              className="max-h-72 overflow-y-auto"
            >
              {filtered.map((entry, index) => {
                const { label, Icon } = NODE_TYPE_META[entry.node.type];
                const isActive =
                  index === Math.min(active, filtered.length - 1);
                return (
                  <li key={`${entry.sourceDiagramId}/${entry.node.id}`}>
                    <button
                      type="button"
                      onClick={() => place(entry)}
                      onMouseEnter={() => setActive(index)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
                        isActive ? "bg-secondary" : "hover:bg-secondary/60",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm text-foreground">
                          {entry.node.name}
                        </span>
                        <span className="truncate text-[10px] leading-tight text-muted-foreground">
                          {label}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full border border-border px-1.5 py-0.5 text-[9px] leading-none font-medium text-muted-foreground">
                        <ArrowUp aria-hidden="true" className="size-2.5" />
                        {entry.sourceLevel}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  );
}
