"use client";

/**
 * The icon embedder for the browser — the download and copy paths on the
 * canvas.
 *
 * ITS OWN MODULE, with the `"use client"` that `react-dom/client` requires.
 * It used to be a `const` inside `icon-markup.ts`, which made that module —
 * and therefore `render-svg.ts`, which defaulted to it — client-only, and
 * `/api/render` could not import the renderer at all. Splitting the two
 * embedders is what unblocked it; the shared recipe stays in
 * `createIconEmbedder`, so the server path cannot draw a mark differently.
 */

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { createIconEmbedder, type EmbedIcon } from "./icon-markup";

/** Renders each icon into a detached DOM node and captures its `innerHTML`. */
export const embeddedIconSvg: EmbedIcon = createIconEmbedder((component) => {
  const host = document.createElement("div");
  const root = createRoot(host);
  // flushSync: the markup must exist synchronously, before unmount below.
  // Called from an event handler, never during a React render pass.
  flushSync(() => {
    root.render(createElement(component));
  });
  const markup = host.innerHTML;
  root.unmount();
  return markup;
});
