"use client";

/**
 * Opens the model carried in the location fragment — the receiving half of
 * view mode's "Edit this diagram" link. Props-free per:
 * mounted by the shell, reads the URL, writes the store.
 *
 * `#m=<payload>&d=<diagramId>` is the same fragment the viewer's share codec
 * produces in the other direction, so one format serves both handoffs and a
 * share link pasted at `/editor` opens for editing rather than 404-ing on
 * meaning.
 *
 * Three things this has to get right:
 *
 *  1. **Run once, then erase the fragment.** The import replaces the whole
 *     document, so a reload that re-ran it would silently throw away
 *     everything typed since. `history.replaceState` clears the hash the
 *     moment the model lands, which also keeps a multi-kB payload out of the
 *     address bar for the rest of the session.
 *  2. **Never destroy work silently.** The editor boots on the starter
 *     document, so on arrival there is nothing to lose — but if the store is
 *     already dirty (a draft was recovered before this ran) the import is
 *     declined out loud rather than overwriting it.
 *  3. **Land dirty, on the named diagram.** `markSaved: false` is the honest
 *     state: this model came from a link, not from a file on disk, so the
 *     dirty indicator and Save both mean what they say. It also keeps the
 *     crash-recovery prompt from offering an unrelated orphan draft over the
 *     top of it (that offer is gated on a clean, untitled boot).
 */

import { useEffect, useRef } from "react";

import { toast } from "@/components/ui/toast";
import { decodeShareFragment } from "@/features/viewer/share/codec";

import { useEditorStore } from "../state";
import { parseModelText } from "../text-pane/sync";

/** Strips the fragment without adding a history entry or reloading. */
function clearHash(): void {
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

export function ModelHandoff(): null {
  // Effects run twice under StrictMode in development; the fragment is read
  // and cleared once regardless.
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    const hash = window.location.hash;
    if (!hash.includes("m=")) return;

    let cancelled = false;
    void decodeShareFragment(hash).then((decoded) => {
      if (cancelled) return;
      if (decoded.status === "none") return;
      if (decoded.status === "error") {
        clearHash();
        toast({
          message: `That editor link could not be opened — ${decoded.message}.`,
        });
        return;
      }

      if (decoded.status === "expired") {
        // The link worked and its author set it to lapse; say when, rather
        // than implying it arrived damaged. Required, not optional: this
        // branch adds `expired` to the decode result, so omitting the case
        // leaves a non-exhaustive match that does not compile.
        const on = new Date(decoded.expiresAt * 1000).toLocaleDateString(
          undefined,
          { year: "numeric", month: "long", day: "numeric" },
        );
        clearHash();
        toast({
          message: `That editor link expired on ${on} — ask whoever shared it for a fresh one.`,
        });
        return;
      }

      const store = useEditorStore.getState();
      if (store.isDirty) {
        toast({
          message:
            "You have unsaved changes, so the model in that link was not opened. Save or discard first, then follow the link again.",
        });
        return;
      }

      const parsed = parseModelText(decoded.aftText);
      if (parsed.status === "error") {
        clearHash();
        toast({
          message: `The model in that link is not valid: ${parsed.error.message}`,
        });
        return;
      }

      clearHash();
      store.replaceModel(parsed.value.model, {
        markSaved: false,
        fileHandleName: null,
      });
      // Only after the model is in place — `setActiveDiagram` validates
      // against the diagrams the store currently holds.
      if (
        decoded.diagramId !== null &&
        parsed.value.model.diagrams[decoded.diagramId] !== undefined
      ) {
        useEditorStore.getState().setActiveDiagram(decoded.diagramId);
      }
      toast({
        message: `Opened "${parsed.value.model.metadata.title}" for editing — ${parsed.value.summary}. Unsaved: use Save to keep it.`,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
