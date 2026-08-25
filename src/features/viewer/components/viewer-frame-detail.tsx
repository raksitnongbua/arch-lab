"use client";

/**
 * The boundary card: what the top-right panel shows when a FRAME is selected
 * on an editable canvas. The fourth resident of the corner slot, and the
 * multi-selection card's shape on purpose — a boundary, like a lasso, is a
 * thing the reader selects to ACT on, so the card is compact: the label, what
 * the boundary holds, a rename form. Everything about the members stays one
 * click away on each member.
 *
 * ONLY RENDERED ON AN EDITABLE CANVAS, the multi card's rule: frame SELECTION
 * exists only where the FrameLayer runs controlled (see its props), which the
 * viewer canvas does exactly while editable — a read-only or locked canvas
 * keeps the zoom-and-march focus with no card. That is also why `onRename`
 * and `onDelete` are required rather than presence-gated like the node card's
 * pencil: there is no read view for this card to fall back to.
 *
 * RENAME AND REMOVE. This card shipped rename-only, its header holding the
 * removal to a spec: decide where the members and any nested frames land
 * before offering the button. The answer is `deletedFrameEdit`'s, which took
 * it from the editor store's shipped verdict (`deleteFrame`: re-home one
 * level out, never cascade) — so the button removes ONE ring and everything
 * it held stays on the canvas, and the card says so beside the button
 * whenever the boundary holds anything, because "remove" next to a populated
 * group otherwise reads as removing the group.
 */

import { useEffect, useRef, useState } from "react";

import { Check, Trash2, X } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { C4Frame } from "@/types";

import { EditField, FIELD_CLASSES } from "./viewer-node-detail";

/** What the frame card describes — resolved by the canvas from its diagram. */
export interface FrameDetail {
  frame: C4Frame;
  /** Direct member nodes in this diagram (not transitive through children). */
  memberCount: number;
  /** Frames nested directly inside this one. */
  childFrameCount: number;
}

export function ViewerFrameDetail({
  detail,
  onDismiss,
  onRename,
  onDelete,
}: {
  detail: FrameDetail;
  onDismiss: () => void;
  /**
   * The new label. The canvas resolves it to the selected frame and the host
   * turns it into ONE line patch (`renamedFrameEdit`) — one undo entry.
   */
  onRename: (label: string) => void;
  /**
   * Remove the boundary. The canvas resolves it to the selected frame and
   * the host applies `deletedFrameEdit` — members and nested boundaries
   * re-home one level out, one edit, one undo entry — and announces where
   * they landed; the card only reports the press.
   */
  onDelete: () => void;
}): React.JSX.Element {
  const { frame, memberCount, childFrameCount } = detail;
  const [label, setLabel] = useState(frame.label);
  /* The label takes focus on mount rather than through `autoFocus`, which
     jsx-a11y flags — the multi card's own note. The reader arrives having
     just selected the boundary, and the one act this card offers is typing
     its new name. */
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    labelRef.current?.select();
  }, []);
  const blank = label.trim() === "";

  const holds = [
    `${memberCount} ${memberCount === 1 ? "element" : "elements"}`,
    ...(childFrameCount > 0
      ? [
          `${childFrameCount} nested ${childFrameCount === 1 ? "boundary" : "boundaries"}`,
        ]
      : []),
  ].join(", ");

  return (
    <aside
      aria-label="Boundary details"
      className={cn(
        // The node card's envelope, kept identical on purpose: this card
        // takes the same corner slot, and two widths would make selection
        // feel like two features.
        "flex max-h-[min(40vh,32rem)] w-72 max-w-full flex-col overflow-y-auto sm:max-h-[min(70vh,32rem)]",
        "rounded-lg border border-primary/40 bg-card/95 p-3 shadow-lg backdrop-blur",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium tracking-wide text-primary uppercase">
          Boundary
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Deselect boundary"
          className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      <p className="mt-1 text-sm leading-snug font-medium text-foreground">
        {frame.label}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">Holds {holds}</p>
      <form
        className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          // The disabled button already blocks this; belt for Enter in the
          // field, where the browser submits regardless of button state.
          if (blank) return;
          onRename(label.trim());
        }}
      >
        <EditField term="Name">
          <input
            ref={labelRef}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className={FIELD_CLASSES}
          />
        </EditField>
        <button
          type="submit"
          disabled={blank}
          className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          <Check aria-hidden="true" className="size-3.5" />
          Rename boundary
        </button>
      </form>
      {/* OUTSIDE the form, the node card's rule for its nest buttons: the
          rename is a field Apply rewrites in place, the removal is an act —
          Enter in the name field must never remove the boundary. */}
      <div className="mt-2 border-t border-border/60 pt-2">
        <button
          type="button"
          onClick={onDelete}
          className={buttonClasses({
            variant: "outline",
            size: "sm",
            className: "w-full",
          })}
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
          Remove boundary
        </button>
        {memberCount > 0 || childFrameCount > 0 ? (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Removes the boundary only — everything it holds stays on the canvas,
            one level out.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
