"use client";

/**
 * The mounted ER canvas — what `/live` renders once the pane's text has parsed
 * as an ER document. Layout and focus, composed around the pure `ErDiagram`.
 *
 * WHY THERE IS A DETAIL PANEL AT ALL. The first cut had none, on the argument
 * that an ER box already draws its detail — every column, its type and its key
 * roles are on the box. That was wrong twice. It ignored `desc`, which is the
 * one thing the box CANNOT show and the only place a schema records WHY a
 * column exists ("lowercased on write, so it can be a unique key"). And it
 * left the fifth canvas as the only one a reader cannot interrogate, which on
 * a product whose selling point is presentation is a defect, not a
 * simplification.
 *
 * WHAT FOCUS ANSWERS. Clicking a table dims everything it is not joined to and
 * lights the relationships that touch it — "what does this table talk to?",
 * which is the question a reader brings to a schema they did not write. The
 * panel then names the joins in words, with the cardinality spelled out, so
 * the crow's feet are readable by someone who has not memorised them.
 *
 * AND THE PANEL IS ALSO WHERE AN ENTITY IS RETYPED. `canvas-editing.md`:
 * "Look for the surface the canvas already has before building one." This
 * canvas refused `revise` on `"surface"` grounds — the grammar could hold the
 * edit and nothing on the canvas would take it — and that refusal moves here,
 * into the panel a click already opens, rather than into a second dock beside
 * it. Which fields it may rewrite is `ErEntityRevision`'s verdict, not this
 * file's.
 *
 * FOCUS IS VALIDATED AT READ TIME, the rule `usecase-viewer.tsx` states: the
 * pane re-parses on every keystroke, so a focused entity can vanish under the
 * reader's cursor. A focus pointing at nothing reads as no focus rather than
 * as a panel describing a table that no longer exists.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ErCardinality, ErLabFile } from "@/types";

import { Scan, ZoomIn, ZoomOut } from "lucide-react";

// Type-only, and a deep import for it: the playground's edit module is where
// this shape is defined and enforced — which fields it admits and which it
// refuses is that module's verdict — and re-declaring it here would be a
// second definition free to drift from the gesture that honours it. The
// flowchart viewer imports `FlowNodeRevision` the same way.
import type { ErEntityRevision } from "@/features/playground/input/er-edit";

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
import { layoutEr } from "../lib/layout";
import { ErDiagram } from "./er-diagram";
import type { ErFocus } from "./er-diagram";

/**
 * The gestures this canvas can send back, when editing is on.
 *
 * PRESENCE IS THE OFFER, the contract the flowchart and sequence canvases
 * already keep: the whole bundle is `undefined` while the canvas is locked,
 * read-only or in a Mermaid pane, and the viewer then renders no editing
 * chrome at all rather than disabled controls. `editable` is the second half
 * of the same answer for a host that holds the handlers but cannot let them
 * run yet — a bundle whose `editable` is false is treated exactly like an
 * absent one, so there is one branch to read and not two.
 *
 * AN ENTITY IS ADDRESSED BY ID, which the parser proves unique per file — none
 * of the index-addressing the flowchart needs for its unnamed edges applies.
 *
 * NOTHING HERE IMPORTS THE PLAYGROUND. The host passes these in, the same
 * direction the flowchart's `FlowchartEditHandlers` points: this feature knows
 * what a gesture means geometrically and nothing about the text it becomes.
 */
