"use client";

/**
 * Canvas motion runtime. Three small responsibilities, all
 * driven by the frozen `lib/motion.ts` so reduced-motion is honoured in one
 * place (never a duplicate media query in a component):
 *
 * 1. Writes the `--motion-*` CSS custom properties that
 *    `styles/canvas-motion.css` animates with onto <html>, from `duration()`
 *    — 0ms under `prefers-reduced-motion`, re-synced if the preference
 *    changes mid-session.
 *
 * 2. Tracks which node/edge ids have already been presented, so the create
 *    animations run once per genuinely new element — never on the remounts
 *    caused by level navigation, undo of a delete, or file open of a
 *    previously seen diagram state within the session.
 *
 * 3. Plays the delete animation (: fade + scale out over
 *    `nodeOut`). The store removes elements synchronously and React unmounts
 *    them on the next commit, so nothing React-side can animate the exit
 *    without delaying the mutation — and no handler may wait on an animation.
 *    Instead a store subscriber (which runs synchronously, while the outgoing
 *    DOM still exists) clones the departing `.react-flow__node` /
 *    `.react-flow__edge` element in place, stamps the ghost class from
 *    `canvas-motion.css` on the clone, and removes it when the animation is
 *    over. The model, the store, and React never see the ghost.
 */

import { DURATIONS, duration } from "../../lib/motion";
import { useEditorStore, type EditorStore } from "../../state";

/* ---- 1. duration custom properties ---------------------------------------- */

const MOTION_VARS: ReadonlyArray<[keyof typeof DURATIONS, string]> = [
  ["hover", "--motion-hover"],
  ["nodeIn", "--motion-node-in"],
  ["nodeOut", "--motion-node-out"],
  ["edgeDraw", "--motion-edge-draw"],
  ["selection", "--motion-selection"],
];

function syncMotionVars(): void {
  const root = document.documentElement;
  for (const [key, varName] of MOTION_VARS) {
    root.style.setProperty(varName, `${duration(key)}ms`);
  }
}

/* ---- 2. first-presentation tracking --------------------------------------- */

/** id -> epoch ms of first sighting. */
const firstSeenAt = new Map<string, number>();

/**
 * True the first time an element id is presented (and for a short grace
 * window afterwards, so StrictMode's double-invoked initializers agree with
 * the first answer). False on any later remount — level navigation, undo of
 * a delete — so those never replay the create animation.
 */
export function isFirstPresentation(
  kind: "node" | "edge",
  id: string,
): boolean {
  const key = `${kind}:${id}`;
  const now = Date.now();
  const first = firstSeenAt.get(key);
  if (first === undefined) {
    firstSeenAt.set(key, now);
    return true;
  }
  return now - first < 1000;
}

/* ---- 3. delete ghosts ------------------------------------------------------ */

/** Bulk deletes (cascades, big multi-selects) cut instantly — ghosting dozens
 * of elements at once would jank exactly when the model is busiest. */
const MAX_GHOSTS = 24;

function spawnGhost(selector: string, ghostClass: string, ms: number): void {
  const source = document.querySelector(selector);
  const parent = source?.parentElement;
  if (!source || !parent) return;
  const clone = source.cloneNode(true) as Element;
  // The clone is presentation-only: unhook it from anything that targets the
  // live element by id or role.
  clone.removeAttribute("data-id");
  clone.setAttribute("aria-hidden", "true");
  clone.classList.add(ghostClass);
  parent.appendChild(clone);
  // animationend is the happy path; the timeout covers the clone being
  // detached mid-animation (e.g. level navigation replacing the container).
  const remove = () => clone.remove();
  clone.addEventListener("animationend", remove, { once: true });
  window.setTimeout(remove, ms + 100);
}

function spawnDeleteGhosts(state: EditorStore, prev: EditorStore): void {
  if (state.model === prev.model) return;
  // A level change replaces the whole node set — that is 's transition,
  // not a deletion.
  if (state.activeDiagramId !== prev.activeDiagramId) return;
  const ms = duration("nodeOut");
  if (ms === 0) return;

  const prevDiagram = prev.model.diagrams[prev.activeDiagramId];
  const nextDiagram = state.model.diagrams[state.activeDiagramId];
  if (!prevDiagram || !nextDiagram || prevDiagram === nextDiagram) return;

  const nextNodeIds = new Set(nextDiagram.nodes.map((node) => node.id));
  const nextEdgeIds = new Set(nextDiagram.edges.map((edge) => edge.id));
  const removedNodes = prevDiagram.nodes.filter(
    (node) => !nextNodeIds.has(node.id),
  );
  const removedEdges = prevDiagram.edges.filter(
    (edge) => !nextEdgeIds.has(edge.id),
  );
  const total = removedNodes.length + removedEdges.length;
  if (total === 0 || total > MAX_GHOSTS) return;

  for (const node of removedNodes) {
    spawnGhost(
      `.react-flow__node[data-id="${CSS.escape(node.id)}"]`,
      "af-node-ghost",
      ms,
    );
  }
  for (const edge of removedEdges) {
    spawnGhost(
      `.react-flow__edge[data-id="${CSS.escape(edge.id)}"]`,
      "af-edge-ghost",
      ms,
    );
  }
}

/* ---- install ---------------------------------------------------------------- */

let installed = false;

/**
 * Idempotent one-time install, called from the node/edge components' layout
 * effects (before their first paint, so even the first-ever element animates
 * with the right durations). Deliberately never uninstalled — the editor is
 * the app, and the subscription must outlive any individual node.
 */
export function ensureCanvasMotionRuntime(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  syncMotionVars();
  window
    .matchMedia("(prefers-reduced-motion: reduce)")
    .addEventListener("change", syncMotionVars);
  useEditorStore.subscribe(spawnDeleteGhosts);
}
