"use client";

/**
 * The client wrapper for `/view/[modelId]` — a bundled model's ViewerShell,
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
 *
 * The hash is an external store (server snapshot: empty — fragments cannot
 * take part in server-rendered markup); when it names a valid non-root
 * diagram the shell is remounted (keyed) starting there. The one frame on
 * the root before that is the price of hydration correctness.
 */

import { useSyncExternalStore } from "react";

import type { ViewerModel } from "../lib/model";
import { diagramIdFromHash } from "../share/codec";
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

const readEmpty = (): string => "";

export function ViewerBundledView({
  model,
}: {
  model: ViewerModel;
}): React.JSX.Element {
  const hash = useSyncExternalStore(subscribeToHash, readHash, readEmpty);

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
      share={{ kind: "bundled", modelId: model.id }}
      // Deliberately NOT immersive by default any more. Hiding the site chrome
      // on arrival dropped a reader somewhere with no visible route back to the
      // rest of the app, and made this route behave unlike `/view` for a reason
      // nobody could infer from the screen. Immersive is still one click away on
      // the strip under the canvas — a choice now, rather than a state you have
      // to notice and undo.
    />
  );
}
