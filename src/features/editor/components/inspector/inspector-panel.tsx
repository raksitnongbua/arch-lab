"use client";

/**
 * STUB — ownership transfers to T2-D in Batch 2 (AF-E3-S2/S3 inspector).
 *
 * Contract (dev-handoff §4.4): props-free, mounted by `editor-shell.tsx`
 * inside the right rail (the shell owns the rail's width and border), reads
 * the store itself. The real implementation branches on the selection: node
 * fields / edge fields / diagram title+description when nothing is selected.
 */

export function InspectorPanel(): React.JSX.Element {
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Inspector
      </h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Select an element to edit its properties. Property editing lands with
        the inspector ticket.
      </p>
    </div>
  );
}
