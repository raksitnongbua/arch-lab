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

import { useEffect, useMemo, useRef, useState } from "react";

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
