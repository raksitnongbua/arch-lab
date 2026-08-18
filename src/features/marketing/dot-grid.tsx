"use client";

/**
 * DOT GRID — the home page's interactive ground.
 *
 * Adapted from React Bits' `DotGrid` (MIT, https://reactbits.dev). The physics
 * are theirs and unchanged in substance: dots the pointer sweeps past are thrown
 * with inertia proportional to pointer speed, a click sends a shockwave with
 * distance falloff, and everything returns on an elastic ease. What changed is
 * everything that would have made it wrong HERE, and each of those is worth
 * naming because none of them is a style preference:
 *
 *  1. COLOUR COMES FROM A CSS CUSTOM PROPERTY, not a hex prop. The upstream
 *     component takes `baseColor="#5227FF"` and parses it with a hex regex. This
 *     app has seven themes, every colour is an oklch token, and `check:themes`
 *     measures them — a hardcoded hex would be the one thing on the page that
 *     ignores the theme picker. Tokens are resolved through the canvas itself
 *     (see `resolveToRgb`), which is what lets an oklch token become the rgb
 *     triple the interpolation needs without this file reimplementing oklch.
 *
 *  2. IT OBEYS BOTH MOTION PREFERENCES — `prefers-reduced-motion` and the
 *     app-wide idle-motion toggle. Upstream has no notion of either. Ambient
 *     motion nobody asked for is exactly what that toggle governs, and when
 *     either says no this renders the STATIC field below instead of nothing:
 *     the dots are part of the design, only their motion is optional.
 *
 *  3. THE STATIC FIELD IS SERVER-RENDERED AND PIXEL-IDENTICAL. A client
 *     component's first paint has no canvas, so a canvas-only version flashes an
 *     empty background on every load. The CSS field underneath is two lines of
 *     `radial-gradient` at the same pitch, in the same token, at the same
 *     opacity — so when the canvas takes over there is nothing to see. That is
 *     also what a crawler and a no-JS reader get.
 *
 *  4. THE GRID IS ANCHORED TOP-LEFT, not centred. Upstream centres it in the
 *     wrapper with `extraX / 2`, which is right for a standalone hero. Here it
 *     has to land on the same lattice as the CSS `background-size` tile, and a
 *     background tile is anchored at the origin — centring put the canvas dots a
 *     few pixels off their static twins and the hand-off flickered.
 *
 *  5. THE LOOP STOPS. Upstream runs `requestAnimationFrame` forever, redrawing
 *     every dot of a still grid for as long as the tab is open. This one parks
 *     after the last dot settles and wakes on the next pointer event, because a
 *     decorative background is not worth a permanent frame budget.
 *
 *  6. POINTER EVENTS ARE GATED ON THE CANVAS RECT. Upstream binds `click` to
 *     `window`, so every click anywhere on the page — every link, every button —
 *     fires a shockwave in a background the reader may have scrolled past. The
 *     listeners still have to be on `window` (the canvas is
 *     `pointer-events: none`, which it must be, or it would eat every click on
 *     the page), so the gate is a bounds check instead.
 */

import { gsap } from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useIdleMotion, useReducedMotion } from "@/lib/idle-motion";
import { cn } from "@/lib/utils";

gsap.registerPlugin(InertiaPlugin);

