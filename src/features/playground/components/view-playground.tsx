"use client";

/**
 * THE playground — one page for every document arch-lab can render, seeded
 * by `?d=` (`/demo` lists the bundled examples — this page does not offer
 * its own picker); one source rail on the LEFT holds ONE textarea, and
 * every edit is auto-detected and rendered on the RIGHT: `ViewerShell` for a
 * C4 model, `SequenceViewer` for a sequence document, `FlowchartViewer` for
 * a flowchart, `UseCaseViewer` for a use-case diagram. C4 `.alab`, sequence
 * `.alab`, flowchart `.alab`, use-case `.alab`, arch-lab JSON, Mermaid C4,
 * Mermaid `sequenceDiagram` and Mermaid `flowchart` / `graph` (in both its
 * flowchart and use-case readings) all just work — `input/parse.ts` composes
 * the real readers; nothing is parsed twice or differently here.
 *
 * This file replaced the two separate playgrounds (`viewer-playground.tsx`,
 * `sequence-playground.tsx`) and the `/live` chooser between them. The merge
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
 *   - The format toggle rewrites the pane in place, all four kinds now:
 *     `.alab ⇄ Mermaid` via the real serializers. Both directions exist for
 *     every kind, so both options always render; a C4 document sitting in the
 *     pane as JSON simply shows neither side checked. (`check:view-input`
 *     round-trips the toggle for all four, because the flowchart side
 *     shipped broken once: the emitter's YAML frontmatter defeated the
 *     detectors and Mermaid was an unclickable option.)
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

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlignLeft,
  Braces,
  Download,
  Expand,
  FilePlus2,
  FileText,
  ChevronDown,
  Info,
  Link2,
  Pencil,
  Repeat2,
  Shrink,
  X,
} from "lucide-react";
import Link from "next/link";

import { buttonClasses, Button } from "@/components/ui/button";
import {
  CANVAS_LOCK_COPY,
  CanvasLockButton,
  canvasStateLabel,
} from "./canvas-lock-button";
import { SvgExportButton } from "@/components/ui/svg-export-button";
import { CaretQuote } from "@/components/ui/caret-quote";
import { CopyButton } from "@/components/ui/copy-button";
import { NumberedTextarea } from "@/components/ui/numbered-textarea";
import {
  SourceRailToggle,
  SplitWorkbench,
} from "@/components/ui/split-workbench";
import type {
  C4NodeRevision,
  C4NodeType,
  ExternalRef,
  SequenceItemPath,
  SequenceMessageRevision,
  SequenceParticipantRevision,
} from "@/types";
import { sequenceItemKey, sequenceMessagePaths } from "@/types";
/* PAST THE BARREL, as `input/sequence-edit.ts` does and for the reason its
   comment gives: the refusals a reorder can hit are the sequence feature's own
   (a note in the way, a `box` boundary), and this page is the one surface that
   speaks them. */
import {
  messageReorderRefusal,
  participantReorderRefusal,
} from "@/features/sequence/lib/reorder";

import type { TourStep } from "@/components/ui/tour";
import {
  ShareLinkFailurePage,
  type ShareOpenFailure,
} from "@/components/share/share-link-failure";
import {
  SHARE_PENDING_CLASS,
  ShareOpening,
} from "@/components/share/share-opening";
import {
  serializeFlowchartText,
  serializeSequenceText,
  serializeUseCaseText,
  serializeErText,
  serializeDictText,
} from "@/features/archtext";
import {
  MERMAID_FLOWCHART_EXPORT_CAVEAT,
  MERMAID_SEQUENCE_EXPORT_CAVEAT,
  MERMAID_USECASE_EXPORT_CAVEAT,
} from "@/features/mermaid";
import {
  FlowchartExportButton,
  FlowchartShareButton,
  FlowchartViewer,
  MERMAID_FLOWCHART_CAVEAT,
} from "@/features/flowchart";
import {
  MERMAID_USECASE_CAVEAT,
  UseCaseExportButton,
  UseCaseShareButton,
  UseCaseViewer,
} from "@/features/usecase";
import { ErShareButton, ErViewer, renderErSvg } from "@/features/er";
import { DictShareButton, DictViewer, renderDictSvg } from "@/features/dict";
import {
  MERMAID_SEQUENCE_CAVEAT,
  SequenceExportButton,
  SequenceShareButton,
  SequenceViewer,
  type SequenceEditHandlers,
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
  type NodeMoveHandler,
  type PaneErrorDetail,
} from "@/features/viewer";
import { CANVAS_EDIT_ENABLED } from "@/lib/constants";
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
  VIEW_STARTER_TEXT,
  type SeedKind,
  type ToggleFormat,
  type ViewDocument,
  type ViewSourceError,
} from "../input/parse";
import {
  canvasEditability,
  createdNodeEdit,
  createdRefEdit,
  nestedNodeEdit,
  unnestedNodeEdit,
  createdNodeName,
  deletedNodeEdit,
  movedNodeEdit,
  ownsChildDiagram,
  revisedNodeEdit,
  type CanvasEdit,
} from "../input/canvas-edit";
import {
  activationRefusal,
  deletedMessageEdit,
  deletedParticipantEdit,
  insertedMessageEdit,
  insertedParticipantEdit,
  participantRemovalRefusal,
  reorderedMessageEdit,
  reorderedParticipantEdit,
  repointedMessageEdit,
  revisedMessageEdit,
  revisedParticipantEdit,
  toggledAutonumberEdit,
  INSERTED_PARTICIPANT_NAME,
} from "../input/sequence-edit";
import { CANVAS_LOCKED_BY_DEFAULT } from "../lib/canvas-lock";
import { KIND_BLURB } from "../lib/kind-copy";
import { useCanvasLocked, useSourceCollapsed } from "../lib/use-preference";

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

/**
 * How many canvas edits can be undone. Bounded because each entry is a whole
 * copy of the document's source text, and a long session of nudging a large
 * diagram would otherwise hold every version of it in memory for the lifetime
 * of the page. Fifty is far past the "I did not mean that" window this is for;
 * anything older is a change the reader has moved on from, and the text itself
 * is still theirs to edit by hand.
 */
