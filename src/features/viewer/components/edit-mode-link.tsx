"use client";

/**
 * "Edit this diagram" — hands the model on screen, opened at the diagram on
 * screen, to the editor. The mirror image of the editor's `ViewModeLink`, and
 * deliberately built the same way: a real `<a href>` whose fragment is encoded
 * ahead of the click, so middle-click, ⌘-click and "open in new tab" behave
 * like any other link.
 *
 * The model travels inside the link through the same share codec both
 * directions already use — nothing is uploaded, and the editor needs no access
 * to this page's state. It is the whole file, not a reconstruction: see
 * `archLabFileFrom`.
 *
 * This replaced a plain link to `/editor`, which opened the blank starter
 * document — from a page showing a model, the one thing you want to edit is
 * that model.
 *
 * ---- On the length ceiling ----
 *
 * The share tiers (`SHARE_URL_SAFE_LENGTH` / `MAX_SHARE_URL_LENGTH`)
 * deliberately do NOT apply here. Those exist because a *shared* link gets
 * pasted through chat apps and mail clients that truncate, and a truncated
 * link fails silently for the recipient. This link is same-origin navigation
 * the user clicks themselves: the fragment never reaches a server, so no
 * server URL limit is in play, and no carrier ever touches it. It uses the
 * codec's `MAX_HANDOFF_URL_LENGTH` — a runaway guard for a pathological
 * model, shared with every other same-machine hand-off — where this file's
 * reasoning originated before the constant moved to the codec.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";

import { serializeArchText } from "@/features/archtext";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { archLabFileFrom, type ViewerModel } from "../lib/model";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_HANDOFF_URL_LENGTH,
} from "../share/codec";

/* `canEncodeShare` is a client-only capability check, constant for the page's
 * life. Read through useSyncExternalStore rather than an effect: false on the
 * server and during hydration, real on the client, with no setState cascade. */
const subscribeToNothing = (): (() => void) => () => {};
const readFalse = (): boolean => false;

export function EditModeLink({
  model,
  diagramId,
}: {
  model: ViewerModel;
  /** The diagram on screen — the editor opens on this one. */
  diagramId: string;
}): React.JSX.Element {
  // Held together with the text it was built from, so a fragment from a
  // previous model is never presented as this one's.
  const [encoded, setEncoded] = useState<{ text: string; href: string } | null>(
    null,
  );
  const [tooLarge, setTooLarge] = useState(false);
  const canEncode = useSyncExternalStore(
    subscribeToNothing,
    canEncodeShare,
    readFalse,
  );

  // View mode never mutates the model, so this is stable for the page's life —
  // unlike the editor side, which has to debounce every dragged pixel.
  const text = serializeArchText(archLabFileFrom(model));

  useEffect(() => {
    if (!canEncode) return;
    let cancelled = false;
    // Every write below is inside the promise, never in the effect body — a
    // synchronous setState there is a cascading render.
    void encodeShareFragment(text, diagramId).then((fragment) => {
      if (cancelled) return;
      const target = `/editor#${fragment}`;
      if (
        `${window.location.origin}${target}`.length > MAX_HANDOFF_URL_LENGTH
      ) {
        setTooLarge(true);
        return;
      }
      setTooLarge(false);
      setEncoded({ text, href: target });
    });
    return () => {
      cancelled = true;
    };
  }, [canEncode, text, diagramId]);

  const href = encoded !== null && encoded.text === text ? encoded.href : null;
  const label = (
    <>
      <span className="sm:hidden">Edit</span>
      <span className="hidden sm:inline">Edit this diagram</span>
    </>
  );

  if (href === null) {
    return (
      <span
        aria-disabled="true"
        title={
          !canEncode
            ? "This browser cannot hand the model to the editor (it lacks CompressionStream)."
            : tooLarge
              ? "This model is too large to carry in a link — export it and open the file in the editor."
              : "Preparing the editor link…"
        }
        className={cn(
          buttonClasses({ size: "sm" }),
          "pointer-events-none shrink-0 opacity-50",
        )}
      >
        {label}
        <ArrowRight aria-hidden="true" />
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-label="Edit this diagram — opens it in the editor"
      className={buttonClasses({ size: "sm", className: "shrink-0" })}
    >
      {label}
      <ArrowRight aria-hidden="true" />
    </a>
  );
}
