"use client";

/**
 * The dot field's tuning panel.
 *
 * A TOOL, NOT A FEATURE, and the gating is what keeps that true. It renders only
 * when the URL carries `?dots`, and `dot-grid-studio-gate.tsx` imports it
 * dynamically, so a visitor to the home page never downloads a byte of it. That
 * is the whole reason it is a separate module from the gate and from the field.
 *
 * WHAT IT IS FOR: finding values. Nothing it changes is persisted — a reload is a
 * reset — and the way a setting gets kept is the copy button, which emits the
 * `DOT_GRID_DEFAULTS` literal to paste into `dot-grid-config.ts`. A panel that
 * saved to localStorage would be a user-facing setting for a decorative
 * background, which is a thing nobody wants to configure and everybody would
 * then have to have a migration for.
 *
 * WHY NO COLOUR PICKER, when the component this is adapted from has two: a hex is
 * a colour for one theme, and there are seven here. The two colour controls pick
 * from `DOT_GRID_TOKENS` instead, so a choice made while looking at the dark
 * theme still means something in `paper` — and switching theme with the panel
 * open re-resolves the canvas, which is a useful thing to be able to watch.
 *
 * Deliberately NOT `aria-hidden` and deliberately keyboard-operable, unlike the
 * field it drives: the field is decoration, but this is a control surface, and a
 * range input that cannot be reached by tab is a broken control even in a
 * developer tool.
 */

import { Check, Copy, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  DOT_GRID_DEFAULTS,
  DOT_GRID_TOKENS,
  dotGridAsSource,
  resetDotGrid,
  setDotGridValue,
  useDotGridConfig,
  type DotGridConfig,
} from "./dot-grid-config";

/**
 * One slider's range and step.
 *
 * THE PITCH IS NOT TUNABLE HERE, which is why `gap` has the range it does:
 * `dotSize + gap` has to stay 28 so the canvas lattice and the CSS tile beneath
 * it coincide, and `check:dot-grid` asserts that. So `dotSize` is the only size
 * control and the panel keeps `gap` in step with it automatically — offering two
 * independent sliders would let anyone break the invariant in one drag and see
 * the static field and the canvas separate by a few pixels.
 */
const RANGES: Record<
  Exclude<keyof DotGridConfig, "baseVar" | "activeVar" | "gap">,
  { min: number; max: number; step: number; label: string; hint?: string }
> = {
  dotSize: {
    min: 1,
    max: 6,
    step: 0.5,
    label: "Dot size",
    hint: "gap follows, to hold the 28px pitch",
  },
  proximity: { min: 40, max: 320, step: 10, label: "Proximity" },
  speedTrigger: {
    min: 20,
    max: 600,
    step: 20,
    label: "Speed trigger",
    hint: "px/s before a sweep throws",
  },
  shockRadius: { min: 60, max: 480, step: 10, label: "Shock radius" },
  shockStrength: { min: 1, max: 12, step: 0.5, label: "Shock strength" },
  maxSpeed: { min: 1000, max: 10000, step: 500, label: "Max speed" },
  resistance: {
    min: 40,
    max: 900,
    step: 20,
    label: "Resistance",
    hint: "lower travels further",
  },
  returnDuration: {
    min: 0.4,
    max: 5,
    step: 0.1,
    label: "Return duration",
    hint: "seconds",
  },
};

const PITCH = DOT_GRID_DEFAULTS.dotSize + DOT_GRID_DEFAULTS.gap;

export function DotGridStudio() {
  const config = useDotGridConfig();
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClasses({
          variant: "outline",
          size: "sm",
          className: "fixed bottom-4 left-4 z-50",
        })}
      >
        Dot studio
      </button>
    );
  }

  const copy = () => {
    void navigator.clipboard.writeText(dotGridAsSource(config)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <aside
      aria-label="Dot field studio"
      className="af-glass fixed bottom-4 left-4 z-50 max-h-[80vh] w-[22rem] overflow-y-auto rounded-xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur-xl"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground">
            Dot field studio
          </h2>
          {/* Says out loud that this is not a setting, because a panel of
              sliders looks exactly like one. */}
          <p className="text-[11px] leading-tight text-muted-foreground">
            Not saved — copy the values into{" "}
            <code className="font-mono">dot-grid-config.ts</code>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close the studio"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <Tokens
          label="At rest"
          value={config.baseVar}
          onChange={(value) => setDotGridValue("baseVar", value)}
        />
        <Tokens
          label="Under the pointer"
          value={config.activeVar}
          onChange={(value) => setDotGridValue("activeVar", value)}
        />

        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((key) => (
          <Slider
            key={key}
            id={key}
            value={config[key]}
            range={RANGES[key]}
            onChange={(value) => {
              setDotGridValue(key, value);
              /* The pitch invariant, maintained here rather than trusted: the
                 lattice must stay 28px or the canvas separates from the static
                 field it hands over from. */
              if (key === "dotSize") setDotGridValue("gap", PITCH - value);
            }}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3">
        <button
          type="button"
          onClick={copy}
          className={buttonClasses({ size: "sm", className: "gap-1.5" })}
        >
          {copied ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <Copy aria-hidden="true" className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy defaults"}
        </button>
        <button
          type="button"
          onClick={resetDotGrid}
          className={buttonClasses({
            variant: "outline",
            size: "sm",
            className: "gap-1.5",
          })}
        >
          <RotateCcw aria-hidden="true" className="size-3.5" />
          Reset
        </button>
      </div>
    </aside>
  );
}

function Tokens({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        {/* A live swatch, painted by the token itself rather than by a resolved
            value — so it is right in every theme for free, and it is also the
            fastest way to see that a token exists at all. */}
        <span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: `var(${value})` }}
        />
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {DOT_GRID_TOKENS.map((token) => (
            <option key={token} value={token}>
              {token}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

function Slider({
  id,
  value,
  range,
  onChange,
}: {
  id: string;
  value: number;
  range: {
    min: number;
    max: number;
    step: number;
    label: string;
    hint?: string;
  };
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={`dot-${id}`}
        className="flex items-baseline justify-between gap-2 text-xs"
      >
        <span className="text-muted-foreground">
          {range.label}
          {range.hint === undefined ? null : (
            <span className="ml-1.5 text-[10px] text-muted-foreground/70">
              {range.hint}
            </span>
          )}
        </span>
        <span className="font-mono text-[11px] text-foreground tabular-nums">
          {value}
        </span>
      </label>
      <input
        id={`dot-${id}`}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-secondary",
          "[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
          "[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      />
    </div>
  );
}
