"use client";

/**
 * STUB — ownership transfers to T3-A in Batch 3 (AF-E5-S1/S2 save & open).
 *
 * Contract (dev-handoff §4.4): props-free, mounted by `editor-shell.tsx`,
 * reads the store itself. The real implementation wires `Cmd+S`/`Cmd+O` via
 * its own hook, the File System Access API with fallback (D2), and the
 * unsaved-changes prompt. The buttons exist now so the header reads as a real
 * editor; they enable when persistence lands.
 */

import { FolderOpen, Save } from "lucide-react";

import { Button } from "@/components/ui/button";

export function FileActions(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled
        title="Open — lands with the persistence ticket"
      >
        <FolderOpen aria-hidden="true" />
        Open
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Save — lands with the persistence ticket"
      >
        <Save aria-hidden="true" />
        Save
      </Button>
    </div>
  );
}
