"use client";

/**
 * The layout-direction control, beside the canvas lock.
 *
 * WHY IT LIVES HERE AND NOT IN THE VIEW-CONTROLS PILL. The pill at the
 * canvas's bottom right — zoom, fit, the minimap, mono — changes what the
 * READER sees and touches no file. This changes the document: it writes a
 * `direction` line, and the next person to open the text sees it. Controls
 * that edit belong with the padlock that governs editing, and this one is only
 * mounted when that padlock is open, so it cannot be pressed on a shared link
 * or a locked canvas.
 *
 * TWO QUESTIONS, TWO CONTROLS, AND THAT IS A CORRECTION. The first version
 * offered `File · Top-down · Left-right` as three directions, where `File`
 * meant "inherit". It conflated which way with how widely, and pressing `File`
 * did nothing at all for the common case — a diagram with no attribute of its
 * own is ALREADY inheriting, so the button was the state in force. It also
 * left no way to set the file's direction, which is the one thing a button
 * labelled "File" should obviously do. Reported as "กดแล้วไม่เกิดไรขึ้น" —
 * pressed it, nothing happened — which is exactly what it did.
 *
 * So: SCOPE is its own choice, and the two direction buttons apply at that
 * scope. `This layer` writes `direction=` onto the diagram's own line;
 * `Whole file` writes the `direction` header line. What is in force at the
 * selected scope is the button that reads as pressed.
 *
 * CLEARING IS ONLY OFFERED WHEN THERE IS SOMETHING TO CLEAR. `Follow file`
 * appears only while `This layer` is selected AND the diagram carries its own
 * attribute; `Clear` appears only while `Whole file` is selected and the file
 * has a line. That is what stops this control ever showing a button whose
 * press does nothing — the failure it is replacing.
 *
 * The glyphs are the shapes, not letters: a column of bars for top-down, a row
 * for left-to-right. A reader reaches for this because the picture is the
 * wrong shape, so the control shows shapes.
 */

import type { C4LayoutDirection } from "@/types";

/** Which document line a press writes. */
export type DirectionScope = "layer" | "file";

function DirectionGlyph({ value }: { value: C4LayoutDirection }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 12 12",
    "aria-hidden": true as const,
    fill: "currentColor",
  };
  return value === "tb" ? (
    <svg {...common}>
      <rect x="3" y="1" width="6" height="2.4" rx="0.6" />
      <rect x="3" y="4.8" width="6" height="2.4" rx="0.6" />
      <rect x="3" y="8.6" width="6" height="2.4" rx="0.6" />
    </svg>
  ) : (
    <svg {...common}>
      <rect x="1" y="3" width="2.4" height="6" rx="0.6" />
      <rect x="4.8" y="3" width="2.4" height="6" rx="0.6" />
      <rect x="8.6" y="3" width="2.4" height="6" rx="0.6" />
    </svg>
  );
}

const CHIP =
  "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors";
const ON = "bg-primary text-primary-foreground";
const OFF = "text-muted-foreground hover:bg-secondary hover:text-foreground";
const GROUP =
  "flex items-center gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 shadow-sm backdrop-blur";

export function LayoutDirectionToggle({
  scope,
  onScopeChange,
  layerDirection,
  fileDirection,
  onApply,
  onClear,
}: {
  scope: DirectionScope;
  onScopeChange: (next: DirectionScope) => void;
  /** This diagram's own attribute, or null when it carries none. */
  layerDirection: C4LayoutDirection | null;
  /** The file's header line, or null when it has none. */
  fileDirection: C4LayoutDirection | null;
  onApply: (scope: DirectionScope, direction: C4LayoutDirection) => void;
  onClear: (scope: DirectionScope) => void;
}) {
  /* What is in force AT THE SELECTED SCOPE — not what the diagram ends up
     laid out by. Showing the effective direction would make `Whole file` light
     a button the file does not say, and then pressing it would do nothing:
     the bug this control was rebuilt to remove. */
  const inForce = scope === "layer" ? layerDirection : fileDirection;
  const clearable = inForce !== null;

  return (
    <div className="flex items-center gap-1.5">
      <div
        role="group"
        aria-label="Where the direction applies"
        className={GROUP}
      >
        {(
          [
            [
              "layer",
              "This layer",
              "Write direction= on this diagram's own line",
            ],
            ["file", "Whole file", "Write the file's direction header line"],
          ] as const
        ).map(([value, label, title]) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            title={title}
            /* Selecting a scope writes nothing — it re-aims the two buttons
               beside it. Pressing it while already selected is therefore
               harmless rather than a no-op that looks broken. */
            onClick={() => onScopeChange(value)}
            className={[CHIP, scope === value ? ON : OFF].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Layout direction" className={GROUP}>
        {(
          [
            ["tb", "Top-down"],
            ["lr", "Left-right"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={inForce === value}
            title={
              value === "tb"
                ? scope === "layer"
                  ? "Lay this diagram out top to bottom — writes direction=tb on its line"
                  : "Lay the whole file out top to bottom — writes direction tb"
                : scope === "layer"
                  ? "Lay this diagram out left to right, folding a long flow into bands — writes direction=lr on its line"
                  : "Lay the whole file out left to right, folding a long flow into bands — writes direction lr"
            }
            onClick={() => {
              if (inForce !== value) onApply(scope, value);
            }}
            className={[CHIP, inForce === value ? ON : OFF].join(" ")}
          >
            <DirectionGlyph value={value} />
            {label}
          </button>
        ))}
        {clearable ? (
          <button
            type="button"
            title={
              scope === "layer"
                ? "Remove this diagram's direction= so it follows the file again"
                : "Remove the file's direction line"
            }
            onClick={() => onClear(scope)}
            className={[CHIP, OFF].join(" ")}
          >
            {scope === "layer" ? "Follow file" : "Clear"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
