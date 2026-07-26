"use client";

/**
 * `tags` editor (AF-E3-S2). Chips with per-chip remove buttons plus a text
 * input: Enter or comma adds, Backspace in an empty input removes the last
 * tag. Adds and removes are discrete actions, so each is its own undo entry
 * (no coalescing). Tags are deduplicated and kept sorted lexically — the
 * order the serializer writes (data-model.md).
 */

import { useState } from "react";
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";

import { Field } from "./field";

export function TagInput({
  id,
  tags,
  commit,
}: {
  id: string;
  /** Committed tags from the store (empty array when unset). */
  tags: readonly string[];
  /** Write the new set; `undefined` clears the optional field entirely. */
  commit: (next: string[] | undefined) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const tag = raw.trim();
    if (tag === "") return;
    if (tags.includes(tag)) {
      setDraft("");
      return;
    }
    commit([...tags, tag].sort());
    setDraft("");
  };

  const remove = (tag: string) => {
    const next = tags.filter((t) => t !== tag);
    commit(next.length > 0 ? next : undefined);
  };

  return (
    <Field id={id} label="Tags">
      <div className="flex flex-col gap-1.5">
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label="Current tags">
            {tags.map((tag) => (
              <li
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {tag}
                <button
                  type="button"
                  aria-label={`Remove tag ${tag}`}
                  className="rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => remove(tag)}
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Input
          id={id}
          value={draft}
          placeholder="Add a tag…"
          autoComplete="off"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(draft);
              return;
            }
            if (event.key === "Backspace" && draft === "" && tags.length > 0) {
              event.preventDefault();
              const last = tags[tags.length - 1];
              if (last !== undefined) remove(last);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft("");
              event.currentTarget.blur();
            }
          }}
          onBlur={() => add(draft)}
        />
      </div>
    </Field>
  );
}
