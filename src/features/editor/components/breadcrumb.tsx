"use client";

/**
 * STUB — ownership transfers to T2-C in Batch 2 (AF-E2-S3 breadcrumb
 * navigation).
 *
 * Contract (dev-handoff §4.4): props-free, mounted by `editor-shell.tsx`,
 * reads the store itself. The real implementation renders
 * `selectBreadcrumb(state)` as `Name [Level]` segments with click-to-navigate,
 * viewport/selection restore, middle-segment overflow, and the root shake.
 * This stub reads only plain store STATE (never a Batch-1 action body).
 */

import { useEditorStore } from "../state";

export function Breadcrumb(): React.JSX.Element {
  const title = useEditorStore((s) => s.model.metadata.title);
  const level = useEditorStore(
    (s) => s.model.diagrams[s.activeDiagramId]?.level ?? "context",
  );
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

  return (
    <nav
      aria-label="Diagram hierarchy"
      className="flex min-w-0 items-center gap-1.5 text-sm"
    >
      <span className="truncate font-medium text-foreground">{title}</span>
      <span className="shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
        {levelLabel}
      </span>
    </nav>
  );
}
