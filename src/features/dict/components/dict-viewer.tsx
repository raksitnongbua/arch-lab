"use client";

/**
 * The mounted dictionary canvas.
 *
 * NO FOCUS MODE, and that is a decision rather than an omission. Focus exists
 * on the other canvases to answer "what is this connected to" — a question a
 * dictionary cannot ask, because it has no connections. Every fact a
 * dictionary holds is already ON the row: the name, the type, the flags, the
 * meaning, the provenance, the legal values, an example. There is nothing left
 * for a panel to reveal, so a panel would be a second copy of the row.
 *
 * THAT STILL HOLDS NOW THAT THE CANVAS IS EDITABLE, and the reorder handles are
 * not a focus model creeping back in: a handle is an ACTION on the row it sits
 * in, so pressing one changes the document rather than selecting anything, and
 * there is nothing to clear afterwards. `DictEditHandlers` says what the
 * actions are and `dict-diagram.tsx` how they are drawn.
 *
 * A client component for the live region, for the pane's own width, and — when
 * editing is on — for giving focus back to the handle a reorder just moved.
 * `DictDiagram` is still pure and server-renderable, which is what lets the
 * crawlable pages ship the whole table in their HTML. That matters more for
 * this kind than any other — a reference document a search engine cannot read
 * is a reference nobody finds.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DictLabFile } from "@/types";

import { Scan, ZoomIn, ZoomOut } from "lucide-react";

import { ZoomMenu } from "@/components/ui/zoom-menu";
import {
  ZOOM_BUTTON_CLASSES,
  ZOOM_IN_TITLE,
  ZOOM_OUT_TITLE,
  ZOOM_PILL_CLASSES,
} from "@/components/ui/zoom-pill";
import { useCanvasZoom, ZOOM_MAX } from "@/components/ui/use-canvas-zoom";
import { CANVAS_RULE_CLASS, groundFieldCss } from "@/lib/canvas-ground";
import { cn } from "@/lib/utils";
import { layoutDict } from "../lib/layout";
import { DictDiagram, dictHandleKey } from "./dict-diagram";
import type {
  DictReorderDirection,
  DictReorderSurface,
  DictReorderTarget,
} from "./dict-diagram";

/**
 * The gestures this canvas can send back, when editing is on.
 *
 * PRESENCE IS THE OFFER, as on the flowchart canvas: the whole bundle is
 * absent while the canvas is locked or read-only, and the viewer then draws no
 * editing chrome at all rather than a table of dead controls.
 *
 * EVERY GESTURE IS A REORDER, and there will be no move. A dictionary is a
 * table whose column grid is solved across the whole document at once, so it
 * carries no coordinate to write a drag into — a block dropped at a point
 * would be re-solved back onto the grid by the next parse. What a reader can
 * change is the READING ORDER, which is already the text: a section's place is
 * its position in the file, a field's is its position inside its section.
 *
 * A SECTION IS ADDRESSED BY ITS LABEL and a FIELD by its name under that
 * label, which is the addressing the gesture module and its spans use.
 */
export interface DictEditHandlers {
  onReorderSection: (label: string, direction: DictReorderDirection) => void;
  onReorderField: (
    sectionLabel: string,
    fieldName: string,
    direction: DictReorderDirection,
  ) => void;
  /**
   * Why this reorder would be declined, or `null`. Asked as each control is
   * DRAWN rather than after a press, so the ends of a run read as walls: the
   * first section cannot move earlier, and a control that completes and
   * silently changes nothing reads as broken.
   *
   * The sentence belongs to the gesture module — the canvas never composes one
   * of its own, so a reason read off a handle matches the reason read
   * anywhere else.
   *
   * IT TAKES THE FILE, which the viewer already has, so the host can hand the
   * module's own function over UNBOUND. A pre-bound closure would be a second
   * place the "which file is this about" question is answered, free to answer
   * it with a stale model one render behind the table on screen.
   */
  reorderRefusal: (
    file: DictLabFile,
    target: DictReorderTarget,
    direction: DictReorderDirection,
  ) => string | null;
  /**
   * Rewrite the DOCUMENT's own title — the `title` line of the shared `.alab`
   * header, and the one gesture here that addresses no row.
   *
   * THE TITLE ONLY, deliberately. The gesture can also write a `description`
   * line, but this canvas draws no document description — `layoutDict`
   * measures a title band and nothing else, and the "description" in this
   * layout is a FIELD's meaning. Offering a box for a line the reader cannot
   * see the effect of is the stale claim `CANVAS_EDIT_OFFERS` warns about, so
   * `description` is left `undefined` here, which the gesture reads as "leave
   * that line exactly as it is".
   *
   * AN EMPTIED TITLE IS REFUSED — every grammar here requires one — so the
   * field is `required` and the press never completes, rather than completing
   * and changing nothing.
   *
   * STRUCTURAL, NOT IMPORTED, as `DictReorderSurface` is: the host's
   * `RetitleFields` satisfies it without this feature naming the playground.
   *
   * OPTIONAL WHERE THE THREE ABOVE ARE NOT: retitling is its own cell of
   * `CANVAS_EDIT_OFFERS`, so a host that offers reordering has not thereby
   * answered for the heading, and the title becomes typeable only for a host
   * that hands this over.
   */
  onRetitle?: (fields: { title?: string; description?: string }) => void;
}

