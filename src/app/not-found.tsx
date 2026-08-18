import { ArrowRight, Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

/**
 * The 404 page.
 *
 * WRITTEN FOR THE 404s THIS SITE ACTUALLY SERVES, which are mostly not typos.
 * Five routes call `notFound()` — `/view/[modelId]` and the three
 * `/view/<kind>/[exampleId]` routes, plus `/demo` — so the common arrival is a
 * reader who followed a link to a specific EXAMPLE OR MODEL that is not there:
 * an id that was renamed, a bookmark from before a rename, a URL somebody typed
 * from memory. That reader does not need to be told the internet is fallible;
 * they need the list of examples that do exist. So `/demo` is the primary
 * action, not the home page.
 *
 * SHARE LINKS DO NOT LAND HERE, and that distinction is why this page says
 * nothing about them. A `#m=…` payload lives in the URL fragment, which never
 * reaches the server, so a broken or expired share link resolves as a perfectly
 * valid `/view` and is answered by `components/share/share-link-failure.tsx` —
 * which can say *why* it failed. Mentioning share links here would send the one
 * reader who cannot be helped by this page looking in the wrong place.
 *
 * The tone follows that failure page's rule: name what happened, offer the next
 * move, do not apologise in general terms. Nothing here is an error state to the
 * reader — a URL that no longer resolves is ordinary.
 *
 * `noindex` because a 404 that gets indexed is a search result that wastes
 * somebody's click. The HTTP status is already 404 (Next sets it for this file),
 * so this is belt and braces for crawlers that index on content rather than
 * status.
 */
export const metadata: Metadata = {
  title: "Page not found",
  description: `The page you asked for is not part of ${APP_NAME}. Browse the bundled example diagrams instead.`,
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-20 sm:px-8 sm:py-28">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2 font-mono text-xs tracking-wide text-muted-foreground uppercase">
          <span className="grid size-8 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
            <Compass aria-hidden="true" className="size-4" />
          </span>
          404
        </p>

        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          That page is not here
        </h1>

        {/* Two sentences, and the second one is the useful one: it names the
            most likely cause for the arrivals this page really gets, which is a
            diagram id rather than a mistyped word. */}
        <p className="mt-4 leading-relaxed text-muted-foreground">
          The URL does not match anything on this site. If you followed a link
          to a specific diagram, its id may have changed since the link was made
          — every bundled example is listed on the demo page, under its current
          name.
        </p>

        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link href="/demo" className={buttonClasses({ size: "md" })}>
            Browse the examples
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            href="/view"
            className={buttonClasses({ variant: "outline", size: "md" })}
          >
            Open the playground
          </Link>
        </div>

        {/* The navbar already carries every route, so this is not a site map —
            just the two destinations a reader who wanted neither of the above
            is most likely to have been aiming at. */}
        <p className="mt-8 border-t border-border/60 pt-6 text-sm text-muted-foreground">
          Looking for something else? The{" "}
          <Link
            href="/syntax"
            className="font-medium text-primary hover:underline"
          >
            syntax reference
          </Link>{" "}
          documents the text format,{" "}
          <Link
            href="/mcp"
            className="font-medium text-primary hover:underline"
          >
            /mcp
          </Link>{" "}
          covers using {APP_NAME} from an AI agent, and the{" "}
          <Link
            href="/faq"
            className="font-medium text-primary hover:underline"
          >
            FAQ
          </Link>{" "}
          answers what it is and what it does with your file.
        </p>
      </div>
    </div>
  );
}
