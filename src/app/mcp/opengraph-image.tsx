import { ImageResponse } from "next/og";

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgCard,
  OgMcpMini,
} from "@/features/marketing/og/card";
import { MCP_CARD_TOOLS, MCP_TOOLS } from "@/features/mcp/catalog";
import { APP_NAME } from "@/lib/constants";

/**
 * `/mcp`'s social card — the one page on this site whose subject is not a
 * diagram, and until now the one page with no card of its own.
 *
 * WHAT IT REPLACES. Without an image beside this route, Next served the ROOT
 * card: "Architecture diagrams that survive review", over a C4 container stack.
 * Every link to the connect guide therefore previewed as a diagram advert —
 * and the audience for this page is not looking for a diagram tool, it is
 * looking for an MCP server. The card that greets them has to say "server", or
 * it is answering a question nobody asked. Same failure as the one the per-kind
 * playground cards fixed, one route further out.
 *
 * THE COUNT AND THE NAMES BOTH COME FROM THE CATALOGUE, not typed here, for
 * the same reason the page's structured data reads it: a card that advertises a
 * tool the server no longer exposes is worse than one that advertises nothing,
 * and a link preview is the one surface where nobody will notice it went stale.
 * `MCP_CARD_TOOLS` resolves the three through the guard that throws at module
 * load, so a rename fails the build here too.
 *
 * "(beta)" is on the page and in its title but not on the card: a preview has
 * one line of footer, and "read-only and unauthenticated" is the fact that
 * decides whether someone connects it. The status is one click away.
 *
 * The frame, the palette and the Satori constraints live in
 * `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — an MCP server for architecture diagrams`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="MODEL CONTEXT PROTOCOL"
      headline="Let your agent draw"
      headlineTail="the architecture."
      footer={`${MCP_TOOLS.length} tools · read-only · no key to paste`}
      art={<OgMcpMini tools={MCP_CARD_TOOLS} />}
    />,
    size,
  );
}
