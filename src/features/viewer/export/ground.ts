"use client";

/**
 * THE GROUND, IN AN EXPORTED FILE — the sheet the drawing was read on, carried
 * into the download.
 *
 * THIS REVERSES A DECISION THIS BRANCH RECORDED, and the reversal is written
 * down rather than edited in quietly. The ground used to be kept OUT of every
 * export, on the argument that it is screen chrome — "it says where a drawing
 * is being read, not what it means", and "an export is the drawing lifted off
 * the sheet and set down on a slide".
 *
 * WHAT CHANGED THE DECISION: a `blueprint` that exports without its ruling is
 * not a blueprint, and a `paper` export without its grain is not paper. The
 * whole point of the theme work is that the sheet is part of how a diagram
 * READS — `purpose.md` calls presentation the product — so an export that drops
 * it is an export that does not look like what the author saw. The old
 * argument proves too much: `--canvas` is already in every exported file by the
 * same reasoning it would have excluded, and nobody thinks the ground colour is
 * chrome.
 *
 * TWO DIFFERENCES FROM THE SCREEN, both forced by the medium rather than
 * chosen:
 *
 *   1. **AN EXPORT HAS NO CAMERA.** So the rule layer takes whatever single
 *      rung the document's own scale selects — every exporter writes its
 *      drawing 1:1, so that is `groundLevels(1)`. No cross-fade and no second
 *      level, unless the document's scale genuinely puts two in the band. The
 *      ladder is not disabled here; it is evaluated once instead of per frame.
 *   2. **THE GRAIN IS ONE FULL-BLEED FILTERED RECT, NOT A TILE.** On screen it
 *      is a 120px tile because the cost is paid every frame and `stitchTiles`
 *      is what makes tiling invisible. An export is rasterised once, so the
 *      tile buys nothing and costs a `<pattern>` wrapped around a `<filter>` —
 *      the most demanding shape to hand a rasteriser. `baseFrequency` is per
 *      USER UNIT, so the grain comes out at exactly the same scale either way.
 *
 *   3. **THE FROST IS A SPLIT, NOT A BACKDROP.** On screen the diagram area's
 *      frost is a `<div>` whose `backdrop-filter` blurs whatever the pane
 *      painted behind it. A file has no backdrop and no CSS box, so
 *      {@link frostedGroundMarkup} reaches the same picture from the other
 *      side: it emits these layers TWICE, disjointly — once clipped to
 *      everything outside the surface box and left crisp, once clipped to the
 *      inside of it and run through `<feGaussianBlur>`. Same layers, same σ,
 *      and for the one theme that asks for a frost the agreement is exact,
 *      because that theme has no material layer for the two mechanisms to
 *      diverge on.
 *
 * THE FILTER PRIMITIVES ARE LIFTED FROM THE THEME'S OWN DATA URI rather than
 * restated here. `--canvas-sheet-grain` is a `url("data:image/svg+xml,…")`
 * holding the very `<feTurbulence>` chain the screen paints, so this decodes it
 * and re-wraps it — which means `globals.css` stays the single definition and
 * there is no TypeScript/CSS pair to drift. The contract it relies on is that
 * the chain's last primitive is named `result='grain'`; `check:canvas-grid`
 * asserts every theme's URI declares it.
 */

import {
  GROUND_SHEEN,
  groundLevels,
  type GroundLevel,
} from "@/lib/canvas-ground";
import { DIAGRAM_SURFACE_RADIUS } from "@/lib/diagram-surface";

/** Everything an exporter needs to paint the ground it was read on. */
export interface ExportGround {
  /** Markup for the file's `<defs>`. Empty when the theme grounds nothing. */
  defs: string;
  /**
   * Full-bleed layers, painted directly after the `--canvas` backdrop and
   * before any of the drawing. Empty when the theme grounds nothing.
   */
  layers: (x: number, y: number, width: number, height: number) => string;
}

const EMPTY: ExportGround = { defs: "", layers: () => "" };

const isPaint = (value: string): boolean =>
  value !== "" &&
  value !== "transparent" &&
  !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(value);

