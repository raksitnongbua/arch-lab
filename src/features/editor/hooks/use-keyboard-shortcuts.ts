"use client";

/**
 * The editor's shortcut registry (dev-handoff §4.5). One instance, one window
 * listener. Each ticket registers its bindings from its own hook file via
 * `useShortcuts`; nobody edits a shared keymap.
 *
 * Central rules enforced here, once, for every binding:
 * - Bindings never fire while focus is inside an `input`, `textarea`, `select`
 *   or `[contenteditable]` element. Do not re-check this per binding.
 * - `mod` means Cmd on macOS and Ctrl everywhere else.
 * - Duplicate binding ids throw in development so collisions surface
 *   immediately; in production the later registration wins.
 *
 * Combos reserved by Batch 1: `mod+z`, `mod+shift+z`, `mod+a`, `Escape`,
 * `shift+1`, `shift+0`, arrow keys (plain and `shift+`). Claimed elsewhere:
 * `mod+ArrowDown`/`mod+ArrowUp` (T2-C), `Delete`/`Backspace` (T2-D),
 * `F2`/`Enter` (T2-A), `mod+s`/`mod+o` (T3-A), `mod+c`/`mod+v` (T2-E).
 */

import { useEffect } from "react";

import { useEditorStore, type EditorStore } from "../state";

export interface ShortcutContext {
  store: EditorStore;
  event: KeyboardEvent;
}

export interface ShortcutBinding {
  /** Unique; duplicate ids throw in dev so collisions surface immediately. */
  id: string;
  /**
   * e.g. "mod+z", "mod+shift+z", "mod+ArrowDown", "shift+1", "F2", "Escape".
   * `mod` = Cmd on macOS, Ctrl elsewhere. Digits match by physical key
   * (`event.code`), so "shift+1" works on layouts where Shift+1 types "!".
   */
  combo: string;
  when?: (ctx: ShortcutContext) => boolean;
  run: (ctx: ShortcutContext) => void;
  /** Default true. */
  preventDefault?: boolean;
}

interface ParsedCombo {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

interface RegisteredBinding {
  binding: ShortcutBinding;
  parsed: ParsedCombo;
}

const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform);

const registry = new Map<string, RegisteredBinding>();

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1).map((part) => part.toLowerCase());
  return {
    mod: modifiers.includes("mod"),
    shift: modifiers.includes("shift"),
    alt: modifiers.includes("alt"),
    key,
  };
}

function comboMatches(event: KeyboardEvent, parsed: ParsedCombo): boolean {
  const modPressed = IS_MAC ? event.metaKey : event.ctrlKey;
  if (modPressed !== parsed.mod) return false;
  if (event.shiftKey !== parsed.shift) return false;
  if (event.altKey !== parsed.alt) return false;
  // Digits by physical key: Shift+1 produces key "!" on most layouts.
  if (/^[0-9]$/.test(parsed.key)) return event.code === `Digit${parsed.key}`;
  if (parsed.key.length === 1) {
    return event.key.toLowerCase() === parsed.key.toLowerCase();
  }
  return event.key === parsed.key;
}

/** Central text-focus suppression (dev-handoff §4.5). */
function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    ) !== null
  );
}

function handleKeyDown(event: KeyboardEvent): void {
  if (isTextEditingTarget(event.target)) return;
  const ctx: ShortcutContext = {
    store: useEditorStore.getState(),
    event,
  };
  for (const { binding, parsed } of registry.values()) {
    if (!comboMatches(event, parsed)) continue;
    if (binding.when && !binding.when(ctx)) continue;
    if (binding.preventDefault !== false) event.preventDefault();
    binding.run(ctx);
  }
}

let listenerAttached = false;

function syncListener(): void {
  if (typeof window === "undefined") return;
  const shouldAttach = registry.size > 0;
  if (shouldAttach && !listenerAttached) {
    window.addEventListener("keydown", handleKeyDown);
    listenerAttached = true;
  } else if (!shouldAttach && listenerAttached) {
    window.removeEventListener("keydown", handleKeyDown);
    listenerAttached = false;
  }
}

/**
 * Registers bindings for the lifetime of the calling component. Memoize the
 * array (`useMemo`) — a fresh array every render re-registers harmlessly but
 * churns. Returns nothing; cleanup is automatic on unmount.
 */
export function useShortcuts(bindings: ShortcutBinding[]): void {
  useEffect(() => {
    for (const binding of bindings) {
      if (
        registry.has(binding.id) &&
        process.env.NODE_ENV !== "production" &&
        registry.get(binding.id)?.binding !== binding
      ) {
        throw new Error(
          `Duplicate shortcut id "${binding.id}". Every binding id must be unique across the editor (dev-handoff §4.5).`,
        );
      }
      registry.set(binding.id, { binding, parsed: parseCombo(binding.combo) });
    }
    syncListener();
    return () => {
      for (const binding of bindings) {
        if (registry.get(binding.id)?.binding === binding) {
          registry.delete(binding.id);
        }
      }
      syncListener();
    };
  }, [bindings]);
}
