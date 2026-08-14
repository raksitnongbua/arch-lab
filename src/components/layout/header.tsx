"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { buttonClasses } from "@/components/ui/button";
import { MCP_STATUS_LABEL } from "@/features/mcp/catalog";
import { APP_NAME, EDITOR_ENABLED } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Primary navigation.
 *
 * The order runs from DOING to READING to BUILDING, left to right:
 *
 *   View — the one entry that puts a model on screen, so it leads, and it is
 *     the one entry drawn as a button (see `cta` below).
 *   Syntax, Validate, MCP — the reference trio, adjacent on purpose: reading
 *     the grammar, testing something against it, and pointing an agent at both
 *     are the same errand. MCP sits last of the three, being the one you reach
 *     for after the format makes sense.
 *   Editor — last, at the far right. It is the heaviest destination on the bar
 *     (a full authoring surface, not a page you read), and it is the only entry
 *     that can disappear, so keeping it at the end means EDITOR_ENABLED toggles
 *     a trailing item rather than resequencing the whole nav.
 *
 * The Demo entry was removed on request (do not re-add it). The Editor entry
 * is gated behind EDITOR_ENABLED; flipping that flag restores it with no other
 * change.
 *
 * WHY THE ROW COLLAPSES BELOW `sm`. The original measurement: four entries
 * plus the wordmark and the theme toggle came to ~404px against a 393px
 * viewport (iPhone 15), and a header wider than the viewport widens the whole
 * document — every page below it then scrolls sideways. Hiding the wordmark
 * below `sm` bought back its ~80px (~322px); the fifth entry, Editor, spent
 * ~60px of that again (~382px). That left ~11px of slack at 393px and an
 * overflow again at 375px (iPhone SE, 13 mini) — one more entry, one longer
 * label, or one wider system font tips it. Shaving per-entry pixels has run
 * out of viewport, so below `sm` the entries move behind a single menu button
 * instead. That also returns the wordmark to phones (they showed only the
 * mark) and makes About C4 reachable on a phone at all — it was `hidden`
 * below `sm` with no fallback.
 *
 * The mobile panel is the same non-trapping popover `ui/zoom-menu.tsx` argues
 * for: Escape-to-close, pointerdown-outside-to-close, no focus trap. It is a
 * short list of links under a bar, not a dialog.
 *
 * MCP carries a `status` pill read from the mcp feature's catalogue, so the
 * beta marker here can never disagree with the one on `/mcp` or the one the
 * server sends on `initialize` — there is one constant behind all three.
 *
 * The empty-array guard on the <nav> below still matters if every entry is
 * ever removed again: an empty <nav> would expose a navigation landmark with
 * nothing in it, which is worse for a screen reader than no landmark at all.
 */
const NAV_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  /** Release status, shown as a small pill after the label. */
  status?: string;
  /**
   * Drawn as a button-styled call to action rather than a text link. A
   * button, not a group separator, because a separator only splits the row
   * into clusters — a reader still sees five equally-weighted text links and
   * no answer to "where do I start". The button silhouette is the one
   * affordance readers already rank above plain links. It uses the `outline`
   * variant, not `primary`: this header renders on every route, and a filled
   * primary button in permanent view would compete with the content's own
   * CTAs everywhere at once.
   */
  cta?: boolean;
}> = [
  // View leads: it is the one place you can actually put a model on screen,
  // where the header otherwise offered three ways to read ABOUT the format and
  // none to use it. This is not the removed Demo entry — that pointed at the
  // bundled examples index, this is the playground itself.
  { href: "/view", label: "View", cta: true },
  { href: "/syntax", label: "Syntax" },
  { href: "/validate", label: "Validate" },
  { href: "/mcp", label: "MCP", status: MCP_STATUS_LABEL },
  ...(EDITOR_ENABLED ? [{ href: "/editor", label: "Editor" }] : []),
];

/** Shared by every focusable in this file that cannot take `buttonClasses`. */
const FOCUS_RING =
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none";

/**
 * A descendant counts as current: `/view/shopflow` is still "View", and
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
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [menuOpen]);

  const closeMenu = (): void => setMenuOpen(false);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl"
    >
      {/* Full-bleed rather than centred in a max-width container: the editor is
          edge-to-edge (rails flush to both sides), so a contained header left the
          chrome visibly inset from the app below it. Padding is kept close to the
          editor header's own so the two read as one continuous surface. */}
      <div className="flex h-16 w-full items-center justify-between gap-3 px-3 sm:gap-4 sm:px-6">
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

          <a
            href="https://c4model.com"
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
              "hidden rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex",
              FOCUS_RING,
            )}
          >
            About C4
          </a>

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
          {/* About C4 rides in the panel because below `sm` this is its only
              home — the row's copy is display-none there. Outside the <nav>,
              as on the row: it leaves the site, so it is not primary
              navigation. */}
          <div className="border-t border-border/60 p-3">
            <a
              href="https://c4model.com"
              target="_blank"
              rel="noreferrer noopener"
              onClick={closeMenu}
              className={cn(
                "flex w-full rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                FOCUS_RING,
              )}
            >
              About C4
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/**
 * One nav entry, in either layout. One definition on purpose: the current-page
 * treatment, the `aria-current` contract, and the status pill must behave
 * identically in the row and in the panel, and two renderers would let them
 * drift.
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
      {/* Part of the link's accessible name, not aria-hidden: "MCP Beta" is
          what the entry actually offers, and a screen-reader user needs the
          caveat as much as anyone. No width to reclaim any more — the row only
          exists at `sm` and up, and the panel has the room. */}
      {link.status !== undefined ? (
        <span className="rounded-full border border-accent/25 bg-accent/12 px-1.5 py-px text-[10px] leading-none font-medium tracking-wide text-accent uppercase">
          {link.status}
        </span>
      ) : null}
    </Link>
  );
}

/** Three nested squares — the C4 drill-down, at logo scale. */
function Mark() {
  return (
    <span
      aria-hidden="true"
      className="relative grid size-8 place-items-center rounded-lg border border-border bg-card text-primary transition-colors group-hover:border-primary/40"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        className="size-4.5"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" opacity="0.45" />
        <rect x="7" y="7" width="10" height="10" rx="2" opacity="0.75" />
        <rect x="10.5" y="10.5" width="3" height="3" rx="1" />
      </svg>
    </span>
  );
}
