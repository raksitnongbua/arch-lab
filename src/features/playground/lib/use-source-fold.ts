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
 */
export function useSourceCollapsed(): [boolean, (collapsed: boolean) => void] {
  const collapsed = useSyncExternalStore(
    subscribeSourceCollapsed,
    readSourceCollapsed,
    () => false,
  );
  return [
    collapsed,
    useCallback((next: boolean) => writeSourceCollapsed(next), []),
  ];
}
