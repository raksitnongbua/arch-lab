"use client";

/**
 * THE playground — one page for every document arch-lab can render. Mounted
 * at `/view`, `/view/c4` and `/view/sequence`, which differ ONLY in which
 * example seeds the pane; one source rail on the LEFT holds ONE textarea, and
 * every edit is auto-detected and rendered on the RIGHT: `ViewerShell` for a
 * C4 model, `SequenceViewer` for a sequence document. C4 `.alab`, sequence
 * `.alab`, arch-lab JSON, Mermaid C4 and Mermaid `sequenceDiagram` all just
 * work — `input/parse.ts` composes the real readers; nothing is parsed twice
 * or differently here.
 *
 * This file replaced the two separate playgrounds (`viewer-playground.tsx`,
 * `sequence-playground.tsx`) and the `/view` chooser between them. The merge
 * kept both pages' contracts:
 *
 *   - Same 300 ms debounce, same "last good document keeps rendering" rule:
 *     while the pane fails to parse, the canvas shows the previous good
 *     document and the error sits inline under the pane — the parser's
 *     line/column with the offending line quoted, caret at the column, or the
 *     validator's JSON-path issues. A blank canvas never explains anything.
 *   - The C4 JSON pane survives as a toggle that appears only while the
 *     current document is C4, with the two-way sync intact: ONE pending edit
 *     slot `{pane, value}`, a debounce that parses it and on success rewrites
 *     ONLY the opposite pane — the pane being typed in is never rewritten by
 *     the sync, which is what structurally rules out echo loops and mid-edit
 *     reformatting. Canonicalising your OWN pane is the explicit Format
 *     button.
 *   - The format toggle rewrites the pane in place, both kinds now:
 *     `.alab ⇄ Mermaid` via the real serializers. Both directions exist for
 *     both kinds, so both options always render; a C4 document sitting in the
 *     pane as JSON simply shows neither side checked.
 *   - Mermaid C4 stopped being an "import" ceremony: the merged pane reads it
 *     like everything else, and the lossy-import caveat moved into the same
 *     disclosure the sequence page already used for its Mermaid caveats.
 *   - Share links (`#m=…`) open in place ON EVERY ROUTE. The chooser used to
 *     decode the fragment and forward it to the playground that could read
 *     it; with one playground that whole apparatus collapses into "render
 *     what the payload is" — see the share effect below, which also inherits
 *     the chooser's duty of clearing the pre-paint `data-share-forward` flag.
 *   - Immersive mode and its Escape ladder (sequence canvas), the tour and
 *     its extra steps, the share/export buttons, the URL sync and the
 *     resizable/collapsible workbench rail all carried over unchanged.
 *
 * Everything runs in the browser: nothing typed here is uploaded or stored.
 *
 * WHY A FEATURE OF ITS OWN (`features/playground`) rather than a component
 * inside `viewer/`: this page consumes BOTH the viewer and the sequence
 * features, and the repo's import layering runs `editor → viewer → sequence`
 * (see the three `motion.ts` files). Seating a sequence-importing component
 * inside `viewer/` would invert that layering; a sibling feature downstream
 * of both keeps it acyclic, and everything arrives through the two barrels —
 * no new cross-feature deep imports (`dry.md`).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlignLeft,
  Braces,
  Download,
  Expand,
  FileText,
  Info,
  Repeat2,
  Shrink,
  X,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses, Button } from "@/components/ui/button";
import { CaretQuote } from "@/components/ui/caret-quote";
import { CopyButton } from "@/components/ui/copy-button";
import {
  SourceRailToggle,
  SplitWorkbench,
} from "@/components/ui/split-workbench";
import type { TourStep } from "@/components/ui/tour";
import {
  ShareLinkFailurePage,
  type ShareOpenFailure,
} from "@/components/share/share-link-failure";
import {
  SHARE_PENDING_CLASS,
  ShareOpening,
} from "@/components/share/share-opening";
import { serializeSequenceText } from "@/features/archtext";
import { MERMAID_SEQUENCE_EXPORT_CAVEAT } from "@/features/mermaid";
import {
  MERMAID_SEQUENCE_CAVEAT,
  SequenceExportButton,
  SequenceShareButton,
  SequenceViewer,
} from "@/features/sequence";
import {
  canEncodeShare,
  decodeShareFragment,
  downloadBlob,
  dropUrlFragment,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
  MERMAID_LOSSY_NOTICE,
  PANE_LABEL,
  parsePane,
  SHARE_FORWARD_ATTRIBUTE,
  sourceFileStem,
  ViewerShell,
  type PaneErrorDetail,
} from "@/features/viewer";
import { cn } from "@/lib/utils";

import {
  convertedSourceText,
  describeDocument,
  documentTitle,
  JSON_EXTENSION,
  MERMAID_C4_EXPORT_CAVEAT,
  parseViewSource,
  sourceExtension,
  sourceTextFor,
  VIEW_SEED_DOCUMENT,
  VIEW_SEED_TEXT,
  type SeedKind,
  type ToggleFormat,
  type ViewDocument,
  type ViewSourceError,
} from "../input/parse";

/**
 * How long the pane rests before its content is parsed (and, for C4, the
 * other pane regenerated). 300 ms keeps typing smooth — no parse per
 * keystroke — while the canvas still feels live. One convention, inherited
 * from both predecessor pages.
 */
const PARSE_DEBOUNCE_MS = 300;

/**
 * How long the document rests before the URL is rewritten. Longer than the
 * pane sync: rewriting costs a compress, and the address bar is not something
 * anyone watches keystroke by keystroke.
 */
const URL_SYNC_DEBOUNCE_MS = 800;

/*
 * This page's additions to the sequence viewer's tour (its `extraTourSteps`
 * prop): immersive mode and the source pane are THIS page's controls, so
 * their steps live here rather than in a viewer that renders neither. The C4
 * shell carries its own tour and needs no additions.
 */
