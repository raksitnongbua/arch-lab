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
 *      route with the playground that can READ it (see below), keeping the
 *      fragment — which the playground decodes exactly as it always did.
 *      `router.replace`, not push: the chooser was never really visited, so
 *      Back must not return to it.
 *   2. The chooser's markup is ALWAYS rendered, server included, and the
 *      server and client render it identically — so hydration never aborts and
 *      the copy is in the SSR HTML. `/view` is in `sitemap.ts`; a route that
 *      ships an empty body to a crawler is not a route as far as search is
 *      concerned.
 *
 *      The flash a share-link user would otherwise see is suppressed BEFORE
 *      first paint by the inline script in the root layout, which stamps
 *      `data-share-forward` on <html>; `globals.css` hides the chooser while
 *      that is set. A React guard cannot do this job — the fragment is not
 *      available until the client, by which point the paint has happened.
 *
 *   3. …and this component CLEARS that attribute whenever there is no payload.
 *      The script cannot: it runs once per document load, and a client-side
 *      navigation never reloads the document, so the flag outlived the URL that
 *      set it and turned `/view` into a blank page for the rest of the session.
 *      A pre-paint hide needs a post-hydration owner; that owner is here.
 *
 * WHICH PLAYGROUND a payload goes to is DECIDED BY READING IT, not assumed.
 * This route once forwarded everything to `/view/c4`, reasoning that a
 * `/view#m=…` link is a C4 model by construction — sequence sharing did not
 * exist while `/view` was the playground. That held for the legacy links and
 * not for reality: a sequence fragment reaches `/view` easily (a stale hash
 * carried in from a sequence link, which is exactly how it was reported), and
 * the C4 playground then refused a document that was perfectly valid and simply
 * not its kind. A `.alab` document names its kind on line 1, so the fragment is
 * decoded and sniffed with `detectAlabKind` — the same function
 * `/view/sequence` uses — and forwarded to the playground that can read it.
 */

import { useEffect, useSyncExternalStore } from "react";
import { ArrowRight, GitBranch, MousePointerClick } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { detectAlabKind } from "@/features/archtext";
import {
  decodeShareFragment,
  normalizeShareFragment,
  SHARE_FORWARD_ATTRIBUTE,
  SHARE_PARAM_MODEL,
} from "@/features/viewer/share/codec";

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
  const body = normalizeShareFragment(hash);
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
    if (!forwarding) {
      /* CLEAR THE PRE-PAINT FLAG. It is stamped by an inline script in the root
         layout, which runs ONCE per document load and cannot run again — while
         a client-side navigation never reloads the document. So a visitor who
         opened ANY url carrying `#m=…` (a share link, on any route) kept the
         attribute for the rest of the session, and the moment they navigated to
         `/view` the stylesheet hid the chooser: a blank page with nothing to
         click, and no forward either, because React can see there is no payload
         to forward. Only a reload escaped it.
         The attribute means "this document is forwarding a payload right now",
         so the component that knows that is false has to say so. */
      document.documentElement.removeAttribute(SHARE_FORWARD_ATTRIBUTE);
      return;
    }
    /* WHICH PLAYGROUND THE PAYLOAD BELONGS TO, decided by READING it.
       This used to forward every payload to `/view/c4` on the grounds that a
       `/view#m=…` link is a C4 model "by construction" — true of the legacy
       links this route was built for, and false in practice: a sequence
       fragment reaches `/view` easily (a stale hash carried in from a sequence
       link), and the C4 playground then refused a document that was perfectly
       valid, just not its kind. The document names its own kind on line 1;
       `detectAlabKind` is the same sniffer `/view/sequence` uses.

       The fragment rides on NORMALIZED, not verbatim: concatenating the raw
       hash is what let a fragment double — forward once and the URL is
       `/view/c4#m=…`; land back here with that hash still in the bar and the
       next forward produces `#m=…#m=…`, whose `m` value is no longer
       base64url, so the playground refuses the link it was handed ("This share
       link could not be opened"). Clicking /view → C4 a few times reached
       `#m=…` five times over.

       Undecodable payloads still go to `/view/c4`: that route already renders
       the codec's own located error, and a chooser growing its own copy of
       those messages is the drift this app keeps refusing elsewhere. */
    const body = normalizeShareFragment(hash);
    let cancelled = false;
    void decodeShareFragment(body).then((decoded) => {
      if (cancelled) return;
      const route =
        decoded.status === "ok" &&
        detectAlabKind(decoded.aftText) === "sequence"
          ? "/view/sequence"
          : "/view/c4";
      router.replace(`${route}#${body}`);
    });
    return () => {
      cancelled = true;
    };
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
      {/* Both cards say they accept Mermaid, which answers "where do I paste
          it" and not "what does it become". The second question is answered
          in the playgrounds themselves now — each pane has a format toggle
          that rewrites the text — which is why the separate convert page this
          paragraph used to point at is gone. */}
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Arriving with Mermaid? Paste it into either playground: it is detected,
        drawn, and one toggle away from the{" "}
        <span className="font-mono">.alab</span> you can commit.
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
