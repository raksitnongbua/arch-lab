"use client";

/**
 * Quick-add menu. Props-free — mounted by
 * `canvas.tsx` inside the React Flow children, reads its state itself.
 *
 * Opens when an edge drag is released over empty canvas: `canvas.tsx`
 * publishes the gesture to `useCanvasInteraction` (`pendingConnect`) and this
 * component takes over. It offers only the active level's valid node types;
 * choosing one creates the node at the release point AND the edge from the
 * drag's source, as ONE undo entry (`createConnectedNode` →
 * `store.transact`). `Escape` (here, or centrally via the canvas's binding)
 * and pane clicks close it and create nothing.
 *
 * Keyboard: focus lands on the first option; arrows cycle; `Enter`/`Space`
 * choose; digits 1–n choose directly (registered by `useConnectShortcuts`).
 */

import { useEffect, useRef, type KeyboardEvent } from "react";

import { selectValidNodeTypes, useEditorStore } from "../../state";
import {
  createConnectedNode,
  useConnectShortcuts,
} from "../../hooks/use-connect-shortcuts";
import { setPendingConnect, useCanvasInteraction } from "../canvas";
import { NODE_TYPE_META } from "../palette-item";

/** Estimated popover box, for clamping inside the window. */
const MENU_WIDTH = 232;
const MENU_ITEM_HEIGHT = 38;
const MENU_CHROME_HEIGHT = 44;

export function QuickAddMenu(): React.JSX.Element | null {
  // The registry bindings live for the canvas's lifetime — this
  // component always renders (null when closed), so mounting them here keeps
  // them in -owned files only.
  useConnectShortcuts();

  const pendingConnect = useCanvasInteraction((s) => s.pendingConnect);
  const validTypes = useEditorStore(selectValidNodeTypes);
  const listRef = useRef<HTMLDivElement>(null);

  const open = pendingConnect !== null;

  // Focus the first option when the menu opens (keyboard operability).
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLButtonElement>("button[role='menuitem']")
      ?.focus();
  }, [open]);

  if (!pendingConnect) return null;

  const close = (): void => setPendingConnect(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      // Close only the menu (integration risk R5) — stop the event so the
      // canvas's central Escape binding cannot also clear the selection
      // after we have already reset `pendingConnect`.
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      // Let the focused option's default click fire, but keep the keypress
      // away from the global registry (`Enter` is 's rename combo).
      event.stopPropagation();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[role='menuitem']",
      ) ?? [],
    );
    if (items.length === 0) return;
    const active = document.activeElement;
    const index = items.findIndex((item) => item === active);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const next = items[(index + delta + items.length) % items.length];
    next?.focus();
  };

  const left = Math.max(
    8,
    Math.min(
      pendingConnect.screenPosition.x,
      window.innerWidth - MENU_WIDTH - 8,
    ),
  );
  const estimatedHeight =
    MENU_CHROME_HEIGHT + validTypes.length * MENU_ITEM_HEIGHT;
  const top = Math.max(
    8,
    Math.min(
      pendingConnect.screenPosition.y,
      window.innerHeight - estimatedHeight - 8,
    ),
  );

  return (
    <div
      ref={listRef}
      role="menu"
      aria-label="Add a connected element"
      style={{ left, top, width: MENU_WIDTH }}
      className="fixed z-50 flex flex-col rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      onKeyDown={handleKeyDown}
    >
      <p className="px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        Add connected element
      </p>
      {validTypes.map((type, index) => {
        const { label, Icon } = NODE_TYPE_META[type];
        return (
          <button
            key={type}
            type="button"
            role="menuitem"
            onClick={() => createConnectedNode(type)}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <kbd
              aria-hidden="true"
              className="shrink-0 rounded-sm border border-border bg-background px-1 font-mono text-[10px] text-muted-foreground"
            >
              {index + 1}
            </kbd>
          </button>
        );
      })}
    </div>
  );
}
