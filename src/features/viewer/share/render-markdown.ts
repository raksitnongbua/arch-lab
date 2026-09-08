/**
 * The markdown a reader pastes into a README, a ticket or a Notion page.
 *
 * ONE LINE, TWO DESTINATIONS:
 *
 *   [![<title>](<origin>/api/render?m=…&t=…&i=…)](<the share link>)
 *
 * The image is `/api/render` drawing the document on the server, so the
 * picture in that page is the one arch-lab draws — its theme, its role
 * colours, its icons — rather than whatever the host tool would have drawn.
 * The link around it is the ordinary share link, so a reader who wants the
 * live diagram, its motion or its paths is one click away from all three. A
 * static image cannot carry any of that, and pretending otherwise is what
 * makes an exported picture feel like a downgrade.
 *
 * ═══ THE PAYLOAD MOVES FROM THE FRAGMENT TO THE QUERY, AND THAT IS THE WHOLE
 * PRIVACY DIFFERENCE ═══
 *
 * A share link keeps its model after the `#`, which no browser ever sends to
 * a server. An image cannot: `<img src>` is a request, so the same bytes have
 * to travel as a query string — reaching our logs, and travelling again every
 * time anybody opens the page holding the image. `route.ts` argues why that is
 * worth it; this module is the only place in the product that mints such a
 * URL, and it does so from an explicit press rather than in the background.
 *
 * THE FRAGMENT IS REUSED, NEVER REBUILT. It arrives from the same
 * `encodeShareFragment` call that produced the link on screen, which is what
 * keeps three things in step that have drifted before: the diagram (`d=`), the
 * expiry (`exp=`/`sig=`) and the model itself. Re-encoding here would mint a
 * SECOND expiry — so a sharer who asked for an hour would hand over markdown
 * whose image outlived the link wrapped around it.
 */

import type { Theme } from "@/lib/constants";
import type { IconStyle } from "@/lib/icon-style";

/** Where `/api/render` lives, and what it should draw. */
export interface RenderMarkdownInput {
  /** `window.location.origin` — resolved by the caller, never hardcoded. */
  origin: string;
  /**
   * The share fragment body (`m=AF1.…[&d=…][&exp=…&sig=…]`), verbatim from the
   * link the panel is showing.
   */
  fragment: string;
  /** The share link the image links to. */
  shareUrl: string;
  /** The reader's current theme, so the image matches the screen. */
  theme: Theme;
  /** The reader's current icon style, for the same reason. */
  iconStyle: IconStyle;
  /** Becomes the image's alt text. */
  title: string;
}

/**
 * Alt text for the image.
 *
 * `]` is the one character that must not survive: markdown ends the alt at the
 * first unescaped one, so a title carrying a bracket would truncate the alt
 * and leave the rest of it as stray text beside the image. Escaped rather than
 * stripped — a title is the author's own words.
 */
function altFor(title: string): string {
  return title.replace(/([[\]])/g, "\\$1");
}

/**
 * The markdown for one diagram.
 *
 * Pure and synchronous: every asynchronous part — compressing the model,
 * minting the expiry — happened when the link was built.
 */
export function buildRenderMarkdown(input: RenderMarkdownInput): string {
  const renderUrl =
    `${input.origin}/api/render?${input.fragment}` +
    `&t=${encodeURIComponent(input.theme)}` +
    `&i=${encodeURIComponent(input.iconStyle)}`;

  return `[![${altFor(input.title)}](${renderUrl})](${input.shareUrl})\n`;
}

/**
 * Why Copy Markdown is unavailable for a document that ships with the app.
 *
 * A bundled model has no payload — its Share panel hands out the page's own
 * address, which is the whole point of those links being short. `/api/render`
 * draws from a payload, so there is nothing here to put in the query string.
 *
 * The fix is a route that takes a model id (`?model=atlas-shop`), which would
 * also be the SHORTEST render URL in the product and is the one most likely to
 * end up in a README. It is named here rather than in a backlog because the
 * reader who presses a disabled button deserves to know what would make it
 * work.
 */
export const BUNDLED_MARKDOWN_REFUSAL =
  "this model ships with the app, so its share link is just the page address — " +
  "there is no payload to draw an image from. Paste or edit a document to copy " +
  "markdown for it.";
