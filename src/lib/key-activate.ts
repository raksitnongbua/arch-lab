import type { KeyboardEvent } from "react";

/**
 * Enter and Space activate a thing that is not a `<button>`.
 *
 * WHY IT EXISTS AT ALL. Every diagram canvas here is an `<svg>`, and the things
 * a reader selects inside one are `<rect>`s and `<path>`s carrying
 * `role="button"` and `tabIndex={0}`. That role is a promise: a screen reader
 * announces the shape as a button, and a keyboard user will press Enter or
 * Space expecting what a button does. Nothing in the platform honours that for
 * a non-native element, so the handler has to be written — and a `role="button"`
 * with no key handler is a control that only exists for a mouse.
 *
 * ONE COPY, AFTER THREE. This body was written out identically in the
 * flowchart, sequence and use-case canvases before it lived anywhere, and the
 * gantt, timeline and lifecycle canvases each needed a fourth, fifth and sixth
 * when their hover-to-select was withdrawn — at which point `dry.md`'s test
 * ("identical bodies, copy-paste fingerprints") stops being arguable. The three
 * originals now import this.
 *
 * BOTH `preventDefault` AND `stopPropagation` ARE LOAD-BEARING, and the reason
 * the sequence canvas wrote down is the reason for all of them: Space scrolls
 * the pane by default, and the viewers wrap their canvas in an element with its
 * own key handler that would otherwise see the same press twice.
 *
 * NOT AN `onClick` SUBSTITUTE. A pointer click and a key press stay separate
 * handlers on the same element; this only ever adds the keyboard half.
 */
export const keyActivate =
  (action: () => void) =>
  (event: KeyboardEvent<SVGElement>): void => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };
