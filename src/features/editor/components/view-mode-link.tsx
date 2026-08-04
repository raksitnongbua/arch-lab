"use client";

/**
 * "Open in view mode" — the current model, read-only, in a new tab.
 *
 * A real `<a target="_blank">` rather than a button that calls `window.open`,
 * so middle-click, ⌘-click and "open in new window" all behave the way the
 * rest of the web does. That forces the href to exist BEFORE the click, which
 * is why the fragment is encoded ahead of time rather than on demand.
 *
 * The model travels inside the link, through the same share codec the viewer's
 * own Share button uses — nothing is uploaded, and the new tab needs no access
 * to this tab's store. Encoding needs the platform's CompressionStream, so it
 * happens on the client and the link is inert until the fragment is ready.
 *
 * Debounced, because this re-encodes the WHOLE model and the store updates on
 * every dragged pixel. The delay is generous on purpose: nobody reaches for
 * this control mid-drag, and a stale-by-a-moment href is corrected long before
 * a hand gets to the mouse.
 */

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_HANDOFF_URL_LENGTH,
} from "@/features/viewer/share/codec";
import { cn } from "@/lib/utils";

import { useEditorStore } from "../state";
import { renderModel } from "../text-pane/sync";

const ENCODE_DEBOUNCE_MS = 600;

/** Why the link is not available, when it is not. */
type Blocked = "encoding" | "unsupported" | "too-large";

export function ViewModeLink(): React.JSX.Element {
  const model = useEditorStore((state) => state.model);
  const activeDiagramId = useEditorStore((state) => state.activeDiagramId);

  // Held together with the text it was built from, so a fragment from a
  // previous model is never presented as this one's — the same reason the
  // text pane stores its `base`.
  const [encoded, setEncoded] = useState<{ text: string; href: string } | null>(
    null,
  );
  const [blocked, setBlocked] = useState<Blocked>("encoding");

  const rendered = renderModel(model);
  const text = rendered.status === "ok" ? rendered.text : null;

  useEffect(() => {
    if (text === null) return;
    let cancelled = false;
    // Every state write below happens inside the timer or the promise, never
    // in the effect body: a synchronous setState there is a cascading render
    // (and `react-hooks/set-state-in-effect` rightly refuses it).
    const timer = window.setTimeout(() => {
      if (!canEncodeShare()) {
        setBlocked("unsupported");
        return;
      }
      void encodeShareFragment(text, activeDiagramId).then((fragment) => {
        if (cancelled) return;
        const target = `/view#${fragment}`;
        // The HANDOFF ceiling, not the share tiers: this link is same-origin
        // navigation the user clicks in their own browser, so the carrier
        // truncation the share limits guard against cannot happen to it.
        if (
          `${window.location.origin}${target}`.length > MAX_HANDOFF_URL_LENGTH
        ) {
          setBlocked("too-large");
          return;
        }
        setBlocked("encoding");
        setEncoded({ text, href: target });
      });
    }, ENCODE_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, activeDiagramId]);

  const href = encoded !== null && encoded.text === text ? encoded.href : null;

  if (href === null) {
    return (
      <span
        aria-disabled="true"
        title={
          blocked === "unsupported"
            ? "This browser cannot build a share link."
            : blocked === "too-large"
              ? "This model is too large to carry in a link — save it and open the file in view mode."
              : "Preparing the link…"
        }
        className={cn(
          buttonClasses({ variant: "ghost", size: "sm" }),
          "pointer-events-none opacity-50",
        )}
      >
        <ExternalLink aria-hidden="true" />
        <span className="hidden @[46rem]:inline">View mode</span>
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Open this model in view mode, in a new tab"
      className={buttonClasses({ variant: "ghost", size: "sm" })}
    >
      <ExternalLink aria-hidden="true" />
      <span className="hidden @[46rem]:inline">View mode</span>
    </a>
  );
}
