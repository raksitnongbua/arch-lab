"use client";

/**
 * Single-node inspector (AF-E3-S2): `name`, `description` (≤500 chars with a
 * counter), `technology` (autocomplete from the icon registry), `type`
 * (constrained to the level's legality matrix), `icon` (swatch opening
 * T2-A's IconPicker) and `tags`.
 *
 * Text fields commit through `useInspectorField` — one undo entry per
 * editing session via the store's `coalesceKey`. Discrete controls (type,
 * icon, tags) commit immediately, one undo entry each.
 */

import { useState } from "react";
import { Layers } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LEVEL_LABEL } from "@/lib/constants";
import {
  childLevelOf,
  hasChildDiagram,
  isNodeTypeValidAtLevel,
  VALID_NODE_TYPES_BY_LEVEL,
  type C4Level,
  type C4Frame,
  type C4Node,
  type C4NodeType,
} from "@/types";

import { SHAPE_LABEL } from "@/features/viewer/lib/labels";

import { InvalidNodeTypeError, useEditorStore } from "../../state";
import { canDrillInto, drillIntoNode } from "../../hooks/use-level-navigation";
import { useIconStyle } from "@/lib/icon-style";

import { resolveIcon } from "../../lib/icons/registry";
import { IconPicker } from "../icon-picker";
import { Field, InspectorSection } from "./field";
import { TagInput } from "./tag-input";
import { TechnologyInput } from "./technology-input";
import { useInspectorField } from "./use-inspector-field";

/**
 * The type control picks a SILHOUETTE (the eight node types), not one of the
 * five C4 abstractions — so it speaks `SHAPE_LABEL`. The abstraction each
 * choice maps to is what the node's own `[...]` line then renders.
 *
 * @deprecated Import `SHAPE_LABEL` from `@/features/viewer/lib/labels`.
 */
export const NODE_TYPE_LABELS = SHAPE_LABEL;

const DESCRIPTION_MAX = 500;

/**
 * Stable empty array for the frames selector. A fresh `[]` on every call would
 * be a new reference each time, and Zustand's default identity comparison would
 * then re-render this inspector on every unrelated store change.
 */
const EMPTY_FRAMES: readonly C4Frame[] = [];

