"use client";

/**
 * The multi-selection card: what the top-right panel shows when the marquee
 * has lassoed SEVERAL elements. A deliberate contrast with its two siblings —
 * `viewer-node-detail` and `viewer-edge-detail` each describe ONE thing and
 * its connections, and stretching either over N elements would mean inventing
 * a summary nobody asked for. Two or more selected means the reader is here
 * to ACT on the set, and the one act a set supports is the boundary — so the
 * card is compact: the count, the boundary control, Apply. Everything a
 * reader might want to know about one element stays one click away on that
 * element.
 *
 * ONLY RENDERED ON AN EDITABLE CANVAS. The marquee is an editing gesture (a
 * read-only canvas never draws the box), so unlike the node card this one has
 * no read view to fall back to — presence of the gesture is presence of the
 * card.
 *
 * The boundary control is the node edit form's: the same three-way choice
 * (`C4NodeFrameChoice`), the same `NEW_FRAME` sentinel, the same field
 * chrome, imported rather than re-spelled so the two cards cannot drift on
 * what a choice means. It DEFAULTS to "New boundary…" with the label
 * selected, because the gesture's headline is lasso → name it → Enter:
 * several elements into a new boundary in one action.
 *
 * APPLY IS DISABLED while "New boundary…" has no label, which the single
 * form deliberately does not do (it falls back to the element's existing
 * membership — a state N elements do not share, so there is nothing honest
 * to fall back to here). This is not the "absent, not disabled" rule's case:
 * that rule is for controls a host would ALWAYS refuse; this button is one
 * keystroke from enabled and the empty field beside it is the explanation.
 */

import { useEffect, useRef, useState } from "react";

import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { C4Frame, C4NodeFrameChoice } from "@/types";

import { EditField, FIELD_CLASSES, NEW_FRAME } from "./viewer-node-detail";

export function ViewerMultiDetail({
  count,
  frames,
  onDismiss,
  onGroup,
}: {
  /** How many elements the marquee selected — always ≥ 2 (one falls through
   *  to single selection in the canvas, which owns everything that means). */
  count: number;
  /** The current diagram's own boundaries — the select's existing choices. */
  frames: readonly C4Frame[];
  onDismiss: () => void;
  /**
   * The grouping intent. The canvas resolves it to the lassoed ids and the
   * host turns it into ONE text edit (`groupedNodesEdit`) — one undo entry
   * for the whole grouping.
   */
  onGroup: (frame: C4NodeFrameChoice) => void;
}): React.JSX.Element {
  const [frameId, setFrameId] = useState<string>(NEW_FRAME);
  const [label, setLabel] = useState("");
  /* The label takes focus on mount rather than through `autoFocus`, which
     jsx-a11y flags — the node form's own note. The reader arrives mid-gesture:
     the lasso just closed and the next thing they do is type the name. */
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    labelRef.current?.select();
  }, []);
  const needsLabel = frameId === NEW_FRAME && label.trim() === "";

  return (
    <aside
      aria-label="Selection details"
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
          Selection
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Deselect elements"
          className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      <p className="mt-1 text-sm leading-snug font-medium text-foreground">
        {count} elements selected
      </p>
      <form
        className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          // The disabled button already blocks this; belt for Enter in the
          // select, where the browser submits regardless of button state.
          if (needsLabel) return;
          onGroup(
            frameId === NEW_FRAME
              ? { kind: "new", label: label.trim() }
              : frameId === ""
                ? { kind: "none" }
                : { kind: "existing", frameId },
          );
        }}
      >
        <EditField term="Boundary">
          <select
            value={frameId}
            onChange={(event) => setFrameId(event.target.value)}
            className={FIELD_CLASSES}
          >
            <option value="">None</option>
            {frames.map((frame) => (
              <option key={frame.id} value={frame.id}>
                {frame.label}
              </option>
            ))}
            <option value={NEW_FRAME}>New boundary…</option>
          </select>
        </EditField>
        {frameId === NEW_FRAME ? (
          <EditField term="Boundary name">
            <input
              ref={labelRef}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Internal, Trust boundary"
              className={FIELD_CLASSES}
            />
          </EditField>
        ) : null}
        <button
          type="submit"
          disabled={needsLabel}
          className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          <Check aria-hidden="true" className="size-3.5" />
          {frameId === ""
            ? "Remove from boundaries"
            : `Group ${count} elements`}
        </button>
      </form>
    </aside>
  );
}