/** A custom property's used value, forced through a probe so `var()` resolves. */
function usedColour(styles: CSSStyleDeclaration, variable: string): string {
  const raw = styles.getPropertyValue(variable).trim();
  if (raw === "" || raw === "transparent") return "";
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${variable})`;
  document.body.append(probe);
  try {
    return getComputedStyle(probe).color;
  } finally {
    probe.remove();
  }
}

/** The `<filter>` body out of a grain data URI, or null if there is no grain. */
function grainPrimitives(value: string): string | null {
  const uri = /url\(\s*["']?(data:image\/svg\+xml,[^"')]*)["']?\s*\)/.exec(
    value,
  )?.[1];
  if (uri === undefined) return null;
  let markup: string;
  try {
    markup = decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
  } catch {
    /* A grain we cannot decode is a grain we must not half-emit: a filter with
       a dangling `in2` paints black over the whole drawing. */
    return null;
  }
  const body = /<filter[^>]*>([\s\S]*?)<\/filter>/.exec(markup)?.[1];
  if (body === undefined || !body.includes("result='grain'")) return null;
  return body;
}

const escapeAttr = (value: string): string => value.replaceAll('"', "&quot;");

/**
 * Read the active theme's ground, once, at export time.
 *
 * Returns {@link EMPTY} for the four themes that ground nothing, and away from
 * a browser — every caller concatenates the result, so "no ground" costs a pair
 * of empty strings rather than a branch at nine call sites.
 */
export function resolveExportGround(): ExportGround {
  if (typeof document === "undefined") return EMPTY;
  const styles = getComputedStyle(document.documentElement);

  const defs: string[] = [];
  const layerParts: ((x: number, y: number, w: number, h: number) => string)[] =
    [];

  /* ---- the rule layer: one rung, in the drawing's own units ------------- */
  const dot = usedColour(styles, "--canvas-rule-dot");
  const line = usedColour(styles, "--canvas-rule-line");
  const levels: GroundLevel[] = groundLevels(1);
  for (const level of levels) {
    const pitch = level.worldPitch;
    if (isPaint(dot)) {
      const id = `af-ground-dots-${level.index}`;
      defs.push(
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${pitch}" height="${pitch}">` +
          `<circle cx="0" cy="0" r="${level.dotSizePx / 2}" fill="${escapeAttr(dot)}"/>` +
          `</pattern>`,
      );
      layerParts.push(
        (x, y, w, h) =>
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id})" opacity="${level.opacity.toFixed(4)}"/>`,
      );
    }
    if (isPaint(line)) {
      const id = `af-ground-lines-${level.index}`;
      defs.push(
        `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${pitch}" height="${pitch}">` +
          `<path d="M ${pitch} 0 L 0 0 L 0 ${pitch}" fill="none" ` +
          `stroke="${escapeAttr(line)}" stroke-width="${level.lineWidthPx}"/>` +
          `</pattern>`,
      );
      layerParts.push(
        (x, y, w, h) =>
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id})" opacity="${level.opacity.toFixed(4)}"/>`,
      );
    }
  }

  /* ---- the material layer: the sheet itself ---------------------------- */
  const ink = usedColour(styles, "--canvas-sheet-ink");
  const grain = grainPrimitives(
    styles.getPropertyValue("--canvas-sheet-grain"),
  );
  const sheetOpacity = Number(
    styles.getPropertyValue("--canvas-sheet-opacity"),
  );
  if (grain !== null && isPaint(ink) && sheetOpacity > 0) {
    /* The filter region is stated in absolute percentages of the rect it is
       applied to. Left to its default (-10% .. 120%) the grain would be
       generated over a larger box than it is painted on, which shifts the noise
       relative to the drawing between screen and file for no gain. */
    defs.push(
      `<filter id="af-ground-grain" x="0" y="0" width="100%" height="100%">` +
        grain +
        `<feFlood flood-color="${escapeAttr(ink)}" result="ink"/>` +
        `<feComposite in="ink" in2="grain" operator="in"/>` +
        `</filter>`,
    );
    layerParts.push(
      (x, y, w, h) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" ` +
        `filter="url(#af-ground-grain)" opacity="${sheetOpacity}"/>`,
    );
  }

  /* The sheen is a single band rather than a field, so it is a gradient rather
     than a tile. Its numbers live in `lib/canvas-ground.ts` and `globals.css`
     spells the same ones into a CSS gradient — the one TypeScript/CSS pair this
     feature has, and `check:canvas-grid` pins it. */
  const band = styles.getPropertyValue("--canvas-sheet-band").trim();
  if (band !== "" && band !== "none" && isPaint(ink)) {
    /* CSS gradient angles run clockwise from "to top"; SVG's x1/y1→x2/y2 is a
       vector. 115deg is therefore this unit vector, written out rather than
       trigonometry at export time. */
    const radians = ((GROUND_SHEEN.angleDeg - 90) * Math.PI) / 180;
    const dx = Math.cos(radians) / 2;
    const dy = Math.sin(radians) / 2;
    defs.push(
      `<linearGradient id="af-ground-sheen" x1="${(0.5 - dx).toFixed(4)}" y1="${(0.5 + dy).toFixed(4)}" ` +
        `x2="${(0.5 + dx).toFixed(4)}" y2="${(0.5 - dy).toFixed(4)}">` +
        `<stop offset="${GROUND_SHEEN.from}" stop-color="${escapeAttr(ink)}" stop-opacity="0"/>` +
        `<stop offset="0.5" stop-color="${escapeAttr(ink)}" stop-opacity="${GROUND_SHEEN.peak}"/>` +
        `<stop offset="${GROUND_SHEEN.to}" stop-color="${escapeAttr(ink)}" stop-opacity="0"/>` +
        `</linearGradient>`,
    );
    layerParts.push(
      (x, y, w, h) =>
        `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#af-ground-sheen)"/>`,
    );
  }

  if (defs.length === 0) return EMPTY;
  return {
    defs: defs.join(""),
    layers: (x, y, w, h) => layerParts.map((part) => part(x, y, w, h)).join(""),
  };
}

