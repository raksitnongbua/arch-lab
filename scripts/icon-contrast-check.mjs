#!/usr/bin/env node
/**
 * Every icon, RENDERED, on both themes — the only test that catches the
 * failure this feature kept shipping.
 *
 * Three separate bugs reached the branch because the artwork was perfectly
 * well-formed and simply could not be SEEN:
 *
 *   1. Five overlay logos (php, rust, golang, mysql, grpc) are white ink,
 *      drawn for a dark background. Invisible on a light canvas.
 *   2. Spring Boot, Spark, Celery, Istio and Temporal leave most paths
 *      unfilled, so they fell back to the SVG default of BLACK. Invisible on
 *      a dark canvas.
 *   3. GitHub, Sentry, Kafka and Heroku are near-black brand colours.
 *      Invisible on a dark canvas.
 *
 * None of that is malformed markup, so no parser, type or build could object,
 * and a source-reading check cannot decide it either: whether a mark is
 * visible depends on how its paths, fills, gradients and inherited colours
 * COMPOSE, which is what a renderer is for. Regex attempts at this produced
 * both false negatives (gradient-painted marks read as inkless) and false
 * positives (Next.js and Python called invisible). So this script rasterises
 * each mark at 48px on a light and a dark canvas, decodes the PNG, and counts
 * the pixels whose luminance clearly separates from the background.
 *
 * Requires `rsvg-convert` (librsvg). Where it is unavailable the script says
 * so and exits 0 rather than passing silently on nothing.
 *
 * Exits non-zero on any failure. Run with: pnpm check:icon-contrast
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";

const WORK = mkdtempSync(path.join(tmpdir(), "af-icon-contrast-"));

/** Under this share of the box standing out from the canvas, a mark is not visible. */
const MIN_COVERAGE = 0.02;
/** Luminance gap (0-255) at which a pixel reads as "not the background". */
const MIN_SEPARATION = 40;

try {
  execFileSync("rsvg-convert", ["--version"], { stdio: "ignore" });
} catch {
  console.log("rsvg-convert not installed — skipping the rendered icon check.");
  console.log("Install librsvg to run it (brew install librsvg).");
  process.exit(0);
}

/** Minimal PNG reader: 8-bit RGB/RGBA, non-interlaced — what rsvg-convert emits. */
function decode(buf) {
  let pos = 8,
    width = 0,
    height = 0,
    colorType = 6,
    idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const channels =
    colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 4;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[rp + x];
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c =
        x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let v;
      switch (filter) {
        case 0:
          v = cur;
          break;
        case 1:
          v = cur + a;
          break;
        case 2:
          v = cur + b;
          break;
        case 3:
          v = cur + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c,
            pa = Math.abs(p - a),
            pb = Math.abs(p - b),
            pc = Math.abs(p - c);
          v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          v = cur;
      }
      out[y * stride + x] = v & 0xff;
    }
    rp += stride;
  }
  return { width, height, channels, data: out };
}

