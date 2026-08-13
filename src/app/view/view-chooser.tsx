"use client";

/**
 * `/view` — the chooser between the two playgrounds, and the LANDING SPOT
 * for legacy share links.
 *
 * Share links minted before `/view/c4` existed look like `/view#m=…` — the
 * model travels in the URL fragment, which the server never sees, so only
 * the client can notice one and forward it. The rules, in order:
 *
 *   1. On mount, if the fragment carries a share payload (`m=`), replace the
 *      route with `/view/c4` KEEPING the fragment intact — the C4 playground
 *      decodes it exactly as it always did. `router.replace`, not push: the
 *      chooser was never really visited, so Back must not return to it.
 *   2. The chooser's markup is ALWAYS rendered, server included, and the
 *      server and client render it identically — so hydration never aborts and
 *      the copy is in the SSR HTML. `/view` is in `sitemap.ts`; a route that
 *      ships an empty body to a crawler is not a route as far as search is
 *      concerned.
 *
 *      The flash a share-link user would otherwise see is suppressed BEFORE
 *      first paint by the inline script in `page.tsx`, which stamps
 *      `data-share-forward` on <html>; `globals.css` hides the chooser while
 *      that is set. A React guard cannot do this job — the fragment is not
 *      available until the client, by which point the paint has happened.
 *
 * Every `/view#m=…` payload is a C4 model BY CONSTRUCTION: sequence sharing
 * did not exist while `/view` was the playground, and sequence links have
 * always minted against their own route (`/view/sequence`, now the shorter
 * `/view/seq` alias) — so forwarding to `/view/c4` is right for every legacy
 * link there is.
 */

import { useEffect, useSyncExternalStore } from "react";
import { ArrowRight, GitBranch, MousePointerClick } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { SHARE_PARAM_MODEL } from "@/features/viewer/share/codec";

/**
 * Subscribes to the fragment rather than sampling it once.
 *
 * The obvious version of this guard is a `mounted` boolean over an empty
 * subscribe, which reads the hash exactly once. That is wrong in a way that
 * only shows up on one path: arriving at `/view` and THEN acquiring a payload —
 * pasting a share URL into the address bar while already on this page changes
 * only the fragment, so the browser fires `hashchange` and never remounts, and
 * a once-sampled guard would sit on the chooser forever with a perfectly good
 * model in the URL.
 *
 * The server snapshot is the empty string: no fragment exists there, so the
 * server renders the chooser and the first client render agrees.
 */
function subscribeToHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function hasSharePayload(hash: string): boolean {
  const body = hash.replace(/^#/, "");
  if (body === "") return false;
  return new URLSearchParams(body).get(SHARE_PARAM_MODEL) !== null;
}

export function ViewChooser(): React.JSX.Element {
  const router = useRouter();

  const hash = useSyncExternalStore(
    subscribeToHash,
    () => window.location.hash,
    () => "",
  );

  const forwarding = hasSharePayload(hash);

  useEffect(() => {
    if (!forwarding) return;
    // The fragment rides along verbatim — `router.replace` preserves it as
    // part of the href, and the playground reads it off `location.hash` on
    // its own mount.
    router.replace(`/view/c4${hash}`);
  }, [forwarding, hash, router]);

  return (
    // `af-view-chooser` is the hook the pre-paint script's CSS hides while a
    // share payload is being forwarded. `aria-hidden` follows the same state so
    // a screen reader is not read a page it is about to leave; it is derived
    // from React state rather than the attribute because only React knows
    // whether the redirect has already been issued.
    <div
      className="af-view-chooser mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14"
      aria-hidden={forwarding || undefined}
    >
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          What do you want to put on screen?
        </h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Two live playgrounds, one text format family. Both run entirely in
          your browser — nothing you type is uploaded or stored.
        </p>
      </header>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        <li>
          <ChooserCard
            href="/view/c4"
            icon={<GitBranch aria-hidden="true" className="size-5" />}
            title="C4 model"
            body={
              <>
                Structure: who talks to what, from Context down to Code. A
                two-pane editor — <span className="font-mono">.alab</span> text
                and JSON in lossless sync — with drill-down, share links and
                image export. Accepts Mermaid C4 as a one-way import.
              </>
            }
            cta="Open the C4 playground"
          />
        </li>
        <li>
          <ChooserCard
            href="/view/sequence"
            icon={<MousePointerClick aria-hidden="true" className="size-5" />}
            title="Sequence diagram"
            body={
              <>
                Behaviour: one flow, message by message, in order. Write{" "}
                <span className="font-mono">.alab</span> sequence text or paste
                a Mermaid <span className="font-mono">sequenceDiagram</span>,
                then <em>explore</em> it — click a message, participant, or
                fragment and watch its arrows draw while the rest recedes.
              </>
            }
            cta="Open the sequence playground"
          />
        </li>
      </ul>

      <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
        Not sure which? A C4 model answers &ldquo;what is this system made
        of?&rdquo;; a sequence diagram answers &ldquo;what happens when
        …?&rdquo;. Finished, read-only examples live in the{" "}
        <Link href="/demo" className="font-medium text-primary hover:underline">
          demo gallery
        </Link>
        .
      </p>
    </div>
  );
}

function ChooserCard({
  href,
  icon,
  title,
  body,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  cta: string;
}): React.JSX.Element {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
        {icon}
      </span>
      <span className="text-lg font-semibold text-foreground">{title}</span>
      <span className="flex-1 text-sm leading-relaxed text-muted-foreground">
        {body}
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        {cta}
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </Link>
  );
}
