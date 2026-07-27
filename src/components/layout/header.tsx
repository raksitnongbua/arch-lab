"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { APP_NAME, EDITOR_ENABLED } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Primary navigation. The header renders in the root layout, so these are the
 * only links that reach /demo (and, when the editor ships, /editor) from
 * every page — without them the demo is only discoverable from the
 * landing-page hero. The Editor entry follows EDITOR_ENABLED: while the
 * editor is gated off for this release, the navbar simply does not offer it.
 */
const NAV_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/demo", label: "Demo" },
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

        <nav aria-label="Primary" className="flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isCurrent = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                  isCurrent
                    ? "bg-secondary/70 font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="https://c4model.com"
            target="_blank"
            rel="noreferrer noopener"
            className="hidden rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:inline-flex"
          >
            About C4
          </a>
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
