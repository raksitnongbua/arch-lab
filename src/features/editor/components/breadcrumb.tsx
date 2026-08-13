"use client";

/**
 * The breadcrumb (T2-C — AF-E2-S3). Props-free per §4.4; mounted by the
 * frozen `editor-shell.tsx`.
 *
 * - Renders `selectBreadcrumb(state)` as `Name [Level]` segments,
 *   root → current, separated by `›`.
 * - Clicking an ancestor navigates UP: the canvas restores that level's saved
 *   camera, and `use-level-navigation` re-centres it on the level's
 *   last-selected node when it would be off-screen.
 * - Each non-root segment with siblings gets a switcher for going ACROSS to
 *   another child diagram of the same parent.
 * - When the path is too wide, middle segments collapse into a `…` menu;
 *   root and current always stay visible. Measured against the shell
 *   header's free space (the `flex-1` spacer), with hysteresis so it never
 *   oscillates.
 * - `mod+ArrowUp` at the root is a no-op with a subtle shake (transform-only,
 *   suppressed under reduced motion). Shortcuts live in
 *   `use-level-navigation`, mounted here — the breadcrumb always exists.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

import { LEVEL_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { hasChildDiagram, isBoundaryPlaceholder } from "@/types";

import {
  navigateToDiagram,
  useLevelNavigation,
  useNavigationFeedback,
} from "../hooks/use-level-navigation";
import { prefersReducedMotion } from "../lib/motion";
import {
  selectBreadcrumb,
  useEditorStore,
  type BreadcrumbSegment,
  type EditorModel,
} from "../state";
import {
  BreadcrumbOverflowMenu,
  BreadcrumbSiblingsMenu,
  type BreadcrumbMenuItem,
} from "./breadcrumb-overflow-menu";

/** Extra free space required before an expand attempt (hysteresis). */
const EXPAND_SLACK_PX = 32;

/**
 * Sibling diagrams of `segment` — the other child diagrams under the same
 * parent, labelled by their owner node's name. Empty at the root.
 */
function siblingsOf(
  model: EditorModel,
  segment: BreadcrumbSegment,
): BreadcrumbMenuItem[] {
  const diagram = model.diagrams[segment.diagramId];
  if (diagram === undefined || diagram.parentDiagramId === null) return [];
  const parent = model.diagrams[diagram.parentDiagramId];
  if (parent === undefined) return [];
  const items: BreadcrumbMenuItem[] = [];
  for (const node of parent.nodes) {
    if (!hasChildDiagram(node) || isBoundaryPlaceholder(node)) continue;
    if (typeof node.childDiagramId !== "string") continue;
    items.push({
      id: node.childDiagramId,
      label: node.name,
      current: node.childDiagramId === segment.diagramId,
    });
  }
  return items;
}

function SegmentContent({
  segment,
}: {
  segment: BreadcrumbSegment;
}): React.JSX.Element {
  return (
    <>
      <span className="max-w-44 truncate">{segment.label}</span>
      <span className="shrink-0 rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
        {LEVEL_LABEL[segment.level]}
      </span>
    </>
  );
}

