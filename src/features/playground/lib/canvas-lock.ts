/**
 * Whether the reader has LOCKED the C4 canvas against editing, remembered
 * across visits.
 *
 * EDITABLE IS THE DEFAULT, and the stored value is the lock rather than the
 * permission. Nothing here is uploaded and nothing is stored: a stray drag
 * changes the reader's own copy of a document in their own browser, which they
 * can undo, retype or reload away. Defaulting to read-only would hide the
 * feature behind a control nobody would think to look for, to protect against
 * a cost that is close to zero.
 *
 * WHO THE LOCK IS FOR, since the default answers the common case: someone
 * PRESENTING. Sharing a screen, talking through a diagram, dragging the canvas
 * to pan — and one press that starts on a node instead of on empty space moves
 * a box in front of an audience. That is the whole reason the control exists,
 * and it is why it sits in the canvas strip beside the immersive toggle rather
 * than in a settings menu.
 *
 * REMEMBERED, because the reader who wants it wants it every time: someone who
 * uses this page to present will present again. Stored as a cookie for the
 * reason `source-fold.ts` sets out at length — the server renders this page,
 * so a preference it cannot see is a preference that flashes the wrong state
 * on every load.
 *
 * ONE KEY FOR EVERY PLAYGROUND ROUTE, matching the source fold: "do not let me
 * move things" is about how you are using the page, not which document you
 * opened.
 */

import { booleanPreference } from "./preference-cookie";

/** Module-level, for the reason given in `use-preference.ts`. */
export const canvasLockPreference = booleanPreference({
  cookie: "af-canvas-locked",
  onValue: "locked",
  offValue: "unlocked",
});

/** The cookie the server reads and the lock writes. */
export const CANVAS_LOCK_COOKIE = canvasLockPreference.cookie;

/**
 * The server's read. An ABSENT cookie is `false` — editable — so a first-time
 * reader gets the default without the server having to know about defaults.
 */
export const isLockedCookie = canvasLockPreference.fromCookie;
