import { ImageResponse } from "next/og";

import { APP_NAME } from "@/lib/constants";

/**
 * The social card, generated at build time from JSX instead of committed as a
 * binary — there is no design tool in this repo's loop, so a checked-in PNG
 * would drift the first time the brand moved. Living beside the root layout,
 * it covers every route that does not ship its own image.
 *
 * The palette is the dark theme's tokens from `globals.css`, hand-converted
 * to sRGB hex because Satori does not parse `oklch()`. If the tokens change,
 * these follow — same deal as the `themeColor` approximation in layout.tsx.
 * The miniature Container-level stack echoes the landing hero
 * (`hero-diagram.tsx`) so the card and the page someone lands on read as the
 * same product.
 */

export const alt = `${APP_NAME} — C4 architecture diagrams as plain text`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* Dark-theme tokens, sRGB approximations. */
const BACKGROUND = "#1b1b23";
const CARD = "#232330";
const BORDER = "#3c3c4d";
const FOREGROUND = "#f2f2f8";
const MUTED = "#a3a3b5";
const PRIMARY = "#9d8cff";
const ACCENT = "#4fd6e4";

function Node({ name, tech }: { name: string; tech: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 300,
        padding: "18px 22px",
        borderRadius: 14,
        border: `1.5px solid ${BORDER}`,
        background: CARD,
      }}
    >
      <span style={{ fontSize: 24, fontWeight: 600, color: FOREGROUND }}>
        {name}
      </span>
      <span style={{ fontSize: 18, color: MUTED }}>{tech}</span>
    </div>
  );
}

/* The connector between two nodes — a short vertical rule, offset from the
 * card's left edge so the stack reads as a diagram rather than as a list. */
function Connector() {
  return (
    <div
      style={{
        display: "flex",
        width: 2,
        height: 26,
        marginLeft: 60,
        background: BORDER,
      }}
    />
  );
}

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: BACKGROUND,
        backgroundImage:
          "linear-gradient(to right, #26262f 1px, transparent 1px), linear-gradient(to bottom, #26262f 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          maxWidth: 640,
        }}
      >
        <span
          style={{
            fontSize: 26,
            letterSpacing: 2,
            color: ACCENT,
            marginBottom: 20,
          }}
        >
          .alab — plain text on disk
        </span>
        <span
          style={{
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.15,
            color: FOREGROUND,
          }}
        >
          C4 architecture diagrams that
        </span>
        <span
          style={{
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.15,
            // Satori supports background-clip: text, so the headline can
            // carry the same primary→accent run as the landing hero.
            backgroundImage: `linear-gradient(90deg, ${PRIMARY}, ${ACCENT})`,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          survive code review.
        </span>
        <span style={{ fontSize: 30, color: MUTED, marginTop: 32 }}>
          {APP_NAME} · local-first C4 editor · no account, no cloud
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <Node name="Web App" tech="Next.js · SSR" />
        <Connector />
        <Node name="API Service" tech="Go · REST" />
        <Connector />
        <Node name="Orders DB" tech="PostgreSQL" />
      </div>
    </div>,
    size,
  );
}
