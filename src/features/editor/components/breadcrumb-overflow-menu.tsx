"use client";

/**
 * The breadcrumb's two dropdowns:
 *
 * - `BreadcrumbOverflowMenu` — the `…` menu the middle segments collapse into
 *   when the path is too wide. Root and current never enter it.
 * - `BreadcrumbSiblingsMenu` — the per-segment switcher for going ACROSS to a
 *   sibling diagram (other child diagrams of the same parent).
 *
 * Both share one keyboard-complete dropdown: `menu`/`menuitem(radio)` roles,
 * focus moves to the first item on open, arrow keys rove (wrapping),
 * Home/End jump, Escape/Tab close and return focus to the trigger, and an
 * outside pointerdown closes.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export interface BreadcrumbMenuItem {
  id: string;
  label: string;
  /** Small trailing hint, e.g. the C4 level. */
  hint?: string;
  /** Marks the item as the one currently shown (renders as a radio). */
  current?: boolean;
}

interface DropdownProps {
  triggerContent: ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  items: BreadcrumbMenuItem[];
  onSelect: (id: string) => void;
}

function focusItem(menu: HTMLElement | null, index: number): void {
  if (menu === null) return;
  const items = menu.querySelectorAll<HTMLElement>("[role^='menuitem']");
  const clamped = ((index % items.length) + items.length) % items.length;
  items[clamped]?.focus();
}

function BreadcrumbDropdown({
  triggerContent,
  triggerLabel,
  triggerClassName,
  items,
  onSelect,
}: DropdownProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Focus the first item as soon as the menu exists.
  useLayoutEffect(() => {
    if (open) focusItem(menuRef.current, 0);
  }, [open]);

  // Outside pointerdown closes without stealing the click.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root !== null && event.target instanceof Node) {
        if (root.contains(event.target)) return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // The menu is modal to the keyboard: nothing may leak to the window-level
    // shortcut registry (arrow-nudge, Escape-clears-selection, Enter-rename).
    event.stopPropagation();
    const menu = menuRef.current;
    if (menu === null) return;
    const itemEls = Array.from(
      menu.querySelectorAll<HTMLElement>("[role^='menuitem']"),
    );
    const activeIndex = itemEls.findIndex(
      (el) => el === document.activeElement,
    );
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(menu, activeIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(menu, activeIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(menu, 0);
        break;
      case "End":
        event.preventDefault();
        focusItem(menu, itemEls.length - 1);
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

  const hasRadios = items.some((item) => item.current !== undefined);

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        className={cn(
          "flex shrink-0 items-center rounded-md text-muted-foreground transition-colors",
          "hover:bg-secondary hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          open && "bg-secondary text-foreground",
          triggerClassName,
        )}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
      >
        {triggerContent}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          aria-orientation="vertical"
          className="absolute top-full left-0 z-50 mt-1.5 max-w-72 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role={hasRadios ? "menuitemradio" : "menuitem"}
              aria-checked={hasRadios ? item.current === true : undefined}
              tabIndex={-1}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                "hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none",
                item.current === true
                  ? "font-medium text-foreground"
                  : "text-foreground/90",
              )}
              onClick={() => {
                close(false);
                if (item.current !== true) onSelect(item.id);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint !== undefined ? (
                <span className="shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                  {item.hint}
                </span>
              ) : null}
              {item.current === true ? (
                <span aria-hidden="true" className="shrink-0 text-accent">
                  •
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The two breadcrumb dropdowns                                                */
/* -------------------------------------------------------------------------- */

export function BreadcrumbOverflowMenu({
  items,
  onNavigate,
}: {
  items: BreadcrumbMenuItem[];
  onNavigate: (diagramId: string) => void;
}): React.JSX.Element {
  return (
    <BreadcrumbDropdown
      triggerContent={
        <span aria-hidden="true" className="px-1 leading-none">
          …
        </span>
      }
      triggerLabel="Collapsed breadcrumb levels"
      triggerClassName="h-6 min-w-6 justify-center text-sm"
      items={items}
      onSelect={onNavigate}
    />
  );
}

export function BreadcrumbSiblingsMenu({
  segmentLabel,
  items,
  onNavigate,
}: {
  /** The segment the switcher belongs to, for the accessible name. */
  segmentLabel: string;
  items: BreadcrumbMenuItem[];
  onNavigate: (diagramId: string) => void;
}): React.JSX.Element {
  return (
    <BreadcrumbDropdown
      triggerContent={
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="size-3 fill-none stroke-current stroke-[1.5]"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" strokeLinecap="round" />
        </svg>
      }
      triggerLabel={`Switch to a sibling of ${segmentLabel}`}
      triggerClassName="size-5 justify-center"
      items={items}
      onSelect={onNavigate}
    />
  );
}
