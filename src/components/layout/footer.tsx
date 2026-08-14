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
        {/* Two links, not a link list: the syntax reference is where the
            format is learned, and `/convert` is where a reader who already has
            Mermaid gets into it. The header nav deliberately does not carry
            Convert — a fifth entry there overflows a 393px viewport (see the
            width note in `header.tsx`), and the footer is where a route
            reached once per document belongs. */}
        <p>
          Saves as plain text you can read. Diff it, review it, commit it.{" "}
          <Link
            href="/syntax"
            className="font-medium text-foreground hover:underline"
          >
            <span className="font-mono">.alab</span> syntax reference
          </Link>{" "}
          ·{" "}
          <Link
            href="/convert"
            className="font-medium text-foreground hover:underline"
          >
            Mermaid → <span className="font-mono">.alab</span>
          </Link>
        </p>
      </div>
    </footer>
  );
}