export interface ErEditHandlers {
  /**
   * Place `entityId`'s box top-left at `position`, in the LAYOUT's own units —
   * which is what `ErEntity.position` holds unchanged.
   *
   * NO OFFSET TO SUBTRACT, and this canvas is the only one of the three where
   * that is true — so it is measured, not assumed. `layoutEr` writes a stated
   * `(x,y)` straight onto the box (`box.x = at.x`) and never slides the
   * drawing afterwards, so the space the canvas draws in and the space the
   * text records are the same one. The flowchart solves its rows around axis 0
   * and has to give back `layout.offset`; the use-case layout normalises the
   * whole cast into its margins and under its heading, and `UseCaseViewer`
   * measures that shift to invert it. Writing the drawn coordinate through
   * either of those walked the shape off the page one drag at a time.
   */
  onMoveEntity: (entityId: string, position: { x: number; y: number }) => void;
  /** Hand one entity back to the solver — its `(x,y)` and its `pin` both go,
   *  because a pin with no position is a document the parser refuses. */
  onReleaseEntity: (entityId: string) => void;
  /** Set or clear one entity's pin, which exempts it from a whole-diagram
   *  release. Pinning needs a position to keep. */
  onPinEntity: (entityId: string, pinned: boolean) => void;
  /**
   * Rewrite one entity's own wording — its label, its `[technology]`, its
   * `#tag`s and its `desc`. What this may NOT rewrite, and why, is
   * `ErEntityRevision`'s verdict.
   *
   * OPTIONAL, WHERE THE THREE PLACEMENT GESTURES ARE NOT, and the asymmetry
   * is the grid's rather than this file's: placing and revising are separate
   * cells in `CANVAS_EDIT_OFFERS`, answered separately per notation AND per
   * pane language, so a host can legitimately be allowed to place an entity
   * and not to retype one. `editable` is one flag and cannot say that. An
   * absent handler is how this bundle already spells "not offered", so the
   * panel renders no wording fields at all rather than a form that submits
   * into nothing — which is the same read-only-versus-disabled answer the
   * whole-bundle contract above gives.
   */
  onReviseEntity?: (entityId: string, revision: ErEntityRevision) => void;
  /** False while the host holds the handlers but must not run them. */
  editable: boolean;
}

export interface ErViewerProps {
  file: ErLabFile;
  onAnnounce?: (message: string) => void;
  /** Editing gestures, or absent — see `ErEditHandlers`. */
  edit?: ErEditHandlers;
  /**
   * The canvas lock, mounted at the pane's own top-right corner exactly as the
   * C4, sequence and flowchart canvases mount theirs.
   *
   * A SLOT RATHER THAN A FLAG, and it lives on the canvas rather than in the
   * host's strip for the reason `67b35ae` bought: a lock that was correct in
   * `canvasEditability` and rendered only inside another notation's branch left
   * a whole canvas silently uneditable with no control anywhere to unlock it,
   * for a release, with every assertion green.
   *
   * DELIBERATELY NOT GATED ON `edit`: locking WITHDRAWS the handlers, so a lock
   * that only rendered alongside them could never be pressed to undo itself.
   */
  lockSlot?: React.ReactNode;
}

/**
 * How far a press must travel before it stops being a click on a table and
 * becomes a move.
 *
 * IN CSS PIXELS, MEASURED ON CLIENT COORDINATES. A threshold in the layout's
 * user units is a threshold that shrinks with the zoom: at the default "fit"
 * scale a schema wider than its pane draws at well under 1:1, so two pixels of
 * hand jitter clear several user units and every click becomes a drag. A
 * pointer's tremor is a physical quantity, so its threshold has to be one too.
 *
 * MAINTAINED BY HAND against its twins — `NODE_DRAG_THRESHOLD` in
 * `flowchart-viewer.tsx` and `CANVAS_DRAG_THRESHOLD` in
 * `sequence/lib/reorder.ts` — because a feature may not deep-import another
 * feature's internals and this has no home in `src/lib` yet. Give it one when
 * a fourth canvas needs it.
 */
const ENTITY_DRAG_THRESHOLD = 4;

/** Cardinality in words, for the panel. The glyphs are the notation and the
 * canvas draws them; this is the reading for someone who has not memorised
 * a crow's foot, and it is the same vocabulary the `.alab` model uses. */
const CARDINALITY_PROSE: Record<ErCardinality, string> = {
  one: "exactly one",
  "zero-or-one": "zero or one",
  "one-or-more": "one or more",
  "zero-or-more": "zero or more",
};

/**
 * The panel's field styling, in one place — three inputs and a textarea share
 * it, and a fourth copy is how one of them ends up a pixel out from the rest.
 *
 * `bg-canvas/60` IS THE SHARED ANSWER rather than a colour chosen here: it is
 * the fill the C4 details panel and the flowchart dock both use for a control
 * floating over a diagram, and `check:canvas-chrome` fails a viewer that
 * reaches for a full-strength `bg-background` or `bg-canvas` — a notation
 * grounding itself is how the ground behind a diagram came to change shade
 * when the reader changed notation.
 *
 * `text-xs` AND NOT THE FLOWCHART DOCK'S `text-sm`, which is why this is a
 * copy of that token rather than a shared constant: this panel is a 18rem card
 * floating over the canvas whose every other line is `text-xs`, and one
 * `text-sm` column inside it would read as a different card. The token that
 * has to agree is the fill, and it does.
 */
