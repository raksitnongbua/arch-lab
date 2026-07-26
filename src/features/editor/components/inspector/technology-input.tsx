"use client";

/**
 * `technology` free-text field with autocomplete from the icon registry
 * (AF-E3-S2): typing "post" suggests "PostgreSQL". Selecting a suggestion
 * only sets the text — it NEVER touches the node's icon (an explicitly chosen
 * icon must survive, AF-E4-S3 is out of scope this sprint).
 *
 * Editing semantics come from `useInspectorField`: one undo entry per
 * focus→blur session, debounced live commits in between.
 */

import { useCallback, useId, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { searchIcons } from "../../lib/icons/registry";
import { useInspectorField } from "./use-inspector-field";
import { Field } from "./field";

const MAX_SUGGESTIONS = 6;

export function TechnologyInput({
  id,
  label = "Technology",
  fieldKey,
  value,
  placeholder,
  commit,
}: {
  id: string;
  label?: string;
  /** Field identity for session coalescing, e.g. `node:<d>:<n>:technology`. */
  fieldKey: string;
  /** Committed value from the store ("" when unset). */
  value: string;
  placeholder?: string;
  /** Write the value; "" should clear the optional field. */
  commit: (next: string, coalesceKey: string) => void;
}): React.JSX.Element {
  const field = useInspectorField({ value, fieldKey, commit });
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  const suggestions = useMemo(() => {
    if (!field.isEditing || field.value.trim() === "") return [];
    return searchIcons(field.value).slice(0, MAX_SUGGESTIONS);
  }, [field.isEditing, field.value]);

  const showList = listOpen && suggestions.length > 0;

  const pick = useCallback(
    (name: string) => {
      field.onChange(name); // debounced commit under the session key
      setListOpen(false);
      setActiveIndex(-1);
    },
    [field],
  );

  return (
    <Field id={id} label={label}>
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listboxId : undefined}
          aria-activedescendant={
            showList && activeIndex >= 0
              ? `${listboxId}-${activeIndex}`
              : undefined
          }
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={placeholder}
          value={field.value}
          onFocus={field.onFocus}
          onChange={(event) => {
            field.onChange(event.currentTarget.value);
            setListOpen(true);
            setActiveIndex(-1);
          }}
          onBlur={() => {
            setListOpen(false);
            setActiveIndex(-1);
            field.onBlur();
          }}
          onKeyDown={(event) => {
            if (showList) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((i) => (i + 1) % suggestions.length);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex(
                  (i) => (i - 1 + suggestions.length) % suggestions.length,
                );
                return;
              }
              if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                const active = suggestions[activeIndex];
                if (active !== undefined) pick(active.name);
                return;
              }
              if (event.key === "Escape") {
                // First Escape only closes the list; a second one reverts.
                event.preventDefault();
                setListOpen(false);
                setActiveIndex(-1);
                return;
              }
            }
            field.onKeyDown(event);
          }}
        />
        {showList ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label={`${label} suggestions`}
            className="absolute top-full right-0 left-0 z-30 mt-1 overflow-hidden rounded-md border border-border bg-popover py-1 text-sm text-popover-foreground shadow-md"
          >
            {suggestions.map((icon, index) => (
              <li
                key={icon.slug}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "cursor-pointer px-3 py-1.5",
                  index === activeIndex
                    ? "bg-secondary text-foreground"
                    : "hover:bg-secondary/60",
                )}
                // Mousedown, not click: keep focus in the input so the blur
                // commit still belongs to this editing session.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(icon.name);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {icon.name}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
