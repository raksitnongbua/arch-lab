/**
 * Whether the reader has LOCKED the canvas against editing, remembered across
 * visits.
 *
 * LOCKED IS THE DEFAULT, and the stored value is still the lock rather than
 * the permission. This reverses the default this file used to argue for, so
 * the old argument is worth stating before the reason it stopped holding: a
 * stray drag changed the reader's own copy of a document in their own browser,
 * undoable and reloadable away, and defaulting to read-only would hide the
 * feature behind a control nobody would think to look for — a large cost to
 * avoid one close to zero.
 *
 * WHAT CHANGED IS THE CANVAS. When that was written, the one thing a canvas
 * gesture could do was move a C4 node eight pixels. The canvas now creates,
 * repoints, removes and renames messages and lifelines, reorders them by drag,
 * and rewrites wording in place — and every one of those lands in the source
 * text. "Undoable" is still true and no longer reassuring: the common visit to
 * this page is READING a diagram somebody sent, and a mis-aimed press on a
 * document you did not write is now an edit you have to notice before you can
 * undo it.
 *
 * AND THE OBJECTION IS ANSWERED BY THE CONTROL, NOT BY THE DEFAULT. Hiding the
 * feature was the real risk in flipping this, and it is the failure this
 * project has already shipped twice. The answer is that the locked face of the
 * control is an INVITATION rather than a status: a pencil offering "Edit", not
 * a padlock reporting "Locked". The argument for that shape, and the
 * assertions that keep it, are in `canvas-lock-button.tsx`. If that control
 * ever regresses to reporting state, this default is wrong again.
 *
 * WHO THE LOCK IS FOR is now the common case rather than the exception:
 * someone READING or PRESENTING. Sharing a screen, talking through a diagram,
 * dragging the canvas to pan — and one press that starts on a node instead of
 * on empty space moves a box in front of an audience.
 *
 * AN EXISTING CHOICE SURVIVES, which is why the default moved by changing what
 * an ABSENT cookie means and not by changing what a stored one means. The two
 * spellings are the reader's own words: `unlocked` still reads as editable, so
 * a reader who deliberately chose Editable under the old default keeps it, and
 * `locked` still reads as locked. Only the never-set case moved. Inverting the
 * cookie's meaning would have reversed every reader who had already decided —
 * see `whenUnset` in `preference-cookie.ts`.
 *
 * REMEMBERED, because the reader who wants it wants it every time: someone who
 * uses this page to edit will edit again. Stored as a cookie for the reason
 * `source-fold.ts` sets out at length — the server renders this page, so a
 * preference it cannot see is a preference that flashes the wrong state on
 * every load, and for a lock that flash is a frame in which a drag can land.
 *
 * ONE KEY FOR EVERY PLAYGROUND ROUTE, matching the source fold: "do not let me
 * move things" is about how you are using the page, not which document you
 * opened.
 */

import { booleanPreference } from "./preference-cookie";

/**
 * What a reader who has never touched the control gets. Named and exported
 * rather than written as a bare `true` here and a second `true` at the
 * playground's prop default, which is exactly how a default ends up disagreeing
 * with itself: the server would send one answer and a host that omits the prop
 * would render the other.
 */
export const CANVAS_LOCKED_BY_DEFAULT = true;

/** Module-level, for the reason given in `use-preference.ts`. */
export const canvasLockPreference = booleanPreference({
  cookie: "af-canvas-locked",
  onValue: "locked",
  offValue: "unlocked",
  whenUnset: CANVAS_LOCKED_BY_DEFAULT,
});

/** The cookie the server reads and the lock writes. */
export const CANVAS_LOCK_COOKIE = canvasLockPreference.cookie;

/**
 * The server's read. Anything that is not the reader's explicit `unlocked`
 * reads as locked, so a first-time reader — and a reader carrying a stale
 * value from some future rename — gets the default without the server having
 * to know about defaults.
 */
export const isLockedCookie = canvasLockPreference.fromCookie;
