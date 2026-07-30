"use client";

/**
 * The inspector for a `^ref` boundary placeholder.
 *
 * A separate panel rather than `NodeInspector` with every control disabled.
 * Two reasons: threading `disabled` through six inputs invites the one that
 * gets missed, and a row of greyed-out fields tells the user *that* they cannot
 * edit without telling them *where* they can. This panel states the identity as
 * plain read-only text and puts the way out — "Open original" — front and
 * centre.
 *
 * This closed a real hole. `node-inspector.tsx` had no placeholder awareness at
 * all, so a reference's name, type, icon and tags were freely editable, and
 * `syncRefPlaceholders` would silently overwrite those edits the next time the
 * original changed. "Read-only" was documented on `isBoundaryPlaceholder` and
 * enforced nowhere.
 *
 * What stays editable lives elsewhere and is deliberate: position and size are
 * per-diagram layout (not in `REF_MIRRORED_KEYS`), so the node is still
 * draggable and resizable on the canvas, and it can still be a relationship
 * source. Read-only governs identity, not participation.
 */

import { ArrowUp, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { C4Level, C4Node } from "@/types";

import { goToOriginal } from "../../lib/goto-original";
import { useEditorStore } from "../../state";
import { NODE_TYPE_META } from "../palette-item";

/** One read-only fact. Omitted entirely when the original has no value. */
function Field({
  label,
  value,
}: {
  label: string;
  value?: string;
}): React.JSX.Element | null {
  if (value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="text-sm break-words text-foreground">{value}</p>
    </div>
  );
}

export interface RefInspectorProps {
  node: C4Node;
}

export function RefInspector({ node }: RefInspectorProps): React.JSX.Element {
  const sourceLevel = useEditorStore((s): C4Level | null => {
    const ref = node.externalRef;
    if (ref === undefined) return null;
    return s.model.diagrams[ref.diagramId]?.level ?? null;
  });
  const { label } = NODE_TYPE_META[node.type];

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Reference
        </h3>
        {sourceLevel !== null ? (
          <span className="flex items-center gap-0.5 rounded-full border border-border px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted-foreground">
            <ArrowUp aria-hidden="true" className="size-2.5" />
            {sourceLevel}
          </span>
        ) : null}
      </header>

      <Field label="Name" value={node.name} />
      <Field label="Type" value={label} />
      <Field label="Technology" value={node.technology} />
      <Field label="Description" value={node.description} />

      <p className="rounded-md border border-border/60 bg-secondary/40 px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
        These come from the original and cannot be changed here — editing them
        in one place keeps every diagram that shows this element in agreement.
        You can still move it and draw relationships from it.
      </p>

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={() => goToOriginal(node)}
      >
        <ExternalLink aria-hidden="true" className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Open original</span>
      </Button>
    </section>
  );
}
