import Link from "next/link";

import { APP_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60">
      {/* Full-bleed to match the header — see the note there. */}
      <div className="flex w-full flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-mono">{APP_NAME}</span> — local-first
          architecture documentation. C4 today; more diagram types planned.
        </p>
        {/* The FAQ lives here rather than in the header, and that is a
            deliberate placement: the header row has already run out of viewport
            once (see the note in `header.tsx`), and a reader who wants an
            objection answered is either at the bottom of a page or looking for
            the small print — which is where a footer already is. */}
        <p>
          Saves as plain text you can read. Diff it, review it, commit it.{" "}
          <Link
            href="/syntax"
            className="font-medium text-foreground hover:underline"
          >
            <span className="font-mono">.alab</span> syntax reference
          </Link>
          {" · "}
          <Link
            href="/faq"
            className="font-medium text-foreground hover:underline"
          >
            FAQ
          </Link>
        </p>
      </div>
    </footer>
  );
}
