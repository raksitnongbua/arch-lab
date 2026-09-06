import { ImageResponse } from "next/og";

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  OgCard,
  OgKindMix,
} from "@/features/marketing/og/card";
import { KINDS_WITH_SYNTAX_SECTIONS } from "@/features/mcp/catalog";
import { APP_NAME } from "@/lib/constants";

/**
 * `/skill`'s social card.
 *
 * IT EXISTS BECAUSE "NO CARD" IS NOT NEUTRAL. Next serves the ROOT card to any
 * route without one, so a link to this page would preview as "Architecture
 * diagrams that survive review" over a C4 stack — a diagram advert shown to
 * somebody who is shopping for an agent skill. That is the exact failure the
 * per-notation playground cards and `/mcp`'s card were both added to fix, and
 * a new route inherits it silently unless the card ships with the route.
 *
 * THE FOOTER SPENDS ITS ONE LINE ON "no server" — the fact that decides
 * whether this reader keeps reading, and the whole difference between this
 * page and `/mcp`. The notation count comes from the catalogue for the reason
 * `/mcp`'s tool count does: a preview is the one surface where nobody notices
 * a number going stale.
 *
 * `OgKindMix` rather than the MCP figure: what the skill teaches is the
 * NOTATIONS, and the mix is the art that says "several kinds of diagram"
 * without claiming a connection to anything.
 *
 * The frame, the palette and the Satori constraints live in
 * `features/marketing/og/card.tsx`.
 */

export const alt = `${APP_NAME} — an Agent Skill for architecture diagrams`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpenGraphImage() {
  return new ImageResponse(
    <OgCard
      eyebrow="AGENT SKILL"
      headline="Your agent knows"
      headlineTail="the grammar."
      footer={`${KINDS_WITH_SYNTAX_SECTIONS.length} grammars · one install · no server`}
      art={<OgKindMix />}
    />,
    size,
  );
}
