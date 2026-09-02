"use client";

/**
 * The layout-direction control, beside the canvas lock.
 *
 * WHY IT LIVES HERE AND NOT IN THE VIEW-CONTROLS PILL. The pill at the
 * canvas's bottom right — zoom, fit, the minimap, mono — changes what the
 * READER sees and touches no file. This changes the document: it writes
 * `direction=` onto the diagram's own line, and the next person to open the
 * text sees it. Controls that edit belong with the padlock that governs
 * editing, and this one is only mounted when that padlock is open, so it
 * cannot be pressed on a shared link or in a locked canvas.
 *
 * WHY THREE STATES AND NOT A SWITCH. `tb` and `lr` are the two directions,
 * but the third — inherit — is the state most documents are actually in, and a
 * two-way switch would have no way to express it. Worse, it would have to
 * PICK one to show for a diagram that says nothing, which would mean the
 * control lies about the file until it is pressed, and pressing it to get back
 * to where you started would write a line you never had. So the state a
 * diagram is in is always one of the three showing, and `File` returns it to
 * the header's default by removing the attribute.
 *
 * The glyphs are the shapes, not letters: a column of bars for top-down, a row
 * for left-to-right, and the app's own document mark for inherit. A reader
 * reaches for this because the picture is the wrong shape, so the control
 * shows shapes.
 */

import type { C4LayoutDirection } from "@/types";

/** What one diagram's direction currently is, including "the file decides". */
export type DirectionChoice = C4LayoutDirection | "inherit";

const OPTIONS: readonly {
  value: DirectionChoice;
  label: string;
  title: string;
}[] = [
  {
    value: "inherit",
    label: "File",
    title:
      "Follow the file's own direction — removes this diagram's direction= attribute",
  },
  {
    value: "tb",
    label: "Top-down",
    title: "Lay this diagram out top to bottom — writes direction=tb",
  },
  {
    value: "lr",
    label: "Left-right",
    title:
      "Lay this diagram out left to right, folding a long flow into bands — writes direction=lr",
  },
];

function Glyph({ value }: { value: DirectionChoice }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 12 12",
    "aria-hidden": true as const,
    fill: "currentColor",
  };
  if (value === "tb") {
    return (
      <svg {...common}>
        <rect x="3" y="1" width="6" height="2.4" rx="0.6" />
        <rect x="3" y="4.8" width="6" height="2.4" rx="0.6" />
        <rect x="3" y="8.6" width="6" height="2.4" rx="0.6" />
      </svg>
    );
  }
  if (value === "lr") {
    return (
      <svg {...common}>
        <rect x="1" y="3" width="2.4" height="6" rx="0.6" />
        <rect x="4.8" y="3" width="2.4" height="6" rx="0.6" />
        <rect x="8.6" y="3" width="2.4" height="6" rx="0.6" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M3 1.6h4.2L9 3.4V10.4H3z" />
      <path d="M4.6 5.4h2.8M4.6 7.6h2.8" />
    </svg>
  );
}

export function LayoutDirectionToggle({
  current,
  onChange,
}: {
  /** The diagram's own setting — "inherit" when its line carries none. */
  current: DirectionChoice;
  onChange: (next: DirectionChoice) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Diagram layout direction"
      className="flex items-center gap-0.5 rounded-lg border border-border bg-card/90 p-0.5 shadow-sm backdrop-blur"
    >
      {OPTIONS.map((option) => {
        const active = option.value === current;
        return (
          <button
            key={option.value}
            type="button"
            /* `aria-pressed` rather than a radio group: three buttons that
               each apply immediately is what this is, and a radiogroup would
               promise arrow-key navigation between a set that is not a form
               field. */
            aria-pressed={active}
            title={option.title}
            onClick={() => {
              // Pressing the state you are already in is a no-op all the way
              // down — the gesture returns null for it — but not calling at
              // all keeps an announcement from being queued for nothing.
              if (!active) onChange(option.value);
            }}
            className={[
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            ].join(" ")}
          >
            <Glyph value={option.value} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
