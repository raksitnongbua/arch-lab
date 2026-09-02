"use client";

/**
 * The layout-direction control, beside the canvas lock: one small button that
 * opens a menu of OUTCOMES.
 *
 * WHY IT LIVES HERE AND NOT IN THE VIEW-CONTROLS PILL. The pill at the
 * canvas's bottom right — zoom, fit, the minimap, mono — changes what the
 * READER sees and touches no file. This changes the document: it writes a
 * `direction` line, and the next person to open the text sees it. Controls
 * that edit belong with the padlock that governs editing, and this one is only
 * mounted while that padlock is open, so it cannot be pressed on a shared link
 * or a locked canvas.
 *
 * TWO REDESIGNS, AND BOTH FAILURES ARE WORTH KEEPING WRITTEN DOWN.
 *
 * The first offered `File · Top-down · Left-right` as three DIRECTIONS, with
 * `File` meaning "inherit". It conflated which way with how widely, and
 * pressing `File` did nothing for the common case — a diagram with no
 * attribute of its own is already inheriting, so that button was the state in
 * force. It also left no way to set the file's direction at all.
 *
 * The second split scope out as its own segmented control: `This layer |
 * Whole file` beside `Top-down | Left-right`. Correct, and still wrong — four
 * chips in two groups is more chrome than a canvas corner has room for, every
 * two-word label wrapped mid-hyphen ("Top- / down"), and the reader had to
 * ASSEMBLE an outcome from two axes before anything happened.
 * `menu-item.ts` had already written the rule that kills it: "a menu should
 * say what you GET, not make you assemble it."
 *
 * So: one row per outcome. Four rows, each naming both the shape and the
 * scope, plus a clearing row that appears only when there is something to
 * clear. Resting chrome is one button wide, the anatomy is `zoom-menu.tsx`'s
 * (readout-as-button, shared dismissal hook, real `<button>` rows), and no row
 * can be one whose press does nothing — the row currently in force is checked
 * rather than pressable-and-inert.
 *
 * The glyphs are the shapes, not letters: a column of bars for top-down, a row
 * of them for left-to-right. A reader reaches for this because the picture is
 * the wrong shape, so the control shows shapes.
 */

import { useCallback, useId, useRef, useState } from "react";
import { Check } from "lucide-react";

import { useMenuDismissal } from "@/components/ui/menu-dismissal";
import { cn } from "@/lib/utils";
import type { C4LayoutDirection } from "@/types";

/** Which document line a press writes. */
export type DirectionScope = "layer" | "file";

function DirectionGlyph({
  value,
  className,
}: {
  value: C4LayoutDirection;
  className?: string;
}) {
  return value === "tb" ? (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <rect x="3" y="1" width="6" height="2.4" rx="0.6" />
      <rect x="3" y="4.8" width="6" height="2.4" rx="0.6" />
      <rect x="3" y="8.6" width="6" height="2.4" rx="0.6" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      fill="currentColor"
      className={className}
    >
      <rect x="1" y="3" width="2.4" height="6" rx="0.6" />
      <rect x="4.8" y="3" width="2.4" height="6" rx="0.6" />
      <rect x="8.6" y="3" width="2.4" height="6" rx="0.6" />
    </svg>
  );
}

const OUTCOMES: readonly {
  scope: DirectionScope;
  direction: C4LayoutDirection;
  label: string;
  hint: string;
}[] = [
  {
    scope: "layer",
    direction: "tb",
    label: "Top-down, this layer",
    hint: "direction=tb on this diagram",
  },
  {
    scope: "layer",
    direction: "lr",
    label: "Left-right, this layer",
    hint: "direction=lr on this diagram",
  },
  {
    scope: "file",
    direction: "tb",
    label: "Top-down, whole file",
    hint: "direction tb in the header",
  },
  {
    scope: "file",
    direction: "lr",
    label: "Left-right, whole file",
    hint: "direction lr in the header",
  },
];

export function LayoutDirectionMenu({
  layerDirection,
  fileDirection,
  onApply,
  onClear,
}: {
  /** This diagram's own attribute, or null when it carries none. */
  layerDirection: C4LayoutDirection | null;
  /** The file's header line, or null when it has none. */
  fileDirection: C4LayoutDirection | null;
  onApply: (scope: DirectionScope, direction: C4LayoutDirection) => void;
  onClear: (scope: DirectionScope) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // The dismissal contract lives in the shared hook — see `menu-dismissal.ts`
  // for the Escape-consumption and pointerdown arguments it carries.
  const closeMenu = useCallback(() => setOpen(false), []);
  useMenuDismissal(open, closeMenu, wrapperRef);

  /* What the diagram is ACTUALLY laid out by, which is what the button shows:
     its own attribute if it has one, else the file's, else top-down. The rows
     tick the setting they would write, which is a different question — a
     diagram inheriting `lr` from the file shows "Left-right" on the button and
     a tick on the FILE row, because that is where the line lives. */
  const effective: C4LayoutDirection = layerDirection ?? fileDirection ?? "tb";

  const choose = (scope: DirectionScope, direction: C4LayoutDirection) => {
    setOpen(false);
    onApply(scope, direction);
  };
  const clear = (scope: DirectionScope) => {
    setOpen(false);
    onClear(scope);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={`Layout runs ${effective === "lr" ? "left to right" : "top to bottom"} — choose a layout direction`}
        title="Layout direction"
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2 py-1.5 text-[11px] font-medium whitespace-nowrap text-foreground shadow-sm backdrop-blur transition-colors hover:bg-secondary"
      >
        <DirectionGlyph value={effective} className="size-3 shrink-0" />
        {effective === "lr" ? "Left-right" : "Top-down"}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Layout direction"
          /* Opens DOWNWARD and to the right edge: this button sits at the
             canvas's top right beside the padlock, so there is room below it
             and none above. */
          className="af-glass absolute top-full right-0 z-20 mt-1.5 min-w-56 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
        >
          {OUTCOMES.map((row) => {
            const inForce =
              (row.scope === "layer" ? layerDirection : fileDirection) ===
              row.direction;
            return (
              <button
                key={`${row.scope}-${row.direction}`}
                type="button"
                role="menuitemradio"
                aria-checked={inForce}
                onClick={() => choose(row.scope, row.direction)}
                className={cn(
                  "flex w-full items-start gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none",
                  inForce ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <Check
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 size-3 shrink-0",
                    !inForce && "invisible",
                  )}
                />
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-xs whitespace-nowrap",
                      inForce && "font-medium",
                    )}
                  >
                    {row.label}
                  </span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {row.hint}
                  </span>
                </span>
              </button>
            );
          })}

          {/* Clearing rows exist only when there is a line to remove, which is
              what keeps every row in this menu one that does something. */}
          {layerDirection !== null || fileDirection !== null ? (
            <div className="mt-1 border-t border-border pt-1">
              {layerDirection !== null ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => clear("layer")}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                >
                  <span className="size-3 shrink-0" />
                  Follow the file instead
                </button>
              ) : null}
              {fileDirection !== null ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => clear("file")}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs whitespace-nowrap text-muted-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                >
                  <span className="size-3 shrink-0" />
                  Remove the file&rsquo;s direction
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
