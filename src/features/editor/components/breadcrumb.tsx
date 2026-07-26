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

import { cn } from "@/lib/utils";
import { hasChildDiagram, isBoundaryPlaceholder, type C4Level } from "@/types";

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

const LEVEL_LABELS: Record<C4Level, string> = {
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
};

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
        {LEVEL_LABELS[segment.level]}
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

export function Breadcrumb(): React.JSX.Element {
  useLevelNavigation();

  const segments = useEditorStore(selectBreadcrumb);
  const model = useEditorStore((s) => s.model);
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
    return (
      <li
        key={segment.diagramId}
        className="flex min-w-0 shrink-0 items-center gap-0.5"
      >
        {isCurrent ? (
          <span
            aria-current="page"
            className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm font-medium text-foreground"
          >
            <SegmentContent segment={segment} />
          </span>
        ) : (
          <button
            type="button"
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm text-muted-foreground transition-colors",
              "hover:bg-secondary hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
            onClick={() => navigateToDiagram(segment.diagramId)}
          >
            <SegmentContent segment={segment} />
          </button>
        )}
        {siblings.length > 1 ? (
          <BreadcrumbSiblingsMenu
            segmentLabel={segment.label}
            items={siblings.map((item) => ({
              ...item,
              hint: LEVEL_LABELS[segment.level],
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
      className="min-w-0 overflow-hidden"
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
                        hint: LEVEL_LABELS[item.level],
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
