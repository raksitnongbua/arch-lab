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
 * Three permanent entries — Syntax (the `.alab` text-format reference),
 * Validate (the model checker) and MCP (connecting an AI agent) — so all are
 * reachable from every route, not only from the footer and the playground.
 * They are adjacent on purpose: reading the grammar, testing something
 * against it, and pointing an agent at both are the same errand. MCP goes
 * last because it is the one you reach for after the format makes sense.
 * The Demo entry was removed on request (do not re-add it), and the Editor
 * entry is gated behind EDITOR_ENABLED; flipping that flag restores it
 * alongside the others with no other change.
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
  ...(EDITOR_ENABLED ? [{ href: "/editor", label: "Editor" }] : []),
  { href: "/syntax", label: "Syntax" },
  { href: "/validate", label: "Validate" },
  { href: "/mcp", label: "MCP", status: MCP_STATUS_LABEL },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      {/* Full-bleed rather than centred in a max-width container: the editor is
          edge-to-edge (rails flush to both sides), so a contained header left the
          chrome visibly inset from the app below it. Padding is kept close to the
          editor header's own so the two read as one continuous surface. */}
      <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          <Mark />
          <span className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
            {APP_NAME}
          </span>
        </Link>

        {/* Nav sits in the RIGHT-HAND group, not centred between the logo and
            the actions: with only a couple of entries a centred nav floats in
            the middle of a full-bleed header, far from both edges and from
            everything else that is clickable. Grouped here it reads as one
            cluster of controls, and it stays put as entries are added. */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Suppressed entirely when there are no links: an empty <nav> would
              expose a navigation landmark with nothing in it, which is worse
              for a screen reader than having no landmark at all. */}
          {NAV_LINKS.length > 0 ? (
            <nav aria-label="Primary" className="flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const isCurrent = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                      isCurrent
                        ? "bg-secondary/70 font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {link.label}
                    {/* Part of the link's accessible name, not aria-hidden:
                        "MCP Beta" is what the entry actually offers, and a
                        screen-reader user needs the caveat as much as anyone. */}
                    {link.status !== undefined ? (
                      <span className="rounded-full border border-accent/25 bg-accent/12 px-1.5 py-px text-[10px] leading-none font-medium tracking-wide text-accent uppercase">
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
