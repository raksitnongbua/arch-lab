"use client";

/**
 * The element inspector: the node-side twin of viewer-edge-detail. It renders
 * in the same top-right panel slot and describes the selected element using
 * only what the model genuinely holds on `C4Node` — name, type, technology,
 * description, tags, and the level of the diagram it sits in (a node's level
 * is never stored on it) — then the element's relationships in the current
 * view, incoming and outgoing, each with its label and the other endpoint.
 *
 * The drill affordance lives here too: an element with a child diagram gets
 * a prominent "Zoom into this element" button with the child element count.
 * Boundary placeholders (`externalRef`) and file-split children (`childRef`)
 * are named honestly instead of showing a dead button. Nothing is invented.
 *
 * ON AN EDITABLE CANVAS IT ALSO EDITS. `onRevise` present, the header grows
 * the same pencil the sequence dock has, and the descriptive rows swap for a
 * form over the fields the panel already showed — type, name, technology,
 * description, tags — plus the element's icon (the shared `IconPicker`) and
 * its colour (`NODE_TAG_PALETTE` and the document's own coloured tags).
 * This panel is that editor rather than a new dock because it is
 * already the one surface showing every field a node has, so "edit this" can
 * mean "edit all of it" without a second inspector appearing anywhere. The
 * form's interaction grammar is the sequence dock's, deliberately (habit 2 of
 * `codebase.md`): plain <form> so Enter submits, Apply/Cancel in that order,
 * blank optional fields submit as absent, remount per element so fields start
 * from the new element's values. The form pieces are re-spelled here rather
 * than imported because the layering runs editor → viewer → sequence — this
 * feature cannot import the sequence viewer's.
 *
 * Announcements come from the host's existing aria-live region, not from
 * this component (same contract as the relationship card): the playground
 * says what the applied edit did.
 */

import { useEffect, useRef, useState } from "react";

