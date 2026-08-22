"use client";

import { useCallback, useSyncExternalStore } from "react";

import { canvasLockPreference } from "./canvas-lock";
import type { BooleanPreference } from "./preference-cookie";
import { sourceFoldPreference } from "./source-fold";

/**
 * A remembered boolean and a setter that persists it — the same shape as
 * `useState<boolean>`, so a call site reads as it did before it was stored.
 *
 * `initial` is what the SERVER rendered, read from the request's cookie, and
 * it is the server snapshot here so hydration matches the markup exactly. The
 * client read is the same cookie, so the two agree by construction rather than
 * by a correction the reader can see.
 *
 * The preference object must be a module-level singleton: `useSyncExternalStore`
 * resubscribes whenever `subscribe` changes identity, so a preference built
 * inside a component would tear down and re-add its listener every render.
 */
function usePreference(
  preference: BooleanPreference,
  initial: boolean,
): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(
    preference.subscribe,
    preference.read,
    () => initial,
  );
  return [
    value,
    useCallback((next: boolean) => preference.write(next), [preference]),
  ];
}

/** The remembered source-rail fold. */
export function useSourceCollapsed(
  initial: boolean,
): [boolean, (collapsed: boolean) => void] {
  return usePreference(sourceFoldPreference, initial);
}

/** The remembered canvas lock — see `canvas-lock.ts` for what it is for. */
export function useCanvasLocked(
  initial: boolean,
): [boolean, (locked: boolean) => void] {
  return usePreference(canvasLockPreference, initial);
}
