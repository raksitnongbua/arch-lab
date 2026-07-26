"use client";

/**
 * Inline label editor (AF-E1-S6), shared by nodes and edge label chips.
 *
 * Text lives in the input's LOCAL state — keystrokes never touch the store.
 * Exactly one store call ends the edit: `endLabelEdit(true, value)` on
 * Enter/blur (one `updateNode`/`updateEdge` ⇒ ONE undo entry), or
 * `endLabelEdit(false)` on Escape (reverts, no entry). An empty committed
 * value keeps the previous one (enforced by the store).
 */

import { useCallback, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { useEditorStore } from "../../state";

export interface InlineLabelProps {
  /** The committed value; shown pre-selected when the editor opens. */
  value: string;
  ariaLabel: string;
  className?: string;
}

export function InlineLabel({
  value,
  ariaLabel,
  className,
}: InlineLabelProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  // endLabelEdit unmounts this component, which can fire a trailing blur —
  // this ref makes finishing idempotent so the edit ends exactly once.
  const doneRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const finish = useCallback((commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    useEditorStore.getState().endLabelEdit(commit, inputRef.current?.value);
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={value}
      aria-label={ariaLabel}
      // nodrag/nopan: React Flow must not start a drag from inside the editor.
      className={cn(
        "nodrag nopan w-full min-w-0 rounded-sm bg-node px-0.5 text-center text-node-foreground caret-ring ring-1 ring-ring outline-none",
        className,
      )}
      onKeyDown={(event) => {
        // Keep Enter/Escape/Delete/mod+Z inside the editor (risk R5). The
        // shortcut registry already ignores inputs; this stops React Flow too.
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}
