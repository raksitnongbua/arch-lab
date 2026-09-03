"use client";

/**
 * The client wrapper for `/live/[modelId]` — a bundled model's ViewerShell,
 * opened immersive (this route shows one model and nothing else), plus the two
 * share-related concerns the server page cannot handle:
 *
 *   1. It provides the `share` source (`kind: "bundled"`), so the Share
 *      panel offers the plain page URL — the shortest honest link for a
 *      model that already ships with the site.
 *   2. It reads the `#d=<diagramId>` deep link on mount (fragments never
 *      reach the server, so only the client can) and reopens the shell on
 *      that diagram. Unknown or missing ids fall back to the root — a stale
 *      link still renders the model.
 *   3. It reads `?i=1` — a share link that asked to open immersive — for a
 *      reason the query param does NOT share with the fragment: this route is
 *      statically prerendered for every bundled model (`generateStaticParams`),
 *      and taking `searchParams` on the server would opt all of them out of
 *      that. So the one place the param is read late is the one route that
 *      pays nothing else for reading it early.
 *
 * Both live in an external store (server snapshot: empty — neither a fragment
 * nor a client-only URL read can take part in server-rendered markup); when
 * the hash names a valid non-root diagram the shell is remounted (keyed)
 * starting there. The one frame on the root before that is the price of
 * hydration correctness, and immersive arrives on the same frame.
 */

import { useSyncExternalStore } from "react";

import type { ViewerModel } from "../lib/model";
import { diagramIdFromHash, pathFromHash } from "../share/codec";
import { immersiveFromSearch } from "../share/immersive-param";
import { ViewerShell } from "./viewer-shell";

/* The location hash as an external store: `""` on the server (fragments
 * never reach it), the live value on the client, updates on hashchange. */

function subscribeToHash(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function readHash(): string {
  return window.location.hash;
}

/* The query, read the same way and for the same reason — see the header. It
 * subscribes to `hashchange` too rather than to nothing: a query cannot change
 * without a navigation, so there is no event of its own to listen for, and
 * sharing the subscription keeps the two reads on one frame. */
function readSearch(): string {
  return window.location.search;
}

const readEmpty = (): string => "";

export function ViewerBundledView({
  model,
}: {
  model: ViewerModel;
}): React.JSX.Element {
  const hash = useSyncExternalStore(subscribeToHash, readHash, readEmpty);
  const search = useSyncExternalStore(subscribeToHash, readSearch, readEmpty);

  const target = diagramIdFromHash(hash);
  const initialDiagramId =
    target !== null &&
    target !== model.rootDiagramId &&
    model.diagrams[target] !== undefined
      ? target
      : null;

  return (
    <ViewerShell
      key={initialDiagramId ?? "root"}
      model={model}
      initialDiagramId={initialDiagramId ?? undefined}
      initialPath={pathFromHash(hash)}
      share={{ kind: "bundled", modelId: model.id }}
      // Immersive ONLY when the link asked for it. Defaulting this route to
      // immersive dropped a reader somewhere with no visible route back to the
      // rest of the app, and made it behave unlike `/live` for a reason nobody
      // could infer from the screen — so the default went. `?i=1` is not that
      // default returning: it is a sharer deciding, for one link, that the
      // diagram is the whole point, and the strip's toggle and Escape still
      // undo it.
      defaultImmersive={immersiveFromSearch(search)}
    />
  );
}