interface Dot {
  cx: number;
  cy: number;
  xOffset: number;
  yOffset: number;
  /** Guards against re-throwing a dot that is already mid-flight. */
  inertiaApplied: boolean;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface DotGridProps {
  /** Diameter of one dot, in CSS pixels. */
  dotSize?: number;
  /** Centre-to-centre spacing, in CSS pixels. Must match the static field. */
  gap?: number;
  /** Custom property painting a dot at rest. */
  baseVar?: string;
  /** Custom property painting a dot under the pointer. */
  activeVar?: string;
  /** Radius within which dots take colour and can be thrown. */
  proximity?: number;
  /** Pointer speed, px/s, above which a sweep throws dots. */
  speedTrigger?: number;
  /** Radius of a click's shockwave. */
  shockRadius?: number;
  /** How hard a click pushes, before falloff. */
  shockStrength?: number;
  /** Ceiling on the speed fed to the inertia tween. */
  maxSpeed?: number;
  /** Inertia drag — higher settles sooner. See RESISTANCE below. */
  resistance?: number;
  /** Seconds for a thrown dot to ease back home. */
  returnDuration?: number;
  className?: string;
}

/**
 * How long the pointer sampler is allowed to run, in ms.
 *
 * Upstream throttles to 50ms. 24 is a little over one frame at 60Hz: the
 * sampler's whole job is to measure pointer VELOCITY, and at 20Hz a fast flick
 * across the hero is two samples, so the speed it computes is an average over
 * 100ms rather than the speed the hand was actually moving. Dots were being
 * thrown limply on gestures that felt sharp.
 */
const SAMPLE_MS = 24;

/**
 * WHY THE DEFAULT RESISTANCE IS 180 AND NOT UPSTREAM'S 750.
 *
 * `inertia: { xOffset: n }` sets an initial VELOCITY in units per second, not a
 * target offset — which upstream's `pushX` naming hides, and it matters because
 * the two read the same at a glance. Measured against gsap 3.15 (velocity in,
 * pixels travelled out):
 *
 *     velocity     r=100    r=200    r=400    r=620    r=750
 *          100    25.3px   13.5px    6.7px    5.4px    5.4px
 *          200    73.7px   50.5px   27.0px   17.4px   14.4px
 *          400   178.5px  147.4px  101.1px   69.4px   57.5px
 *
 * A pointer sweep hands this a velocity of roughly 10–140 (the dot's distance
 * from the pointer plus a fifth of a percent of pointer speed), so at 750 a dot
 * moves about five pixels: on a 28px lattice that is under a fifth of the pitch,
 * and behind a headline it cannot be seen at all. At 180 the same sweep moves a
 * dot about half a pitch — enough to read as displacement rather than as a
 * flicker, and short of the full pitch where dots visibly trade places and the
 * field stops looking like a lattice.
 */

/**
 * A CSS colour — any notation the browser parses, oklch included — as an rgb
 * triple, resolved BY the browser rather than by arithmetic here.
 *
 * The trick is that a canvas context normalises `fillStyle`: assign it any
 * parseable colour and read it back, and you get `#rrggbb`. So the oklch tokens
 * in `globals.css` convert without this file knowing what oklch is, which is the
 * only reason a themed canvas is not a second colour pipeline to keep in step
 * with `scripts/lib/oklch.mjs`.
 *
 * Returns null when the browser refuses the value — then the caller leaves the
 * static CSS field in place, since a canvas that cannot read the theme would
 * paint the wrong colour rather than no colour.
 */
function resolveToRgb(
  ctx: CanvasRenderingContext2D,
  element: Element,
  property: string,
): Rgb | null {
  const value = getComputedStyle(element).getPropertyValue(property).trim();
  if (value === "") return null;

  // A sentinel the browser cannot produce, so "unchanged" means "rejected".
  ctx.fillStyle = "#000000";
  ctx.fillStyle = value;
  const normalised = ctx.fillStyle;
  if (typeof normalised !== "string" || !normalised.startsWith("#"))
    return null;

  const hex =
    normalised.length === 4
      ? `#${normalised[1]}${normalised[1]}${normalised[2]}${normalised[2]}${normalised[3]}${normalised[3]}`
      : normalised;
  if (hex.length < 7) return null;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function DotGrid({
  dotSize = 2,
  gap = 26,
  baseVar = "--border",
  activeVar = "--primary",
  proximity = 130,
  speedTrigger = 100,
  shockRadius = 220,
  shockStrength = 4,
  maxSpeed = 5000,
  resistance = 180,
  /* Slower than upstream's 1.5. The return is the part a reader actually
     watches — the throw is over in a fifth of a second — and on `elastic.out` a
     longer settle reads as weight rather than as lag. */
  returnDuration = 2.2,
  className,
}: DotGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotsRef = useRef<Dot[]>([]);
  const pointerRef = useRef({
    x: -1e4,
    y: -1e4,
    inside: false,
    lastTime: 0,
    lastX: 0,
    lastY: 0,
  });
  const paletteRef = useRef<{ base: Rgb; active: Rgb } | null>(null);
  /** Bumped when the theme changes, to re-resolve the two tokens. */
  const [themeEpoch, setThemeEpoch] = useState(0);
  /** False until the canvas has read the theme and drawn once. */
  const [painting, setPainting] = useState(false);

  const reducedMotion = useReducedMotion();
  const idleMotion = useIdleMotion();
  const animated = !reducedMotion && idleMotion;

  /* The same lattice the static field below is tiled on: one dot per `pitch`,
     anchored at the origin. See note 4 in the header. */
  const pitch = dotSize + gap;

  const tile = useMemo(
    () => ({
      backgroundImage: `radial-gradient(circle at ${dotSize / 2}px ${dotSize / 2}px, var(${baseVar}) ${dotSize / 2}px, transparent 0)`,
      backgroundSize: `${pitch}px ${pitch}px`,
    }),
    [baseVar, dotSize, pitch],
  );

  const circlePath = useMemo(() => {
    if (typeof window === "undefined" || window.Path2D === undefined) {
      return null;
    }
    const path = new window.Path2D();
    path.arc(0, 0, dotSize / 2, 0, Math.PI * 2);
    return path;
  }, [dotSize]);

  const buildGrid = useCallback(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (wrapper === null || canvas === null) return;

    const { width, height } = wrapper.getBoundingClientRect();
    if (width === 0 || height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx !== null) {
      // setTransform, not scale: buildGrid runs again on every resize, and
      // `scale` compounds — the second call would draw at 4× on a retina
      // screen and the dots would walk off the canvas.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const dots: Dot[] = [];
    // `<= width` rather than `< width`, so the column that lands exactly on the
    // right edge is drawn: the static tile paints it, and a missing final
    // column is visible as a bare stripe at some viewport widths.
    for (let y = dotSize / 2; y <= height; y += pitch) {
      for (let x = dotSize / 2; x <= width; x += pitch) {
        dots.push({
          cx: x,
          cy: y,
          xOffset: 0,
          yOffset: 0,
          inertiaApplied: false,
        });
      }
    }
    dotsRef.current = dots;
  }, [dotSize, pitch]);

  /* ---- the palette, re-read whenever the theme changes ------------------- */

  useEffect(() => {
    if (!animated) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (canvas === null || ctx === null) return;

    const base = resolveToRgb(ctx, canvas, baseVar);
    const active = resolveToRgb(ctx, canvas, activeVar);
    if (base === null || active === null) {
      // Leave the static field showing rather than painting a guess.
      paletteRef.current = null;
      setPainting(false);
      return;
    }
    paletteRef.current = { base, active };
    setPainting(true);
  }, [activeVar, animated, baseVar, themeEpoch]);

  useEffect(() => {
    if (!animated) return;
    /* next-themes swaps a class on <html>, which changes what the tokens
       resolve to without firing any event a canvas would hear. */
    const observer = new MutationObserver(() => setThemeEpoch((n) => n + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, [animated]);

  /* ---- geometry ---------------------------------------------------------- */

  useEffect(() => {
    if (!animated) return;
    buildGrid();
    const wrapper = wrapperRef.current;
    if (wrapper === null) return;
    const observer = new ResizeObserver(buildGrid);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [animated, buildGrid]);

  /* ---- the draw loop, which parks itself --------------------------------- */

  /**
   * Restarts the loop. Reached through a ref rather than passed around because
   * the loop is RECURSIVE — `draw` schedules `draw` — and a self-referencing
   * `useCallback` is both a lint error here (`react-hooks/immutability`: a value
   * read before it is declared cannot see later changes to itself) and a real
   * hazard: the closure would capture the first `draw` forever and keep drawing
   * with a stale palette after a theme swap. Defining the whole loop inside one
   * effect and publishing only the wake-up handle keeps a single live copy.
   */
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!animated || !painting || circlePath === null) return;

    let frame = 0;
    let running = false;
    const proxSq = proximity * proximity;

    const draw = () => {
      const canvas = canvasRef.current;
      const palette = paletteRef.current;
      const ctx = canvas?.getContext("2d") ?? null;
      if (canvas === null || ctx === null || palette === null) {
        running = false;
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const pointer = pointerRef.current;
      let moving = false;

      for (const dot of dotsRef.current) {
        const dx = dot.cx - pointer.x;
        const dy = dot.cy - pointer.y;
        const dsq = dx * dx + dy * dy;

        let fill = `rgb(${palette.base.r},${palette.base.g},${palette.base.b})`;
        if (pointer.inside && dsq <= proxSq) {
          /* Colour is keyed to the dot's HOME, not its thrown position: a dot
             flung out of the lit circle keeps the tint it was lit with until it
             settles, instead of flickering back to base mid-flight. */
          const t = 1 - Math.sqrt(dsq) / proximity;
          const mix = (from: number, to: number) =>
            Math.round(from + (to - from) * t);
          fill = `rgb(${mix(palette.base.r, palette.active.r)},${mix(palette.base.g, palette.active.g)},${mix(palette.base.b, palette.active.b)})`;
          moving = true;
        }
        if (dot.xOffset !== 0 || dot.yOffset !== 0) moving = true;

        ctx.save();
        ctx.translate(dot.cx + dot.xOffset, dot.cy + dot.yOffset);
        ctx.fillStyle = fill;
        ctx.fill(circlePath);
        ctx.restore();
      }

      /* PARKED, not cleared: the last frame stays on the canvas, and that frame
         is a complete grid of dots at rest — the same picture the static field
         shows. So there is nothing to redraw until something moves again, and
         stopping costs the reader nothing. */
      if (!moving) {
        running = false;
        return;
      }
      frame = requestAnimationFrame(draw);
    };

    const wake = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(draw);
    };
    wakeRef.current = wake;

    /* One frame straight away, so the canvas carries a full grid before the
       pointer ever arrives — otherwise the hand-off from the static field is a
       blank flash. */
    wake();

    return () => {
      cancelAnimationFrame(frame);
      running = false;
      wakeRef.current = () => {};
    };
  }, [animated, circlePath, painting, proximity]);

  /* ---- the pointer ------------------------------------------------------- */

  useEffect(() => {
    if (!animated || !painting) return;

    /** Throws one dot, on whichever impulse asked. */
    const push = (dot: Dot, pushX: number, pushY: number) => {
      dot.inertiaApplied = true;
      gsap.killTweensOf(dot);
      gsap.to(dot, {
        inertia: { xOffset: pushX, yOffset: pushY, resistance },
        onComplete: () => {
          gsap.to(dot, {
            xOffset: 0,
            yOffset: 0,
            duration: returnDuration,
            ease: "elastic.out(1,0.75)",
            onUpdate: () => wakeRef.current(),
          });
          dot.inertiaApplied = false;
        },
        onUpdate: () => wakeRef.current(),
      });
    };

    let lastSample = 0;

    const onMove = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      const now = performance.now();
      if (now - lastSample < SAMPLE_MS) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const pointer = pointerRef.current;

      /* THE GATE. The listener is on `window` because the canvas cannot receive
         events, so "is the pointer even over the dots" has to be asked here —
         see note 6. Leaving the box also has to be handled, or the last dots to
         be lit stay lit for as long as the tab is open. */
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      if (!inside) {
        if (pointer.inside) {
          pointer.inside = false;
          pointer.x = -1e4;
          pointer.y = -1e4;
          wakeRef.current();
        }
        pointer.lastTime = 0;
        return;
      }

      const dt = pointer.lastTime === 0 ? 16 : now - pointer.lastTime;
      let vx = ((x - pointer.lastX) / dt) * 1000;
      let vy = ((y - pointer.lastY) / dt) * 1000;
      let speed = Math.hypot(vx, vy);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        vx *= scale;
        vy *= scale;
        speed = maxSpeed;
      }

      lastSample = now;
      pointer.lastTime = now;
      pointer.lastX = x;
      pointer.lastY = y;
      pointer.x = x;
      pointer.y = y;
      pointer.inside = true;

      if (speed > speedTrigger) {
        for (const dot of dotsRef.current) {
          if (dot.inertiaApplied) continue;
          if (Math.hypot(dot.cx - x, dot.cy - y) >= proximity) continue;
          push(dot, dot.cx - x + vx * 0.005, dot.cy - y + vy * 0.005);
        }
      }
      wakeRef.current();
    };

    const onDown = (event: PointerEvent) => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

      for (const dot of dotsRef.current) {
        if (dot.inertiaApplied) continue;
        const distance = Math.hypot(dot.cx - x, dot.cy - y);
        if (distance >= shockRadius) continue;
        const falloff = 1 - distance / shockRadius;
        push(
          dot,
          (dot.cx - x) * shockStrength * falloff,
          (dot.cy - y) * shockStrength * falloff,
        );
      }
      wakeRef.current();
    };

    /* `pointer*`, not `mouse*`: a touch drag should ripple the field too, and
       pointer events are the one family that covers both without a second
       listener. Passive — nothing here calls preventDefault, and saying so
       keeps the sampler off the scroll path. */
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      for (const dot of dotsRef.current) gsap.killTweensOf(dot);
    };
  }, [
    animated,
    maxSpeed,
    painting,
    proximity,
    resistance,
    returnDuration,
    shockRadius,
    shockStrength,
    speedTrigger,
  ]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className={cn("pointer-events-none relative", className)}
    >
      {/* The static field: server-rendered, no JS, pixel-identical to what the
          canvas paints at rest. Hidden the moment the canvas has read the theme
          and put a frame up — see note 3. */}
      <div
        className="absolute inset-0"
        style={{ ...tile, opacity: painting ? 0 : undefined }}
      />
      {animated ? (
        <canvas
          ref={canvasRef}
          /* `pointer-events: none` is load-bearing, not tidiness: this layer
             covers the hero, and a canvas that took clicks would swallow every
             one meant for the copy and the call to action underneath it. */
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      ) : null}
    </div>
  );
}