import {
  ArrowLeftRight,
  Check,
  Minus,
  MoveLeft,
  MoveRight,
  Pencil,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";

import { buttonClasses } from "@/components/ui/button";
import { orAbsent } from "@/lib/absent";
import { LEVEL_LABEL } from "@/lib/constants";

import { MetaRow } from "./viewer-meta-row";
import { cn } from "@/lib/utils";
import type {
  C4Edge,
  C4Frame,
  C4Level,
  C4Node,
  C4NodeColorChoice,
  C4NodeFrameChoice,
  C4NodeRevision,
  C4NodeType,
} from "@/types";

import { IconPicker } from "@/features/editor/components/icon-picker";
import { resolveIcon } from "@/features/editor/lib/icons/registry";
import {
  freeColorTag,
  presentableTagColor,
} from "@/features/editor/lib/free-color";
import {
  colorRoleForNode,
  colorTagsOf,
  NODE_TAG_PALETTE,
  ROLE_COLOR_VARS,
  tagFillCss,
} from "@/features/editor/lib/node-colors";
import { useIconStyle } from "@/lib/icon-style";

import {
  C4_ABSTRACTION,
  SHAPE_LABEL,
  shapeAddsInformation,
} from "../lib/labels";
import { creatableNodeTypes } from "../lib/node-palette";

/** One relationship touching the selected element, in the current diagram. */
export interface NodeConnection {
  edge: C4Edge;
  /** Name of the endpoint that is NOT the selected element. */
  otherName: string;
}

export interface NodeDetail {
  node: C4Node;
  /** Level of the containing diagram — the element's own C4 level. */
  level: C4Level;
  /** Edges where the element is the source. */
  outgoing: NodeConnection[];
  /** Edges where the element is the target. */
  incoming: NodeConnection[];
  /** Present ⇔ the element has a loaded child diagram to zoom into. */
  drill: { childCount: number; childLevel: C4Level } | null;
  /**
   * The level one step deeper, or `null` at `code` where there is nowhere
   * further to go. What decides whether nesting is even a question for this
   * element — the panel never offers a nest the grammar has no block for.
   */
  childLevel: C4Level | null;
  /**
   * The element's child diagram when it EXISTS BUT HOLDS NOTHING — the state
   * `drill` deliberately refuses to report, because an empty child is not a
   * drill-down. On an editable canvas it is its own situation: a workspace to
   * open and fill, and the only child that may be removed again. `exists`
   * distinguishes an empty block from a DANGLING pointer at no block at all.
   */
  emptyChild: { exists: boolean } | null;
  /**
   * The diagram's own boundaries — what the edit form's frame select offers
   * beside "none" and a new label. Frames belong to the diagram rather than
   * the element, so they arrive with the detail the way `tagColors` does.
   */
  frames: readonly C4Frame[];
  /**
   * The document's `metadata.tagColors` — what the edit form's colour control
   * reads to show the element's current colour and to offer the author's own
   * coloured tags before the built-in palette. Comes with the detail rather
   * than being plucked from a context because everything else this card
   * states arrives the same way.
   */
  tagColors?: Readonly<Record<string, string>>;
}

/** Directional glyph for a connection row, seen from the selected element. */
function connectionIcon(
  edge: C4Edge,
  side: "outgoing" | "incoming",
): React.JSX.Element {
  if (edge.direction === "bidirectional") {
    return <ArrowLeftRight aria-hidden="true" className="size-3 shrink-0" />;
  }
  if (edge.direction === "none") {
    return <Minus aria-hidden="true" className="size-3 shrink-0" />;
  }
  return side === "outgoing" ? (
    <MoveRight aria-hidden="true" className="size-3 shrink-0" />
  ) : (
    <MoveLeft aria-hidden="true" className="size-3 shrink-0" />
  );
}

function ConnectionRow({
  connection,
  side,
}: {
  connection: NodeConnection;
  side: "outgoing" | "incoming";
}): React.JSX.Element {
  const { edge, otherName } = connection;
  return (
    <li className="flex items-start gap-1.5 rounded-md border border-border/60 bg-canvas/60 px-2 py-1.5">
      <span className="mt-0.5 text-primary">{connectionIcon(edge, side)}</span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-foreground">
          {otherName}
        </span>
        {edge.label !== undefined && edge.label !== "" ? (
          <span className="block text-[10px] leading-snug text-muted-foreground">
            {edge.label}
          </span>
        ) : null}
        {edge.technology !== undefined && edge.technology !== "" ? (
          <span className="block truncate font-mono text-[9px] text-muted-foreground/70">
            [{edge.technology}]
          </span>
        ) : null}
      </span>
    </li>
  );
}

function ConnectionGroup({
  heading,
  connections,
  side,
}: {
  heading: string;
  connections: NodeConnection[];
  side: "outgoing" | "incoming";
}): React.JSX.Element | null {
  if (connections.length === 0) return null;
  return (
    <div>
      <p className="text-[9px] tracking-wide text-muted-foreground uppercase">
        {heading}
      </p>
      <ul className="mt-1 space-y-1">
        {connections.map((connection) => (
          <ConnectionRow
            key={connection.edge.id}
            connection={connection}
            side={side}
          />
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The edit form — the sequence dock's grammar, on this panel's three fields   */
/* -------------------------------------------------------------------------- */

/** Exported for `viewer-multi-detail`, which renders the same boundary
 * control this panel's form does — one spelling of the field chrome, so the
 * two cards cannot drift apart visually. */
export const FIELD_CLASSES =
  "mt-0.5 w-full rounded-md border border-border bg-canvas/60 px-2 py-1 " +
  "text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:outline-none";

/** One labelled control. The <label> WRAPS its control rather than using
 * `htmlFor`, for the reason the sequence dock's `DockField` gives: an id
 * would have to be unique per selected element, a name to keep in step for
 * nothing. Exported for `viewer-multi-detail`, with `FIELD_CLASSES`. */
export function EditField({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="text-[10px] font-medium text-muted-foreground">
        {term}
      </span>
      {children}
    </label>
  );
}

/**
 * The node editor. `key`ed on the node id by its caller, so selecting a
 * different element REMOUNTS it — the fields start from the new element's
 * values rather than from an effect that syncs them (the sequence forms'
 * rule, for the sequence forms' reason).
 *
 * THE NAME MAY NOT BE BLANKED: the model requires one, and `revisedNodeEdit`
 * refuses an empty name rather than dropping the edit silently — so the form
 * submits the name as typed and leaves the refusal to the one authority. The
 * two optional text fields go through `orAbsent`, exactly as the dock's do.
 *
 * THE TYPE select offers `creatableNodeTypes(level)` — the Add palette's own
 * derivation, labelled with the `.alab` keywords — so it cannot offer a type
 * the parser refuses at this level. What a type change carries (the default
 * size follows, the icon field does not move) is `revisedNodeEdit`'s verdict,
 * argued there; the form only reports the chosen keyword.
 *
 * THE TAGS field edits the NON-COLOUR tags, whole-value; the colour-carrying
 * ones are the Colour control's (`C4NodeRevision.tags` carries the division),
 * and the field SAYS both when it is hiding them and when a typed tag will be
 * left out for being a colour — silence in either direction would read as a
 * bug or eat typed text.
 *
 * THE ICON control reuses the editor inspector's grammar — a button showing
 * the resolved icon that opens the shared `IconPicker`, a pick landing as
 * `iconSource: "explicit"` — and clearing it means THE TYPE DEFAULT, spelled
 * as omission, because that is the only cleared state the format has: an
 * absent icon renders the type's own mark, never a blank.
 *
 * THE COLOUR control offers the document's own coloured tags first, then the
 * measured `NODE_TAG_PALETTE`, then ANY colour — a wheel plus hex entry —
 * plus Automatic, the type's role colour. It submits an INTENT
 * (`C4NodeColorChoice`); `revisedNodeEdit` owns turning that into tag and
 * header writes. When the choice would take a coloured tag off the element —
 * the precedence trap `resolveTagColor` documents — the form says which,
 * BEFORE Apply, so the swap is never silent.
 *
 * THE FREE COLOUR goes through `presentableTagColor` before it is previewed
 * or submitted, and the form never holds an unconstructed hex: the wheel is
 * a native `<input type="color">` (keyboard- and AT-operable, brings the
 * platform's own spectrum, costs no dependency — a custom wheel would have
 * to re-earn all three), the text field takes a typed hex and simply does
 * not commit until it parses, and when the construction had to move the
 * colour the form SAYS so beside a swatch of what Apply will actually paint.
 * The tag is `freeColorTag`'s — derived from the hex, so the same colour on
 * a second element reuses the first element's header line (the module
 * headers carry both arguments).
 */
/* Sentinel for the frame select's "mint a new one" row. A value no slug can
   collide with, because `slugify` never emits a leading space. Exported for
   `viewer-multi-detail`, whose boundary select is this one over N elements. */
export const NEW_FRAME = " new";

/* Sentinel for the colour control's free pick, `NEW_FRAME`'s shape for
   `NEW_FRAME`'s reason: no tag can start with a space (`slugify` and the
   bare-tag grammar both refuse one), so this can never shadow a real tag. */
const FREE_COLOR = " custom";

/* What the free picker holds before the reader touches it when the element
   has no colour of its own to seed from: mid-lightness, mid-chroma, a hue no
   role uses — already inside `presentableTagColor`'s band, so the seed is
   what the swatch shows. An arbitrary but stated choice; nothing is written
   until the reader picks. */
const FREE_COLOR_SEED = "#9f6ea3";

function NodeEditForm({
  node,
  level,
  tagColors,
  frames,
  onSubmit,
  onCancel,
}: {
  node: C4Node;
  /** The containing diagram's level — what decides which types the Type
   *  select may offer (`creatableNodeTypes`, the Add palette's own table). */
  level: C4Level;
  tagColors: Readonly<Record<string, string>> | undefined;
  frames: readonly C4Frame[];
  onSubmit: (revision: C4NodeRevision) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(node.name);
  /* The type select's options come from the SAME derivation the Add palette
     reads, so the form cannot offer a keyword the parser refuses at this
     level — and the labels are the `.alab` keywords themselves, the
     palette's own argument: the control teaches the word the source pane
     will change to. The current type is always among them, because the
     parser accepted the document against the same table. */
  const [type, setType] = useState(node.type);
  const typeOptions = creatableNodeTypes(level);
  const [technology, setTechnology] = useState(node.technology ?? "");
  const [description, setDescription] = useState(node.description ?? "");
  const [icon, setIcon] = useState(node.icon);
  const [iconSource, setIconSource] = useState(node.iconSource);
  const [pickerOpen, setPickerOpen] = useState(false);
  /* The colour the element wears now, by the same precedence the canvas
     paints with — `worn[0]` wins, the rest are the tags a new choice removes. */
  const worn = colorTagsOf(node, tagColors);
  const [colorTag, setColorTag] = useState<string | null>(worn[0] ?? null);
  /* THE TAG FIELD HOLDS THE NON-COLOUR HALF of the element's tags, and only
     that half — `C4NodeRevision.tags` carries the division: a colour-carrying
     tag IS the element's colour, owned by the Colour control below, and a
     field that could edit it would fight that control over precedence. The
     split is SAID beside the field whenever it hides something, because a tag
     field that silently refuses to show some of the element's tags reads as
     a bug rather than a boundary. Comma-separated, since `.alab` quotes a
     tag containing spaces. */
  const [tagsText, setTagsText] = useState(() =>
    (node.tags ?? []).filter((tag) => !worn.includes(tag)).join(", "),
  );
  /* The free pick. `freeHex` only ever holds `presentableTagColor` output —
     the construction is applied on the way IN, so the preview swatch, the
     warning and the submitted hex cannot disagree about what Apply writes.
     It seeds from the element's own colour (constructed) so "nudge my
     current colour" starts from it rather than from a stranger. */
  const [freeHex, setFreeHex] = useState(() => {
    const wornHex = worn[0] === undefined ? "" : (tagColors?.[worn[0]] ?? "");
    return (
      presentableTagColor(wornHex === "" ? FREE_COLOR_SEED : wornHex)?.hex ??
      FREE_COLOR_SEED
    );
  });
  /* Whether the LAST pick had to move to stay legible — drives the one
     sentence that keeps the clamp honest. Seeding never sets it: nothing was
     picked yet, so there is nothing to disclose. */
  const [freeAdjusted, setFreeAdjusted] = useState(false);
  /* The hex field as TYPED — kept apart from `freeHex` so a half-typed value
     neither commits nor gets rewritten under the reader's cursor. */
  const [hexText, setHexText] = useState(() => freeHex);
  /* A wheel pick or a parsed hex both land here: construct, remember whether
     construction moved it, and make the free colour the pending choice — the
     reader just used the picker, so the pick IS the intent. */
  const commitFreeColor = (raw: string, typed?: string) => {
    const constructed = presentableTagColor(raw);
    if (constructed === null) return;
    setFreeHex(constructed.hex);
    setFreeAdjusted(constructed.adjusted);
    setHexText(typed ?? constructed.hex);
    setColorTag(FREE_COLOR);
  };
  /* The frame select carries THREE states in one control, because the
     grammar's choice is three-way: no boundary, one that exists, or one this
     edit mints. `NEW_FRAME` is a sentinel option rather than a second
     checkbox — a checkbox would let the reader ask for a new boundary while
     an existing one is still selected, a state the revision cannot spell. */
  const [frameId, setFrameId] = useState<string>(node.frameId ?? "");
  const [newFrameLabel, setNewFrameLabel] = useState("");
  const [iconStyle] = useIconStyle();

  /* The document's own coloured tags lead — an author who built a vocabulary
     should meet it before the built-ins — and a palette name the document
     already defines is NOT offered twice: the document's colour owns the tag
     (`revisedNodeEdit` never rewrites an existing `tagcolor` line). */
  const colorOptions = [
    ...Object.entries(tagColors ?? {})
      .filter(([, color]) => typeof color === "string" && color !== "")
      .map(([tag, color]) => ({ tag, color })),
    ...NODE_TAG_PALETTE.filter(({ tag }) => (tagColors?.[tag] ?? "") === ""),
  ];
  const hexFor = (tag: string): string =>
    colorOptions.find((option) => option.tag === tag)?.color ?? "";
  /* The pending choice as the TAG it would store — the free pick resolves to
     its hex-derived tag here, so the replacement warning and the submit
     cannot disagree with each other about which tag is chosen. */
  const chosenTag =
    colorTag === FREE_COLOR ? freeColorTag(freeHex, tagColors) : colorTag;
  /* Which coloured tags the pending choice takes off the element — worth a
     sentence exactly when it is not empty. */
  const replaced = worn.filter((tag) => tag !== chosenTag);
  const roleVars = ROLE_COLOR_VARS[colorRoleForNode(node)];

  /* The tag field as a LIST, and the part of it the Colour control owns. A
     typed colour tag is filtered from the submit rather than refused with
     the whole form (`revisedNodeEdit` would refuse it outright), and the
     sentence below the field says so BEFORE Apply — dropping typed text
     silently is the one thing worse than refusing it. A leading `#` is
     forgiven: the read view prints tags bare, but the format spells them
     with one. */
  const typedTags = [
    ...new Set(
      tagsText
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter((tag) => tag !== ""),
    ),
  ];
  const typedColorTags = typedTags.filter(
    (tag) => (tagColors?.[tag] ?? "") !== "",
  );

  /* The PENDING type, so a reader weighing "what does this become" previews
     the default icon the new keyword brings rather than the old one's. */
  const resolvedIcon = resolveIcon(
    icon !== undefined ? { type, icon } : { type },
  );
  const IconGlyph = resolvedIcon.def.byStyle[iconStyle];

  /* The name takes focus on mount rather than through `autoFocus`, which
     jsx-a11y flags and which cannot be scoped to "this remount" — the same
     note as the sequence forms. */
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.select();
  }, []);

  return (
    <form
      className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        const color: C4NodeColorChoice =
          chosenTag === null
            ? { kind: "role" }
            : {
                kind: "tag",
                tag: chosenTag,
                // The free pick submits its constructed hex; a swatch pick
                // submits the hex it was offered as.
                color: colorTag === FREE_COLOR ? freeHex : hexFor(chosenTag),
              };
        /* A blank label with "New boundary" chosen is NOT a request to mint
           an unnamed frame — `revisedNodeEdit` refuses one, and refusing
           here too would cost the reader their typing. It falls back to
           whatever membership the element already had. */
        const frame: C4NodeFrameChoice =
          frameId === NEW_FRAME
            ? newFrameLabel.trim() === ""
              ? node.frameId !== undefined
                ? { kind: "existing", frameId: node.frameId }
                : { kind: "none" }
              : { kind: "new", label: newFrameLabel.trim() }
            : frameId === ""
              ? { kind: "none" }
              : { kind: "existing", frameId };
        onSubmit({
          name,
          type,
          technology: orAbsent(technology),
          description: orAbsent(description),
          // The non-colour half only, colour tags filtered with a sentence
          // beside the field — the module refuses what this form filters.
          tags: typedTags.filter((tag) => (tagColors?.[tag] ?? "") === ""),
          // Spread-guarded so a default icon submits as ABSENT — the same
          // "empty means absent" contract the text fields state.
          ...(icon !== undefined ? { icon } : {}),
          ...(icon !== undefined && iconSource !== undefined
            ? { iconSource }
            : {}),
          color,
          frame,
        });
      }}
    >
      <EditField term="Name">
        <input
          ref={nameRef}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={FIELD_CLASSES}
        />
      </EditField>
      {/* Mono like the Add strip's buttons: the options ARE the `.alab`
          keywords, and the two controls should visibly speak one language. */}
      <EditField term="Type">
        <select
          value={type}
          onChange={(event) => setType(event.target.value as C4NodeType)}
          className={cn(FIELD_CLASSES, "font-mono")}
        >
          {typeOptions.map((option) => (
            <option key={option.type} value={option.type}>
              {option.keyword}
            </option>
          ))}
        </select>
      </EditField>
      <EditField term="Technology">
        <input
          value={technology}
          onChange={(event) => setTechnology(event.target.value)}
          placeholder="Next.js, PostgreSQL 16 — blank to remove"
          className={cn(FIELD_CLASSES, "font-mono")}
        />
      </EditField>
      {/* A TEXTAREA because the field may hold newlines the render honours —
          the same reason the dock's Details field is one. */}
      <EditField term="Description">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder="Blank to remove"
          className={FIELD_CLASSES}
        />
      </EditField>
      <EditField term="Tags">
        <input
          value={tagsText}
          onChange={(event) => setTagsText(event.target.value)}
          placeholder="pci, team-payments — comma-separated, blank to remove"
          className={cn(FIELD_CLASSES, "font-mono")}
        />
      </EditField>
      {/* The division, said where it applies: the element HAS more tags than
          the field shows exactly when it wears a colour, and a field that
          hides tags without saying why reads as a bug. */}
      {worn.length > 0 ? (
        <p className="-mt-1 text-[10px] leading-snug text-muted-foreground">
          {worn.map((tag) => `#${tag}`).join(", ")}{" "}
          {worn.length === 1 ? "is" : "are"} this element&apos;s colour —
          managed by the Colour control below, not here.
        </p>
      ) : null}
      {typedColorTags.length > 0 ? (
        <p className="-mt-1 text-[10px] leading-snug text-muted-foreground">
          {typedColorTags.map((tag) => `#${tag}`).join(", ")}{" "}
          {typedColorTags.length === 1 ? "is" : "are"} a colour in this
          document, so Apply leaves{" "}
          {typedColorTags.length === 1 ? "it" : "them"} out — pick the colour in
          the Colour control below instead.
        </p>
      ) : null}
      {/* A DIV, not an EditField: a <label> wrapping two buttons would hand
          clicks on the term to whichever button is first. */}
      <div>
        <span className="text-[10px] font-medium text-muted-foreground">
          Icon
        </span>
        <div className="mt-0.5 flex items-center gap-1">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Change icon (current: ${resolvedIcon.def.name})`}
            onClick={() => setPickerOpen(true)}
            className={cn(
              FIELD_CLASSES,
              "mt-0 flex min-w-0 flex-1 items-center gap-1.5 text-left hover:bg-secondary",
            )}
          >
            <IconGlyph aria-hidden="true" className="size-4 shrink-0" />
            <span className="truncate">{resolvedIcon.def.name}</span>
            {icon === undefined ? (
              <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">
                default
              </span>
            ) : null}
          </button>
          {icon !== undefined ? (
            <button
              type="button"
              onClick={() => {
                // Clearing means the TYPE DEFAULT (see the form header):
                // both keys go, exactly as the format omits them.
                setIcon(undefined);
                setIconSource(undefined);
              }}
              className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Use default
            </button>
          ) : null}
        </div>
        {pickerOpen ? (
          <IconPicker
            {...(icon !== undefined ? { value: icon } : {})}
            nodeType={type}
            onChange={(slug) => {
              setIcon(slug);
              // A pick from the panel is the reader's own choice, so it must
              // never be auto-overridden by a technology edit — "explicit",
              // the same verdict the editor inspector's picker hands down.
              setIconSource("explicit");
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}
      </div>
      {/* BOUNDARY BEFORE COLOUR: membership changes what the diagram says,
          colour only how it looks, and the form reads top-down from meaning
          to appearance — the same ordering the read view uses. */}
      <EditField term="Boundary">
        <select
          value={frameId}
          onChange={(event) => setFrameId(event.target.value)}
          className={FIELD_CLASSES}
        >
          <option value="">None</option>
          {frames.map((frame) => (
            <option key={frame.id} value={frame.id}>
              {frame.label}
            </option>
          ))}
          <option value={NEW_FRAME}>New boundary…</option>
        </select>
      </EditField>
      {frameId === NEW_FRAME ? (
        <EditField term="Boundary name">
          <input
            value={newFrameLabel}
            onChange={(event) => setNewFrameLabel(event.target.value)}
            placeholder="Internal, Trust boundary — blank to leave as-is"
            className={FIELD_CLASSES}
          />
        </EditField>
      ) : null}
      <div>
        <span className="text-[10px] font-medium text-muted-foreground">
          Colour
        </span>
        <div
          role="group"
          aria-label="Element colour"
          className="mt-0.5 flex flex-wrap items-center gap-1"
        >
          {/* Automatic first: the role colour is the resting state, and the
              swatch wears the role's own theme variables so it previews what
              Apply would actually paint. */}
          <button
            type="button"
            aria-pressed={colorTag === null}
            aria-label="Automatic — the type's own colour"
            title="Automatic"
            onClick={() => setColorTag(null)}
            className={cn(
              "size-6 shrink-0 rounded-full border-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              colorTag === null && "ring-2 ring-ring ring-offset-1",
            )}
            style={{ background: roleVars.fill, borderColor: roleVars.stroke }}
          />
          {colorOptions.map(({ tag, color }) => (
            <button
              key={tag}
              type="button"
              aria-pressed={colorTag === tag}
              aria-label={`Colour ${tag}`}
              title={`#${tag}`}
              onClick={() => setColorTag(tag)}
              className={cn(
                "size-6 shrink-0 rounded-full border-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                colorTag === tag && "ring-2 ring-ring ring-offset-1",
              )}
              /* The swatch is a miniature of the node it would produce: the
                 raw hex as the stroke, the fill REBUILT through the same
                 `tagFillCss` construction the canvas uses — so the preview is
                 theme-correct by the same mechanism, not by a second one. */
              style={{ background: tagFillCss(color), borderColor: color }}
            />
          ))}
        </div>
        {/* ANY colour: wheel, hex, and the pressable result. The three stay
            one row so the preview is never out of sight of the inputs that
            move it. */}
        <div className="mt-1 flex items-center gap-1.5">
          <input
            type="color"
            value={freeHex}
            onChange={(event) => commitFreeColor(event.target.value)}
            aria-label="Any colour — opens a colour wheel"
            title="Any colour"
            className="size-6 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <input
            value={hexText}
            onChange={(event) => {
              const typed = event.target.value;
              setHexText(typed);
              /* Long form commits as it completes; shorthand waits for blur —
                 expanding "#a47" under a cursor still heading for "#a47c13"
                 would hijack the reader's typing. */
              if (/^#[0-9a-fA-F]{6}$/.test(typed)) {
                commitFreeColor(typed, typed);
              }
            }}
            onBlur={() => commitFreeColor(hexText)}
            aria-label="Any colour as a hex code"
            placeholder="#rrggbb"
            className={cn(FIELD_CLASSES, "mt-0 w-24 font-mono")}
          />
          <button
            type="button"
            aria-pressed={colorTag === FREE_COLOR}
            aria-label={`Use this colour (${freeHex})`}
            title={freeHex}
            onClick={() => setColorTag(FREE_COLOR)}
            className={cn(
              "size-6 shrink-0 rounded-full border-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              colorTag === FREE_COLOR && "ring-2 ring-ring ring-offset-1",
            )}
            /* The same miniature the palette swatches are: the CONSTRUCTED
               hex as the stroke, the fill rebuilt through `tagFillCss` — the
               preview shows what Apply writes, by the same mechanism. */
            style={{ background: tagFillCss(freeHex), borderColor: freeHex }}
          />
        </div>
        {colorTag === FREE_COLOR && freeAdjusted ? (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Adjusted to stay readable on every theme — the hue is yours, the
            lightness moved to where the border keeps its contrast.
          </p>
        ) : null}
        {presentableTagColor(hexText) === null ? (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Not a hex colour yet — #rgb or #rrggbb.
          </p>
        ) : null}
        {replaced.length > 0 ? (
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
            Applying removes {replaced.map((tag) => `#${tag}`).join(", ")} from
            this element — that tag was its colour, and the header keeps the
            colour for other elements.
          </p>
        ) : null}
      </div>
      {/* Apply / Cancel, in that order — the primary action nearest the
          fields, matching the sequence dock's `DockFormActions`. */}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Check aria-hidden="true" className="size-3.5" />
          Apply
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ViewerNodeDetail({
  detail,
  onDismiss,
  onZoomIn,
  onRevise,
  onNest,
  onUnnest,
}: {
  detail: NodeDetail;
  onDismiss: () => void;
  /** Drill into the element's child diagram — same path as the zoom chip. */
  onZoomIn: () => void;
  /**
   * Rewrite the element's wording. Present only while the canvas is editable
   * — presence is the signal, so a locked or read-only canvas renders no
   * pencil rather than a disabled one (the same contract the sequence dock's
   * `edit` prop states).
   */
  onRevise?: (revision: C4NodeRevision) => void;
  /**
   * Give the element a fresh, empty child diagram one level down. Presence is
   * decided PER ELEMENT by the canvas, from the same facts `nestedNodeEdit`
   * refuses on, so a button that appears is a button the host will honour.
   */
  onNest?: () => void;
  /**
   * Remove the element's empty child diagram — the way back out of a nest
   * nobody filled. Present only beside a child the canvas can see is empty.
   */
  onUnnest?: () => void;
}): React.JSX.Element {
  const { node } = detail;

  /* Keyed by the TARGET rather than a bare boolean, the sequence dock's rule
     for the sequence dock's reason: selecting another element must close the
     form, not re-aim it — an open form holds the reader's half-typed text,
     and silently re-pointing it would commit that text to an element they
     were not looking at. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId === node.id;

  /* A boundary placeholder is read-only BY MEANING, not by mode: its name is
     the referenced node's, derived at parse time (`revisedNodeEdit` refuses it
     too — one verdict on both sides). So the pencil is withheld, and the card
     below already says why. */
  const revisable = onRevise !== undefined && node.externalRef === undefined;

  return (
    <aside
      aria-label="Element details"
      className={cn(
        // Narrow screens: the card keeps its width but caps at 40vh so more
        // than half the canvas stays visible under it; it scrolls internally
        // and dismisses via the X, Escape, or a pane tap.
        "flex max-h-[min(40vh,32rem)] w-72 max-w-full flex-col overflow-y-auto sm:max-h-[min(70vh,32rem)]",
        "rounded-lg border border-primary/40 bg-card/95 p-3 shadow-lg backdrop-blur",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium tracking-wide text-primary uppercase">
          Element
        </p>
        <span className="flex items-center gap-0.5">
          {revisable && !editing ? (
            <button
              type="button"
              onClick={() => setEditingId(node.id)}
              aria-label="Edit this element"
              className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Pencil aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Deselect element"
            className="-m-1 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </span>
      </div>

      {/* The form REPLACES the descriptive rows rather than sitting above
          them — the sequence dock's shape: two renderings of the same fields
          at once would leave the reader unsure which one the diagram obeys. */}
      {revisable && editing ? (
        <NodeEditForm
          key={node.id}
          node={node}
          level={detail.level}
          tagColors={detail.tagColors}
          frames={detail.frames}
          onSubmit={(revision) => {
            setEditingId(null);
            onRevise(revision);
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : (
        <>
          <NodeReadView detail={detail} onZoomIn={onZoomIn} />
          {/* NESTING LIVES OUTSIDE THE FORM, unlike boundary and colour: those
              are fields of the element's own line, which Apply rewrites as
              one patch. A child diagram is a whole block elsewhere in the
              file — an action, not a field, and putting it behind Apply would
              let Cancel imply it could be taken back after the block existed. */}
          {onNest !== undefined || onUnnest !== undefined ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
              {onNest !== undefined ? (
                <button
                  type="button"
                  onClick={onNest}
                  className={buttonClasses({ variant: "outline", size: "sm" })}
                >
                  <ZoomIn aria-hidden="true" className="size-3.5" />
                  Add{" "}
                  {detail.childLevel !== null
                    ? LEVEL_LABEL[detail.childLevel].toLowerCase()
                    : "child"}{" "}
                  diagram
                </button>
              ) : null}
              {onUnnest !== undefined ? (
                <button
                  type="button"
                  onClick={onUnnest}
                  className={buttonClasses({ variant: "outline", size: "sm" })}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Remove empty child
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}

/** The descriptive rows — everything the card shows when it is not a form. */
function NodeReadView({
  detail,
  onZoomIn,
}: {
  detail: NodeDetail;
  onZoomIn: () => void;
}): React.JSX.Element {
  const { node, level, outgoing, incoming, drill } = detail;
  const { def } = resolveIcon(node);
  const [iconStyle] = useIconStyle();
  const Icon = def.byStyle[iconStyle];
  const hasConnections = outgoing.length > 0 || incoming.length > 0;

  return (
    <>
      <p className="mt-1 flex items-center gap-1.5 text-sm leading-snug font-medium text-pretty text-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className={cn(node.type === "codeElement" && "font-mono")}>
          {node.name}
        </span>
      </p>

      <dl className="mt-2 space-y-1 border-t border-border/60 pt-2">
        {/*
         * The C4 classification, plus the silhouette in parentheses whenever
         * the two differ ("Container (database)"). This panel is the one
         * place with room to say both, so it is where a reader who wonders
         * why a cylinder is labelled Container finds the answer.
         */}
        <MetaRow term="Type">
          {shapeAddsInformation(node.type)
            ? `${C4_ABSTRACTION[node.type]} (${SHAPE_LABEL[node.type].toLowerCase()})`
            : C4_ABSTRACTION[node.type]}
        </MetaRow>
        {node.technology !== undefined && node.technology !== "" ? (
          <MetaRow term="Technology">
            <span className="font-mono">{node.technology}</span>
          </MetaRow>
        ) : null}
        <MetaRow term="Level">{LEVEL_LABEL[level]} view</MetaRow>
        {node.tags !== undefined && node.tags.length > 0 ? (
          <MetaRow term="Tags">
            <span className="flex flex-wrap justify-end gap-1">
              {node.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-1.5 py-px font-mono text-[9px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </span>
          </MetaRow>
        ) : null}
      </dl>

      {node.description !== undefined && node.description !== "" ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {node.description}
        </p>
      ) : null}

      {node.externalRef !== undefined ? (
        <p className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
          Boundary placeholder — this element is defined one level up and is
          mirrored here read-only for context.
        </p>
      ) : null}

      <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
        <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Relationships in this view
        </p>
        {hasConnections ? (
          <>
            <ConnectionGroup
              heading="Outgoing"
              connections={outgoing}
              side="outgoing"
            />
            <ConnectionGroup
              heading="Incoming"
              connections={incoming}
              side="incoming"
            />
          </>
        ) : (
          <p className="text-[10px] leading-snug text-muted-foreground">
            No relationships touch this element in the current view.
          </p>
        )}
      </div>

      {drill !== null ? (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-[10px] leading-snug text-muted-foreground">
            Contains {drill.childCount}{" "}
            {drill.childCount === 1 ? "element" : "elements"} in its{" "}
            {LEVEL_LABEL[drill.childLevel]} view.
          </p>
          <button
            type="button"
            onClick={onZoomIn}
            className={buttonClasses({
              size: "sm",
              className: "mt-1.5 w-full",
            })}
          >
            <ZoomIn aria-hidden="true" />
            Zoom into this element
          </button>
        </div>
      ) : node.childRef !== undefined ? (
        <p className="mt-2 rounded-md bg-muted/60 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
          This element&apos;s child diagram lives in a separate file (
          <span className="font-mono">{node.childRef}</span>) and is not loaded
          in this view.
        </p>
      ) : null}
    </>
  );
}
