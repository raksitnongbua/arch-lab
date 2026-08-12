"use client";

/**
 * The IDLE-MOTION preference: whether diagrams keep moving while nobody is
 * touching them.
 *
 * ONE PREFERENCE FOR THE WHOLE APP, not one per view. It started in the sequence
 * viewer and the C4 canvas needed the same switch, and two of them would mean a
 * reader who turns motion off in one place is surprised by it in the other —
 * "stop the diagrams moving" is a statement about diagrams, not about a route.
 * The storage key is deliberately unscoped for the same reason. (It was
 * `arch-lab:sequence-idle-motion`; anyone who had set it will find the toggle
 * back at its default once, which is a fair price for not having to set it
 * twice from here on.)
 *
 * WHAT IT DOES NOT COVER. Motion the reader ASKED for — a focus draw, a
 * selection comet, an entrance — is not idle motion and is not gated by this.
 * Nor does this replace `prefers-reduced-motion`, which wins outright wherever
 * both apply: the OS setting is a statement about the person, and a UI toggle
 * cannot overrule it.
 *
 * The store is a `useSyncExternalStore` over localStorage, the D17 mounted-guard
 * shape used by `useReducedMotion` and `diagram-inspector.tsx`: the server
 * snapshot is the DEFAULT (on), and the client corrects after hydration if a
 * stored "off" disagrees, rather than a render reading a browser API the server
 * does not have.
 *
 * localStorage failures (private mode, quota) degrade to session-only state:
 * reads fall back to the default and writes still notify this tab, so the toggle
 * keeps working — it just forgets on reload. The `storage` event only fires in
 * OTHER tabs, so writes also notify a local listener set; both paths funnel
 * through the one subscribe.
 */

import { useSyncExternalStore } from "react";

/* -------------------------------------------------------------------------- */
/* The OS preference                                                           */
/* -------------------------------------------------------------------------- */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * Lives beside the toggle because the two are never used apart: every consumer
 * needs both to decide whether motion runs, and a second copy of this in each
 * view is a second chance for the two reads to disagree within one render.
 *
 * `matchMedia` is a browser API, so the server snapshot is `false` and the
 * client corrects after hydration — the D17 mounted-guard pattern, which is what
 * keeps a reduced-motion default from aborting hydration for a whole page.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/* -------------------------------------------------------------------------- */
/* The preference                                                              */
/* -------------------------------------------------------------------------- */

const IDLE_MOTION_KEY = "arch-lab:idle-motion";
const listeners = new Set<() => void>();

export function readIdleMotion(): boolean {
  try {
    return window.localStorage.getItem(IDLE_MOTION_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeIdleMotion(on: boolean): void {
  try {
    window.localStorage.setItem(IDLE_MOTION_KEY, on ? "on" : "off");
  } catch {
    /* Session-only degradation — see the module comment. */
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

export function useIdleMotion(): boolean {
  return useSyncExternalStore(subscribe, readIdleMotion, () => true);
}

/**
 * Whether idle motion should actually run, as a value to stamp on a container
 * (`data-af-idle`). An ATTRIBUTE rather than a custom property because turning
 * this off has to withdraw declarations, not just change values — a parked
 * marching dash is not a resting connector but a connector wearing a dash
 * pattern that means something else. A var can change a value; only a selector
 * can retract a rule.
 *
 * Reduced motion wins outright, which is why it is a parameter here rather than
 * read inside: the caller already tracks it reactively, and a second
 * unsynchronised read can disagree with the one React rendered with.
 */
export function idleMotionState(
  reduced: boolean,
  idleMotion: boolean,
): "on" | "off" {
  return reduced || !idleMotion ? "off" : "on";
}
