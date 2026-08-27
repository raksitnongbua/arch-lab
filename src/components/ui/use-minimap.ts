"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Whether the minimap is showing, and the one key that changes it.
 *
 * CLOSED IS THE DEFAULT, and that is a product decision rather than a
 * performance one. `purpose.md` says a diagram here is meant to be PRESENTED —
 * shown in a review, dropped in a deck, put on a screen while someone talks
 * through it — and a 160x108 thumbnail that nobody asked for was sitting on
 * every diagram from the moment it opened, in every screenshot and behind every
 * speaker. The map is for a reader who has LOST their place, which is a state,
 * not a default.
 *
 * NOT REMEMBERED, deliberately: closed means closed on arrival, every visit.
 * The alternative — sticky once opened — is defensible and was considered, but
 * it makes the presentation case depend on what the presenter last did while
 * authoring, which is exactly the surprise this default exists to remove. The
 * lock and the source fold ARE remembered (`preference-cookie.ts`); if this
 * should join them, that is the seam, and it is one call site away.
 *
 * WHICH MEANS THE BUTTON CARRIES THE FEATURE. A default-off map reachable only
 * by a keystroke is a feature nobody finds — this product has shipped that
 * mistake twice, and `canvas-lock.ts` records the second. So the toggle is a
 * permanent, labelled control in the navigation cluster and the key is the
 * shortcut FOR it, never the only route to it.
 *
 * `m`, BARE, is the first single-letter shortcut in this app: every other
 * binding is `mod+`, `shift+` or a named key. That is why the form-field
 * exemption below is not optional — without it, typing "m" in the source pane
 * would toggle a map instead of typing a letter. Miro binds the same key for
 * the same thing, so a reader arriving from there already knows it.
 */
export interface Minimap {
  open: boolean;
  toggle: () => void;
}

/** Whether a keystroke belongs to whatever the reader is typing into. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable]") !== null
  );
}

export function useMinimap(): Minimap {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((current) => !current), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "m" && event.key !== "M") return;
      /* Any modifier means the reader meant something else — ⌘M minimises the
         window on a Mac, and claiming it would fight the operating system. */
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return { open, toggle };
}