import {
  collectRenderedArtwork,
  luminanceOf,
  nodeCardColours,
} from "./lib/icon-artwork.mjs";

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Share of the icon box whose pixels clearly separate from the canvas. */
function coverage(art, background, ink) {
  const viewBox = /viewBox=["']([^"']+)["']/.exec(art)?.[1] ?? "0 0 24 24";
  const body = /<svg\b[^>]*>([\s\S]*)<\/svg>/.exec(art)?.[1] ?? "";
  const svgPath = path.join(WORK, "probe.svg");
  const pngPath = path.join(WORK, "probe.png");
  /* Rendered exactly as `packagedSvgComponent` emits it: our own root,
     `fill="currentColor"`, and the theme's ink supplied by the page. */
  writeFileSync(
    svgPath,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="48" height="48">` +
      `<rect width="100%" height="100%" fill="${background}"/>` +
      `<svg width="48" height="48" viewBox="${viewBox}" fill="currentColor" color="${ink}">${body}</svg></svg>`,
  );
  execFileSync("rsvg-convert", [
    "-w",
    "48",
    "-h",
    "48",
    svgPath,
    "-o",
    pngPath,
  ]);
  const image = decode(readFileSync(pngPath));
  const canvas = luminance(
    parseInt(background.slice(1, 3), 16),
    parseInt(background.slice(3, 5), 16),
    parseInt(background.slice(5, 7), 16),
  );
  const pixels = image.width * image.height;
  let standOut = 0;
  for (let i = 0; i < pixels; i++) {
    const o = i * image.channels;
    const gap = Math.abs(
      luminance(image.data[o], image.data[o + 1], image.data[o + 2]) - canvas,
    );
    if (gap > MIN_SEPARATION) standOut++;
  }
  return standOut / pixels;
}

const jobs = collectRenderedArtwork();
let failures = 0;

/* ------------------------------------------------------------------------ */
/* A mark's OWN ink, against the card it sits on                            */
/* ------------------------------------------------------------------------ */

/**
 * The rendered test below asks "is anything visible". This asks the sharper
 * question the rendered one cannot: does the mark's OWN colour survive?
 *
 * Kong is the case that forced it. Its artwork is partly #003459 and partly
 * unfilled; the unfilled half inherits the node's accent and renders fine, so
 * coverage looked healthy while the navy half was invisible against a blue
 * container card — a logo drawn half-missing. Coverage cannot see that, and
 * nor can a page-background test, because the card is not the page.
 *
 * Only marks whose ENTIRE declared ink collapses into a card are failed. The
 * gap between the ones that are genuinely lost (Δ0–5: Vault, Helm, Kong,
 * Ansible, CircleCI) and the next nearest (Δ17) is wide, so the threshold sits
 * in it rather than at either edge.
 */
const MIN_INK_SEPARATION = 10;
const THEMES = nodeCardColours();

for (const job of jobs) {
  const inks = [
    ...new Set(
      [
        ...job.art.matchAll(/(?:fill|stroke)\s*[:=]\s*["']?(#[0-9a-fA-F]{6})/g),
      ].map((m) => m[1]),
    ),
  ];
  if (inks.length === 0) continue; // inherits the accent, which the theme picks to contrast
  for (const [theme, { cards }] of Object.entries(THEMES)) {
    for (const card of cards) {
      const separation = Math.max(
        ...inks.map((ink) => Math.abs(luminanceOf(ink) - luminanceOf(card))),
      );
      if (separation >= MIN_INK_SEPARATION) continue;
      failures++;
      console.error(
        `  ✗ ${job.slug} (${job.style}) — its own ink vanishes into the ${theme} ${card} card (Δlum ${separation.toFixed(0)})`,
      );
      console.error(
        "    route it through the mono artwork so it takes the node's accent instead",
      );
    }
  }
}

for (const job of jobs) {
  const onLight = coverage(job.art, "#ffffff", "#111111");
  const onDark = coverage(job.art, "#0b0b0b", "#f5f5f5");
  if (onLight >= MIN_COVERAGE && onDark >= MIN_COVERAGE) continue;
  failures++;
  console.error(
    `  ✗ ${job.slug} (${job.style}) — light ${(onLight * 100).toFixed(1)}%, ` +
      `dark ${(onDark * 100).toFixed(1)}%`,
  );
  console.error(
    onLight < MIN_COVERAGE
      ? "    white or near-white ink: invisible on a light canvas"
      : "    black or near-black ink: invisible on a dark canvas",
  );
  console.error(
    "    route it through the mono artwork instead (brand.tsx), or drop it — " +
      "recolouring is not an option",
  );
}

if (failures > 0) {
  console.error(
    `\n${failures} of ${jobs.length} rendered icon(s) are not visible on both themes`,
  );
  process.exit(1);
}
console.log(`All ${jobs.length} rendered icons are visible on both themes.`);
