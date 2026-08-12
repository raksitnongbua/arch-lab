import { ImageResponse } from "next/og";

import { APP_NAME } from "@/lib/constants";

/**
 * The iOS home-screen / macOS touch icon.
 *
 * WHY IT EXISTS SEPARATELY from `icon.svg`. Apple's touch icon is the one place
 * the SVG cannot serve: iOS wants a raster at a known size, and it composites
 * the image onto the home screen WITHOUT honouring transparency — a transparent
 * mark comes out on an unpredictable black or white plate. So this one carries
 * its own background, and squares off the corners because iOS applies its own
 * mask; rounding here would round twice and leave the mark floating in a
 * shrunken pill.
 *
 * Generated from JSX at build time rather than committed as a PNG, for the same
 * reason `opengraph-image.tsx` is: there is no design tool in this repo's loop,
 * so a binary would drift the first time the brand moved. The geometry is the
 * same container-holding-a-component as `icon.svg`, scaled — one mark, two
 * renderings, and the proportions below are that file's viewBox arithmetic
 * multiplied out so the two cannot drift apart by eye.
 *
 * Colours are the dark theme's --primary and --accent as sRGB, hand-converted
 * because Satori does not parse `oklch()` — the same caveat, and the same pair,
 * as the social card.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const alt = `${APP_NAME}`;

/* Dark-theme tokens, sRGB approximations — see the note above. */
const BACKGROUND = "#1b1b23";
const PRIMARY = "#9d8cff";
const ACCENT = "#4fd6e4";

/*
 * icon.svg draws on a 32-unit viewBox: a 23.5 square with a 2.5 stroke and a
 * 6.75 radius, holding a 10 square with a 3 radius. At 180px that is ×5.625.
 */
const SCALE = 180 / 32;
const OUTER = Math.round(23.5 * SCALE);
const STROKE = Math.round(2.5 * SCALE);
const OUTER_RADIUS = Math.round(6.75 * SCALE);
const INNER = Math.round(10 * SCALE);
const INNER_RADIUS = Math.round(3 * SCALE);

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BACKGROUND,
      }}
    >
      <div
        style={{
          width: OUTER,
          height: OUTER,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: `${STROKE}px solid ${PRIMARY}`,
          borderRadius: OUTER_RADIUS,
        }}
      >
        <div
          style={{
            width: INNER,
            height: INNER,
            background: ACCENT,
            borderRadius: INNER_RADIUS,
          }}
        />
      </div>
    </div>,
    size,
  );
}
