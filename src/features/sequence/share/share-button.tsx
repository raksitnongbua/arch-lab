"use client";

/**
 * "Share" for a sequence document: the whole flow packed into a link.
 *
 * REUSES THE C4 CODEC rather than minting a second one. `encodeShareFragment`
 * compresses arbitrary text into `#m=AF1.…`, and a sequence document is text —
 * so the two kinds share one payload format, one compression path, one
 * base64url alphabet and one set of length tiers. A parallel codec would be a
 * second thing to keep correct for no gain, and the two would drift the first
 * time either changed.
 *
 * WHAT MAKES IT A SEQUENCE LINK is the ROUTE, not the payload: `/view/sequence`
 * hands what it decodes to the sequence parser, `/view/c4` to the C4 one. The
 * playground detects the document kind anyway (a C4 document pasted into the
 * sequence pane is told where to go), so a link that lands on the wrong route
 * explains itself instead of failing.
 *
 * DELIBERATELY SIMPLER THAN THE C4 BUTTON, which carries expiry, signing and a
 * diagram selector. None of those apply here: a sequence document has no
 * sub-diagrams to point at, and expiring links needs the signing endpoint's
 * key, which is a server concern this feature does not yet have a reason to
 * pull in. When it does, the shape to copy is `viewer/share/share-button.tsx`.
 *
 * NOTHING IS UPLOADED. The payload lives in the URL fragment, which browsers
 * never send to a server — the copy in the link is the only copy.
 */

import { useCallback, useState } from "react";
import { Check, Link2, TriangleAlert } from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
  SHARE_URL_SAFE_LENGTH,
} from "@/features/viewer/share/codec";
import { cn } from "@/lib/utils";

/** Where a sequence share link lands. */
const SHARE_ROUTE = "/view/sequence";

type LinkState =
  | { status: "idle" }
  | { status: "copied"; caveat: string | null }
  | { status: "refused"; message: string };

export function SequenceShareButton({
  /** The document to pack — the pane's current text, verbatim. */
  text,
  onAnnounce,
  className,
}: {
  text: string;
  onAnnounce: (message: string) => void;
  className?: string;
}): React.JSX.Element {
  const [state, setState] = useState<LinkState>({ status: "idle" });

  const share = useCallback(async () => {
    if (!canEncodeShare()) {
      const message =
        "This browser cannot build share links — it has no CompressionStream. Copy the text instead.";
      setState({ status: "refused", message });
      onAnnounce(message);
      return;
    }

    const fragment = await encodeShareFragment(text, null);
    const url = `${window.location.origin}${SHARE_ROUTE}#${fragment}`;

    // The tiers are the codec's, and the wording follows its reasoning: a long
    // link is not "invalid", it is fragile in specific carriers, and the
    // failure lands on the RECIPIENT. Saying which is the difference between a
    // warning someone can act on and folklore.
    if (url.length > MAX_SHARE_URL_LENGTH) {
      const message =
        `This flow is too big for a link (${url.length.toLocaleString()} characters). ` +
        "Long URLs get truncated in transit and fail for whoever opens them — " +
        "send the .alab text instead.";
      setState({ status: "refused", message });
      onAnnounce(message);
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can be refused by permissions or a non-secure context. The
      // link is still valid, so say what happened rather than implying the
      // share failed.
      const message =
        "Could not reach the clipboard. The link is in the address bar's format — copy it from there.";
      setState({ status: "refused", message });
      onAnnounce(message);
      return;
    }

    const caveat =
      url.length > SHARE_URL_SAFE_LENGTH
        ? `Long link (${url.length.toLocaleString()} characters) — fine in chat, but plain-text email may wrap and break it.`
        : null;
    setState({ status: "copied", caveat });
    onAnnounce(
      caveat === null
        ? "Share link copied. Nothing was uploaded — the whole flow travels inside the link."
        : `Share link copied. ${caveat}`,
    );
  }, [text, onAnnounce]);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <button
        type="button"
        onClick={() => void share()}
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        {state.status === "copied" ? (
          <Check aria-hidden="true" />
        ) : (
          <Link2 aria-hidden="true" />
        )}
        {state.status === "copied" ? "Link copied" : "Share"}
      </button>

      {/* The outcome in text, not only through the live region: a sighted user
          who missed the button's label change still needs to know a long link
          may break, and a refusal must never look like nothing happened. */}
      {state.status === "refused" ? (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0"
          />
          {state.message}
        </p>
      ) : null}
      {state.status === "copied" && state.caveat !== null ? (
        <p className="text-xs text-muted-foreground">{state.caveat}</p>
      ) : null}
    </div>
  );
}