const FIELD_CLASS =
  "mt-0.5 w-full rounded-md border border-border bg-canvas/60 px-2 py-1 " +
  "text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:outline-none";

/**
 * One labelled control. The `<label>` WRAPS its control rather than pointing
 * at it with `htmlFor`, the answer the C4 panel's `EditField` and the sequence
 * dock's `DockField` both give: an id would have to be unique per selected
 * entity — a name to keep in step for nothing — and a hard-coded one is a
 * duplicate the day two panels are open at once.
 *
 * AND IT IS THE CONTROL'S ONLY ACCESSIBLE NAME. An `aria-label` beside it
 * OVERRIDES the visible caption rather than adding to it, so "Entity
 * description" on a box captioned "Details" leaves anyone driving the panel by
 * voice asking for a name that appears nowhere on screen. One name, said once,
 * inside a panel the entity's own heading already scopes.
 */
function EntityField({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="text-[10px] font-medium text-muted-foreground">
        {term}
      </span>
      {children}
    </label>
  );
}

/** An emptied box REMOVES the field: `undefined` is what the gesture reads as
 *  "drop it", where a blank string would write `[]` or `desc ""`. */
const orAbsent = (value: string): string | undefined =>
  value.trim() === "" ? undefined : value.trim();

/**
 * A focused entity's own wording, editable in the panel the canvas already
 * opens for it — the `"surface"` refusal moving the way `canvas-editing.md`
 * says it should, into the surface that was already there rather than into a
 * second inspector beside it.
 *
 * `key`ed ON THE ENTITY ID by its caller, so focusing another table REMOUNTS
 * this with that table's values. A shared instance would keep the fields the
 * reader had half-typed and submit them against a different entity, which is
 * the bug the flowchart dock's and the C4 panel's forms both carry a `key`
 * for.
 *
 * THE NAME IS SUBMITTED AS TYPED and the refusal is left to the one
 * authority: `revisedErEntityEdit` drops an edit whose label is blank,
 * because the parser refuses that document, so a second rule here would be a
 * second answer free to disagree. `required` is the browser saying so before
 * the press, not instead of it.
 *
 * THE COLUMNS ARE NOT HERE, and the panel says so rather than leaving their
 * absence to be read as an oversight — `ErEntityRevision` carries why.
 */
function EntityWordingForm({
  entity,
  onRevise,
}: {
  entity: {
    id: string;
    label: string;
    technology?: string;
    tags?: readonly string[];
    description?: string;
  };
  onRevise: (entityId: string, revision: ErEntityRevision) => void;
}): React.JSX.Element {
  const [label, setLabel] = useState(entity.label);
  const [technology, setTechnology] = useState(entity.technology ?? "");
  /* Tags round-trip through ONE space-separated string rather than a chip
     editor, the flowchart dock's answer: the grammar writes them as `#a #b` on
     the entity's own line, so a text field is the shape that matches what the
     author would have typed. The leading `#` is decoration — accepted if
     typed, never required. */
  const [tags, setTags] = useState((entity.tags ?? []).join(" "));
  const [description, setDescription] = useState(entity.description ?? "");

  return (
    <form
      className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        onRevise(entity.id, {
          label,
          technology: orAbsent(technology),
          tags: tags
            .split(/[\s,]+/)
            .map((tag) => tag.replace(/^#/, ""))
            .filter((tag) => tag !== ""),
          description: orAbsent(description),
        });
      }}
    >
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        Wording
      </p>
      <EntityField term="Label">
        <input
          className={FIELD_CLASS}
          value={label}
          required
          onChange={(event) => setLabel(event.target.value)}
        />
      </EntityField>
      <EntityField term="Technology">
        <input
          className={FIELD_CLASS}
          value={technology}
          placeholder="PostgreSQL"
          onChange={(event) => setTechnology(event.target.value)}
        />
      </EntityField>
      <EntityField term="Tags">
        <input
          className={FIELD_CLASS}
          value={tags}
          placeholder="billing core"
          onChange={(event) => setTags(event.target.value)}
        />
      </EntityField>
      <EntityField term="Details">
        <textarea
          className={FIELD_CLASS}
          rows={3}
          value={description}
          placeholder="What this table is for"
          onChange={(event) => setDescription(event.target.value)}
        />
      </EntityField>
      <button
        type="submit"
        className="mt-0.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Apply
      </button>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        The id and the columns are edited in the source text — relationship
        lines refer to the id, and every column is a line of its own.
      </p>
    </form>
  );
}

