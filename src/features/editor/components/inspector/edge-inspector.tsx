"use client";

/**
 * Single-edge inspector (AF-E3-S3): `label`, `technology`, `direction`
 * (`forward` | `bidirectional` | `none`) and `style` (`solid` | `dashed`).
 *
 * Text fields coalesce per editing session; the two selects are discrete —
 * one change, one undo entry. `style: "solid"` is the format default, so it
 * is written as an absent field (data-model.md omits unset optionals).
 */

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { C4Edge, C4Node, EdgeDirection, EdgeStyle } from "@/types";

import { useEditorStore } from "../../state";
import { Field, InspectorSection } from "./field";
import { TechnologyInput } from "./technology-input";
import { useInspectorField } from "./use-inspector-field";

const DIRECTION_LABELS: Record<EdgeDirection, string> = {
  forward: "Forward (source → target)",
  bidirectional: "Bidirectional (both ends)",
  none: "None (no arrowheads)",
};

const STYLE_LABELS: Record<EdgeStyle, string> = {
  solid: "Solid",
  dashed: "Dashed",
};

export function EdgeInspector({
  diagramId,
  edge,
  nodes,
}: {
  diagramId: string;
  edge: C4Edge;
  /** The active diagram's nodes, for the endpoint summary line. */
  nodes: readonly C4Node[];
}): React.JSX.Element {
  const updateEdge = useEditorStore((s) => s.updateEdge);

  const keyBase = `inspector:edge:${diagramId}:${edge.id}`;
  const sourceName =
    nodes.find((node) => node.id === edge.source)?.name ?? edge.source;
  const targetName =
    nodes.find((node) => node.id === edge.target)?.name ?? edge.target;

  const labelField = useInspectorField({
    value: edge.label ?? "",
    fieldKey: `${keyBase}:label`,
    commit: (next, coalesceKey) => {
      const trimmed = next.trim();
      updateEdge(
        diagramId,
        edge.id,
        { label: trimmed === "" ? undefined : trimmed },
        { coalesceKey },
      );
    },
  });

  return (
    <InspectorSection title="Relationship">
      <p className="text-xs text-muted-foreground">
        {sourceName} → {targetName}
      </p>

      <Field id="inspector-edge-label" label="Label">
        <Input
          id="inspector-edge-label"
          placeholder='e.g. "Reads customer data"'
          value={labelField.value}
          onFocus={labelField.onFocus}
          onChange={(event) => labelField.onChange(event.currentTarget.value)}
          onBlur={labelField.onBlur}
          onKeyDown={labelField.onKeyDown}
        />
      </Field>

      <TechnologyInput
        id="inspector-edge-technology"
        fieldKey={`${keyBase}:technology`}
        value={edge.technology ?? ""}
        placeholder='e.g. "gRPC", "HTTPS/JSON"'
        commit={(next, coalesceKey) => {
          const trimmed = next.trim();
          updateEdge(
            diagramId,
            edge.id,
            { technology: trimmed === "" ? undefined : trimmed },
            { coalesceKey },
          );
        }}
      />

      <Field id="inspector-edge-direction" label="Direction">
        <Select
          id="inspector-edge-direction"
          value={edge.direction}
          onChange={(event) =>
            updateEdge(diagramId, edge.id, {
              direction: event.currentTarget.value as EdgeDirection,
            })
          }
        >
          {(Object.keys(DIRECTION_LABELS) as EdgeDirection[]).map(
            (direction) => (
              <option key={direction} value={direction}>
                {DIRECTION_LABELS[direction]}
              </option>
            ),
          )}
        </Select>
      </Field>

      <Field id="inspector-edge-style" label="Style">
        <Select
          id="inspector-edge-style"
          value={edge.style ?? "solid"}
          onChange={(event) => {
            const next = event.currentTarget.value as EdgeStyle;
            // "solid" is the format default — store it as an absent field.
            updateEdge(diagramId, edge.id, {
              style: next === "solid" ? undefined : next,
            });
          }}
        >
          {(Object.keys(STYLE_LABELS) as EdgeStyle[]).map((style) => (
            <option key={style} value={style}>
              {STYLE_LABELS[style]}
            </option>
          ))}
        </Select>
      </Field>
    </InspectorSection>
  );
}
