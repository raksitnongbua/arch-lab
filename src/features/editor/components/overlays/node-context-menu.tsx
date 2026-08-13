"use client";

/**
 * The node context menu (T2-C — AF-E2-S2). Props-free per §4.4; mounted by
 * the frozen `canvas.tsx`, which publishes right-clicked nodes to the
 * `useCanvasInteraction` seam. This component reads `contextMenu` from that
 * seam — no global listeners of its own for state the seam already carries —
 * and clears it when the menu closes.
 *
 * Items:
 * - "Drill into" — opens the node's child diagram, or, on a drillable leaf,
 *   creates an empty child one level deeper first (`createChildDiagram`, ONE
 *   undo entry) and navigates in. Navigation is never an undo entry.
 * - A `code`-level node, a boundary placeholder, or a `childRef` node gets
 *   NO drill affordance in any form (AF-E2-S2, D4).
 * - "Rename" — begins inline label editing (`F2`/`Enter` stay T2-A's combos;
 *   this just calls the store).
 *
 * Accessibility: `menu`/`menuitem` roles, focus lands on the first item on
 * open and returns to the previously focused element on close, arrow keys
 * rove with wrap, Home/End jump, Escape closes (also handled centrally by
 * the canvas's Escape binding), outside pointerdown closes.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

import { LEVEL_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { childLevelOf, hasChildDiagram, isBoundaryPlaceholder } from "@/types";

import { canDrillInto, drillIntoNode } from "../../hooks/use-level-navigation";
import { duplicateNodes } from "../../lib/duplicate";
import { useEditorStore } from "../../state";
import { setContextMenu, useCanvasInteraction } from "../canvas";

const VIEWPORT_MARGIN_PX = 8;

interface MenuItem {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

function focusItemAt(menu: HTMLElement | null, index: number): void {
  if (menu === null) return;
  const items = menu.querySelectorAll<HTMLElement>("[role='menuitem']");
  if (items.length === 0) return;
  const clamped = ((index % items.length) + items.length) % items.length;
  items[clamped]?.focus();
}

export function NodeContextMenu(): React.JSX.Element | null {
  const contextMenu = useCanvasInteraction((s) => s.contextMenu);
  const diagram = useEditorStore(
    (s) => s.model.diagrams[s.activeDiagramId] ?? null,
  );

  const menuRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const node =
    contextMenu !== null && diagram !== null
      ? (diagram.nodes.find((n) => n.id === contextMenu.nodeId) ?? null)
      : null;
  const open = contextMenu !== null && node !== null;

  const close = useCallback((restoreFocus: boolean) => {
    if (restoreFocus) {
      const previous = previousFocusRef.current;
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus();
      }
    }
    setContextMenu(null);
  }, []);

  // A stale target (node deleted, diagram switched) clears the seam.
  useEffect(() => {
    if (contextMenu !== null && node === null) setContextMenu(null);
  }, [contextMenu, node]);

  // Position: the menu renders hidden at the raw pointer position, then this
  // effect measures it, clamps it into the viewport, reveals it and moves
  // focus to the first item. Imperative style writes — never state — so an
  // unrelated re-render cannot reset the clamped position (React only patches
  // style keys whose JSX values changed).
  useLayoutEffect(() => {
    if (!open || contextMenu === null) return;
    const menu = menuRef.current;
    if (menu === null) return;
    previousFocusRef.current = document.activeElement;
    menu.style.left = `${Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(
        contextMenu.screenPosition.x,
        window.innerWidth - menu.offsetWidth - VIEWPORT_MARGIN_PX,
      ),
    )}px`;
    menu.style.top = `${Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(
        contextMenu.screenPosition.y,
        window.innerHeight - menu.offsetHeight - VIEWPORT_MARGIN_PX,
      ),
    )}px`;
    menu.style.visibility = "visible";
    focusItemAt(menu, 0);
  }, [open, contextMenu]);

  // Outside pointerdown closes. This state is NOT carried by the seam (the
  // canvas only clears on pane clicks); scoped to while the menu is open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu !== null && event.target instanceof Node) {
        if (menu.contains(event.target)) return;
      }
      setContextMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!open || node === null || diagram === null) return null;
  // Boundary placeholders are read-only: no menu at all.
  if (isBoundaryPlaceholder(node)) return null;

  const childLevel = childLevelOf(diagram.level);
  const items: MenuItem[] = [];
  if (hasChildDiagram(node)) {
    items.push({
      id: "drill",
      label: "Drill into",
      // A child diagram is always exactly one level deeper (AF-E2-S1).
      hint: childLevel !== null ? LEVEL_LABEL[childLevel] : undefined,
      run: () => drillIntoNode(node.id),
    });
  } else if (childLevel !== null && canDrillInto(node, true)) {
    items.push({
      id: "drill-create",
      label: "Drill into",
      hint: `New ${LEVEL_LABEL[childLevel]}`,
      run: () => drillIntoNode(node.id),
    });
  }
  items.push({
    id: "rename",
    label: "Rename",
    hint: "F2",
    run: () =>
      useEditorStore.getState().beginLabelEdit({ kind: "node", id: node.id }),
  });
  items.push({
    id: "duplicate",
    label: "Duplicate",
    // No hint: there is no single-key duplicate binding, and advertising one
    // that does not exist is worse than showing nothing.
    // Right-clicking a node does not necessarily select it, so this duplicates
    // the node under the CURSOR rather than `selection` — what the user
    // actually pointed at. The clone is selected, so a drag moves the copy.
    run: () => duplicateNodes([node.id]),
  });

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // The menu is modal to the keyboard: nothing may leak to the window-level
    // shortcut registry (arrow-nudge, Escape-clears-selection, Enter-rename).
    event.stopPropagation();
    const menu = menuRef.current;
    if (menu === null) return;
    const itemEls = Array.from(
      menu.querySelectorAll<HTMLElement>("[role='menuitem']"),
    );
    const activeIndex = itemEls.findIndex(
      (el) => el === document.activeElement,
    );
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItemAt(menu, activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItemAt(menu, activeIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItemAt(menu, 0);
        break;
      case "End":
        event.preventDefault();
        focusItemAt(menu, itemEls.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
      default:
        break;
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${node.name}`}
      aria-orientation="vertical"
      className="fixed z-50 max-w-64 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{
        left: contextMenu.screenPosition.x,
        top: contextMenu.screenPosition.y,
        visibility: "hidden",
      }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground/90",
            "hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none",
          )}
          onClick={() => {
            close(false);
            item.run();
          }}
        >
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint !== undefined ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {item.hint}
            </span>
          ) : null}
        </button>
      ))}
    </div>,
    document.body,
  );
}
