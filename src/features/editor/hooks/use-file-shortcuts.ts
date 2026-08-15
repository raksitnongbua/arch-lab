"use client";

/**
 * The file keyboard bindings, registered through the shared shortcut registry
 *. claims exactly `mod+s` (save) and `mod+o` (open);
 * suppression while focus is in an input/textarea/[contenteditable] is
 * enforced centrally by the registry.
 *
 * Mounted by `FileActions`, which supplies the actual save/open flows.
 */

import { useMemo } from "react";

import { useShortcuts, type ShortcutBinding } from "./use-keyboard-shortcuts";

export interface FileShortcutHandlers {
  onSave: () => void;
  onOpen: () => void;
}

export function useFileShortcuts({
  onSave,
  onOpen,
}: FileShortcutHandlers): void {
  const bindings = useMemo<ShortcutBinding[]>(
    () => [
      {
        id: "t3a:save",
        combo: "mod+s",
        run: () => onSave(),
      },
      {
        id: "t3a:open",
        combo: "mod+o",
        run: () => onOpen(),
      },
    ],
    [onSave, onOpen],
  );
  useShortcuts(bindings);
}
