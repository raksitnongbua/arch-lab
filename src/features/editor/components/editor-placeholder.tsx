import { Construction } from "lucide-react";

import { Badge } from "@/components/ui/badge";

/**
 * Stand-in for the real canvas. It exists so `src/features/editor` has a
 * compiling public surface and an obvious insertion point — see the README in
 * this feature directory before replacing it.
 */
export function EditorPlaceholder() {
  return (
    <section
      aria-labelledby="editor-placeholder-heading"
      className="relative flex min-h-80 flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-canvas"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--canvas-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--canvas-grid) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <Badge variant="outline">
          <Construction aria-hidden="true" className="size-3.5" />
          Not built yet
        </Badge>
        <h2
          id="editor-placeholder-heading"
          className="text-lg font-medium text-foreground"
        >
          The C4 canvas goes here
        </h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Pan, zoom, drag nodes, connect edges, and drill between levels. See
          <code className="mx-1 font-mono text-xs text-foreground">
            src/features/editor/README.md
          </code>
          for the intended structure.
        </p>
      </div>
    </section>
  );
}
