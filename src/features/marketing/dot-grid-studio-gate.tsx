"use client";

/**
 * Decides whether the dot studio exists, and is the reason a visitor never pays
 * for it.
 *
 * `next/dynamic` with `ssr: false` puts the panel in its own chunk, fetched only
 * once this returns true — so the home page's JavaScript is unchanged for anyone
 * who has not asked for the panel. That is the whole job of this file, and it is
 * why it is three lines of logic in a module of its own: `dynamic()` may only be
 * called from a client component, and making the field's own module client-only
 * would have cost the server-rendered static dots.
 *
 * THE GATE IS `?dots` IN THE URL rather than a NODE_ENV check, because the useful
 * time to tune a background is against the real production build — a dev build
 * paints the same dots but not the same frame budget. It is also the only way to
 * hand somebody a link to the thing.
 *
 * `useSyncExternalStore` rather than `useEffect` + `setState`: the server
 * snapshot is `false`, the client snapshot reads the URL, and React uses the
 * server one while hydrating — so the markup matches and there is no mismatch
 * warning. (`useSearchParams` would do this too and would opt the whole route out
 * of static rendering, which is a real cost to the ~100% of visits that do not
 * want a panel.)
 */

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

const DotGridStudio = dynamic(
  () => import("./dot-grid-studio").then((module) => module.DotGridStudio),
  { ssr: false },
);

const NOOP_SUBSCRIBE = () => () => {};

export function DotGridStudioGate() {
  const enabled = useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => new URLSearchParams(window.location.search).has("dots"),
    () => false,
  );
  return enabled ? <DotGridStudio /> : null;
}
