"use client";

/**
 * The full shortcut reference, opened from the canvas hint or `?`.
 *
 * Renders `lib/shortcut-catalog.ts` — the sheet holds no list of its own, so
 * there is one place to add a shortcut and one place a check script can verify.
 *
 * Gestures sit alongside keystrokes rather than in a separate panel. From the
 * reader's side "how do I add an element" has one answer, and it happens to be
 * a double-click; splitting by input device would make them hunt in two places
 * for the same question.
 */

import { useMemo } from "react";

import { Dialog } from "@/components/ui/dialog";

import {
  SHORTCUT_GROUPS,
  type ShortcutEntry,
} from "../../lib/shortcut-catalog";

/**
 * `mod` is Cmd on Apple platforms and Ctrl elsewhere — the same resolution the
 * shortcut registry does, so the sheet cannot advertise a key the binding is not
 * listening for. Read at render, not module load, because this is a client
 * component and `navigator` is only there in the browser.
 */
function useModLabel(): string {
  return useMemo(
    () =>
      typeof navigator !== "undefined" &&
      /mac|iphone|ipad|ipod/i.test(navigator.platform)
        ? "⌘"
        : "Ctrl",
    [],
  );
}

const PRETTY: Readonly<Record<string, string>> = {
  shift: "⇧",
  alt: "⌥",
  space: "Space",
  Escape: "Esc",
};

/**
 * Tokens that describe a MOVEMENT rather than a key to press. Declared, not
 * inferred: a spelling heuristic (`/[a-z]{4,}/`) rendered `Enter`, `Delete` and
 * `Backspace` as gestures, because those words also contain four lowercase
 * letters. Keys are a closed set — list them.
 */
const GESTURES = new Set([
  "double-click",
  "click",
  "drag",
  "drag ↗",
  "drag ●",
  "scroll",
]);

function KeyRun({
  keys,
  mod,
}: {
  keys: string[];
  mod: string;
}): React.JSX.Element {
  return (
    <>
      {keys.map((key, index) =>
        GESTURES.has(key) ? (
          <span
            key={index}
            className="text-[11px] text-muted-foreground italic"
          >
            {key}
          </span>
        ) : (
          <kbd
            key={index}
            className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] leading-none text-secondary-foreground"
          >
            {key === "mod" ? mod : (PRETTY[key] ?? key)}
          </kbd>
        ),
      )}
    </>
  );
}

function Keys({
  entry,
  mod,
}: {
  entry: ShortcutEntry;
  mod: string;
}): React.JSX.Element {
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      <KeyRun keys={entry.keys} mod={mod} />
      {entry.also !== undefined ? (
        <>
          <span className="text-[10px] text-muted-foreground/70">or</span>
          <KeyRun keys={entry.also} mod={mod} />
        </>
      ) : null}
    </span>
  );
}

export interface ShortcutSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutSheet({
  open,
  onClose,
}: ShortcutSheetProps): React.JSX.Element | null {
  const mod = useModLabel();
  if (!open) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Gestures are listed with the keys — the question is what you want to do, not which device does it."
    >
      <div className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-1.5">
            <h3 className="text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase">
              {group.title}
            </h3>
            <ul className="flex flex-col">
              {group.entries.map((entry, index) => (
                <li
                  key={index}
                  className="flex items-baseline justify-between gap-4 border-b border-border/40 py-1.5 last:border-b-0"
                >
                  <span className="min-w-0 text-xs text-foreground">
                    {entry.what}
                    {entry.when !== undefined ? (
                      <span className="text-muted-foreground">
                        {" "}
                        — {entry.when}
                      </span>
                    ) : null}
                  </span>
                  <Keys entry={entry} mod={mod} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