function Separator(): React.JSX.Element {
  return (
    <li aria-hidden="true" className="shrink-0 text-muted-foreground/70">
      ›
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Renaming the model                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The model's name, edited where it is displayed.
 *
 * The root segment's label IS `metadata.title` (see `selectBreadcrumb`), so
 * this is the one place in the editor where the model's own name is on
 * screen. Before this it could only be changed by saving under a different
 * filename — the inspector's Title field edits the root DIAGRAM's title,
 * which is a different field.
 *
 * The gesture has to share the segment with navigation, which already owns
 * single click when you are deeper than the root. So:
 *
 *   - at the root, where there is nothing to navigate to, a single click
 *     starts editing;
 *   - anywhere deeper, single click still navigates and double click starts
 *     editing — the same split the canvas already uses for drill-vs-rename
 *     (D5), so it is a convention here rather than a new rule.
 *
 * Committed on Enter and on blur, abandoned on Escape. An empty or
 * whitespace-only name is refused rather than written: `metadata.title` is
 * required by the file validator, so an empty one would produce a document
 * that will not reopen.
 */
function ModelNameInput({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <input
      ref={(node) => {
        // Select on mount so typing replaces the old name, which is what
        // renaming almost always means.
        if (node !== null && inputRef.current === null) {
          inputRef.current = node;
          node.focus();
          node.select();
        }
      }}
      value={draft}
      aria-label="Model name"
      className={cn(
        "min-w-0 rounded-md border border-input bg-background px-1.5 py-0.5 text-sm font-medium text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
      )}
      size={Math.max(8, Math.min(draft.length + 1, 32))}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(draft);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
          return;
        }
        // The editor binds single-key shortcuts (delete, level nav) at the
        // document. While a name is being typed they must not fire.
        event.stopPropagation();
      }}
    />
  );
}