const CANVAS_UNDO_DEPTH = 50;

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
  /* THE LOCK GETS A STEP because it is the one control that takes every other
     one away, and since the canvas locks by default (`lib/canvas-lock.ts`) it
     is now the step that explains why there is nothing to press on the diagram
     yet. The strip's own “Edit” is meant to answer that without help; this is
     the second chance, and it is the place to say that the editing controls
     APPEAR with it, which the button alone cannot. It teaches the SEQUENCE
     canvas's wording because this is the sequence viewer's tour; the C4 shell
     carries its own. */
  {
    title: "Press Edit to change it",
    body:
      "The canvas starts read-only, so a stray click cannot move anything " +
      "while you read or present. “Edit” at the top of this pane turns it on " +
      "and the editing controls appear with it; “Lock” puts them away again.",
    icon: Pencil,
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

/** How each kind reads mid-sentence ("Loaded a … starter", the starter
 * buttons' titles) — `usecase` is one word in code and two in prose, so the
 * raw SeedKind cannot be interpolated. */
const STARTER_NOUN: Record<SeedKind, string> = {
  c4: "C4",
  sequence: "sequence",
  flowchart: "flowchart",
  usecase: "use-case",
  er: "ER",
  dict: "data dictionary",
};

/** The starter buttons' faces, in the order the row renders them. */
const STARTER_BUTTON_LABEL: Record<SeedKind, string> = {
  c4: "C4",
  sequence: "Sequence",
  flowchart: "Flowchart",
  usecase: "Use case",
  er: "ER",
  dict: "Dictionary",
};

export function ViewPlayground({
  seed,
  initialText,
  initialSourceCollapsed = false,
  initialCanvasLocked = CANVAS_LOCKED_BY_DEFAULT,
}: {
  /** Which example fills the pane when no share payload does. */
  seed: SeedKind;
  /**
   * A bundled example's text, resolved by the route from `?e=`. Server-side,
   * so the example is in the first byte rather than fetched after hydration.
   * Absent means "use the kind's seed".
   */
  initialText?: string;
  /**
   * The reader's stored rail fold, read from the request cookie by the route
   * that mounts this. Passed in rather than read here because only a SERVER
   * component can see the request, and the whole point is that the first
   * rendered byte already has the right layout. Defaults to expanded, which
   * is what a caller with no request context (a test, a story) should get.
   */
  initialSourceCollapsed?: boolean;
  /**
   * The reader's stored canvas lock, read from the request cookie by the route
   * that mounts this — same server-side reasoning as the rail fold above, and
   * one more reason it matters here: a lock applied after hydration would let
   * one frame of editable canvas through, and one frame is enough for a press
   * to land.
   *
   * Defaults to the module's own default rather than a second literal, so a
   * host that omits the prop cannot disagree with the server's read of the
   * cookie. See `lib/canvas-lock.ts` for why locked is that default and what
   * the control does about the risk it carries.
   */
  initialCanvasLocked?: boolean;
}): React.JSX.Element {
  /* ---- state ---------------------------------------------------------- */

  /* An `?e=` example, when the route resolved one, otherwise the kind's
     built-in seed. Parsed rather than trusted: an example is the same kind of
     text a reader could paste, so it goes through the one reader everything
     else does — a broken bundled example then shows the parser's own located
     message instead of a blank canvas. */
  const seedDoc = useMemo(
    () =>
      initialText === undefined
        ? VIEW_SEED_DOCUMENT[seed]
        : (() => {
            const parsed = parseViewSource(initialText);
            return parsed.status === "ok"
              ? parsed.value
              : VIEW_SEED_DOCUMENT[seed];
          })(),
    [initialText, seed],
  );
  const [text, setText] = useState(initialText ?? VIEW_SEED_TEXT[seed]);
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
  /* The sample-diagram menu. Closed by default and session-only: choosing a
     starter is a one-off, so nothing here is worth remembering across loads. */
  const [startersOpen, setStartersOpen] = useState(false);
  const startersMenuId = useId();

  /** The left rail's fold. The toggle lives in the canvas column's own strip,
   * because a control that vanishes with the thing it hides cannot restore it.
   * REMEMBERED across visits in a cookie the SERVER reads, so the first
   * rendered byte already has the right layout — see `lib/source-fold.ts` for
   * why localStorage could not do that without a visible correction. */
  const [sourceCollapsed, setSourceCollapsed] = useSourceCollapsed(
    initialSourceCollapsed,
  );

  /** The canvas lock, remembered per browser — see `lib/canvas-lock.ts`. Its
   * control lives in the canvas strip beside the rail toggle, because that is
   * where the reader is looking when they want it. */
  const [canvasLocked, setCanvasLocked] = useCanvasLocked(initialCanvasLocked);

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

  /* ---- immersive mode (sequence, flowchart and use-case canvases) ---------
   * State + ref pair, exactly as viewer-shell.tsx keeps them: the ref exists
   * so the once-registered Escape listener below can read the CURRENT value
   * without re-registering — a re-registered window listener moves to the
   * back of the listener order, BEHIND the viewers' rung-2 listeners, and
   * the Escape ladder would run bottom-up. The C4 shell brings its own
   * immersive control, so this pair drives the other three canvases only. */

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

  // Escape rung 3 — leave immersive mode, only once the mounted viewer has
  // passed on the event (its rung-2 listener preventDefaults when it clears a
  // focus, and it registered first — child effects run before parent effects
  // — so it always runs first; the flowchart viewer keeps the same ladder).
  // Registered once: `setImmersive` is stable and the current mode is read
  // through the ref.
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
  // rather than strand a fixed, invisible section over nothing. (A swap
  // among the sequence, flowchart and use-case canvases keeps the mode: all
  // three render inside this page's own immersive wrapper.)
  useEffect(() => {
    if (doc.kind === "c4" && immersiveRef.current) setImmersive(false);
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
         session. (The retired chooser owned this clearing for `/live`; the
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
            : doc.kind === "sequence"
              ? serializeSequenceText(doc.file)
              : doc.kind === "flowchart"
                ? serializeFlowchartText(doc.file)
                : doc.kind === "usecase"
                  ? serializeUseCaseText(doc.file)
                  : doc.kind === "er"
                    ? serializeErText(doc.file)
                    : serializeDictText(doc.file),
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
   * Going to Mermaid is LOSSY for every kind (`MERMAID_C4_EXPORT_CAVEAT` /
   * `MERMAID_SEQUENCE_EXPORT_CAVEAT` / `MERMAID_FLOWCHART_EXPORT_CAVEAT`),
   * and the announcement says so the moment it happens. It is not guarded behind a confirmation: the conversion is
   * visible in the box, one Undo away in the textarea's own history, and a
   * dialog in front of a formatting button teaches people to dismiss dialogs.
   */
  /**
   * Replace the pane with a starter for `kind`.
   *
   * Overwrites without a confirmation, deliberately: the textarea's own undo
   * puts it back, and a dialog in front of "give me a blank one" is the kind
   * people learn to dismiss unread.
   */
  const loadStarter = useCallback(
    (kind: SeedKind) => {
      const starter = VIEW_STARTER_TEXT[kind];
      setPending(null);
      setText(starter);
      applyEdit("source", starter);
      setAnnouncement(`Loaded a ${STARTER_NOUN[kind]} starter.`);
    },
    [applyEdit],
  );

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
                : doc.kind === "sequence"
                  ? MERMAID_SEQUENCE_EXPORT_CAVEAT
                  : doc.kind === "flowchart"
                    ? MERMAID_FLOWCHART_EXPORT_CAVEAT
                    : MERMAID_USECASE_EXPORT_CAVEAT
            }`
          : "Converted the pane to .alab — nothing is lost in this direction.",
      );
    },
    [doc, applyEdit],
  );

  /* ---- editing on the canvas -------------------------------------------- */

  /**
   * Whether the canvas may be edited at all. `CANVAS_EDIT_ENABLED` is the
   * deploy switch; `canvasEditability` is the DOCUMENT's answer (C4 only, and
   * not while the pane holds Mermaid, which carries no geometry to write to).
   */
  const editability = canvasEditability(doc);
  /**
   * The same question for the OTHER canvas gesture — rewriting an element's
   * wording, which the sequence canvas offers in its dock and the C4 canvas in
   * its details panel (see `CanvasEditAbility`). Named for what it edits rather
   * than for the ability it asks about, so that the two `canvasEditability`
   * calls on this page cannot be read as the same question.
   */
  const wordingEditability = canvasEditability(doc, "revise");
  /**
   * Whether the canvas is editable RIGHT NOW: the deploy flag, the document's
   * own answer, and the reader's lock, in that order. Any one of the three
   * says no and the canvas is the read-only surface it has always been.
   */
  const canvasEditable =
    CANVAS_EDIT_ENABLED && editability.editable && !canvasLocked;
  /**
   * Whether to offer the lock at all. Gated on the DOCUMENT being editable,
   * not merely on it being C4: a control that cannot change anything is worse
   * than no control, and the five text-laid-out notations get no lock, no
   * disabled button and no tooltip explaining an absence — there is nothing
   * there to lock, so the strip simply does not mention it.
   */
  const showCanvasLock =
    CANVAS_EDIT_ENABLED &&
    (editability.editable || wordingEditability.editable);
  /**
   * The same offer for the sequence canvas, which renders in a DIFFERENT
   * branch of this component — and that difference is why the lock was
   * unreachable there. Gated on the wording ability alone: `showCanvasLock`
   * is an or of both abilities because a C4 document in a Mermaid pane still
   * wants the reason shown beside it, whereas this branch only ever holds a
   * document whose one editable gesture is revision.
   */
  const showSequenceCanvasLock =
    CANVAS_EDIT_ENABLED && wordingEditability.editable;

  /**
   * Whether the SEQUENCE canvas may be edited right now — the same three-part
   * answer `canvasEditable` gives the C4 canvas, against the other ability.
   * The lock is deliberately shared rather than per-canvas: it is the reader's
   * statement "I am presenting this, do not let me change it", which is about
   * the page and not about which notation happens to be open.
   */
  const sequenceEditable =
    CANVAS_EDIT_ENABLED && wordingEditability.editable && !canvasLocked;

  /**
   * Previous source texts, newest last — the undo history for CANVAS edits.
   *
   * THE TEXT IS THE UNDO UNIT, which is what lets this be a ring of strings
   * rather than a command stack. Every canvas edit is defined by the text it
   * produces (`canvas-edit.ts` re-parses to make that literally true), so
   * "undo" is "put the previous text back and parse it" — there is no inverse
   * operation to implement per edit type, and a future edit kind inherits undo
   * for free.
   *
   * SEPARATE FROM THE TEXTAREA'S OWN UNDO, deliberately, and the two must not
   * be merged. Typing in the pane keeps the browser's native undo, which knows
   * about carets and selections and word boundaries in a way nothing here
   * could reproduce; a canvas drag never enters that history because it is not
   * a user edit to the field. Binding one ⌘Z to both would mean either
   * hijacking the textarea (losing caret-accurate undo while typing) or
   * replaying canvas edits through it as text mutations (losing the caret
   * anyway, and fighting React's controlled value). So: focus in the pane
   * undoes typing, focus on the canvas undoes canvas edits — see the focus
   * guard in `viewer-canvas.tsx`, which is the one place that decides.
   *
   * A ref, not state: nothing renders from it, and re-rendering the page on
   * every push would be a render per drag for no visible reason.
   */
  const canvasUndoRef = useRef<string[]>([]);
  /**
   * What the numbering toggle's OFF position should write: the spelling this
   * document used before the toggle turned numbering on. See the capture in
   * `handleToggleAutonumber` for why it is taken on the way on, and
   * `toggledAutonumberEdit`'s header for why the answer cannot come from the
   * text once the flag reads `autonumber`.
   *
   * A ref, not state: nothing renders from it, and it is read only inside the
   * handler that writes it.
   */
  const autonumberOffSpellingRef = useRef<"absent" | "false" | null>(null);

  /**
   * Apply one canvas edit: remember the text being replaced, put the edited
   * text in the pane, adopt the document it parsed to, say what happened.
   *
   * ONE MODEL, and this is where it holds. The gesture is resolved into TEXT by
   * `canvas-edit.ts`, and the document adopted here is that text's own parse —
   * so there is no canvas-side copy of the geometry to fall out of step with
   * the pane. React Flow holds the position for the length of the gesture and
   * hands it over on release; nothing keeps it afterwards.
   *
   * THE EDITED PANE IS `"source"`, not `null`, and the distinction is the whole
   * comment-preservation fix — see the inline note below. The rule that
   * argument enforces is unchanged: whichever pane's text was just written is
   * never rewritten again from the model, which is what structurally rules out
   * echo loops between the source pane and its JSON twin.
   *
   * The pending debounce is dropped first, exactly as `loadStarter` and
   * `convertPane` drop it: a queued keystroke landing after this would parse
   * text that predates the edit and undo it invisibly.
   */
  const applyCanvasEdit = useCallback(
    (edit: CanvasEdit, announcement: string) => {
      const ring = canvasUndoRef.current;
      ring.push(text);
      if (ring.length > CANVAS_UNDO_DEPTH) ring.shift();
      setPending(null);
      setText(edit.text);
      // `"source"` — NOT `null`, and this is the line that keeps comments. The
      // text is already set above, as a PATCH of the author's own bytes; letting
      // `adoptDocument` regenerate the source pane from the model would put the
      // whole-document re-emit — and the comment loss with it — straight back.
      // The rule it enforces is unchanged: the pane being written is never
      // rewritten again from the model. The JSON twin still follows, because a
      // canvas edit is the one case where the caret is in neither pane.
      adoptDocument(edit.doc, "source");
      setAnnouncement(announcement);
    },
    [text, adoptDocument],
  );

  const handleNodeMove = useCallback<NodeMoveHandler>(
    (diagramId, nodeId, position) => {
      const next = movedNodeEdit(doc, text, diagramId, nodeId, position);
      // null covers "landed where it started" as well as "cannot be edited",
      // so a press that moves nothing costs no text change and no undo entry.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Moved ${nodeId} to ${position.x}, ${position.y} — the source text follows.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleNodeDelete = useCallback(
    (diagramId: string, nodeId: string) => {
      /* A node owning a child diagram is refused, and the refusal is SAID.
         Cascading would take a whole level of the model out on one keystroke;
         going quiet would look like a broken key. */
      if (ownsChildDiagram(doc, diagramId, nodeId)) {
        setAnnouncement(
          `${nodeId} cannot be deleted here — it opens a diagram of its own. Remove that level in the source text first.`,
        );
        return;
      }
      const next = deletedNodeEdit(doc, text, diagramId, nodeId);
      if (next === null) return;
      /* The undo key is NAMED here and nowhere else, because a delete is the
         one canvas edit with nothing left on screen to put back by hand — a
         move can always be dragged the other way. */
      applyCanvasEdit(
        next,
        `Deleted ${nodeId} and every relationship touching it — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleNodeRevise = useCallback(
    (diagramId: string, nodeId: string, revision: C4NodeRevision) => {
      const next = revisedNodeEdit(doc, text, diagramId, nodeId, revision);
      // null covers "nothing changed" as well as every refusal, so submitting
      // an untouched form costs no text change and no undo entry — the same
      // contract the two sequence revise handlers state.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `${nodeId} updated to “${revision.name}” — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleNodeCreate = useCallback(
    (diagramId: string, type: C4NodeType): string | null => {
      const next = createdNodeEdit(doc, text, diagramId, type);
      /* SAID, not swallowed, unlike a refused move: a no-op drag left the
         canvas looking exactly as the reader expects, but a pressed Add
         button that changes nothing looks like a broken button — the same
         verdict the sequence insert handlers reached. The one refusal a
         reader can actually cause here is the pane lagging the canvas. */
      if (next === null) {
        setAnnouncement(
          "The element was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return null;
      }
      applyCanvasEdit(
        next,
        /* "and selected", because the id returned below is what the canvas
           centres on and selects — the announcement describes the state the
           reader ARRIVES in, so it says "rename it" rather than the old
           "select it to rename it", which was an instruction the viewport
           did not help them follow. */
        `“${createdNodeName(type)}” added below the diagram and selected — the source text follows. Rename it in the details panel; press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
      // The canvas owns the camera; the id is how it finds what to centre on.
      return next.createdNodeId ?? null;
    },
    [doc, text, applyCanvasEdit],
  );

  const handleRefCreate = useCallback(
    (diagramId: string, source: ExternalRef): string | null => {
      const next = createdRefEdit(doc, text, diagramId, source);
      /* Said for the Add strip's reason — this arrives from the same strip,
         and a menu choice that silently does nothing reads as broken. */
      if (next === null) {
        setAnnouncement(
          "The reference was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return null;
      }
      applyCanvasEdit(
        next,
        "Reference added below the diagram and selected — the source text follows. It mirrors an element from a level above and is read-only here; press Cmd or Ctrl + Z with the diagram focused to undo.",
      );
      return next.createdNodeId ?? null;
    },
    [doc, text, applyCanvasEdit],
  );

  const handleNodeNest = useCallback(
    (diagramId: string, nodeId: string) => {
      const next = nestedNodeEdit(doc, text, diagramId, nodeId);
      if (next === null) {
        setAnnouncement(
          "The child diagram was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        "Child diagram added — the source text follows. Zoom into the element to fill it in; press Cmd or Ctrl + Z with the diagram focused to undo.",
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleNodeUnnest = useCallback(
    (diagramId: string, nodeId: string) => {
      const next = unnestedNodeEdit(doc, text, diagramId, nodeId);
      /* The one refusal a reader can cause here is a child that stopped being
         empty in the pane — worth saying, because the button was offered on
         the strength of it being empty. */
      if (next === null) {
        setAnnouncement(
          "The child diagram was not removed — it is no longer empty, or the source pane and the diagram do not match yet.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        "Empty child diagram removed — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.",
      );
    },
    [doc, text, applyCanvasEdit],
  );

  /* ---- the sequence canvas's own gestures --------------------------------
     Routed through `applyCanvasEdit` exactly as the C4 drag is, so both
     canvases share one undo ring, one "the pane just written is never rewritten
     from the model" rule and one announcement channel. A second pathway for
     the second canvas is the "two halves, each self-consistent" failure this
     module's neighbours already warn about. */

  const handleReviseMessage = useCallback(
    (path: SequenceItemPath, revision: SequenceMessageRevision) => {
      const next = revisedMessageEdit(doc, text, path, revision);
      // null covers "nothing changed" as well as every refusal, so submitting
      // an untouched form costs no text change and no undo entry.
      if (next === null) return;
      applyCanvasEdit(
        next,
        `Message updated to “${revision.label}” — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReviseParticipant = useCallback(
    (participantId: string, revision: SequenceParticipantRevision) => {
      const next = revisedParticipantEdit(doc, text, participantId, revision);
      if (next === null) return;
      applyCanvasEdit(
        next,
        `${participantId} updated to “${revision.name}” — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleInsertMessage = useCallback(
    (after: SequenceItemPath | null, from: string, to: string) => {
      const next = insertedMessageEdit(doc, text, after, from, to);
      if (next === null) {
        /* SAID, not swallowed. The refusals here are all "the pane and the
           canvas disagree" (a keystroke not yet parsed, or text that does not
           parse at all), and a two-click gesture that silently does nothing
           reads as a broken control rather than as a busy moment. */
        setAnnouncement(
          "The message was not inserted — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `Message inserted from ${from} to ${to} — the source text follows. Its wording is open for editing; press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleRepointMessage = useCallback(
    (path: SequenceItemPath, from: string, to: string) => {
      /* The activation refusal is READ OUT before the edit is attempted, for
         the same reason `ownsChildDiagram` is on the C4 side: `null` from the
         gesture covers every refusal at once, and a two-click gesture that
         ends in silence reads as a broken control. This is the one refusal
         with a cause the reader can act on, so it gets its own sentence. */
      const blocked = activationRefusal(doc, path);
      if (blocked !== null) {
        setAnnouncement(blocked);
        return;
      }
      const next = repointedMessageEdit(doc, text, path, from, to);
      if (next === null) {
        setAnnouncement(
          "The message was not repointed — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `Message now runs from ${from} to ${to} — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleDeleteMessage = useCallback(
    (path: SequenceItemPath) => {
      const blocked = activationRefusal(doc, path);
      if (blocked !== null) {
        setAnnouncement(blocked);
        return;
      }
      const next = deletedMessageEdit(doc, text, path);
      if (next === null) {
        setAnnouncement(
          "The message was not deleted — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      /* Undo is NAMED here for the reason the C4 delete names it: a delete is
         the one sequence edit with nothing left on screen to put back by hand.
         A revise can be retyped and a repoint re-clicked; a deleted message's
         wording is gone unless the ring gives it back. */
      applyCanvasEdit(
        next,
        "Message deleted — the source text follows, and later steps renumber. Press Cmd or Ctrl + Z with the diagram focused to undo.",
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReorderMessage = useCallback(
    (path: SequenceItemPath, toIndex: number) => {
      /* THE ACTIVATION SENTENCE FIRST, exactly as the delete and the repoint do
         it, and from the same function: a flag on the dragged message is the
         one refusal with a cause the reader can act on, and it must not be
         reported as "the pane does not match yet". */
      const blocked =
        activationRefusal(doc, path) ??
        (doc.kind === "sequence"
          ? messageReorderRefusal(doc.file, path, toIndex)
          : null);
      if (blocked !== null) {
        setAnnouncement(blocked);
        return;
      }
      const next = reorderedMessageEdit(doc, text, path, toIndex);
      if (next === null) {
        setAnnouncement(
          "The step was not moved — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      /* THE NEW POSITION IS READ OFF THE RE-PARSED DOCUMENT for the same reason
         the numbering toggle reads its state back: a screen-reader user does
         not watch the arrow travel, so the sentence is the whole of the
         feedback and it has to be right about where the step ended up. */
      const landed =
        next.doc.kind === "sequence"
          ? sequenceMessagePaths(next.doc.file.items).findIndex(
              (candidate) =>
                sequenceItemKey(candidate) ===
                sequenceItemKey([...path.slice(0, -1), toIndex]),
            ) + 1
          : 0;
      applyCanvasEdit(
        next,
        `Step moved to position ${landed} — the source text follows, and numbered steps renumber. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleReorderParticipant = useCallback(
    (participantId: string, toIndex: number) => {
      const blocked =
        doc.kind === "sequence"
          ? participantReorderRefusal(doc.file, participantId, toIndex)
          : null;
      if (blocked !== null) {
        setAnnouncement(blocked);
        return;
      }
      const next = reorderedParticipantEdit(doc, text, participantId, toIndex);
      if (next === null) {
        setAnnouncement(
          "The lifeline was not moved — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `${participantId} moved to column ${toIndex + 1} — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleDeleteParticipant = useCallback(
    (participantId: string) => {
      /* SAID WITH A COUNT, never swallowed. Refusing to remove a lifeline is
         the most likely refusal on this canvas — a lifeline nothing points at
         is the exception — so the sentence has to tell the reader what is in
         the way and how much of it. */
      const blocked = participantRemovalRefusal(doc, participantId);
      if (blocked !== null) {
        setAnnouncement(blocked);
        return;
      }
      const next = deletedParticipantEdit(doc, text, participantId);
      if (next === null) {
        setAnnouncement(
          "The lifeline was not removed — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
        );
        return;
      }
      applyCanvasEdit(
        next,
        `${participantId} removed — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.`,
      );
    },
    [doc, text, applyCanvasEdit],
  );

  const handleInsertParticipant = useCallback(() => {
    const next = insertedParticipantEdit(doc, text);
    if (next === null) {
      setAnnouncement(
        "The lifeline was not added — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
      );
      return;
    }
    applyCanvasEdit(
      next,
      `“${INSERTED_PARTICIPANT_NAME}” added at the end of the lifeline order — the source text follows. Click its header to rename it; press Cmd or Ctrl + Z with the diagram focused to undo.`,
    );
  }, [doc, text, applyCanvasEdit]);

  const handleToggleAutonumber = useCallback(() => {
    /* CAPTURED HERE, on the way ON, because this is the last moment the answer
       is still in the file. `autonumber` and its absence render identically to
       `autonumber false`, so the off direction cannot tell from the text which
       of the two off spellings the author had — and always removing the line
       silently deleted an `autonumber false` somebody had written by hand.

       Captured PER TURN-ON rather than per document, which is what makes a ref
       safe here: there is no staleness to invalidate. Switching document,
       undoing, or retyping the pane cannot leave a wrong answer behind, because
       the next turn-on reads the file again. A file that arrives with numbering
       already on has nothing remembered and falls back to `"absent"`, which is
       the right reading of "the toggle removes what turns it on". */
    const numberedNow = doc.kind === "sequence" && doc.file.autonumber === true;
    if (!numberedNow) {
      autonumberOffSpellingRef.current =
        doc.kind === "sequence" && doc.file.autonumber === false
          ? "false"
          : "absent";
    }
    /* A FILE THAT ARRIVED ALREADY NUMBERED has no remembered off state, because
       it was never off — so the off position has to invent one, and the two
       candidates are not equally good. Removing the line loses WHERE the author
       put it: `autonumberAnchor` writes a new flag after the block's leading
       prose, so a flag written above an opening comment comes back below it.
       Writing `false` in place keeps the line exactly where they had it and
       makes off-then-on byte-identical. Both spellings render the same; only
       one leaves the rest of the file alone. */
    const next = toggledAutonumberEdit(
      doc,
      text,
      autonumberOffSpellingRef.current ?? "false",
    );
    if (next === null) {
      setAnnouncement(
        "The step numbering was not changed — the source pane and the diagram do not match yet. Wait for the text to parse, then try again.",
      );
      return;
    }
    /* THE NEW STATE IS READ OFF THE RE-PARSED DOCUMENT, not predicted from the
       old one. The gesture writes text and `adopt` reads it back, so this is
       the only reading that cannot be wrong about what the file now says — and
       the sentence a screen-reader user gets instead of watching the numbers
       appear has to be right about which way the toggle went. */
    const on =
      next.doc.kind === "sequence" && next.doc.file.autonumber === true;
    applyCanvasEdit(
      next,
      on
        ? "Every step is now numbered — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo."
        : "Step numbers are off — the source text follows. Press Cmd or Ctrl + Z with the diagram focused to undo.",
    );
  }, [doc, text, applyCanvasEdit]);

  /**
   * The handler bundle the sequence viewer takes — PRESENT only while editing
   * is on, absent otherwise. Presence is the signal: the viewer renders no
   * editing chrome without it, which is what keeps a locked canvas free of
   * controls rather than showing disabled ones.
   */
  const sequenceEdit = useMemo<SequenceEditHandlers | undefined>(
    () =>
      sequenceEditable
        ? {
            onReviseMessage: handleReviseMessage,
            onReviseParticipant: handleReviseParticipant,
            onInsertMessage: handleInsertMessage,
            onRepointMessage: handleRepointMessage,
            onDeleteMessage: handleDeleteMessage,
            onReorderMessage: handleReorderMessage,
            onReorderParticipant: handleReorderParticipant,
            onDeleteParticipant: handleDeleteParticipant,
            onInsertParticipant: handleInsertParticipant,
            onToggleAutonumber: handleToggleAutonumber,
          }
        : undefined,
    [
      sequenceEditable,
      handleReviseMessage,
      handleReviseParticipant,
      handleInsertMessage,
      handleRepointMessage,
      handleDeleteMessage,
      handleReorderMessage,
      handleReorderParticipant,
      handleDeleteParticipant,
      handleInsertParticipant,
      handleToggleAutonumber,
    ],
  );

  /** Put the previous source text back and parse it — see `canvasUndoRef`. */
  const handleCanvasUndo = useCallback(() => {
    const previous = canvasUndoRef.current.pop();
    if (previous === undefined) {
      setAnnouncement("Nothing left to undo on the diagram.");
      return;
    }
    setPending(null);
    setText(previous);
    // `"source"` because the text is already set above: this parses it and
    // adopts the document without rewriting the pane it came from.
    applyEdit("source", previous);
    setAnnouncement("Undid the last change made on the diagram.");
  }, [applyEdit]);

  /** The handlers together, so the canvas cannot be half-editable.
   *
   * Gated on `canvasEditable` — the `move` answer — even though the bundle now
   * also carries `revise`: for a C4 document the two cells refuse in exactly
   * the same case (a Mermaid pane), so one gate is the honest one and a second
   * would be a condition that can never differ, kept in step by hand. If the
   * cells ever diverge, `revisedNodeEdit` still asks `canvasEditability` for
   * itself — every gesture guards its own ability. */
  const canvasEdit = useMemo(
    () =>
      canvasEditable
        ? {
            onNodeMove: handleNodeMove,
            onNodeRevise: handleNodeRevise,
            onNodeDelete: handleNodeDelete,
            onNodeCreate: handleNodeCreate,
            onRefCreate: handleRefCreate,
            onNodeNest: handleNodeNest,
            onNodeUnnest: handleNodeUnnest,
            onUndo: handleCanvasUndo,
          }
        : undefined,
    [
      canvasEditable,
      handleNodeMove,
      handleNodeRevise,
      handleNodeDelete,
      handleNodeCreate,
      handleRefCreate,
      handleNodeNest,
      handleNodeUnnest,
      handleCanvasUndo,
    ],
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
          {/* THE "live editor" BADGE IS GONE. It was a status pill — the shape
              this site uses for a release stage (`MCP_STATUS_LABEL`) — spent on
              a claim that is neither news nor a stage: every pane on this page
              is live, which the reader learns by typing one character. It also
              said "editor" while the page's own heading says "write your own
              diagram", giving one page two names for itself. */}
          <p className="w-full text-sm leading-relaxed text-muted-foreground sm:w-auto sm:flex-1">
            C4, sequence, flowchart, use case, ER or dictionary —{" "}
            <span className="font-mono text-foreground">.alab</span>, arch-lab
            JSON, or Mermaid, auto-detected and rendered live.{" "}
            {/* WHERE THE CANVAS-EDITING RULE IS NAMED, and it is named here
                because this is the sentence a reader is on when they wonder
                why their ER diagram will not move. Sourced from the flag, so
                the claim is absent rather than false while the canvas is not
                shipped.

                IT USED TO NAME C4 AS THE ONLY EDITABLE CANVAS, which went
                false the moment the sequence canvas became editable and was
                still on the page when a reader asked where the editing was.
                The old sentence is deliberately not quoted here: an assertion
                in `check:canvas-edit` searches this file for it, and prose
                reproducing it would defeat the check that guards it.
                The two abilities are named separately on purpose: they are
                genuinely different, and collapsing them into "C4 and sequence
                can be edited" would promise a sequence drag that does not
                exist.

                THE SEQUENCE HALF NAMES THE VERBS, since the gestures grew past
                "edited": messages and lifelines can now be added, rewritten,
                repointed and removed. Listing them beats a vaguer "can be
                edited" for the same reason the sentence is here at all — a
                reader hunting for the control needs to know it exists before
                they will look for it. */}
            {CANVAS_EDIT_ENABLED ? (
              <>
                C4 nodes can be dragged on the canvas, added from its palette
                and their wording, icon and colour edited in the details panel,
                and sequence messages and lifelines added, edited, repointed,
                reordered, numbered and removed on it; the other kinds lay
                themselves out from the text.{" "}
              </>
            ) : null}
            Nothing leaves your browser.{" "}
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
                : doc.kind === "sequence"
                  ? MERMAID_SEQUENCE_CAVEAT
                  : doc.kind === "flowchart"
                    ? MERMAID_FLOWCHART_CAVEAT
                    : MERMAID_USECASE_CAVEAT}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Going out:</span>{" "}
              {doc.kind === "c4"
                ? MERMAID_C4_EXPORT_CAVEAT
                : doc.kind === "sequence"
                  ? MERMAID_SEQUENCE_EXPORT_CAVEAT
                  : doc.kind === "flowchart"
                    ? MERMAID_FLOWCHART_EXPORT_CAVEAT
                    : MERMAID_USECASE_EXPORT_CAVEAT}
            </p>
          </details>
        ) : null}

        {/* ---- the workbench: source at 30%, canvas at 70% ----
          The pane and the diagram it describes are on screen TOGETHER; both
          predecessor pages arrived at this layout the hard way (see
          components/ui/split-workbench.tsx for the argument). The rail's
          collapse gives the canvas everything when a wide diagram needs it. */}
        <SplitWorkbench
          /* Immersive collapses the RAIL; it must not hide the workbench,
             because the canvas that fixes itself over the viewport is inside
             it and `display: none` on an ancestor beats `position: fixed` on
             a descendant. (Fixed once already on the branch that carries the
             `SplitWorkbench` change; restated here because this branch is cut
             from main, which does not have it yet.) */
          collapsed={sourceCollapsed || isImmersive}
          sourceLabel="document source"
          source={
            /* THE RAIL IS A COLUMN THAT FILLS ITS HEIGHT, not a scrolling
               block. It used to be `overflow-y-auto`, which made the editor a
               fixed 14 rows with dead space under it on any normal window —
               the pane you spend the whole visit in was the one thing on the
               page that did not use the space. Now the notices and the hint
               are `shrink-0` and the EDITORS take what is left, so the text
               area is as tall as the diagram beside it.

               `lg:flex-1` ON THIS WRAPPER is the link that makes the rest of
               that true, and leaving it off is what kept the dead space after
               the first attempt: this div is a flex ITEM of the workbench's
               source column, so without it its height is its content's, and
               the `flex-1` on the editor below then distributes across a box
               that is already exactly as tall as the editor. Every level from
               the page's `100svh` down to the textarea has to pass the height
               on, and `min-h-0` at each one is what lets it shrink rather than
               overflow. Below `lg` the chain is deliberately not joined — the
               panes stack there and the page scrolls. */
            <div className="flex min-h-0 flex-col gap-3 lg:min-h-0 lg:flex-1">
              {/* ---- share-link outcome ---------------------------------- */}
              {/* Success only. Failure never reaches here — it took over the
                  page. */}
              {/* ONE LINE, with the mechanism folded away — the same
                  progressive disclosure the Mermaid notice above uses, and
                  the same border, tint and icon-led summary, because a second
                  notice shape in one rail reads as two unrelated warnings. It
                  was a three-sentence card explaining that the document
                  travelled inside the link; that is the interesting part
                  exactly once, and it sat above the pane on every visit.

                  WHAT MUST NOT SHRINK OUT is "nothing uploaded, nothing
                  stored". It is not reassurance, it is the product's claim
                  (`purpose.md`), and it is the one thing a reader who arrived
                  from someone else's link cannot deduce from the page. The
                  crawlable, full-length statement lives where crawlers read
                  it — `/faq#sharing`, `llms.txt` and `llms-full.txt` — and
                  the link below goes there rather than restating it here. */}
              {openedFromShare ? (
                <div className="flex shrink-0 items-start gap-1">
                  <details className="group min-w-0 flex-1 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm text-foreground">
                    <summary className="flex cursor-pointer list-none items-center gap-2">
                      <Link2
                        aria-hidden="true"
                        className="size-4 shrink-0 text-accent"
                      />
                      {/* WRAPS RATHER THAN TRUNCATES, unlike the strip labels
                          above: this is the claim itself, and a rail narrow
                          enough to clip it would clip "nothing stored" — the
                          half that is the point. */}
                      <span className="min-w-0">
                        Share link — nothing uploaded, nothing stored.
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground underline-offset-2 group-hover:underline">
                        how
                      </span>
                    </summary>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      The document travelled inside the link itself, in the part
                      after the <span className="font-mono">#</span> that
                      browsers never send to a server. Any edits you make stay
                      in this browser.{" "}
                      <Link
                        href="/faq#sharing"
                        className="font-medium text-primary hover:underline"
                      >
                        More on share links
                      </Link>
                    </p>
                  </details>
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
              {/* `lg:flex-1 lg:min-h-0` — the pane takes a share of the
                  rail's height rather than a fixed row count. With the JSON
                  twin open the two split it; alone, the editor is as tall as
                  the diagram beside it. */}
              <section
                aria-label="Document source editor"
                className="flex min-w-0 flex-col gap-2 lg:min-h-0 lg:flex-1"
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
                        /* MERMAID HAS NO DICTIONARY NOTATION, so the option
                           cannot act on this document — clicking it had
                           nothing to convert to. Disabled and titled with the
                           reason rather than hidden: a control that vanishes
                           for one kind reads as a bug in the page, where a
                           disabled one that says why reads as an answer. */
                        const unsupported =
                          format === "mermaid" && doc.kind === "dict";
                        return (
                          <button
                            key={format}
                            type="button"
                            role="radio"
                            aria-checked={current}
                            aria-disabled={unsupported}
                            disabled={unsupported}
                            onClick={() => convertPane(format)}
                            title={
                              unsupported
                                ? "Mermaid has no data-dictionary notation, so there is nothing to convert to"
                                : current
                                  ? `The pane is ${format === "alab" ? ".alab" : "Mermaid"}`
                                  : `Rewrite the pane as ${format === "alab" ? ".alab" : "Mermaid"}`
                            }
                            className={cn(
                              "rounded-md px-2 py-0.5 font-mono text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                              unsupported
                                ? "cursor-not-allowed text-muted-foreground/40"
                                : current
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
                  {/* The pane's OWN actions only. Example LOADERS are
                      deliberately absent: this page renders whatever you put
                      in it, and `/demo` is the one place that lists what is
                      available. Offering a couple of them here too gave a
                      reader two doors to the same room, one of which showed
                      two of the six examples. */}
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

                <NumberedTextarea
                  id={sourcePaneId}
                  value={text}
                  onChange={(event) =>
                    handlePaneChange("source", event.target.value)
                  }
                  onKeyDown={(event) => handleEditorKeyDown(event, "source")}
                  aria-describedby={editingHintId}
                  aria-invalid={paneError?.pane === "source"}
                  /* `rows` is the MOBILE size only: stacked, the page
                     scrolls and a fixed height is right. On `lg` the pane
                     flexes instead (see the rail's note) and `resize-none`
                     goes with it — a drag handle fighting a flex height lets
                     the editor push the hint off the bottom. */
                  rows={14}
                  /* The WRAPPER takes the sizing now — the gutter and the text
                     are two columns inside it, so a height on the textarea
                     alone would leave the numbers a different length. */
                  className={cn(
                    "w-full lg:min-h-0 lg:flex-1",
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
                  className="flex min-w-0 flex-col gap-2 lg:min-h-0 lg:flex-1"
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
                      "w-full min-w-0 rounded-lg border bg-card px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-lg:resize-y lg:min-h-0 lg:flex-1 lg:resize-none",
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
                <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
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

              {/* ONE LINE. This was five sentences — how Tab behaves, that the
                  diagram re-renders as you type, that a failed parse keeps the
                  last good version, and where a sequence `desc` goes — sitting
                  permanently under the editor in a rail perhaps 320px wide.
                  Most of it answered questions the page answers by itself: you
                  learn "it re-renders as you type" by typing, and the error box
                  already says the diagram is showing the last good version when
                  it matters.

                  What survives is the part that is genuinely unguessable and
                  has a real cost when missed — Tab types spaces here, so a
                  keyboard reader needs telling how to leave the field. The
                  authoring guidance moved to the reference page that documents
                  it properly rather than being paraphrased in the furniture. */}
              {/* STARTERS, at the foot of the pane, one per document kind.
                  Not the example gallery this page used to carry — that
                  offered two of six bundled documents and `/demo` lists all of
                  them properly. This is the empty-page problem instead: a
                  reader who has read enough and wants to write their own needs
                  a shape to type into, and retyping a header from memory is
                  where a first document dies.

                  The CURRENT kind's starter is disabled rather than hidden: a
                  pair that appears and disappears as you paste is a moving
                  target, and "you are already writing this kind" is worth
                  saying. Replacing is undoable with the textarea's own undo,
                  which is why there is no confirmation in front of it. */}
              {/* ONE control that OPENS A LIST, not four controls in a row.
                  Four labels plus a disclosure was five things competing for a
                  strip of toolbar, and the four only mean something to a reader
                  who already knows all four grammars. A single named button
                  behind which the choices live — with each one's job written
                  beside it — is the pattern Mermaid's editor uses for the same
                  problem, and it is the right one: the toolbar states that
                  samples exist, the menu answers which. */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStartersOpen((value) => !value)}
                  aria-expanded={startersOpen}
                  aria-haspopup="menu"
                  aria-controls={startersOpen ? startersMenuId : undefined}
                  title="Replace the pane with a sample diagram"
                  className={buttonClasses({
                    variant: "ghost",
                    size: "sm",
                    className: "gap-2",
                  })}
                >
                  <FilePlus2 aria-hidden="true" />
                  Sample diagrams
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "transition-transform duration-200",
                      startersOpen && "rotate-180",
                    )}
                  />
                </button>

                {startersOpen ? (
                  <div
                    id={startersMenuId}
                    role="menu"
                    aria-label="Sample diagrams"
                    /* Opens UPWARD: this toolbar sits at the bottom of the
                       source pane, so a downward menu would open off-screen. */
                    className="af-glass absolute bottom-full left-0 z-50 mb-1.5 min-w-72 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-lg"
                  >
                    {(
                      [
                        "c4",
                        "sequence",
                        "flowchart",
                        "usecase",
                        "er",
                        "dict",
                      ] as const
                    ).map((kind) => {
                      const isCurrent = doc.kind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          role="menuitem"
                          disabled={isCurrent}
                          onClick={() => {
                            loadStarter(kind);
                            setStartersOpen(false);
                          }}
                          title={
                            isCurrent
                              ? `The pane already holds a ${STARTER_NOUN[kind]} document`
                              : `Replace the pane with a ${STARTER_NOUN[kind]} starter`
                          }
                          className={cn(
                            "flex w-full items-start gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                          )}
                        >
                          <FilePlus2
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="text-xs font-medium text-foreground">
                              {STARTER_BUTTON_LABEL[kind]}
                              {isCurrent ? " — open now" : ""}
                            </span>
                            {/* The job each diagram does. In a MENU it costs
                                  nothing: a reader who opened this list is
                                  exactly the one asking "which of these?", so
                                  the answer belongs here rather than folded
                                  behind a second control. */}
                            <span className="text-[11px] leading-tight text-muted-foreground">
                              {KIND_BLURB[kind]}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <p
                id={editingHintId}
                className="shrink-0 text-xs text-muted-foreground"
              >
                <kbd className="font-mono">Tab</kbd> indents ·{" "}
                <kbd className="font-mono">Esc</kbd> then{" "}
                <kbd className="font-mono">Tab</kbd> leaves the editor ·{" "}
                <Link
                  href={
                    doc.kind === "sequence" ? "/syntax#sequence" : "/syntax"
                  }
                  className="text-primary hover:underline"
                >
                  syntax reference
                </Link>
              </p>
            </div>
          }
          canvas={
            doc.kind === "c4" ? (
              <section
                aria-label="Rendered diagram"
                /* `lg:flex-1` — an unprefixed `flex-1` sets `flex-basis: 0%`,
                   which outranks `height` in a column flex container and left
                   this pane at its content height on every phone. See the
                   canvas wrapper in `split-workbench.tsx` for the full story. */
                className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border shadow-sm max-lg:h-[70svh] lg:flex-1"
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
                  {/* THE STATE, IN WORDS. The lock itself moved onto the
                      canvas (its top-right corner, via the shell's slot
                      below) and is an icon-only padlock there, so this word
                      in the strip is now the ONE place the state is spelled
                      out — it stayed where words fit when the control
                      stopped carrying any. A refusal outranks it: a C4
                      document the canvas cannot edit at all has a reason to
                      give, and no lock on it to need a state for. */}
                  <span className="truncate text-xs text-muted-foreground">
                    {CANVAS_EDIT_ENABLED &&
                    doc.kind === "c4" &&
                    !editability.editable
                      ? editability.reason
                      : showCanvasLock
                        ? canvasStateLabel(canvasLocked)
                        : "Diagram"}
                  </span>
                </div>
                <ViewerShell
                  key={shellEpoch}
                  /* The page owns the `h1`; the model's title is a level
                     below it here. Two `h1`s left `/live` and `/live/c4`
                     with no primary topic for a crawler and no primary
                     heading for a screen reader. */
                  titleAs="h2"
                  model={doc.synced.model}
                  initialDiagramId={sharedInitialDiagram ?? undefined}
                  share={{ kind: "payload", text: doc.synced.aftText }}
                  onDiagramChange={handleDiagramChange}
                  /* The playground can always edit a C4 document, even while
                     the reader has it locked to present — so the shell must
                     not offer a link to "edit this diagram somewhere else",
                     which would point back here. Capability, not current
                     state; see `canEdit` on the shell. */
                  canEdit={CANVAS_EDIT_ENABLED && editability.editable}
                  /* ONE CONTROL, and only where it can act: absent, not
                     disabled, when the document cannot be edited at all —
                     the strip shows the REASON instead. Handed to the shell
                     as a slot so it mounts at the canvas's own top right
                     (the product owner's placement), which also keeps it
                     reachable in immersive mode, where this strip is
                     covered. */
                  lockSlot={
                    showCanvasLock ? (
                      <CanvasLockButton
                        locked={canvasLocked}
                        onToggle={setCanvasLocked}
                        onAnnounce={setAnnouncement}
                        copy={CANVAS_LOCK_COPY.c4}
                      />
                    ) : undefined
                  }
                  /* Passing these is what makes the canvas editable — see
                     `CanvasEditHandlers`. `undefined` leaves the shell's
                     read-only canvas exactly as every other host gets it. */
                  edit={canvasEdit}
                />
              </section>
            ) : (
              /* ONE section for the sequence, flowchart and use-case
                 canvases: same immersive wrapper, same strip, same rail
                 toggle — only the viewer and the share/export pair vary by
                 kind. Splitting it into near-identical sections was rejected:
                 the immersive plumbing is the part that must not drift
                 between them. */
              <section
                ref={diagramPaneRef}
                aria-label={
                  doc.kind === "sequence"
                    ? "Rendered sequence diagram"
                    : doc.kind === "flowchart"
                      ? "Rendered flowchart"
                      : "Rendered use-case diagram"
                }
                className={cn(
                  /* `lg:flex-1` for the reason given on the C4 pane above:
                     `flex-basis: 0%` beats `height` in a column, so the
                     unprefixed form cancelled `max-lg:h-[70svh]`. Immersive is
                     unaffected either way — `fixed inset-0` takes it out of
                     the flow, where flex sizing no longer applies. */
                  "flex min-h-0 min-w-0 flex-col overflow-hidden bg-background lg:flex-1",
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
                    {/* Same one word as the C4 strip, from the same helper —
                        see the note there. Immersive outranks it: the way out
                        is the only thing a reader needs from this slot while
                        the diagram covers the viewport. */}
                    <span className="truncate text-xs text-muted-foreground">
                      {isImmersive
                        ? "Immersive — Escape exits (a focused message clears first)"
                        : showSequenceCanvasLock
                          ? canvasStateLabel(canvasLocked)
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
                    {isImmersive ? null : doc.kind === "sequence" ? (
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
                    ) : doc.kind === "flowchart" ? (
                      <>
                        <FlowchartShareButton
                          text={text}
                          title={documentTitle(doc)}
                          format={doc.format}
                          onAnnounce={setAnnouncement}
                        />
                        {/* Renders from the parsed file, not the live DOM —
                            which is why no paneRef is passed (the flowchart
                            exporter's header argues that side). */}
                        <FlowchartExportButton
                          file={doc.file}
                          title={documentTitle(doc)}
                          onAnnounce={setAnnouncement}
                        />
                      </>
                    ) : doc.kind === "usecase" ? (
                      <>
                        <UseCaseShareButton
                          text={text}
                          title={documentTitle(doc)}
                          format={doc.format}
                          onAnnounce={setAnnouncement}
                        />
                        {/* From the parsed file too — the use-case exporter
                            shares the flowchart exporter's from-model
                            argument (its header). */}
                        <UseCaseExportButton
                          file={doc.file}
                          title={documentTitle(doc)}
                          onAnnounce={setAnnouncement}
                        />
                      </>
                    ) : doc.kind === "er" ? (
                      <>
                        <ErShareButton
                          text={text}
                          title={documentTitle(doc)}
                          format={doc.format}
                          onAnnounce={setAnnouncement}
                        />
                        {/* From the parsed FILE, not a paneRef: these
                            exporters render from the model, so they work
                            mid-focus and with the focus dimming excluded by
                            construction — the export renderer never had it. */}
                        <SvgExportButton
                          render={(theme) => renderErSvg(doc.file, theme)}
                          title={documentTitle(doc)}
                          noun="ER diagram"
                          onAnnounce={setAnnouncement}
                        />
                      </>
                    ) : doc.kind === "dict" ? (
                      <>
                        <DictShareButton
                          text={text}
                          title={documentTitle(doc)}
                          onAnnounce={setAnnouncement}
                        />
                        <SvgExportButton
                          render={(theme) => renderDictSvg(doc.file, theme)}
                          title={documentTitle(doc)}
                          noun="data dictionary"
                          onAnnounce={setAnnouncement}
                        />
                      </>
                    ) : null}
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
                {doc.kind === "sequence" ? (
                  <SequenceViewer
                    file={doc.file}
                    onAnnounce={setAnnouncement}
                    extraTourSteps={PLAYGROUND_TOUR_STEPS}
                    edit={sequenceEdit}
                    /* THE SAME LOCK as the C4 branch's, in the branch a
                       sequence document actually renders in — it gates
                       `sequenceEditable`, and leaving it in the C4 branch
                       alone once meant a reader who had locked the canvas
                       could never unlock this one (see the header of
                       `canvas-lock-button.tsx`). A slot at the viewer's
                       top-right corner, matching the C4 canvas; offered only
                       for the notation whose canvas can act on it — the
                       other four in this branch have nothing to lock, and a
                       control that cannot change anything is worse than its
                       absence. */
                    lockSlot={
                      showSequenceCanvasLock ? (
                        <CanvasLockButton
                          locked={canvasLocked}
                          onToggle={setCanvasLocked}
                          onAnnounce={setAnnouncement}
                          copy={CANVAS_LOCK_COPY.sequence}
                        />
                      ) : undefined
                    }
                  />
                ) : doc.kind === "flowchart" ? (
                  <FlowchartViewer
                    file={doc.file}
                    onAnnounce={setAnnouncement}
                  />
                ) : doc.kind === "usecase" ? (
                  <UseCaseViewer file={doc.file} onAnnounce={setAnnouncement} />
                ) : doc.kind === "er" ? (
                  <ErViewer file={doc.file} onAnnounce={setAnnouncement} />
                ) : (
                  <DictViewer file={doc.file} onAnnounce={setAnnouncement} />
                )}
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
