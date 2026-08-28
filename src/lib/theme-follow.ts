"use client";

/**
 * "Let my system decide" — the reader's preference, and the two reactive reads
 * the picker needs.
 *
 * SPLIT FROM `lib/theme-default.ts`, which owns the mapping and the pre-paint
 * script and is imported by the root layout: a server component cannot import a
 * module that depends on `useSyncExternalStore`. The seam is the honest one
 * anyway — that file is what the browser runs before React exists, this one is
 * what React reads afterwards.
 *
 * THE SHAPE IS `lib/idle-motion.ts`'s, deliberately: a `useSyncExternalStore`
 * over localStorage with a server snapshot, plus a `matchMedia` store beside it.
 * That module already carries the argument for every decision repeated here —
 * why the server snapshot is the default rather than a read of a browser API,
 * why a blocked localStorage degrades to session-only instead of throwing, and
 * why writes notify a local listener set as well as the `storage` event (which
 * only fires in OTHER tabs).
 */

import { useSyncExternalStore } from "react";

import { THEME_FOLLOW_STORAGE_KEY, THEME_STORAGE_KEY } from "@/lib/constants";
import { DARK_SCHEME_QUERY } from "@/lib/theme-default";

/* -------------------------------------------------------------------------- */
/* The OS preference                                                           */
/* -------------------------------------------------------------------------- */

function subscribePrefersDark(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_SCHEME_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Whether the reader's system asks for dark surfaces, tracked live.
 *
 * `matchMedia` is a browser API, so the server snapshot is `false` and the
 * client corrects after hydration — the mounted-guard pattern `useReducedMotion`
 * uses. Nothing reads this to decide a PALETTE (the pre-paint script did that
 * before React existed); it is read to keep the `System` row's hint honest about
 * what it currently resolves to, and by the listener that follows a change.
 */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribePrefersDark,
    () => window.matchMedia(DARK_SCHEME_QUERY).matches,
    () => false,
  );
}

/* -------------------------------------------------------------------------- */
/* The preference                                                              */
/* -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

/**
 * `true` while the reader wants their system to decide.
 *
 * DEFAULTS TO FOLLOWING for a reader with nothing stored, which is the same
 * answer the pre-paint script gives and has to be: if this said "pinned" for a
 * fresh visitor, the `System` row would render unticked on the very visit the
 * script had just resolved from the system preference.
 */
export function readFollowSystem(): boolean {
  try {
    if (window.localStorage.getItem(THEME_STORAGE_KEY) === null) return true;
    return window.localStorage.getItem(THEME_FOLLOW_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function writeFollowSystem(follow: boolean): void {
  try {
    if (follow) {
      window.localStorage.setItem(THEME_FOLLOW_STORAGE_KEY, "1");
    } else {
      /* REMOVED, not set to "0". Absent is the pinned state everywhere — the
         script tests for `"1"`, and a reader who has never seen this feature
         has no flag either. Two spellings of pinned would be two things to keep
         in step for no gain. */
      window.localStorage.removeItem(THEME_FOLLOW_STORAGE_KEY);
    }
  } catch {
    /* Session-only degradation, as in `idle-motion.ts`. */
  }
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useFollowSystem(): boolean {
  return useSyncExternalStore(subscribe, readFollowSystem, () => true);
}