export function Breadcrumb(): React.JSX.Element {
  useLevelNavigation();

  const segments = useEditorStore(selectBreadcrumb);
  const model = useEditorStore((s) => s.model);
  const updateMetadata = useEditorStore((s) => s.updateMetadata);
  const [renaming, setRenaming] = useState(false);

  const commitName = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      // Refused, not written: `metadata.title` is required by the file
      // validator, so an empty one produces a document that will not reopen.
      if (trimmed !== "" && trimmed !== model.metadata.title) {
        updateMetadata({ title: trimmed });
      }
      setRenaming(false);
    },
    [model.metadata.title, updateMetadata],
  );
  const shakeToken = useNavigationFeedback((s) => s.shakeToken);

  const navRef = useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const collapsedRef = useRef(collapsed);
  /** Natural width of the fully expanded path, recorded while expanded. */
  const expandedWidthRef = useRef(0);

  /* ---- overflow: collapse middle segments into `…` (AF-E2-S3) ------------ */

  const segmentCountRef = useRef(segments.length);
  // Mirror render values into refs for the measurement callbacks (updating a
  // ref during render is disallowed; this effect runs first, before the
  // re-measure effects below).
  useEffect(() => {
    collapsedRef.current = collapsed;
    segmentCountRef.current = segments.length;
  }, [collapsed, segments]);

  // A path change re-measures from the expanded state (render-time derived
  // state — the measurement callback below re-collapses when needed).
  const [prevSegments, setPrevSegments] = useState(segments);
  if (segments !== prevSegments) {
    setPrevSegments(segments);
    if (collapsed) setCollapsed(false);
  }

  const measure = useCallback(() => {
    const nav = navRef.current;
    const header = nav?.parentElement;
    if (!nav || !header) return;
    if (!collapsedRef.current) {
      // While expanded, the natural path width is directly measurable.
      expandedWidthRef.current = nav.scrollWidth;
      if (
        segmentCountRef.current > 2 &&
        nav.scrollWidth > nav.clientWidth + 1
      ) {
        setCollapsed(true);
      }
      return;
    }
    // Reclaimable space = current width + the header's flex-1 spacer. Expand
    // only with slack to spare (hysteresis) so the state never oscillates.
    const spacer = header.querySelector<HTMLElement>(":scope > .flex-1");
    const available = nav.clientWidth + (spacer?.offsetWidth ?? 0);
    if (available > expandedWidthRef.current + EXPAND_SLACK_PX) {
      setCollapsed(false);
    }
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    const header = nav?.parentElement;
    if (!nav || !header) return;
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [measure]);

  // Content changes don't always resize the (already clamped) nav box, so a
  // path or collapse change re-measures on the next frame as well.
  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [segments, collapsed, measure]);

  /* ---- root shake (AF-E2-S3) ---------------------------------------------- */

  const lastShakeRef = useRef(shakeToken);
  useEffect(() => {
    if (shakeToken === lastShakeRef.current) return;
    lastShakeRef.current = shakeToken;
    const nav = navRef.current;
    if (nav === null || prefersReducedMotion()) return;
    nav.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(4px)" },
        { transform: "translateX(-2px)" },
        { transform: "translateX(2px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 280, easing: "ease-in-out" },
    );
  }, [shakeToken]);

  /* ---- render -------------------------------------------------------------- */

  const showOverflow = collapsed && segments.length > 2;
  const middle = showOverflow ? segments.slice(1, -1) : [];
  const visible: BreadcrumbSegment[] = showOverflow
    ? [segments[0], segments[segments.length - 1]]
    : segments;

  const renderSegment = (segment: BreadcrumbSegment, isCurrent: boolean) => {
    const siblings = siblingsOf(model, segment);
    const isRoot = segment.diagramId === model.rootDiagramId;
    return (
      <li
        key={segment.diagramId}
        className="flex min-w-0 shrink-0 items-center gap-0.5"
      >
        {isRoot && renaming ? (
          <ModelNameInput
            value={model.metadata.title}
            onCommit={commitName}
            onCancel={() => setRenaming(false)}
          />
        ) : isCurrent ? (
          isRoot ? (
            /* At the root there is nowhere to navigate, so the click is free
               to mean rename. Deeper down it still means "go up". */
            <button
              type="button"
              aria-current="page"
              title="Rename the model"
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium text-foreground transition-colors",
                "hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
              onClick={() => setRenaming(true)}
            >
              <SegmentContent segment={segment} />
            </button>
          ) : (
            <span
              aria-current="page"
              className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium text-foreground"
            >
              <SegmentContent segment={segment} />
            </span>
          )
        ) : (
          <button
            type="button"
            {...(isRoot
              ? { title: "Click to open · double-click to rename" }
              : {})}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm text-muted-foreground transition-colors",
              "hover:bg-secondary hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
            onClick={() => navigateToDiagram(segment.diagramId)}
            {...(isRoot ? { onDoubleClick: () => setRenaming(true) } : {})}
          >
            <SegmentContent segment={segment} />
          </button>
        )}
        {siblings.length > 1 ? (
          <BreadcrumbSiblingsMenu
            segmentLabel={segment.label}
            items={siblings.map((item) => ({
              ...item,
              hint: LEVEL_LABEL[segment.level],
            }))}
            onNavigate={navigateToDiagram}
          />
        ) : null}
      </li>
    );
  };

  return (
    <nav
      ref={navRef}
      aria-label="Diagram hierarchy"
      /* A floor, not just `min-w-0`. This nav is the only shrinkable item in
         the header strip, so when a right rail opens flexbox took the whole
         difference out of it — it collapsed to zero width and the breadcrumb
         vanished, taking the only way back up a level with it. The collapse
         logic above is what handles a path that is genuinely too long (it
         folds middles into `…`); flexbox squeezing the element out of
         existence is not the same thing and must not happen. */
      className="min-w-24 shrink overflow-hidden"
    >
      <ol className="flex min-w-0 items-center gap-1 whitespace-nowrap">
        {visible.map((segment, index) => {
          const isCurrent =
            segment.diagramId === segments[segments.length - 1].diagramId;
          return (
            <Fragment key={segment.diagramId}>
              {index > 0 ? <Separator /> : null}
              {index === 1 && showOverflow ? (
                <>
                  <li className="flex shrink-0 items-center">
                    <BreadcrumbOverflowMenu
                      items={middle.map((item) => ({
                        id: item.diagramId,
                        label: item.label,
                        hint: LEVEL_LABEL[item.level],
                      }))}
                      onNavigate={navigateToDiagram}
                    />
                  </li>
                  <Separator />
                </>
              ) : null}
              {renderSegment(segment, isCurrent)}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
