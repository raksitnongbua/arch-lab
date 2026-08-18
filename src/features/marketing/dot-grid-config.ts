"use client";

/**
 * The dot field's tunable configuration, and the store the studio panel writes
 * to.
 *
 * WHY A STORE RATHER THAN PROPS. The field is rendered from `Backdrop()`, which
 * is part of a SERVER component, so there is nothing there to hold state and
 * nothing to pass changing props down from. Threading the values up would mean
 * making the whole home page a client component to support a panel that almost
 * nobody opens. A module-level store keeps the page server-rendered: `DotGrid`
 * subscribes, the panel publishes, and neither knows the other exists.
 *
 * THE DEFAULTS ARE THE SHIPPED DESIGN. The panel is a way to FIND values, not a
 * user setting — nothing here persists, and a reload is a reset. When a value is
 * worth keeping it gets typed into this file, which is why the panel's copy
 * button emits exactly this block. Two consequences worth stating: the server
 * and the first client render always agree (there is no stored state to
 * reconcile), and a visitor cannot land on somebody else's tuning.
 *
 * Each value that was ARGUED FOR carries its argument at the declaration below.
 * They used to sit in `dot-grid.tsx` as parameter defaults, and they moved here
 * with the numbers — a value and the reason for it belong in the same place, or
 * the next person to change it does so without the reason.
 */

import { useSyncExternalStore } from "react";

export interface DotGridConfig {
  /** Diameter of one dot, in CSS pixels. */
  dotSize: number;
  /** Gap between dots. `dotSize + gap` is the lattice pitch, and must stay 28. */
  gap: number;
  /** Custom property painting a dot at rest. */
  baseVar: string;
  /** Custom property painting a dot under the pointer. */
  activeVar: string;
  /** Radius within which dots take colour and can be thrown, in px. */
  proximity: number;
  /** Pointer speed, px/s, above which a sweep throws dots. */
  speedTrigger: number;
  /** Radius of a click's shockwave, in px. */
  shockRadius: number;
  /** How hard a click pushes, before distance falloff. */
  shockStrength: number;
  /** Ceiling on the speed fed to the inertia tween, px/s. */
  maxSpeed: number;
  /** Inertia drag. Lower travels further — see the table in `dot-grid.tsx`. */
  resistance: number;
  /** Seconds for a thrown dot to ease back home. */
  returnDuration: number;
}

export const DOT_GRID_DEFAULTS: DotGridConfig = {
  /* 3px, not 2. A dot's whole presence is its INK, and at a 28px pitch a 2px dot
     covers 0.40% of its cell — the field was correctly wired, correctly masked,
     and still could not be seen. 3px is 0.90%, which more than doubles it for one
     pixel of radius. Further starts to read as a polka dot rather than a
     lattice. */
  dotSize: 3,
  /* Chosen so `dotSize + gap` stays 28 — exactly half the backdrop's 56px line
     grid, so the two lattices coincide instead of beating against each other.
     `check:dot-grid` asserts the pitch, so a change to `dotSize` comes out of
     this, never out of the pitch. */
  gap: 25,
  /* `--node-border`, not `--border`, and this is measured: `--border` cannot be
     seen on the dark ground at ANY opacity — 1.63:1 against it at full strength,
     and the field ran at half. `--node-border` reaches 1.98:1 at the layer's 0.35
     and 3.81:1 at full, so being quiet is a choice rather than an accident. It is
     also the right token by meaning: an outline drawn on a canvas is what a
     lattice mark is. */
  baseVar: "--node-border",
  activeVar: "--primary",
  proximity: 130,
  speedTrigger: 100,
  shockRadius: 220,
  shockStrength: 4,
  maxSpeed: 5000,
  /* 180, not upstream's 750, and measured rather than taste — the velocity table
     is in `dot-grid.tsx` beside the tween that consumes it. At 750 a sweep moves
     a dot about five pixels, under a fifth of the pitch and invisible behind a
     headline; at 180 it moves about half a pitch. */
  resistance: 180,
  /* Slower than upstream's 1.5. The return is the part anyone actually watches —
     the throw is over in a fifth of a second — and on `elastic.out` a longer
     settle reads as weight rather than as lag. */
  returnDuration: 2.2,
};

/**
 * The colour tokens the panel offers, rather than a free hex field.
 *
 * The upstream component this is adapted from takes a hex, and its own
 * customiser offers a colour picker. That would be the wrong control HERE: a hex
 * is a colour one theme's worth of, and this app has seven. Every option below
 * is a token that every theme defines, so a choice made while looking at one
 * theme still means something in the other six.
 *
 * Ordered light-to-dark by role rather than alphabetically, so the list reads as
 * a strength dial: the first entries barely mark the page, the last ones are ink.
 */
export const DOT_GRID_TOKENS: readonly string[] = [
  "--canvas-grid",
  "--border",
  "--node-border",
  "--edge",
  "--muted-foreground",
  "--primary",
  "--accent",
];

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

let current: DotGridConfig = DOT_GRID_DEFAULTS;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Replaces one field. Called only from the studio panel. */
export function setDotGridValue<K extends keyof DotGridConfig>(
  key: K,
  value: DotGridConfig[K],
): void {
  current = { ...current, [key]: value };
  for (const listener of listeners) listener();
}

export function resetDotGrid(): void {
  current = DOT_GRID_DEFAULTS;
  for (const listener of listeners) listener();
}

/**
 * The live configuration.
 *
 * The server snapshot is the same object as the client's initial one — not
 * merely equal to it — so the first client render cannot differ from the server's
 * and there is no hydration reconciliation to get wrong. That is only true
 * because nothing here is persisted; if this ever reads localStorage it needs
 * the mounted-guard shape `lib/idle-motion.ts` uses instead.
 */
export function useDotGridConfig(): DotGridConfig {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => DOT_GRID_DEFAULTS,
  );
}

/** The current values as the `DOT_GRID_DEFAULTS` literal, for the copy button. */
export function dotGridAsSource(config: DotGridConfig): string {
  const line = (key: keyof DotGridConfig) => {
    const value = config[key];
    return `  ${key}: ${typeof value === "string" ? `"${value}"` : value},`;
  };
  return [
    "export const DOT_GRID_DEFAULTS: DotGridConfig = {",
    ...(Object.keys(DOT_GRID_DEFAULTS) as (keyof DotGridConfig)[]).map(line),
    "};",
  ].join("\n");
}