export function ErViewer({
  file,
  onAnnounce,
  edit,
  lockSlot,
}: ErViewerProps): React.JSX.Element {
  const [rawFocus, setRawFocus] = useState<ErFocus>(null);

  /* Memoised, not read inline: `file.entities ?? []` allocates a NEW array
     every render when the key is absent, and an array identity that changes
     on every render makes every downstream `useMemo` and effect fire on every
     keystroke of the source pane. */
  const entities = useMemo(() => file.entities ?? [], [file]);
  const relationships = useMemo(() => file.relationships ?? [], [file]);

  /* Validated at read time — see the header. A focus of either kind can point
     at something the last keystroke deleted, and both are resolved the same
     way: a focus that resolves to nothing reads as no focus. */
  const focus: ErFocus =
    rawFocus === null
      ? null
      : rawFocus.kind === "entity"
        ? entities.some((entity) => entity.id === rawFocus.id)
          ? rawFocus
          : null
        : rawFocus.index < relationships.length
          ? rawFocus
          : null;

  const focusId = focus?.kind === "entity" ? focus.id : null;
  const focused = entities.find((entity) => entity.id === focusId) ?? null;
  const focusedEdge =
    focus?.kind === "relationship" ? relationships[focus.index] : null;
  /* Wrapped, because an announcement effect depends on it: a fresh function
     identity every render would re-announce the focused relationship on every
     keystroke of the source pane. */
  const labelOf = useCallback(
    (id: string): string =>
      entities.find((entity) => entity.id === id)?.label ?? id,
    [entities],
  );

  const joins = useMemo(() => {
    if (focusId === null) return [];
    return relationships
      .filter((r) => r.from === focusId || r.to === focusId)
      .map((r) => {
        const outgoing = r.from === focusId;
        const otherId = outgoing ? r.to : r.from;
        const other = entities.find((entity) => entity.id === otherId);
        return {
          id: otherId,
          label: other?.label ?? otherId,
          /* Read from the FOCUSED table's side outward, which is how a person
             says it: "one customer has zero or more orders". The near
             cardinality is the focused end, the far one is the other. */
          near: outgoing ? r.fromCardinality : r.toCardinality,
          far: outgoing ? r.toCardinality : r.fromCardinality,
          verb: r.label,
          dashed: r.kind === "non-identifying",
        };
      });
  }, [focusId, relationships, entities]);

  useEffect(() => {
    onAnnounce?.(
      `ER diagram rendered: ${entities.length} ${entities.length === 1 ? "entity" : "entities"}, ${relationships.length} ${relationships.length === 1 ? "relationship" : "relationships"}.`,
    );
  }, [entities.length, relationships.length, onAnnounce]);

  useEffect(() => {
    if (focused !== null) {
      onAnnounce?.(
        `Focused ${focused.label}: ${joins.length} ${joins.length === 1 ? "relationship" : "relationships"}.`,
      );
      return;
    }
    if (focusedEdge !== null) {
      onAnnounce?.(
        `Focused the relationship from ${labelOf(focusedEdge.from)} to ${labelOf(focusedEdge.to)}.`,
      );
    }
  }, [focused, focusedEdge, joins.length, labelOf, onAnnounce]);

  /* The layout is computed here as well as inside the canvas, so the camera
     knows the content's size and the drag knows where each box currently is.
     Cheap and pure — and cheaper than threading the measurement back out of a
     component that has no reason to expose it. */
  const size = useMemo(() => layoutEr(file), [file]);
  const laidById = useMemo(
    () => new Map(size.entities.map((entity) => [entity.id, entity])),
    [size],
  );
  const paneRef = useRef<HTMLDivElement>(null);
  const camera = useCanvasZoom({
    paneRef,
    contentWidth: size.bounds.width,
    contentHeight: size.bounds.height,
    onAnnounce,
  });

  /* ---- the move gesture --------------------------------------------------
   * IT COSTS NO NEW POINTER ARBITRATION, which is what made it addable to a
   * canvas that already drag-pans. `useCanvasZoom`'s pan stands down for any
   * press whose target `closest`es a `[role="button"]`, and an entity group
   * carries that role — so the pan never sees the press that starts a move,
   * and a drag that both panned and placed is unreachable rather than merely
   * unlikely. The flowchart canvas stands down for `.af-flow-hit` the same
   * way. */

  const editing = edit !== undefined && edit.editable;
  /* The wording gesture, or nothing — read through `editing` so a bundle the
     host is holding back cannot open a form, exactly as the placement
     controls read it. `ErEditHandlers.onReviseEntity` carries why this one
     may be absent while the other three are not. */
  const revise = editing ? edit?.onReviseEntity : undefined;
  const svgRef = useRef<SVGSVGElement>(null);

  /**
   * Client coordinates → LAYOUT units, through the SVG's own matrix.
   *
   * `getScreenCTM` rather than arithmetic on the camera's scale and the pane's
   * scroll offsets: it already accounts for the viewBox — whose origin is
   * `size.bounds.x`/`y` and goes NEGATIVE the moment something is pinned
   * left of or above the origin — for the `preserveAspectRatio` letterboxing
   * a fitted canvas introduces, and for any page transform above the pane.
   * Three things a hand-rolled conversion has to get right separately, one of
   * which changes with the pane's aspect ratio.
   */
  const toLayoutUnits = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      const matrix = svg?.getScreenCTM();
      if (svg == null || matrix == null) return null;
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const local = point.matrixTransform(matrix.inverse());
      return { x: local.x, y: local.y };
    },
    [],
  );

  /**
   * The in-flight move: which entity, and where its top-left would land.
   * `grab` is the offset from that corner to the pointer, so the box does not
   * jump to centre itself under the cursor on the first move.
   *
   * `moved` is what separates a click from a drag. The entity's group is both
   * the focus target and the move handle, so a press that travels less than
   * `ENTITY_DRAG_THRESHOLD` stays a click and focuses the table, and one that
   * travels further places it.
   */
  const [entityDrag, setEntityDrag] = useState<{
    id: string;
    x: number;
    y: number;
    grab: { dx: number; dy: number };
    /** Where the press started, in CLIENT pixels — the threshold's own unit. */
    from: { clientX: number; clientY: number };
    moved: boolean;
  } | null>(null);

  const handleEntityDragStart = useCallback(
    (id: string, event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      /* A MODIFIER-CLICK IS NOT A MOVE. The flowchart canvas shipped without
         this and any hand jitter past the threshold turned a shift-click into
         a drag; the same three keys are the whole of the gesture's split
         wherever a canvas has one, so they are read identically here. */
      if (event.shiftKey || event.metaKey || event.ctrlKey) return;
      const at = toLayoutUnits(event.clientX, event.clientY);
      const laid = laidById.get(id);
      if (at === null || laid === undefined) return;
      setEntityDrag({
        id,
        x: laid.x,
        y: laid.y,
        grab: { dx: at.x - laid.x, dy: at.y - laid.y },
        from: { clientX: event.clientX, clientY: event.clientY },
        moved: false,
      });
      /* NO POINTER CAPTURE HERE, and the omission is the whole point: capture
         on pointerdown retargets the following `click` to the capturing
         element, so the entity's own `onClick` never runs and clicking a table
         stops focusing it. Capture is taken LAZILY below, on the first move
         that crosses the threshold — by which point there is a real drag to
         keep hold of and no click left to protect. */
    },
    [laidById, toLayoutUnits],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (entityDrag === null) return;
      const at = toLayoutUnits(event.clientX, event.clientY);
      if (at === null) return;
      const crossed =
        entityDrag.moved ||
        Math.abs(event.clientX - entityDrag.from.clientX) +
          Math.abs(event.clientY - entityDrag.from.clientY) >
          ENTITY_DRAG_THRESHOLD;
      if (crossed && !entityDrag.moved) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setEntityDrag({
        ...entityDrag,
        x: at.x - entityDrag.grab.dx,
        y: at.y - entityDrag.grab.dy,
        moved: crossed,
      });
    },
    [entityDrag, toLayoutUnits],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (entityDrag === null) return;
      setEntityDrag(null);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      /* Under the threshold this was a click, and it is left alone: the
         entity's own `onClick` runs after this handler and focuses the table,
         which is what a press that went nowhere has always done. A
         zero-distance move would also write a coordinate the reader never
         asked for and opt the table out of the solver for good. */
      if (!entityDrag.moved) return;
      edit?.onMoveEntity(entityDrag.id, { x: entityDrag.x, y: entityDrag.y });
      /* No offset correction — see `onMoveEntity`. A capture was taken above,
         which is also what stops the trailing click from reaching the box and
         toggling its focus out from under the reader. */
    },
    [edit, entityDrag],
  );

  return (
    <div className="relative h-full w-full">
      {/* Escape clears focus from anywhere on the canvas, matching the
          viewer's own top-level convention. */}
      <div
        ref={paneRef}
        /* THE GROUND, filling the pane rather than the drawing — the reversal
           is recorded at `.af-canvas-rule` in globals.css. */
        className={cn(
          "flex h-full w-full cursor-grab [align-items:safe_center] [justify-content:safe_center] overflow-auto p-4",
          CANVAS_RULE_CLASS,
        )}
        style={groundFieldCss(camera.scale)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && focusId !== null) setRawFocus(null);
        }}
        /* The move's pointer handlers live on the PANE, not on the box: a drag
           that leaves the box mid-gesture must keep moving it, and the pane is
           what takes the capture. They no-op unless a drag is in flight, so
           the camera's own pan listeners (attached natively by
           `useCanvasZoom`) are untouched. */
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Sized in PIXELS from the camera's scale rather than `width="100%"`:
            a percentage width can only ever shrink to the pane, which is why
            this canvas could not be zoomed in at all — there was nothing to
            scroll. An explicit width makes the pane scrollable, which is what
            panning is. HEIGHT too, or the pane cannot centre it vertically and
            a fitted diagram sits against the top edge.

            `safe center` on the pane, not plain `center`: ordinary flex
            centring puts overflow on BOTH sides of the container and the
            start-side overflow is unreachable — you can drag right and never
            get back to the left edge, which is what "stuck" was. `safe` falls
            back to start alignment the moment the content is larger than the
            pane, so it centres a small diagram and stays fully scrollable for
            a large one. */}
        <div
          className="shrink-0"
          style={{
            width: size.bounds.width * camera.scale,
            height: size.bounds.height * camera.scale,
          }}
        >
          <ErDiagram
            file={file}
            focus={focus}
            onFocus={setRawFocus}
            className="block"
            svgRef={svgRef}
            onEntityDragStart={editing ? handleEntityDragStart : undefined}
            /* Only a drag that has really travelled reaches the canvas, so a
               press that stays a click never nudges the box it focuses. */
            entityDrag={entityDrag?.moved === true ? entityDrag : null}
          />
        </div>
      </div>
      {/* The lock, at the pane's top-right — the corner the C4, sequence and
          flowchart canvases all put theirs in, so a reader moving between the
          notations finds it in one place.

          IT SLIDES LEFT OF AN OPEN PANEL, the sequence canvas's fix for the
          same collision: the detail panel owns this corner while it is open,
          and two controls in one corner is how one of them ends up
          unreachable — which is exactly the failure the lock's own history is
          about. */}
      {lockSlot !== undefined ? (
        <div
          className={cn(
            "absolute top-4 z-30",
            focused !== null || focusedEdge !== null
              ? "right-[19.5rem]"
              : "right-4",
          )}
        >
          {lockSlot}
        </div>
      ) : null}
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

      {focusedEdge !== null ? (
        <aside
          aria-label="Relationship detail"
          className="pointer-events-auto absolute top-4 right-4 w-72 rounded-xl border border-border/70 bg-background/95 p-4 shadow-lg backdrop-blur"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              {labelOf(focusedEdge.from)} → {labelOf(focusedEdge.to)}
            </h3>
            <button
              type="button"
              onClick={() => setRawFocus(null)}
              className="rounded px-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear focus"
            >
              ✕
            </button>
          </div>
          {/* THE SENTENCE THE CROW'S FEET SPELL. This is the whole reason a
              line is clickable: the glyphs are the notation and the canvas
              draws them, but a reader who has not memorised a crow's foot
              cannot read them, and nowhere else on the page says it in
              words. */}
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            <span className="text-foreground">
              {CARDINALITY_PROSE[focusedEdge.fromCardinality]}
            </span>{" "}
            {labelOf(focusedEdge.from).toLowerCase()}
            {focusedEdge.label === undefined
              ? " relates to"
              : ` ${focusedEdge.label}`}{" "}
            <span className="text-foreground">
              {CARDINALITY_PROSE[focusedEdge.toCardinality]}
            </span>{" "}
            {labelOf(focusedEdge.to).toLowerCase()}.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {focusedEdge.kind === "identifying"
              ? "Identifying — drawn solid: the child cannot exist without its parent."
              : "Non-identifying — drawn dashed: the child has an identity of its own."}
          </p>
        </aside>
      ) : null}

      {focused !== null ? (
        <aside
          aria-label={`${focused.label} detail`}
          className="pointer-events-auto absolute top-4 right-4 max-h-[calc(100%-2rem)] w-72 overflow-auto rounded-xl border border-border/70 bg-background/95 p-4 shadow-lg backdrop-blur"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                {focused.label}
              </h3>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {focused.id}
                {focused.technology === undefined
                  ? ""
                  : ` · ${focused.technology}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRawFocus(null)}
              className="rounded px-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear focus"
            >
              ✕
            </button>
          </div>

          {/* THE FORM REPLACES THE PROSE rather than sitting under it. The
              `desc` is the one thing this panel exists to show, so a
              read-only copy above an editable copy of the same sentence would
              leave the reader guessing which one the diagram believes. */}
          {revise === undefined ? (
            focused.description !== undefined ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {focused.description}
              </p>
            ) : null
          ) : (
            <EntityWordingForm
              key={focused.id}
              entity={focused}
              onRevise={revise}
            />
          )}

          {/* Only the columns that carry a description. The rest are already
              on the box, and repeating them here would be a second copy of
              the diagram rather than the thing the diagram cannot show. */}
          {(focused.attributes ?? []).some(
            (attribute) => attribute.description !== undefined,
          ) ? (
            <dl className="mt-3 space-y-2 border-t border-border/60 pt-3">
              {(focused.attributes ?? [])
                .filter((attribute) => attribute.description !== undefined)
                .map((attribute) => (
                  <div key={attribute.name}>
                    <dt className="font-mono text-[11px] text-foreground">
                      {attribute.name}
                    </dt>
                    <dd className="text-xs leading-relaxed text-muted-foreground">
                      {attribute.description}
                    </dd>
                  </div>
                ))}
            </dl>
          ) : null}

          <div className="mt-3 border-t border-border/60 pt-3">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Joins
            </p>
            {joins.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Nothing joins this table.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {joins.map((join, index) => (
                  <li
                    key={`${join.id}-${index}`}
                    className="text-xs leading-relaxed text-muted-foreground"
                  >
                    <span className="text-foreground">
                      {CARDINALITY_PROSE[join.near]}
                    </span>{" "}
                    {focused.label.toLowerCase()}
                    {join.verb === undefined ? " →" : ` ${join.verb}`}{" "}
                    <span className="text-foreground">
                      {CARDINALITY_PROSE[join.far]}
                    </span>{" "}
                    {join.label.toLowerCase()}
                    {join.dashed ? (
                      <span className="text-muted-foreground/70">
                        {" "}
                        (non-identifying)
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ---- placement: the two gestures a pointer has that a keyboard
              does not, plus the two that need a control either way.

              THE DRAG IS NAMED RATHER THAN LEFT TO BE DISCOVERED, the
              flowchart dock's answer for its own pin gesture. Placing a table
              is a pointer gesture and there is no keyboard nudge on any canvas
              here — but RELEASING one and PINNING it are gestures of their
              own, and a gesture with no control is a feature only a mouse can
              reach, so both are buttons a Tab lands on.

              THE CONTROLS APPEAR ONLY WHERE THEY CAN DO SOMETHING: releasing
              a table that states no `(x,y)` and pinning one that has no
              position to keep are both edits the gesture module refuses, and a
              control that cannot change anything is worse than its absence. */}
          {editing ? (
            <div className="mt-3 border-t border-border/60 pt-3">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Placement
              </p>
              {focused.position === undefined ? (
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Laid out from what joins it. Drag the table to place it
                  yourself.
                </p>
              ) : (
                <div className="mt-1.5 flex flex-col gap-2">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Placed at {Math.round(focused.position.x)},{" "}
                    {Math.round(focused.position.y)}. Drag the table to move it.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => edit?.onReleaseEntity(focused.id)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      Hand back to the layout
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        edit?.onPinEntity(focused.id, focused.pinned !== true)
                      }
                      aria-pressed={focused.pinned === true}
                      className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-secondary"
                    >
                      {focused.pinned === true
                        ? "Pinned against a sweep"
                        : "Pin against a sweep"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
