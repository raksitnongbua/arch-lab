"use client";

/**
 * Empty-selection inspector (AF-E3-S2's fallback): the active diagram's
 * `title` and `description`, plus the model's read-only `updatedAt`. Text
 * fields use the same one-undo-per-session semantics as node fields, through
 * `updateDiagram`'s `coalesceKey`.
 */

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { C4Diagram } from "@/types";

import { useEditorStore } from "../../state";
import { Field, InspectorSection } from "./field";
import { useInspectorField } from "./use-inspector-field";

const LEVEL_LABELS: Record<C4Diagram["level"], string> = {
  context: "Context",
  container: "Container",
  component: "Component",
  code: "Code",
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function DiagramInspector({
  diagram,
}: {
  diagram: C4Diagram;
}): React.JSX.Element {
  const updateDiagram = useEditorStore((s) => s.updateDiagram);
  const updatedAt = useEditorStore((s) => s.model.metadata.updatedAt);

  const keyBase = `inspector:diagram:${diagram.id}`;

  const titleField = useInspectorField({
    value: diagram.title,
    fieldKey: `${keyBase}:title`,
    commit: (next, coalesceKey) => {
      const trimmed = next.trim();
      if (trimmed === "") return; // a title is required — keep the previous one
      updateDiagram(diagram.id, { title: trimmed }, { coalesceKey });
    },
  });

  const descriptionField = useInspectorField({
    value: diagram.description ?? "",
    fieldKey: `${keyBase}:description`,
    commit: (next, coalesceKey) => {
      const trimmed = next.trim();
      updateDiagram(
        diagram.id,
        { description: trimmed === "" ? undefined : trimmed },
        { coalesceKey },
      );
    },
  });

  return (
    <InspectorSection title={`${LEVEL_LABELS[diagram.level]} diagram`}>
      <Field id="inspector-diagram-title" label="Title">
        <Input
          id="inspector-diagram-title"
          value={titleField.value}
          onFocus={titleField.onFocus}
          onChange={(event) => titleField.onChange(event.currentTarget.value)}
          onBlur={titleField.onBlur}
          onKeyDown={titleField.onKeyDown}
        />
      </Field>

      <Field id="inspector-diagram-description" label="Description">
        <Textarea
          id="inspector-diagram-description"
          rows={4}
          placeholder="What does this diagram show?"
          value={descriptionField.value}
          onFocus={descriptionField.onFocus}
          onChange={(event) =>
            descriptionField.onChange(event.currentTarget.value)
          }
          onBlur={descriptionField.onBlur}
          onKeyDown={(event) => {
            if (event.key === "Escape") descriptionField.onKeyDown(event);
          }}
        />
      </Field>

      <dl className="flex items-baseline justify-between gap-2 border-t border-border pt-3">
        <dt className="text-xs font-medium text-muted-foreground">
          Last updated
        </dt>
        <dd className="text-xs text-foreground">
          {formatTimestamp(updatedAt)}
        </dd>
      </dl>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Select a node or relationship on the canvas to edit its properties.
      </p>
    </InspectorSection>
  );
}