const PLAYGROUND_TOUR_STEPS: readonly TourStep[] = [
  {
    title: "Go immersive",
    body:
      "Immersive, at the top right of this pane, hides everything but the " +
      "diagram. Escape brings it back — a focused message clears first.",
    icon: Expand,
  },
  {
    title: "The text behind it",
    body:
      "The source that draws this diagram sits beside it — edit the pane and " +
      "the diagram re-renders as you type.",
    icon: FileText,
  },
];

/** Which pane a pending edit came from. `json` exists only for C4 documents. */
type EditedPane = "source" | "json";

interface PendingEdit {
  pane: EditedPane;
  value: string;
}

type PaneErrorState =
  | { pane: "source"; error: ViewSourceError }
  | { pane: "json"; error: PaneErrorDetail };

export function ViewPlayground({
  seed,
}: {
  /** Which example fills the pane when no share payload does. */
  seed: SeedKind;
}): React.JSX.Element {
  /* ---- state ---------------------------------------------------------- */

  const seedDoc = VIEW_SEED_DOCUMENT[seed];
  const [text, setText] = useState(VIEW_SEED_TEXT[seed]);
  /** The last GOOD document — what the canvas renders, error or not. */
  const [doc, setDoc] = useState<ViewDocument>(seedDoc);
  const [jsonText, setJsonText] = useState(
    seedDoc.kind === "c4" ? seedDoc.synced.jsonText : "",
  );
  const [pending, setPending] = useState<PendingEdit | null>(null);
  const [paneError, setPaneError] = useState<PaneErrorState | null>(null);
  const [announcement, setAnnouncement] = useState("");

  /** The untouched seed, for skipping the URL sync until an edit happens. */
  const seedDocRef = useRef(seedDoc);

  // Remount the C4 shell only when the diagram being viewed no longer exists
  // in the new model — otherwise drill-down position survives every edit.
  const [shellEpoch, setShellEpoch] = useState(0);
  const currentDiagramRef = useRef(
    seedDoc.kind === "c4" ? seedDoc.synced.model.rootDiagramId : "",
  );

  // Share links (`#m=…`): the document arrives inside the fragment.
  const [openedFromShare, setOpenedFromShare] = useState(false);
  const [sharedInitialDiagram, setSharedInitialDiagram] = useState<
    string | null
  >(null);
  /** A link that would not open; non-null takes over the whole page. */
  const [shareFailure, setShareFailure] = useState<ShareOpenFailure | null>(
    null,
  );

  // JSON is opt-in. `.alab` is the format this product asks people to write —
  // it is what the syntax reference documents, what share links carry, and
  // what reads in a diff. Showing both side by side gave them equal billing
  // and made the page look like it had two answers; the JSON is the on-disk
  // form, not a second thing to learn. Revealed by an explicit click, and
  // never hidden while it is the pane reporting an error.
  const [jsonVisible, setJsonVisible] = useState(false);

  /** The left rail's fold. The toggle lives in the canvas column's own strip,
   * because a control that vanishes with the thing it hides cannot restore it. */
  const [sourceCollapsed, setSourceCollapsed] = useState(false);

  /** Scopes the sequence export button's lookup for the live <svg>. */
  const diagramPaneRef = useRef<HTMLElement>(null);

  const sourcePaneId = useId();
  const jsonPaneId = useId();
  const editingHintId = useId();

  // The JSON pane never renders while the document is not C4, nor while the
  // source pane itself holds arch-lab JSON — a second identical JSON pane
  // syncing against the first answers no question. Forced open when the JSON
  // pane is the one that failed: an error nobody can see is worse than an
  // extra pane.
  const jsonPaneAvailable = doc.kind === "c4" && doc.format !== "json";
  const showJson =
    jsonPaneAvailable && (jsonVisible || paneError?.pane === "json");

  /* ---- immersive mode (sequence canvas only) ------------------------------
   * State + ref pair, exactly as viewer-shell.tsx keeps them: the ref exists
   * so the once-registered Escape listener below can read the CURRENT value
   * without re-registering — a re-registered window listener moves to the
   * back of the listener order, BEHIND the sequence viewer's rung-2 listener,
   * and the Escape ladder would run bottom-up. The C4 shell brings its own
   * immersive control, so this pair only ever drives the sequence canvas. */

  const [isImmersive, setIsImmersive] = useState(false);
  const immersiveRef = useRef(false);

  const setImmersive = useCallback((next: boolean) => {
    immersiveRef.current = next;
    setIsImmersive(next);
    // The page's ONE polite live region carries this too — same channel as
    // parse results, and the two never race (parsing is debounced, this is
    // a click).
    setAnnouncement(
      next
        ? "Immersive mode on — the diagram fills the window and the source pane is hidden. Press Escape to exit (a focused message clears first)."
        : "Immersive mode off — the source pane is back.",
    );
  }, []);

  useEffect(() => {
    if (!isImmersive) return;
    // The fixed section covers the page; stop the page behind it scrolling.
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [isImmersive]);

  // Escape rung 3 — leave immersive mode, only once the sequence viewer has
  // passed on the event (its rung-2 listener preventDefaults when it clears a
  // focus, and it registered first — child effects run before parent effects
  // — so it always runs first). Registered once: `setImmersive` is stable and
  // the current mode is read through the ref.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.fullscreenElement !== null) return; // rung 1 — browser's turn
      if (!immersiveRef.current) return;
      event.preventDefault();
      setImmersive(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setImmersive]);

  // Typing a C4 document while immersive swaps the canvas to the C4 shell,
  // whose own immersive control knows nothing of this state — leave quietly
  // rather than strand a fixed, invisible section over nothing.
  useEffect(() => {
    if (doc.kind !== "sequence" && immersiveRef.current) setImmersive(false);
  }, [doc.kind, setImmersive]);

  /* ---- adopting a successfully parsed document --------------------------- */

  const adoptDocument = useCallback(
    (next: ViewDocument, editedPane: EditedPane | null) => {
      setDoc(next);
      // Only ever rewrite the OTHER pane(s) — never the one being edited.
      if (editedPane !== "source") setText(sourceTextFor(next));
      if (editedPane !== "json" && next.kind === "c4") {
        setJsonText(next.synced.jsonText);
      }
      setPaneError(null);
      if (next.kind === "c4") {
        if (
          next.synced.model.diagrams[currentDiagramRef.current] === undefined
        ) {
          currentDiagramRef.current = next.synced.model.rootDiagramId;
          setShellEpoch((epoch) => epoch + 1);
        }
      }
    },
    [],
  );

  const applyEdit = useCallback(
    (pane: EditedPane, value: string) => {
      if (pane === "source") {
        const result = parseViewSource(value);
        if (result.status === "ok") {
          adoptDocument(result.value, "source");
          setAnnouncement(
            `Parsed as ${describeDocument(result.value)} — diagram updated${
              result.value.kind === "c4" ? "; the JSON pane follows" : ""
            }.`,
          );
          return;
        }
        setPaneError({ pane: "source", error: result.error });
        setAnnouncement(
          `The text has a problem — ${result.error.message} The diagram shows the last good version.`,
        );
        return;
      }

      const result = parsePane("json", value);
      if (result.status === "ok") {
        // The source pane keeps whatever format it is currently in — see
        // `sourceTextFor`. A JSON edit against a sequence document cannot
        // happen (the pane is unmounted), so the fallback format is moot; it
        // exists only to keep the construction total.
        const next: ViewDocument = {
          kind: "c4",
          format: doc.kind === "c4" ? doc.format : "alab",
          synced: result.value,
        };
        adoptDocument(next, "json");
        setAnnouncement(
          "Panes in sync — text regenerated and diagram updated.",
        );
        return;
      }
      setPaneError({ pane: "json", error: result.error });
      setAnnouncement(
        result.error.kind === "mermaid-detected"
          ? `The ${PANE_LABEL.json} pane looks like Mermaid — paste Mermaid into the source pane instead; this one only reads arch-lab JSON.`
          : `${PANE_LABEL.json} has a problem — ${result.error.message}. The source pane and the diagram show the last good version.`,
      );
    },
    [adoptDocument, doc],
  );

  // The debounce: one timer for the single pending edit; replaced (and the
  // old timer cancelled) on every keystroke in either pane, so a stale parse
  // can never land after the user has moved on.
  useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => {
      setPending(null);
      applyEdit(pending.pane, pending.value);
    }, PARSE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [pending, applyEdit]);

  /* ---- opening a share link (`#m=…`) ------------------------------------
   * The fragment never reaches the server, so only the client can read it.
   * Read on mount (and again on `hashchange`, for a second link clicked in
   * the same tab — or a share URL pasted into the address bar while already
   * here, the case the retired chooser subscribed to `hashchange` for). A
   * decoded document replaces the pane exactly as pasting would; a corrupt,
   * truncated or lapsed payload takes over the page instead of annotating the
   * seed example with someone else's failure.
   *
   * WHAT THE MERGE DELETED HERE, on purpose: the chooser used to decode the
   * fragment, sniff its kind with `detectAlabKind`, and `router.replace` to
   * whichever playground could read it — and the sequence playground kept a
   * "wrong-document" takeover for C4 payloads that landed on it anyway. One
   * playground reads every payload kind, so "forward to the right route"
   * collapses into "just render what the payload is": no replace, no sniff
   * ahead of the parse, and no wrong-document page left to reach. */

  useEffect(() => {
    let cancelled = false;

    const openFromHash = async () => {
      const decoded = await decodeShareFragment(window.location.hash);
      if (cancelled) return;

      /* HAND BACK THE PRE-PAINT FLAG. `data-share-forward` is stamped on
         <html> by the root layout's script when the URL carries a payload,
         and `globals.css` uses it to show the holding state instead of the
         seeded example. The script runs once per document load and cannot
         clear itself, so the page that resolved the payload has to — for
         EVERY outcome, "no payload after all" included, because a client-side
         navigation never reloads the document and the flag would otherwise
         outlive the URL that set it and blank this route for the rest of the
         session. (The retired chooser owned this clearing for `/view`; the
         playground owns it everywhere now.) Before the state writes, and in
         the same tick as them, so the next paint carries both the real
         document and the un-hidden page. */
      document.documentElement.removeAttribute(SHARE_FORWARD_ATTRIBUTE);

      // Clear every previous outcome before recording this one. `hashchange`
      // fires for a second link opened in the same tab, and a takeover left
      // standing would describe a link that is no longer in the address bar —
      // worse, a GOOD link would adopt its document invisibly behind the
      // stale error page. Reset covers "none" too: a fragment with no payload
      // is not a share link, so nothing about one should still be on screen.
      setShareFailure(null);
      setOpenedFromShare(false);

      switch (decoded.status) {
        case "none":
          return;

        case "error":
          // Takes over the page. No `setAnnouncement`: the polite live region
          // lives in the editor JSX below, which this path never renders —
          // the failure page carries its own `role="alert"` instead.
          setShareFailure({ kind: "broken", reason: decoded.message });
          return;

        case "expired":
          // Takes over the whole page rather than showing a banner above the
          // seed example — see `@/components/share/share-link-failure` for
          // why a notice over a working editor actively misleads. No
          // announcement for the same reason as "error": the page's
          // `role="status"` is the thing assistive tech hears.
          setShareFailure({ kind: "expired", expiresAt: decoded.expiresAt });
          return;

        case "ok": {
          const result = parseViewSource(decoded.aftText);
          if (result.status !== "ok") {
            // Decoding succeeded and the text still will not parse, which in
            // practice means characters went missing from the MIDDLE of the
            // URL: a payload cut short at the end fails earlier, in
            // `decodeShareFragment`. (A payload of the "other kind" is not a
            // failure any more — this pane reads both.)
            setShareFailure({
              kind: "broken",
              reason:
                "the document inside it does not parse — characters appear to be " +
                "missing from the middle of the link, which happens when a long " +
                "URL is copied across a line wrap",
            });
            return;
          }

          setPending(null);
          // The pane shows the shared text VERBATIM (the sequence page's
          // rule, now for both kinds): what was shared is what is on screen,
          // not a canonicalised retelling of it.
          setText(decoded.aftText);
          adoptDocument(result.value, "source");
          if (result.value.kind === "c4") {
            const model = result.value.synced.model;
            const target =
              decoded.diagramId !== null &&
              model.diagrams[decoded.diagramId] !== undefined
                ? decoded.diagramId
                : model.rootDiagramId;
            currentDiagramRef.current = target;
            setSharedInitialDiagram(target);
            setShellEpoch((epoch) => epoch + 1);
          } else {
            setSharedInitialDiagram(null);
          }
          setOpenedFromShare(true);
          setAnnouncement(
            "Opened a document from a share link — nothing was uploaded; the pane holds its source.",
          );
          return;
        }

        default: {
          // A NEW codec status must never fall through to a silently blank or
          // half-working page: this assignment fails `pnpm typecheck` the
          // moment `DecodedShare` grows a case this switch does not map to a
          // full-page outcome. `check:share-error-pages` asserts the guard
          // stays here.
          const _exhaustive: never = decoded;
          return _exhaustive;
        }
      }
    };

    void openFromHash();
    const onHashChange = () => {
      void openFromHash();
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [adoptDocument]);

  /* ---- keeping the URL shareable as you edit ---------------------------- */
  /**
   * Rewrites `#m=…` to match the document on screen, so the address bar is
   * always a link you can paste — no Share click required.
   *
   * `history.replaceState`, for two reasons that both matter:
   *   - It does NOT fire `hashchange`. The effect above listens for that and
   *     re-decodes the fragment into the pane; if writing the URL triggered
   *     it, every keystroke would round-trip through a decode and stamp on
   *     the caret. `replaceState` is what makes this safe rather than a loop.
   *   - It does not push history. `pushState` per edit would bury the Back
   *     button under dozens of entries and make leaving the page a chore.
   *
   * BOTH KINDS sync now, where the old sequence page never did — a merged
   * pane forces the issue: a C4 share link opened here and then edited into a
   * sequence document would otherwise leave the C4 payload standing in the
   * address bar, a link to something no longer on screen. The payload is the
   * canonical `.alab` (what share links carry, per the codec's contract),
   * whatever format the pane itself is showing.
   *
   * Skipped while the document is still the untouched seed: landing on the
   * page and having the URL instantly grow a payload looks like something
   * happened when nothing did.
   *
   * Any `exp`/`sig` from an incoming link is deliberately dropped once the
   * document changes — that signature covers the ORIGINAL payload's digest
   * and cannot be valid for edited content. Keeping it would produce a link
   * that refuses to open; minting a fresh expiry belongs to the Share panel.
   */
  useEffect(() => {
    if (doc === seedDocRef.current) return;
    if (!canEncodeShare()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const fragment = await encodeShareFragment(
          doc.kind === "c4"
            ? doc.synced.aftText
            : serializeSequenceText(doc.file),
          doc.kind === "c4" &&
            currentDiagramRef.current !== doc.synced.model.rootDiagramId
            ? currentDiagramRef.current
            : null,
        );
        if (cancelled) return;
        const url = `${window.location.origin}${window.location.pathname}#${fragment}`;
        // Past the share HARD ceiling — not the handoff guard — because the
        // address bar's whole point here is to be copyable as a link: it must
        // track what the Share panel would hand over, and clear rather than
        // leave a stale fragment when the panel would refuse.
        window.history.replaceState(
          null,
          "",
          url.length > MAX_SHARE_URL_LENGTH
            ? window.location.pathname
            : `#${fragment}`,
        );
      })();
    }, URL_SYNC_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [doc]);

  /* ---- pane interactions ------------------------------------------------ */

  const handlePaneChange = useCallback((pane: EditedPane, value: string) => {
    if (pane === "source") setText(value);
    else setJsonText(value);
    setPending({ pane, value });
  }, []);

  const handleFormat = useCallback(
    (pane: EditedPane) => {
      setPending(null);
      if (pane === "source") {
        const result = parseViewSource(text);
        if (result.status !== "ok") {
          // Doesn't parse — surface the error now instead of formatting.
          applyEdit("source", text);
          return;
        }
        setText(sourceTextFor(result.value));
        adoptDocument(result.value, "source");
        setAnnouncement("Source pane formatted to its canonical form.");
        return;
      }
      const result = parsePane("json", jsonText);
      if (result.status !== "ok") {
        applyEdit("json", jsonText);
        return;
      }
      setJsonText(result.value.jsonText);
      adoptDocument(
        {
          kind: "c4",
          format: doc.kind === "c4" ? doc.format : "alab",
          synced: result.value,
        },
        "json",
      );
      setAnnouncement(`${PANE_LABEL.json} formatted to its canonical form.`);
    },
    [text, jsonText, doc, applyEdit, adoptDocument],
  );

  /**
   * THE FORMAT TOGGLE: rewrite the pane in the other format, in place.
   *
   * Not a second pane and not a read-only preview. This box has always held
   * EITHER format — it auto-detects on every keystroke — so "switch format"
   * can honestly mean "convert what is in the box", which is the thing people
   * ask for: write in `.alab`, flip to Mermaid, paste it into a README.
   *
   * IT ONLY EVER RUNS ON A DOCUMENT THAT PARSES, from the LAST GOOD parse
   * rather than the raw text: converting half a line has no meaning, and
   * silently converting a stale document would replace the reader's work with
   * something they cannot see the source of.
   *
   * Going to Mermaid is LOSSY for both kinds (`MERMAID_SEQUENCE_EXPORT_CAVEAT`
   * / `MERMAID_C4_EXPORT_CAVEAT`), and the announcement says so the moment it
   * happens. It is not guarded behind a confirmation: the conversion is
   * visible in the box, one Undo away in the textarea's own history, and a
   * dialog in front of a formatting button teaches people to dismiss dialogs.
   */
  const convertPane = useCallback(
    (to: ToggleFormat) => {
      if (doc.format === to) return;
      const converted = convertedSourceText(doc, to);
      setPending(null);
      setText(converted);
      // Re-parse the converted text so `doc.format` (and the C4 JSON twin)
      // follow the rewrite; the conversion announcement below then overwrites
      // the parse announcement, which is redundant with it.
      applyEdit("source", converted);
      setAnnouncement(
        to === "mermaid"
          ? `Converted the pane to Mermaid. ${
              doc.kind === "c4"
                ? MERMAID_C4_EXPORT_CAVEAT
                : MERMAID_SEQUENCE_EXPORT_CAVEAT
            }`
          : "Converted the pane to .alab — nothing is lost in this direction.",
      );
    },
    [doc, applyEdit],
  );

  // Reports which diagram is on screen so edits keep the drill-down place.
  // Also retires the share link's one-shot starting diagram: once the shell
  // is up, later remounts (edits that delete the current diagram) go back to
  // the model root, not to a stale deep link.
  const handleDiagramChange = useCallback((diagramId: string) => {
    currentDiagramRef.current = diagramId;
    setSharedInitialDiagram((current) => (current === null ? current : null));
  }, []);

  /* ---- Tab handling — indent, with a documented escape ------------------ */

  // After Escape, the next Tab moves focus instead of indenting. (This
  // textarea-local Escape sits OUTSIDE the page's Escape ladder on purpose:
  // the sequence viewer's rung-2 listener exempts form fields, so pressing
  // Escape here only arms the Tab hatch — it never clears a diagram focus
  // the user was not looking at.)
  const tabEscapeRef = useRef(false);

  const handleEditorKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>, pane: EditedPane) => {
      if (event.key === "Escape") {
        tabEscapeRef.current = true;
        return;
      }
      if (event.key === "Tab" && !event.shiftKey && !tabEscapeRef.current) {
        event.preventDefault();
        const el = event.currentTarget;
        el.setRangeText("  ", el.selectionStart, el.selectionEnd, "end");
        handlePaneChange(pane, el.value);
      }
      tabEscapeRef.current = false;
    },
    [handlePaneChange],
  );

  /* ---- render ------------------------------------------------------------ */

  const stem = sourceFileStem(documentTitle(doc));
  const paneExtension = sourceExtension(doc);

  // A link that did not open takes over the page. Returned BEFORE the editor
  // so the seed example is never on screen next to the message — the whole
  // point is that there is nothing here to mistake for what was shared.
  const startFresh = () => {
    dropUrlFragment();
    setShareFailure(null);
  };

  if (shareFailure !== null) {
    return (
      <ShareLinkFailurePage
        failure={shareFailure}
        subject="document"
        startFreshLabel="Start your own diagram"
        onStartFresh={startFresh}
      />
    );
  }

  return (
    <>
      {/* Swapped in for the block below, pre-paint, while a share link is being
          opened — so the seeded example is never mistaken for the shared one.
          `display: none` unless the flag is set, so a normal visit pays
          nothing. */}
      <ShareOpening subject="document" />

      <div
        className={cn(
          SHARE_PENDING_CLASS,
          /* A viewport tall on `lg` (minus the sticky 4rem header) so the
             workbench fills what is left. The budget lives here because this
             page knows what chrome it puts above the workbench; below `lg`
             the panes stack and the page scrolls normally. */
          "mx-auto flex w-full max-w-[110rem] flex-col gap-3 px-5 py-4 sm:px-8 lg:h-[calc(100svh-4rem)]",
        )}
      >
        {/* One heading for all three routes, deliberately kind-neutral: the
            routes differ only in their seed, and a heading that flipped with
            the detected kind would rewrite the page around every paste. */}
        <header className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Write your own diagram
          </h1>
          <Badge variant="accent">
            <span className="size-1.5 rounded-full bg-accent" />
            live editor
          </Badge>
          <p className="w-full text-sm leading-relaxed text-muted-foreground sm:w-auto sm:flex-1">
            C4 or sequence —{" "}
            <span className="font-mono text-foreground">.alab</span>, arch-lab
            JSON, or Mermaid, auto-detected and rendered live. Nothing leaves
            your browser.{" "}
            <Link
              href="/syntax"
              className="font-medium text-primary hover:underline"
            >
              Syntax reference
            </Link>
          </p>
        </header>

        <details className="group -mt-2 shrink-0 text-sm text-muted-foreground">
          <summary className="cursor-pointer text-xs text-muted-foreground/80 underline-offset-4 hover:text-foreground hover:underline">
            How .alab, JSON and Mermaid relate
          </summary>
          <p className="mt-2 max-w-3xl leading-relaxed">
            <span className="font-mono text-foreground">.alab</span> is the
            format to write: it is what the syntax reference documents, what
            share links carry, and what reads cleanly in a code review.{" "}
            <span className="font-mono text-foreground">.archlab.json</span> is
            the same C4 model on disk — the interchange form any other tool can
            read without implementing a grammar; the two are lossless twins in
            both directions (proved on every build), so you never have to write
            the JSON by hand. Mermaid is read and written too, lossily — the
            format toggle above the pane converts in place and states what each
            direction drops. Nothing you type is uploaded or stored.
          </p>
        </details>

        {/* THE one polite live region on this page: parse state, sync state,
            immersive toggles AND the sequence viewer's focus announcements
            (plumbed up through its onAnnounce prop). One region, deliberately
            — two polite regions updated near each other race, and the loser's
            announcement is swallowed; this page owns it because it renders
            unconditionally while the canvases come and go. */}
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {/* ONE LINE, with the lossy-import detail folded away — the treatment
            the sequence page established (progressive disclosure: "it
            converted" is news the first time and obvious after, while "here is
            what conversion drops" is reference material you go looking for),
            now covering the C4 Mermaid dialect too. The caveats are CONTRACTS
            — the exported constants, verbatim, never a retelling. */}
        {doc.format === "mermaid" && paneError === null ? (
          <details className="group shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-foreground">
            <summary className="flex cursor-pointer list-none items-center gap-2">
              <Info
                aria-hidden="true"
                className="size-4 shrink-0 text-accent"
              />
              <span>
                Mermaid — converted for you. Use the toggle for{" "}
                <span className="font-mono">.alab</span>.
              </span>
              <span className="ml-auto text-xs text-muted-foreground underline-offset-2 group-hover:underline">
                what conversion drops
              </span>
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Coming in:</span>{" "}
              {doc.kind === "c4"
                ? MERMAID_LOSSY_NOTICE
                : MERMAID_SEQUENCE_CAVEAT}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Going out:</span>{" "}
              {doc.kind === "c4"
                ? MERMAID_C4_EXPORT_CAVEAT
                : MERMAID_SEQUENCE_EXPORT_CAVEAT}
            </p>
          </details>
        ) : null}

        {/* ---- the workbench: source at 30%, canvas at 70% ----
          The pane and the diagram it describes are on screen TOGETHER; both
          predecessor pages arrived at this layout the hard way (see
          components/ui/split-workbench.tsx for the argument). The rail's
          collapse gives the canvas everything when a wide diagram needs it. */}
        <SplitWorkbench
          collapsed={sourceCollapsed}
          sourceLabel="document source"
          hidden={isImmersive}
          source={
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
              {/* ---- share-link outcome ---------------------------------- */}
              {/* Success only. Failure never reaches here — it took over the
                  page. */}
              {openedFromShare ? (
                <div className="flex items-start justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
                  <p className="text-sm leading-relaxed text-foreground">
                    <span className="font-semibold">
                      Opened from a share link.
                    </span>{" "}
                    The document below travelled inside the link itself —
                    nothing was uploaded, and nothing is stored. Any edits stay
                    in your browser.
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpenedFromShare(false)}
                    aria-label="Dismiss the share link notice"
                    className={buttonClasses({
                      variant: "ghost",
                      size: "sm",
                      className: "shrink-0",
                    })}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              ) : null}

              {/* ---- the source pane -------------------------------------- */}
              <section
                aria-label="Document source editor"
                className="flex min-w-0 flex-col gap-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor={sourcePaneId}
                      className="text-sm font-medium text-foreground"
                    >
                      Source text
                    </label>
                    {/* A radiogroup, not two buttons: one choice with two
                        values, and a screen reader should hear it that way. It
                        shows what the pane IS (detected from the text) and
                        switches by rewriting it — see `convertPane`. A C4
                        document sitting here as JSON checks neither side;
                        both options still act (they convert the JSON). */}
                    <div
                      role="radiogroup"
                      aria-label="Source format"
                      className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5"
                    >
                      {(["alab", "mermaid"] as const).map((format) => {
                        const current = doc.format === format;
                        return (
                          <button
                            key={format}
                            type="button"
                            role="radio"
                            aria-checked={current}
                            onClick={() => convertPane(format)}
                            title={
                              current
                                ? `The pane is ${format === "alab" ? ".alab" : "Mermaid"}`
                                : `Rewrite the pane as ${format === "alab" ? ".alab" : "Mermaid"}`
                            }
                            className={cn(
                              "rounded-md px-2 py-0.5 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                              current
                                ? "bg-secondary font-medium text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {format === "alab" ? ".alab" : "Mermaid"}
                          </button>
                        );
                      })}
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Repeat2 aria-hidden="true" className="size-3.5" />
                      switches by rewriting the text
                    </span>
                  </div>
                  {/* PANE-LOCAL actions only — Format, Copy, Download, all of
                      which act on the text beside them.

                      Share and Export are NOT here, and that is a bug fix
                      rather than a tidy-up. They open ~288px dropdown panels,
                      and this rail scrolls (`overflow-y: auto`), which the CSS
                      spec computes to `auto` on BOTH axes — so a panel wider
                      than a 30% rail was clipped at its edge, losing the left
                      half of every label. They now sit in the canvas strip,
                      where the C4 shell has always put its own pair: same
                      controls, same place, no clipping ancestor, and they are
                      about the DIAGRAM rather than about the text. */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PaneActions
                      pane="source"
                      heading="source text"
                      value={text}
                      filename={`${stem}${paneExtension}`}
                      mime={
                        doc.format === "json"
                          ? "application/json"
                          : "text/plain"
                      }
                      onFormat={handleFormat}
                    />
                  </div>
                </div>

                <textarea
                  id={sourcePaneId}
                  value={text}
                  onChange={(event) =>
                    handlePaneChange("source", event.target.value)
                  }
                  onKeyDown={(event) => handleEditorKeyDown(event, "source")}
                  aria-describedby={editingHintId}
                  aria-invalid={paneError?.pane === "source"}
                  spellCheck={false}
                  rows={14}
                  className={cn(
                    "w-full min-w-0 resize-y rounded-lg border bg-card px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    paneError?.pane === "source"
                      ? "border-destructive/60"
                      : "border-border",
                  )}
                />

                {paneError?.pane === "source" ? (
                  <SourceErrorBox error={paneError.error} />
                ) : null}
              </section>

              {/* ---- the C4 JSON twin ------------------------------------- */}
              {showJson ? (
                <section
                  aria-label="arch-lab JSON editor"
                  className="flex min-w-0 flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor={jsonPaneId}
                      className="text-sm font-medium text-foreground"
                    >
                      arch-lab JSON{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        ({JSON_EXTENSION})
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      <PaneActions
                        pane="json"
                        heading="arch-lab JSON"
                        value={jsonText}
                        filename={`${stem}${JSON_EXTENSION}`}
                        mime="application/json"
                        onFormat={handleFormat}
                      />
                    </div>
                  </div>
                  <textarea
                    id={jsonPaneId}
                    value={jsonText}
                    onChange={(event) =>
                      handlePaneChange("json", event.target.value)
                    }
                    onKeyDown={(event) => handleEditorKeyDown(event, "json")}
                    aria-describedby={editingHintId}
                    aria-invalid={
                      paneError?.pane === "json" &&
                      paneError.error.kind !== "mermaid-detected"
                    }
                    spellCheck={false}
                    rows={14}
                    className={cn(
                      "w-full min-w-0 resize-y rounded-lg border bg-card px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      paneError?.pane === "json" &&
                        paneError.error.kind !== "mermaid-detected"
                        ? "border-destructive/60"
                        : "border-border",
                    )}
                  />
                  {paneError?.pane === "json" ? (
                    <JsonErrorBox error={paneError.error} />
                  ) : null}
                </section>
              ) : null}

              {jsonPaneAvailable ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-expanded={showJson}
                    onClick={() => setJsonVisible((open) => !open)}
                  >
                    <Braces aria-hidden="true" />
                    {showJson ? "Hide JSON" : "Show JSON"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {showJson
                      ? "Both panes stay in sync — edit either one."
                      : "The same model as .archlab.json, the format it saves to. You never have to write it by hand."}
                  </p>
                </div>
              ) : null}

              <p id={editingHintId} className="text-xs text-muted-foreground">
                Tab inserts two spaces inside the editor — press Escape, then
                Tab, to move focus out. The diagram re-renders as you type;
                while the text fails to parse it keeps showing the last good
                version.{" "}
                {doc.kind === "sequence" ? (
                  // The sequence grammar's one non-obvious authoring rule,
                  // kept from its page verbatim: where long payloads go.
                  <>
                    Keep message labels short and indent a{" "}
                    <code className="font-mono">desc &quot;…&quot;</code> under
                    one to hold the endpoint or payload — it shows as a code
                    block when the message is clicked, never on the arrow. Use{" "}
                    <code className="font-mono">\n</code> inside it for several
                    lines.
                  </>
                ) : (
                  <>
                    Format rewrites a pane to its canonical form; nothing is
                    reformatted while you type.
                  </>
                )}
              </p>
            </div>
          }
          canvas={
            doc.kind === "c4" ? (
              <section
                aria-label="Rendered diagram"
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border shadow-sm max-lg:h-[70svh]"
              >
                {/* A slim strip for the rail toggle. The shell below owns its
                    own controls (immersive, export, share, tour) in a strip
                    UNDER the canvas; the rail toggle belongs to the page, not
                    to the shell, so it gets its own row rather than reaching
                    into the shell's. */}
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 py-1">
                  <SourceRailToggle
                    collapsed={sourceCollapsed}
                    onToggle={() => setSourceCollapsed(!sourceCollapsed)}
                    sourceLabel="document source"
                  />
                  <span className="truncate text-xs text-muted-foreground">
                    Diagram
                  </span>
                </div>
                <ViewerShell
                  key={shellEpoch}
                  model={doc.synced.model}
                  initialDiagramId={sharedInitialDiagram ?? undefined}
                  share={{ kind: "payload", text: doc.synced.aftText }}
                  onDiagramChange={handleDiagramChange}
                />
              </section>
            ) : (
              <section
                ref={diagramPaneRef}
                aria-label="Rendered sequence diagram"
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background",
                  isImmersive
                    ? // Immersive: cover the viewport. Site chrome and the
                      // source rail are BEHIND the fixed section, untouched —
                      // the same "cover, never edit" rule as viewer-shell.tsx.
                      "fixed inset-0 z-50"
                    : "rounded-xl border border-border shadow-sm max-lg:h-[70svh]",
                )}
              >
                {/* The toolbar strip stays visible in immersive mode too — the
                    exit must always be one click away, not only one keystroke. */}
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 py-1">
                  <span className="flex min-w-0 items-center gap-1">
                    {/* The rail toggle sits with the CANVAS, not with the rail
                        it hides: a control that vanishes along with the thing
                        it controls cannot bring it back. */}
                    {isImmersive ? null : (
                      <SourceRailToggle
                        collapsed={sourceCollapsed}
                        onToggle={() => setSourceCollapsed(!sourceCollapsed)}
                        sourceLabel="document source"
                      />
                    )}
                    <span className="truncate text-xs text-muted-foreground">
                      {isImmersive
                        ? "Immersive — Escape exits (a focused message clears first)"
                        : "Diagram"}
                    </span>
                  </span>
                  {/* Share and Export live in the CANVAS strip, matching the
                      C4 shell's own strip control-for-control. Two reasons,
                      and the first is a defect: in the source rail their
                      dropdown panels were clipped by that column's scroll box
                      (see the note on the rail's action row). The second is
                      that both act on the diagram — Export renders what is on
                      screen, Share hands over the document being drawn — so
                      the canvas is where they belonged anyway.

                      Hidden in immersive: the strip stays visible there so the
                      exit is one click away, and a menu that opened over a
                      fullscreen diagram would be covering the thing it exports. */}
                  <span className="flex shrink-0 items-center gap-1.5">
                    {isImmersive ? null : (
                      <>
                        <SequenceShareButton
                          text={text}
                          title={documentTitle(doc)}
                          format={doc.format}
                          onAnnounce={setAnnouncement}
                        />
                        <SequenceExportButton
                          paneRef={diagramPaneRef}
                          title={documentTitle(doc)}
                          onAnnounce={setAnnouncement}
                        />
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setImmersive(!isImmersive)}
                      aria-pressed={isImmersive}
                      aria-label={
                        isImmersive
                          ? "Exit immersive mode (Escape at the top level)"
                          : "Enter immersive mode — hide the site chrome and the source rail"
                      }
                      title={
                        isImmersive ? "Exit immersive mode" : "Immersive mode"
                      }
                      className={buttonClasses({
                        variant: "ghost",
                        size: "sm",
                      })}
                    >
                      {isImmersive ? (
                        <Shrink aria-hidden="true" />
                      ) : (
                        <Expand aria-hidden="true" />
                      )}
                      <span className="hidden sm:inline">
                        {isImmersive ? "Exit immersive" : "Immersive"}
                      </span>
                    </button>
                  </span>
                </div>
                <SequenceViewer
                  file={doc.file}
                  onAnnounce={setAnnouncement}
                  extraTourSteps={PLAYGROUND_TOUR_STEPS}
                />
              </section>
            )
          }
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Pane actions — Format, Copy, Download (the C4 panes' toolset)               */
/* -------------------------------------------------------------------------- */

function PaneActions({
  pane,
  heading,
  value,
  filename,
  mime,
  onFormat,
}: {
  pane: EditedPane;
  heading: string;
  value: string;
  filename: string;
  mime: string;
  onFormat: (pane: EditedPane) => void;
}): React.JSX.Element {
  return (
    <>
      <button
        type="button"
        onClick={() => onFormat(pane)}
        aria-label={`Format the ${heading} pane to its canonical form`}
        className={buttonClasses({ variant: "ghost", size: "sm" })}
      >
        <AlignLeft aria-hidden="true" />
        Format
      </button>
      <CopyButton text={value} label={`Copy the ${heading}`} />
      <button
        type="button"
        onClick={() =>
          downloadBlob(new Blob([value], { type: mime }), filename)
        }
        aria-label={`Download the ${heading} as ${filename}`}
        className={buttonClasses({ variant: "outline", size: "sm" })}
      >
        <Download aria-hidden="true" />
        Download
      </button>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Errors — one shape, native precision, work always preserved                 */
/* -------------------------------------------------------------------------- */

/** The source pane's failure: located wherever its own reader located it. */
function SourceErrorBox({
  error,
}: {
  error: ViewSourceError;
}): React.JSX.Element {
  if (error.kind === "unknown-format") {
    // Not a located failure — the first line matched no reader, so there is
    // no line to quote and nothing destructive to announce. Neutral tone.
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3.5">
        <p className="text-sm leading-relaxed text-foreground">
          {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3.5">
      <p className="text-sm font-medium text-foreground">
        The text doesn&apos;t parse —{" "}
        <span className="font-mono">{error.message}</span>
      </p>

      {error.kind === "json" ? (
        <JsonIssueList issues={error.issues} />
      ) : (
        <CaretQuoteWithIssues
          line={error.line}
          column={error.column}
          lineText={error.lineText}
          extraIssues={
            // The sequence parser reports one issue at a time; the `.alab` C4
            // and Mermaid readers can carry more after the first.
            error.kind === "parse"
              ? []
              : error.issues.slice(1).map((issue) => ({
                  key: `${issue.line}:${issue.column}:${issue.message}`,
                  text: `line ${issue.line}, column ${issue.column}: ${issue.message}`,
                }))
          }
        />
      )}

      <WorkIsSafeFooter />
    </div>
  );
}

/** The JSON pane's failure — `parsePane("json", …)`'s two shapes. */
function JsonErrorBox({
  error,
}: {
  error: PaneErrorDetail;
}): React.JSX.Element {
  if (error.kind === "mermaid-detected") {
    // Mermaid pasted into the JSON pane. The old page offered an import
    // ceremony here; the merged pane reads Mermaid directly, so the honest
    // answer is the pane that already does.
    return (
      <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3.5">
        <p className="text-sm leading-relaxed text-foreground">
          This looks like <span className="font-mono">Mermaid</span> code. This
          pane only reads arch-lab JSON — paste Mermaid into the source pane
          above, which renders it directly.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3.5">
      <p className="text-sm font-medium text-foreground">
        The arch-lab JSON doesn&apos;t parse —{" "}
        <span className="font-mono">{error.message}</span>
      </p>
      {error.kind === "json" ? <JsonIssueList issues={error.issues} /> : null}
      <WorkIsSafeFooter />
    </div>
  );
}

function JsonIssueList({
  issues,
}: {
  issues: readonly { path: string; message: string }[];
}): React.JSX.Element {
  return (
    <ul className="mt-2 space-y-1.5">
      {issues.map((issue) => (
        <li
          key={`${issue.path}:${issue.message}`}
          className="font-mono text-xs leading-relaxed break-words text-foreground"
        >
          <span className="font-semibold">{issue.path}</span>: {issue.message}
        </li>
      ))}
    </ul>
  );
}

function WorkIsSafeFooter(): React.JSX.Element {
  return (
    <p className="mt-2.5 text-xs text-muted-foreground">
      Your work is safe — the diagram still shows the last good version and will
      catch up once this parses.
    </p>
  );
}

/** The offending line with its caret, plus any issues after the first. */
function CaretQuoteWithIssues({
  line,
  column,
  lineText,
  extraIssues,
}: {
  line: number;
  column: number;
  lineText: string | null;
  extraIssues: readonly { key: string; text: string }[];
}): React.JSX.Element {
  return (
    <>
      <CaretQuote line={line} column={column} lineText={lineText} />
      {extraIssues.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {extraIssues.map((issue) => (
            <li
              key={issue.key}
              className="font-mono text-xs text-muted-foreground"
            >
              {issue.text}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
