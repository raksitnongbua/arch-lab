"use client";

/**
 * The mounted ER canvas — what `/view` renders once the pane's text has parsed
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
 * FOCUS IS VALIDATED AT READ TIME, the rule `usecase-viewer.tsx` states: the
 * pane re-parses on every keystroke, so a focused entity can vanish under the
 * reader's cursor. A focus pointing at nothing reads as no focus rather than
 * as a panel describing a table that no longer exists.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ErCardinality, ErLabFile } from "@/types";

import { ErDiagram } from "./er-diagram";
import type { ErFocus } from "./er-diagram";

export interface ErViewerProps {
  file: ErLabFile;
  onAnnounce?: (message: string) => void;
}

/** Cardinality in words, for the panel. The glyphs are the notation and the
 * canvas draws them; this is the reading for someone who has not memorised
 * a crow's foot, and it is the same vocabulary the `.alab` model uses. */
const CARDINALITY_PROSE: Record<ErCardinality, string> = {
  one: "exactly one",
  "zero-or-one": "zero or one",
  "one-or-more": "one or more",
  "zero-or-more": "zero or more",
};

export function ErViewer({
  file,
  onAnnounce,
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

  return (
    <div className="relative h-full w-full">
      {/* Escape clears focus from anywhere on the canvas, matching the
          viewer's own top-level convention. */}
      <div
        className="h-full w-full overflow-auto p-4"
        onKeyDown={(event) => {
          if (event.key === "Escape" && focusId !== null) setRawFocus(null);
        }}
      >
        <ErDiagram
          file={file}
          focus={focus}
          onFocus={setRawFocus}
          className="mx-auto max-w-full"
        />
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

          {focused.description !== undefined ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {focused.description}
            </p>
          ) : null}

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
        </aside>
      ) : null}
    </div>
  );
}
