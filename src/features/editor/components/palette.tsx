"use client";

/**
 * STUB — ownership transfers to T2-B in Batch 2 (AF-E1-S2 palette drag-drop).
 *
 * Contract (dev-handoff §4.4): props-free, mounted by `editor-shell.tsx`
 * inside the left rail (the shell owns the rail's width and border), reads
 * the store itself. The real implementation lists
 * `VALID_NODE_TYPES_BY_LEVEL[activeLevel]`, encodes drags per §4.7
 * (`lib/drag-payload.ts`), and creates at viewport centre on double-click.
 */

export function Palette(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Palette
      </h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Drag-and-drop node creation lands with the creation-flows ticket.
      </p>
    </div>
  );
}
