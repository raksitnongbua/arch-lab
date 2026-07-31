"use client";

/**
 * The shortcut hint on the canvas: a few essentials, and the way to the rest.
 *
 * Why anything at all — the editor's two most useful gestures are invisible.
 * Nothing on screen says that double-clicking empty canvas creates an element or
 * that a node's corner grip drags out a related one. A control you cannot see is
 * a control you do not have, however well it works.
 *
 * Why only three — the full list is 25 entries. A canvas strip that tried to
 * carry them would be a wall of text over the diagram, which is the thing people
 * came to look at. Three unguessable ones plus a door to the sheet.
 *
 * Matches the viewer's `bottom-center` pill deliberately: same position, same
 * shape, same `hidden sm:block`. The two canvases should feel like one product,
 * and on a phone neither has the width to spare.
 */

import { useCallback, useMemo, useState } from "react";
import { Panel } from "@xyflow/react";

import {
  useShortcuts,
  type ShortcutBinding,
} from "../../hooks/use-keyboard-shortcuts";
import { CANVAS_HINTS, SHORTCUT_SHEET_COMBO } from "../../lib/shortcut-catalog";
import { ShortcutSheet } from "./shortcut-sheet";

export function ShortcutHint(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const bindings = useMemo<ShortcutBinding[]>(
    () => [
      {
        id: "t2f:shortcuts:open",
        combo: SHORTCUT_SHEET_COMBO,
        // Not while renaming: `?` is a character someone may be typing. The
        // registry already suppresses bindings inside inputs, and `labelEdit`
        // covers the inline canvas editor for the same reason.
        when: ({ store }) => store.labelEdit === null,
        run: () => setOpen((value) => !value),
      },
    ],
    [],
  );
  useShortcuts(bindings);

  const mod =
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad|ipod/i.test(navigator.platform)
      ? "⌘"
      : "Ctrl";

  return (
    <>
      <Panel position="bottom-center" className="hidden sm:block">
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          {CANVAS_HINTS.map((hint, index) => (
            <span key={index} className="flex items-center gap-1">
              {index > 0 ? (
                <span aria-hidden="true" className="text-muted-foreground/40">
                  ·
                </span>
              ) : null}
              <span className="font-medium text-primary">
                {hint.keys.map((key) => (key === "mod" ? mod : key)).join("")}
              </span>
              <span>{hint.what}</span>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-1 flex items-center gap-1 rounded-full border border-border/60 px-1.5 py-0.5 transition-colors hover:border-ring/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <kbd className="font-mono text-[10px]">?</kbd>
            shortcuts
          </button>
        </div>
      </Panel>
      <ShortcutSheet open={open} onClose={close} />
    </>
  );
}
