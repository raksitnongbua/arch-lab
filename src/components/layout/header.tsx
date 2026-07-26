import Link from "next/link";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { APP_NAME } from "@/lib/constants";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          <Mark />
          <span className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
            {APP_NAME}
          </span>
        </Link>

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
