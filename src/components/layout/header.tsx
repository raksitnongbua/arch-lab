"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { buttonClasses } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import { NAV_LINKS } from "@/lib/nav-links";
import { cn } from "@/lib/utils";

/** Shared by every focusable in this file that cannot take `buttonClasses`. */
const FOCUS_RING =
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

/**
 * A descendant counts as current: `/live/shopflow` is still "Live", and
 * highlighting only the exact path would leave a reader on a bundled model
 * with no indication of where they are. Safe because no entry is "/" — that
 * would match everything.
 */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Header(): React.JSX.Element {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  /* One listener pair while open, none while closed — the zoom-menu pattern.
     `pointerdown` rather than `click` so the panel is gone before whatever is
     underneath it reacts. */
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Consumed, so this Escape does not also act on whatever page is
      // underneath — one press, one step.
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
      // A keyboard reader may be focused on a link INSIDE the panel; closing
      // would unmount it and drop focus to <body>, stranding them at the top
      // of the document. Hand focus back to the button that opened it — but
      // only when focus was in here, so a mouse user's focus is not stolen.
      if (headerRef.current?.contains(document.activeElement)) {
        menuButtonRef.current?.focus();
      }
    };
    /* CAPTURED. A menu over the C4 canvas otherwise never hears the press
       that should dismiss it: the canvas stops propagation on the
       pointerdown that begins a pan or a marquee, so a bubble-phase
       listener misses a click on empty canvas — the commonest dismissal
       gesture there is. `ui/menu-dismissal.ts` carries the full note. */
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menuOpen]);

  const closeMenu = (): void => setMenuOpen(false);

  return (
    <header
      ref={headerRef}
      /* NO BACKGROUND AND NO BORDER ON THE HEADER ITSELF — both live in the
         fading layer below, and that is the point.
         It was a flat `bg-background/80` with a `border-b`, then `/60`, and
         a uniform tint plus a hard rule is exactly what made the row read as a
         separate bar sitting ON the page rather than as part of it: the tint ends
         somewhere, and wherever it ends there is an edge. Fading the ground out
         downward removes the edge instead of softening it — the row is opaque
         where the text is and gone by the time it meets the page. */
      className="af-glass sticky top-0 z-40"
    >
      {/* THE FADING GROUND, in two layers because a tint and a blur have to fade
          separately. The gradient fades the COLOUR; the mask fades the BLUR, and
          without it the blur would stop dead at the header's bottom edge and put
          back the seam the gradient just removed.
          Both are `absolute` with the default z-index and come FIRST in DOM
          order, so the content below paints over them. Deliberately not `-z-10`:
          a negative z-index child paints before the backgrounds of in-flow
          descendants, which would put these two layers over the nav's own active
          pill — and a negative z-index escaping its intended stacking context is
          the bug that hid this site's entire page backdrop.

          THE BLUR, NOT THE TINT, IS THE LEGIBILITY DEVICE. When the tint came
          down to /45 at the midline (below), the busy-canvas case — /live can
          scroll an accent-coloured node directly under the nav — fell under
          4.5:1 against raw content in the dark themes, and it was under it
          before the change too: at the old /60 midline, `--foreground` over an
          accent node measured 3.6:1 in `dark`. What actually keeps that case
          readable is the blur averaging the node into its card and canvas, so
          the mask's solid stop sits at 70% — past the text band, which ends at
          ~66% of the 64px row — rather than releasing the blur at 45% halfway
          through the text. `check:dot-grid` pins the ≥60% floor. `saturate`
          rides along for the same reason it does on `.af-glass` (globals.css):
          a plain blur of the ground reads as grey haze, and the chroma lift is
          what makes the thinned bar read as glass rather than a smudge. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 backdrop-blur-xl backdrop-saturate-150"
        style={{
          maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 70%, transparent 100%)",
        }}
      />
      <div
        aria-hidden="true"
        /* 80 → 45 → transparent, down from 95/60: with the page's dot field
           running behind the header, every point of opacity here is lattice
           erased, and at /95 the top of the row still read as a bar sitting ON
           the field. The floor is measured, not felt: over every surface the
           header actually crosses — page `--background`, `--canvas`, node
           `--card` — `--foreground` nav text composited through this ground
           stays ≥ 10:1 in all eight themes (worst: pastel over canvas, 10.0:1
           at the text band's thinnest alpha; scripts/lib/oklch.mjs maths).
           The alpha is nearly irrelevant over those surfaces because the tint
           is background-coloured over the background; what the thinning DOES
           cost is the busy-canvas case, which the blur layer above carries —
           see its comment before nudging either number independently. */
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/80 via-background/45 to-transparent"
      />

      {/* Full-bleed rather than centred in a max-width container: the editor is
          edge-to-edge (rails flush to both sides), so a contained header left the
          chrome visibly inset from the app below it. Padding is kept close to the
          editor header's own so the two read as one continuous surface.
          `relative` so it sits above the two ground layers. */}
      <div className="relative flex h-16 w-full items-center justify-between gap-3 px-3 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className={cn(
            "group flex shrink-0 items-center gap-2.5 rounded-md",
            FOCUS_RING,
          )}
        >
          <Mark />
          <span className="font-mono text-[15px] font-semibold tracking-tight whitespace-nowrap text-foreground">
            {APP_NAME}
          </span>
        </Link>

        {/* Nav sits in the RIGHT-HAND group, not centred between the logo and
            the actions: with only a couple of entries a centred nav floats in
            the middle of a full-bleed header, far from both edges and from
            everything else that is clickable. Grouped here it reads as one
            cluster of controls, and it stays put as entries are added. */}
        <div className="flex min-w-0 items-center gap-2">
          {/* Suppressed entirely when there are no links: an empty <nav> would
              expose a navigation landmark with nothing in it, which is worse
              for a screen reader than having no landmark at all. Only one of
              this <nav> and the panel's is ever in the accessibility tree —
              `display: none` removes the other — so the "Primary" label never
              names two landmarks at once. */}
          {NAV_LINKS.length > 0 ? (
            <nav
              aria-label="Primary"
              className="hidden items-center gap-1.5 sm:flex"
            >
              {NAV_LINKS.map((link) => (
                <NavEntry key={link.href} link={link} pathname={pathname} />
              ))}
            </nav>
          ) : null}

          {/* Separates in-app routes from the theme control without adding a
              third gap size. Hidden on narrow screens where the row is tight. */}
          <span
            aria-hidden="true"
            className="mx-1 hidden h-5 w-px bg-border sm:block"
          />

          <ThemeToggle />

          {/* The collapsed nav's toggle. `aria-controls` only while open, the
              way zoom-menu does it: pointing at an id that is not in the DOM
              is an ARIA reference error. */}
          {NAV_LINKS.length > 0 ? (
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              aria-label={
                menuOpen ? "Close navigation menu" : "Open navigation menu"
              }
              className={buttonClasses({
                variant: "outline",
                size: "sm",
                className: "h-9 w-9 px-0 sm:hidden",
              })}
            >
              {menuOpen ? (
                <X aria-hidden="true" />
              ) : (
                <Menu aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>
      </div>

      {/* Phone panel. Positioned against the sticky header (a positioned
          ancestor), full-bleed, so it reads as the bar unfolding rather than
          a floating menu. `sm:hidden` so a phone that rotates to a width
          where the row returns is not left with both navs showing. */}
      {menuOpen && NAV_LINKS.length > 0 ? (
        <div
          id={menuId}
          className="absolute inset-x-0 top-full border-b border-border/60 bg-background/95 shadow-lg backdrop-blur-xl sm:hidden"
        >
          <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
            {NAV_LINKS.map((link) => (
              <NavEntry
                key={link.href}
                link={link}
                pathname={pathname}
                inPanel
                onNavigate={closeMenu}
              />
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}

/**
 * One nav entry, in either layout. One definition on purpose: the current-page
 * treatment and the `aria-current` contract must behave identically in the row
 * and in the panel, and two renderers would let them drift.
 */
function NavEntry({
  link,
  pathname,
  inPanel = false,
  onNavigate,
}: {
  link: (typeof NAV_LINKS)[number];
  pathname: string;
  /** Panel rows are full-width tap targets; row entries are compact. */
  inPanel?: boolean;
  /** Called on click so the panel closes as navigation begins. */
  onNavigate?: () => void;
}): React.JSX.Element {
  const current = isCurrent(pathname, link.href);
  return (
    <Link
      href={link.href}
      aria-current={current ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        link.cta
          ? cn(
              buttonClasses({ variant: "outline", size: "sm" }),
              // The CTA cannot take the plain entries' filled-pill current
              // style — it already has a fill. The border warms toward the
              // primary colour instead, so "you are here" stays visible
              // without a second competing shape.
              current && "border-primary/50 bg-secondary/60",
              inPanel && "h-10 w-full justify-start px-3",
            )
          : cn(
              "inline-flex items-center gap-1.5 rounded-md text-sm whitespace-nowrap transition-colors",
              FOCUS_RING,
              current
                ? "bg-secondary/70 font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
              inPanel ? "flex w-full px-3 py-2.5" : "shrink-0 px-2.5 py-1.5",
            ),
      )}
    >
      {link.label}
    </Link>
  );
}

/**
 * Three nested squares — the C4 drill-down, at logo scale.
 *
 * IT BREATHES THE DRILL-DOWN. The three rings are already the product's central
 * idea (context → container → component), so the idle gesture is that idea in
 * motion: each ring brightens in turn, outermost inwards, which is the order a
 * reader drills. Nothing moves or resizes — opacity only, on three elements
 * that are already there — so the mark never nudges the header's layout, and a
 * logo that shifted by a pixel every few seconds beside navigation would be
 * far worse than a still one.
 *
 * Slow and shallow on purpose (`af-mark-*` in globals.css): this runs on every
 * page, forever, in the reader's peripheral vision. It is a heartbeat, not a
 * greeting — hover is where the mark answers, and there the whole thing lifts
 * to full strength at once.
 *
 * Reduced motion leaves all three rings at their resting opacities, which is
 * the mark as it has always been drawn.
 */
function Mark() {
  return (
    <span
      aria-hidden="true"
      className="af-mark relative grid size-8 place-items-center rounded-lg border border-border bg-card text-primary transition-colors group-hover:border-primary/40"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        className="size-4.5"
      >
        <rect
          className="af-mark-ring af-mark-ring-1"
          x="3"
          y="3"
          width="18"
          height="18"
          rx="3"
          opacity="0.45"
        />
        <rect
          className="af-mark-ring af-mark-ring-2"
          x="7"
          y="7"
          width="10"
          height="10"
          rx="2"
          opacity="0.75"
        />
        <rect
          className="af-mark-ring af-mark-ring-3"
          x="10.5"
          y="10.5"
          width="3"
          height="3"
          rx="1"
        />
      </svg>
    </span>
  );
}