export function NodeInspector({
  diagramId,
  node,
  level,
}: {
  diagramId: string;
  node: C4Node;
  level: C4Level;
}): React.JSX.Element {
  const updateNode = useEditorStore((s) => s.updateNode);
  const setNodeFrame = useEditorStore((s) => s.setNodeFrame);
  // This diagram's boundaries. Read straight off the model rather than passed
  // in, so adding a boundary in the panel populates this select immediately.
  const frames = useEditorStore(
    (s) => s.model.diagrams[diagramId]?.frames ?? EMPTY_FRAMES,
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const keyBase = `inspector:node:${diagramId}:${node.id}`;
  const validTypes = VALID_NODE_TYPES_BY_LEVEL[level];

  const nameField = useInspectorField({
    value: node.name,
    fieldKey: `${keyBase}:name`,
    commit: (next, coalesceKey) => {
      const trimmed = next.trim();
      if (trimmed === "") return; // a name is required — keep the previous one
      updateNode(diagramId, node.id, { name: trimmed }, { coalesceKey });
    },
  });

  const descriptionField = useInspectorField({
    value: node.description ?? "",
    fieldKey: `${keyBase}:description`,
    commit: (next, coalesceKey) => {
      const trimmed = next.trim();
      updateNode(
        diagramId,
        node.id,
        { description: trimmed === "" ? undefined : trimmed },
        { coalesceKey },
      );
    },
  });

  const changeType = (next: C4NodeType) => {
    if (next === node.type) return;
    try {
      if (!isNodeTypeValidAtLevel(next, level)) {
        throw new InvalidNodeTypeError(level, next, validTypes);
      }
      updateNode(diagramId, node.id, { type: next });
    } catch (error) {
      if (error instanceof InvalidNodeTypeError) {
        toast({ message: error.message, tone: "error" });
        return;
      }
      throw error;
    }
  };

  const resolved = resolveIcon(node);
  const [iconStyle] = useIconStyle();
  const IconSvg = resolved.def.byStyle[iconStyle];

  return (
    <InspectorSection title={NODE_TYPE_LABELS[node.type]}>
      <Field id="inspector-node-name" label="Name">
        <Input
          id="inspector-node-name"
          value={nameField.value}
          onFocus={nameField.onFocus}
          onChange={(event) => nameField.onChange(event.currentTarget.value)}
          onBlur={nameField.onBlur}
          onKeyDown={nameField.onKeyDown}
        />
      </Field>

      <Field
        id="inspector-node-description"
        label="Description"
        hint={`${descriptionField.value.length}/${DESCRIPTION_MAX}`}
      >
        <Textarea
          id="inspector-node-description"
          rows={4}
          maxLength={DESCRIPTION_MAX}
          placeholder="What is it, and why does it exist?"
          value={descriptionField.value}
          onFocus={descriptionField.onFocus}
          onChange={(event) =>
            descriptionField.onChange(
              event.currentTarget.value.slice(0, DESCRIPTION_MAX),
            )
          }
          onBlur={descriptionField.onBlur}
          onKeyDown={(event) => {
            // Enter inserts a newline in a textarea; only Escape reverts.
            if (event.key === "Escape") descriptionField.onKeyDown(event);
          }}
        />
      </Field>

      <TechnologyInput
        id="inspector-node-technology"
        fieldKey={`${keyBase}:technology`}
        value={node.technology ?? ""}
        placeholder='e.g. "Go 1.22 / chi"'
        commit={(next, coalesceKey) => {
          const trimmed = next.trim();
          updateNode(
            diagramId,
            node.id,
            { technology: trimmed === "" ? undefined : trimmed },
            { coalesceKey },
          );
        }}
      />

      <Field id="inspector-node-type" label="Type">
        <Select
          id="inspector-node-type"
          value={node.type}
          disabled={validTypes.length <= 1}
          onChange={(event) =>
            changeType(event.currentTarget.value as C4NodeType)
          }
        >
          {validTypes.map((type) => (
            <option key={type} value={type}>
              {NODE_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Field>

      {/*
       * Membership is edited from the ELEMENT side, because the element is what
       * has a selection and an inspector — the boundaries panel on the diagram
       * inspector owns the frames themselves. Hidden entirely when the diagram
       * has no boundaries: a select with one "— none" option is a control that
       * cannot do anything.
       */}
      {frames.length > 0 ? (
        <Field id="inspector-node-frame" label="Boundary">
          <Select
            id="inspector-node-frame"
            value={node.frameId ?? ""}
            onChange={(event) =>
              setNodeFrame(
                diagramId,
                [node.id],
                event.currentTarget.value === ""
                  ? null
                  : event.currentTarget.value,
              )
            }
          >
            <option value="">— none</option>
            {frames.map((frame) => (
              <option key={frame.id} value={frame.id}>
                {frame.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field id="inspector-node-icon" label="Icon">
        <button
          id="inspector-node-icon"
          type="button"
          aria-haspopup="dialog"
          aria-label={`Change icon (current: ${resolved.def.name})`}
          className="flex h-9 w-full items-center gap-2.5 rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-sm transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:outline-none"
          onClick={() => setPickerOpen(true)}
        >
          <IconSvg aria-hidden="true" className="size-5 shrink-0" />
          <span className="truncate">{resolved.def.name}</span>
          {resolved.isFallback ? (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              default
            </span>
          ) : null}
        </button>
        {pickerOpen ? (
          <IconPicker
            {...(node.icon !== undefined ? { value: node.icon } : {})}
            nodeType={node.type}
            onChange={(slug) => {
              updateNode(diagramId, node.id, {
                icon: slug,
                iconSource: "explicit",
              });
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        ) : null}
      </Field>

      <TagInput
        id="inspector-node-tags"
        tags={node.tags ?? []}
        commit={(next) => updateNode(diagramId, node.id, { tags: next })}
      />

      <DrillAction node={node} diagramLevel={level} />
    </InspectorSection>
  );
}

/**
 * The way down a level, in the panel people actually look at.
 *
 * C4 has no "container" you can drop at Context level — containers only exist
 * INSIDE a system, so the palette (which shows exactly the types valid here)
 * can never offer one. Until now the only route was right-click → Drill into,
 * which is invisible: users reported not being able to create a container at
 * all. This states the rule and performs it in one control.
 *
 * Renders nothing at `code` level or on a boundary placeholder, matching
 * `canDrillInto` exactly rather than re-deriving the rule.
 */
function DrillAction({
  node,
  diagramLevel,
}: {
  node: C4Node;
  diagramLevel: C4Level;
}): React.JSX.Element | null {
  const childLevel = childLevelOf(diagramLevel);
  if (childLevel === null || !canDrillInto(node, true)) return null;

  const existing = hasChildDiagram(node);
  const childLabel = LEVEL_LABEL[childLevel].toLowerCase();

  return (
    <div className="mt-1 border-t border-border/60 pt-3">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => drillIntoNode(node.id)}
      >
        <Layers aria-hidden="true" />
        {existing ? `Open ${childLabel}s` : `Add ${childLabel}s inside`}
      </Button>
      {/* Said once, here, because it is the thing nobody guesses: the level
          below is reached THROUGH a node, never from the palette. */}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {existing
          ? `“${node.name}” already has a ${childLabel} diagram.`
          : `${childLabel === undefined ? "The next level" : `A ${childLabel}`} lives inside this ${diagramLevel === "context" ? "system" : "element"} — opening it creates the diagram one level down.`}
      </p>
    </div>
  );
}
