"use client";

/**
 * The dismissal contract a menu floating over a canvas owes, in one hook —
 * shared by the zoom menu and the Add strip's reference menu so a fix to
 * either's dismissal reaches the other (`dry.md`: same body, one definition).
 *
 * The contract, and why each clause is what it is:
 *
 *   - ESCAPE CLOSES AND IS CONSUMED. Both canvases run an Escape ladder
 *     (deselect → climb → leave immersive mode) on a window listener that
 *     honours `defaultPrevented`; without the consume, one press would close
 *     the menu AND clear the reader's selection — two steps for one key, the
 *     ladder rule the sequence playground documents. Captured (`true`) so this
 *     runs before the ladder's bubble-phase listener ever sees the event.
 *   - OUTSIDE `pointerdown` CLOSES, rather than `click`, so the menu is gone
 *     before the canvas beneath it reacts — otherwise dismissing the menu also
 *     pans the canvas or clears a selection.
 *   - One listener pair while open, none while closed.
 *
 * Deliberately dismissal ONLY: what the menu holds, where it opens (the zoom
 * menu opens upward off a bottom pill, the reference menu downward under the
 * toolbar) and what its rows mean stay with each menu, because those are the
 * parts that genuinely differ.
 */

import { useEffect } from "react";

export function useMenuDismissal(
  open: boolean,
  close: () => void,
  /** The element containing BOTH the trigger and the menu — pointer-downs
   *  inside it (including the trigger's own toggle) never dismiss. */
  wrapperRef: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Consumed, so this Escape does not also clear the canvas's selection
      // or leave immersive mode — one press, one step.
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, close, wrapperRef]);
}