export interface DictViewerProps {
  file: DictLabFile;
  onAnnounce?: (message: string) => void;
  /** Editing gestures, or absent — see `DictEditHandlers`. */
  edit?: DictEditHandlers;
  /**
   * The canvas lock, rendered at this pane's own top-right — the corner every
   * other canvas puts its own in, so a reader moving between notations finds
   * it in one place.
   *
   * A SLOT RATHER THAN A BOOLEAN, matching the four canvases that already take
   * one: the host owns the lock state (it is the reader's "I am presenting
   * this", which is about the session and not about one notation) and this
   * viewer only decides where it sits. Absent means there is nothing here to
   * lock, and a control that cannot change anything is worse than no control.
   */
  lockSlot?: React.ReactNode;
}

export function DictViewer({
  file,
  onAnnounce,
  edit,
  lockSlot,
}: DictViewerProps): React.JSX.Element {
  const paneRef = useRef<HTMLDivElement>(null);
  const sections = useMemo(() => file.sections ?? [], [file]);
  const fields = useMemo(
    () => sections.reduce((sum, section) => sum + section.fields.length, 0),
    [sections],
  );

  useEffect(() => {
    onAnnounce?.(
      `Data dictionary rendered: ${sections.length} ${sections.length === 1 ? "section" : "sections"}, ${fields} ${fields === 1 ? "field" : "fields"}.`,
    );
  }, [sections.length, fields, onAnnounce]);

  /* The pane's width, so the table can use the room it has rather than
     leaving gutters on a wide screen. Measured here — the layout stays pure
     and is simply told the number. */
  const [paneWidth, setPaneWidth] = useState(0);
  useEffect(() => {
    const pane = paneRef.current;
    if (pane === null) return;
    const update = (): void => {
      setPaneWidth(pane.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(pane);
    return () => {
      observer.disconnect();
    };
  }, []);

  const size = useMemo(
    () => layoutDict(file, { availableWidth: paneWidth - 32 }),
    [file, paneWidth],
  );
  const camera = useCanvasZoom({
    paneRef,
    contentWidth: size.width,
    contentHeight: size.height,
    onAnnounce,
  });

  /**
   * THE HANDLE A REORDER MUST GIVE FOCUS BACK TO.
   *
   * A reorder re-renders the table with the row somewhere else, and the handle
   * the reader pressed is inside that row — so the browser is being asked to
   * keep focus on a node the reconciler has just moved in the document, which
   * blurs it. A reader walking a field up the section with Enter would get one
   * step and then find focus back at the top of the page, which makes the
   * whole gesture pointer-only in practice. React's keys are not enough on
   * their own: they keep the ELEMENT, and a moved element still loses focus.
   *
   * So the press records which control it was, by the identity that SURVIVES
   * the move — the target's own label and name, not a DOM node or an index —
   * and the commit that follows puts focus back there. Both directions of the
   * pair are recorded, so a reader who pressed "later" keeps pressing "later".
   */
  const pendingFocus = useRef<string | null>(null);
  const focusFrame = useRef(0);

  /* The expiry frame a last press left behind, dropped on unmount. */
  useEffect(
    () => () => {
      cancelAnimationFrame(focusFrame.current);
    },
    [],
  );

  const reorder = useMemo<DictReorderSurface | undefined>(() => {
    if (edit === undefined) return undefined;
    /* The file is bound HERE, in one place, so the control's paint and the
       press's verdict cannot ask about two different models. */
    const refusal = (
      target: DictReorderTarget,
      direction: DictReorderDirection,
    ): string | null => edit.reorderRefusal(file, target, direction);
    return {
      refusal,
      onPress: (target, direction) => {
        const declined = refusal(target, direction);
        /* THE ONE THING THIS CANVAS ANNOUNCES. The host announces what moved,
           and a second sentence for the same event would race it — two live
           regions updated together swallow one of the two. A press on a wall
           is the half the host never sees, because no edit reaches it. */
        if (declined !== null) {
          onAnnounce?.(declined);
          return;
        }
        pendingFocus.current = dictHandleKey(target, direction);
        /* AND THE CLAIM EXPIRES AT THE NEXT FRAME. The commit that answers it
           lands inside this same press — React flushes a discrete event's
           update before yielding — so anything still standing a frame later
           belongs to a press that changed nothing: the HOST can decline one it
           cannot patch safely, when the pane holds text whose line numbers
           describe a different document. A claim left standing would then
           steal focus at whatever unrelated commit came next. */
        cancelAnimationFrame(focusFrame.current);
        focusFrame.current = requestAnimationFrame(() => {
          pendingFocus.current = null;
        });
        if (target.kind === "section") {
          edit.onReorderSection(target.sectionLabel, direction);
        } else {
          edit.onReorderField(target.sectionLabel, target.fieldName, direction);
        }
      },
    };
  }, [edit, file, onAnnounce]);

  /* ---- the title's own editor -------------------------------------------- */

  const onRetitle = edit?.onRetitle;
  const [retitling, setRetitling] = useState(false);

  /* THE PRESS THAT MUST GET ITS FOCUS BACK, for the reason the reorder claim
     above exists: the edit re-parses the document, so the control the reader
     pressed is a node the reconciler has moved and the browser blurs it.

     THIS CLAIM NEEDS NO EXPIRY, unlike that one. Closing the field is itself a
     state change this component makes, so the claim is always answered by the
     very next commit — including when the host declines an edit it cannot
     patch safely, which returns the reader to the title they pressed. */
  const pendingTitleFocus = useRef(false);

  const closeRetitle = useCallback(() => {
    pendingTitleFocus.current = true;
    setRetitling(false);
  }, []);

  /* MOUNTED FRESH ON EVERY OPEN, so the field always reads the title the table
     is drawing rather than a half-typed one left over from a document that has
     changed underneath it. */
  const retitle = useMemo(
    () =>
      onRetitle === undefined
        ? undefined
        : {
            onOpen: () => setRetitling(true),
            form: retitling ? (
              <TitleForm
                title={file.metadata?.title ?? ""}
                onSubmitTitle={(title) => {
                  closeRetitle();
                  onRetitle({ title });
                }}
                onCancel={closeRetitle}
              />
            ) : null,
          },
    [onRetitle, retitling, file.metadata?.title, closeRetitle],
  );

  useEffect(() => {
    if (!pendingTitleFocus.current) return;
    pendingTitleFocus.current = false;
    paneRef.current
      ?.querySelector<HTMLElement>("[data-af-dict-heading]")
      ?.focus();
  });

  /* Deliberately on EVERY commit rather than on `[file]`: the reorder arrives
     as a new file, but so does an edit typed in the pane, and only a press
     that set a claim above is answered here. Matched by reading the attribute
     back rather than through a selector, because a section label is arbitrary
     text and escaping it for one is a bug waiting to be written. */
  useEffect(() => {
    const key = pendingFocus.current;
    if (key === null) return;
    pendingFocus.current = null;
    const handles =
      paneRef.current?.querySelectorAll<HTMLElement>("[data-af-dict-handle]") ??
      [];
    for (const handle of handles) {
      if (handle.dataset.afDictHandle === key) {
        handle.focus();
        return;
      }
    }
  });

  return (
    <div className="relative h-full w-full">
      {/* The lock, in the same corner as every other canvas's — see
          `flowchart-viewer.tsx`, and the header of `canvas-lock-button.tsx`
          for why it is mounted per branch rather than once beside them. */}
      {lockSlot !== undefined ? (
        <div className="absolute top-2 right-2 z-20">{lockSlot}</div>
      ) : null}
      {/* See `er-viewer.tsx` for why the pane uses `safe center` and the
          wrapper is sized in pixels on both axes. */}
      <div
        ref={paneRef}
        /* THE GROUND, filling the pane rather than the drawing — the reversal
           is recorded at `.af-canvas-rule` in globals.css. */
        className={cn(
          "flex h-full w-full cursor-grab [align-items:safe_center] [justify-content:safe_center] overflow-auto p-4",
          CANVAS_RULE_CLASS,
        )}
        style={groundFieldCss(camera.scale)}
      >
        <div
          className="shrink-0"
          style={{
            width: size.width * camera.scale,
            height: size.height * camera.scale,
          }}
        >
          <DictDiagram
            file={file}
            availableWidth={paneWidth - 32}
            className="block"
            reorder={reorder}
            retitle={retitle}
          />
        </div>
      </div>
      {/* The house zoom pill — the same control, classes and gesture hints
          every other canvas mounts, so 400% and the pinch behave identically
          across the product. */}
      <div className="pointer-events-auto absolute right-3 bottom-3 z-20">
        <div className={ZOOM_PILL_CLASSES}>
          <button
            type="button"
            onClick={camera.zoomOut}
            title={ZOOM_OUT_TITLE}
            aria-label="Zoom out"
            className={ZOOM_BUTTON_CLASSES}
          >
            <ZoomOut aria-hidden="true" className="size-4" />
          </button>
          <ZoomMenu
            percent={camera.percent}
            isFit={camera.isFit}
            maxZoom={ZOOM_MAX}
            onFit={camera.fit}
            onZoomTo={camera.zoomTo}
            title="Zoom level"
            keyboardHint=""
          />
          <button
            type="button"
            onClick={camera.zoomIn}
            title={ZOOM_IN_TITLE}
            aria-label="Zoom in"
            className={ZOOM_BUTTON_CLASSES}
          >
            <ZoomIn aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={camera.fit}
            title="Fit the whole diagram"
            aria-label="Fit to view"
            className={ZOOM_BUTTON_CLASSES}
          >
            <Scan aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The title's editor                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The field styling for a control floating over a diagram.
 *
 * `bg-canvas/60` IS THE SHARED ANSWER rather than a shade picked here: it is
 * the fill the flowchart dock, the C4 details panel and the use-case dock all
 * use for this job. `check:canvas-chrome` lets that strength through and fails
 * a viewer reaching for a full-strength `bg-canvas` or `bg-background`,
 * because a notation grounding itself is how the ground behind a diagram came
 * to change shade when the reader changed notation.
 *
 * MAINTAINED BY HAND against `FIELD_CLASS` in `usecase-viewer.tsx` and
 * `flowchart-viewer.tsx`, which a feature may not deep-import from. The token
 * is the part that has to agree, and `check:canvas-chrome` is what watches it.
 */
const FIELD_CLASS =
  "w-full rounded-md border border-border bg-canvas/60 px-2 py-1 text-sm text-foreground " +
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const LABEL_CLASS = "text-xs font-medium text-muted-foreground";

/**
 * The document's title, typed into WHERE IT IS DRAWN.
 *
 * IT IS MOUNTED INSIDE THE CANVAS, in a `foreignObject` over the title band —
 * see `DictRetitleSurface`. The renderer owns the geometry, because only the
 * layout knows where the title sits; this owns the field, because an editor is
 * state and that renderer is pure.
 *
 * SUBMIT, NOT KEYSTROKE. Every gesture on this canvas is a source-text patch
 * that lands in the undo ring, so committing per character would fill the ring
 * a letter at a time and rewrite the pane under a reader still mid-word — the
 * call the reorder handles and every other editable canvas here make.
 *
 * THE REFUSAL IS SURFACED BY THE FIELD, `required`, rather than announced. An
 * emptied title is refused by the gesture too — every grammar requires one —
 * but the thing this must not do is let a press look like it worked, and the
 * browser's own message lands ON the box that is wrong. Nothing is announced
 * from in here: the host owns the single polite live region, a second sentence
 * for one event would race it, and there is no refusal left to carry.
 */
function TitleForm({
  title,
  onSubmitTitle,
  onCancel,
}: {
  title: string;
  onSubmitTitle: (title: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [next, setNext] = useState(title);

  return (
    <form
      /* THE FIELD SCROLLS INSIDE ITS BOX. A `foreignObject` clips to its own
         rectangle and that box is clamped to stay inside the drawing, so on a
         one-section dictionary the Apply row would otherwise be shaved off
         with nothing on screen to say so. */
      className="flex size-full flex-col gap-2 overflow-auto rounded-md border border-node-border bg-node p-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmitTitle(next.trim());
      }}
      /* Escape closes the field and nothing else — the key a reader who
         pressed the title expects to put it back. */
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor="af-dict-title">
          Title
        </label>
        <input
          id="af-dict-title"
          className={FIELD_CLASS}
          value={next}
          required
          /* The reader pressed the title to type in it — landing them in the
             field is what the press asked for. */
          autoFocus
          onChange={(event) => setNext(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
