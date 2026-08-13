"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MCP_STATUS_LABEL } from "@/features/mcp/catalog";
import { APP_NAME, EDITOR_ENABLED } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Primary navigation.
 *
 * The order runs from DOING to READING to BUILDING, left to right:
 *
 *   View — the one entry that puts a model on screen, so it leads.
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
}> = [
  // View leads: it is the one place you can actually put a model on screen,
  // where the header otherwise offered three ways to read ABOUT the format and
  // none to use it. This is not the removed Demo entry — that pointed at the
  // bundled examples index, this is the playground itself.
  { href: "/view", label: "View" },
  { href: "/syntax", label: "Syntax" },
  { href: "/validate", label: "Validate" },
  { href: "/mcp", label: "MCP", status: MCP_STATUS_LABEL },
  ...(EDITOR_ENABLED ? [{ href: "/editor", label: "Editor" }] : []),
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      {/* Full-bleed rather than centred in a max-width container: the editor is
          edge-to-edge (rails flush to both sides), so a contained header left the
          chrome visibly inset from the app below it. Padding is kept close to the
          editor header's own so the two read as one continuous surface. */}
      {/* This row has to fit a phone. Four nav entries plus the wordmark and
          the theme toggle came to ~404px, so at 393px (iPhone 15) — let alone
          375px — it overflowed, and a header wider than the viewport widens
          the whole document: every page below it then scrolls sideways. Gaps
          and padding step down here, and below `sm` the wordmark gives up its
          width to the nav (`max-sm:sr-only` — no pixels, still the link's
          accessible name) leaving the mark to carry the brand. */}
      <div className="flex h-16 w-full items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          <Mark />
          <span className="font-mono text-[15px] font-semibold tracking-tight whitespace-nowrap text-foreground max-sm:sr-only">
            {APP_NAME}
          </span>
        </Link>

        {/* Nav sits in the RIGHT-HAND group, not centred between the logo and
            the actions: with only a couple of entries a centred nav floats in
            the middle of a full-bleed header, far from both edges and from
            everything else that is clickable. Grouped here it reads as one
            cluster of controls, and it stays put as entries are added. */}
        <div className="flex min-w-0 items-center gap-0.5 sm:gap-2">
          {/* Suppressed entirely when there are no links: an empty <nav> would
              expose a navigation landmark with nothing in it, which is worse
              for a screen reader than having no landmark at all. */}
          {NAV_LINKS.length > 0 ? (
            <nav
              aria-label="Primary"
              className="flex items-center gap-0.5 sm:gap-1"
            >
              {NAV_LINKS.map((link) => {
                // A descendant counts as current: `/view/shopflow` is still
                // "View", and highlighting only the exact path would leave a
                // reader on a bundled model with no indication of where they
                // are. Safe because no entry is "/" — that would match
                // everything.
                const isCurrent =
                  pathname === link.href ||
                  pathname.startsWith(`${link.href}/`);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:px-2.5 sm:text-sm",
                      isCurrent
                        ? "bg-secondary/70 font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {link.label}
                    {/* Part of the link's accessible name, not aria-hidden:
                        "MCP Beta" is what the entry actually offers, and a
                        screen-reader user needs the caveat as much as anyone.
                        `max-sm:sr-only` reclaims its width on a phone without
                        dropping it from that name. */}
                    {link.status !== undefined ? (
                      <span className="rounded-full border border-accent/25 bg-accent/12 px-1.5 py-px text-[10px] leading-none font-medium tracking-wide text-accent uppercase max-sm:sr-only">
                        {link.status}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </nav>
          ) : null}

          <a
            href="https://c4model.com"
            target="_blank"
            rel="noreferrer noopener"
            className="hidden rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:inline-flex"
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
        </div>
      </div>
    </header>
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