/**
 * The ground, split around a frosted diagram surface — or emitted exactly as it
 * always was, when no frost was asked for.
 *
 * AT `blur <= 0` THIS IS THE IDENTITY. It returns `ground.defs` untouched and
 * the single full-bleed `ground.layers(0, 0, width, height)` call the three
 * surface exporters made before the frost existed, byte for byte: no clip, no
 * filter, no empty apparatus. Eight of the nine themes resolve
 * `--diagram-surface-blur` to 0 and their downloads must not change a byte the
 * day a ninth opts in — the same emit-nothing-at-zero contract the wash and the
 * role textures carry, living HERE, once, rather than as a branch each exporter
 * remembers to write.
 *
 * THREE DETAILS OF THE SPLIT ARE LOAD-BEARING, and each of them is a way to get
 * a visibly wrong file:
 *
 *   - **The clip sits on a `<g>` OUTSIDE the filtered one.** Clipping before
 *     filtering starves the blur of samples at the boundary, and a Gaussian
 *     with nothing to average at its edge darkens: the surface would come out
 *     ringed by a vignette. Clipping after lets the blur read the full-bleed
 *     ground and then cuts a crisp edge exactly on the surface rect — where the
 *     surface's own 1px rule already draws a line, so the construction adds no
 *     edge the picture did not have.
 *   - **The filter region is `userSpaceOnUse`, expanded by 3σ.** The default
 *     region is percentages of the object's bounding box, which is the geometry
 *     `new-diagram-type.md` bans filters on connectors over. Stating it in user
 *     units is also what makes "the region is wide enough for the blur it
 *     carries" a thing `check:canvas-grid` can measure rather than trust.
 *   - **The outside piece is an even-odd path, not two rects.** A hole in a
 *     clip has to be a second subpath under `clip-rule="evenodd"`; two `<rect>`
 *     children of a `<clipPath>` union instead of subtract, which would clip
 *     nothing at all and paint the crisp ground straight through the frost.
 *
 * AND IT IS STILL NOT A HOLE. Nothing is knocked out: the ground's ink is
 * painted over every pixel of the file and the inside piece is merely low-pass
 * filtered. `lib/diagram-surface.ts` argues the point in full and
 * `check:canvas-grid` holds the residual above the visibility floor with
 * arithmetic, so "the ruling still runs through the area" stays a measurement
 * rather than a claim.
 */
export function frostedGroundMarkup({
  ground,
  box,
  blur,
  width,
  height,
}: {
  ground: ExportGround;
  /** The surface's box in the FILE's coordinates — `diagramSurfaceBox`. */
  box: { x: number; y: number; width: number; height: number };
  /** σ in user units, from `theme.diagramSurface.blur`. 0 disables the split. */
  blur: number;
  /** The file's own size; the ground is full-bleed over it. */
  width: number;
  height: number;
}): { defs: string; layers: string } {
  const crisp = {
    defs: ground.defs,
    layers: ground.layers(0, 0, width, height),
  };
  /* A theme that grounds nothing has nothing to frost, and a frost apparatus
     over an empty ground is a `<defs>` full of clips that clip nothing. */
  if (!(blur > 0) || ground.defs === "") return crisp;

  const margin = blur * 3;
  const outside =
    `M0 0 H${width} V${height} H0 Z ` +
    `M${box.x} ${box.y} h${box.width} v${box.height} h${-box.width} Z`;
  const defs =
    ground.defs +
    `<clipPath id="af-frost-out">` +
    `<path clip-rule="evenodd" fill-rule="evenodd" d="${outside}"/>` +
    `</clipPath>` +
    `<clipPath id="af-frost-in">` +
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" ` +
    `height="${box.height}" rx="${DIAGRAM_SURFACE_RADIUS}"/>` +
    `</clipPath>` +
    `<filter id="af-frost-blur" filterUnits="userSpaceOnUse" ` +
    `x="${box.x - margin}" y="${box.y - margin}" ` +
    `width="${box.width + margin * 2}" height="${box.height + margin * 2}">` +
    `<feGaussianBlur stdDeviation="${blur}"/>` +
    `</filter>`;
  const layers =
    `<g clip-path="url(#af-frost-out)">${crisp.layers}</g>` +
    `<g clip-path="url(#af-frost-in)">` +
    `<g filter="url(#af-frost-blur)">${crisp.layers}</g>` +
    `</g>`;
  return { defs, layers };
}
