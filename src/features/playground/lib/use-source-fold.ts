"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  readSourceCollapsed,
  subscribeSourceCollapsed,
  writeSourceCollapsed,
} from "./source-fold";

/**
 * The remembered fold, and a setter that persists it — same shape as
 * `useState<boolean>`, so the call site reads as it did before it was stored.
 *
 * `initial` is what the SERVER rendered, read from the request's cookie, and
 * it is the server snapshot here so hydration matches the markup exactly. The
 * client read is the same cookie, so the two agree by construction rather than
 * by a correction the reader can see.
 */
export function useSourceCollapsed(
  initial: boolean,
): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(
    subscribeSourceCollapsed,
    readSourceCollapsed,
    () => initial,
  );
  return [
    collapsed,
    useCallback((next: boolean) => writeSourceCollapsed(next), []),
  ];
}
