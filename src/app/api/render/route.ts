/**
 * `/api/render` — a diagram, drawn on the server, as an SVG image.
 *
 * WHY THIS EXISTS. A markdown file can hold an image and a link and nothing
 * else: no script, and GitHub strips iframes. So the only way a diagram
 * arrives in a README, a Notion page or a Jira ticket looking like arch-lab
 * drew it is as an image at a URL — which is a render service, and this is
 * ours. Everything before it could hand a reader Mermaid's drawing of the
 * document; this hands them the document's own.
 *
 * ═══ THE PRIVACY CHANGE, STATED PLAINLY ═══
 *
 * A share link carries the model in the `#` fragment, and a fragment never
 * leaves the browser — that is the promise `share/codec.ts` opens with, and
 * this route does NOT break it, because a share link still works exactly that
 * way. What this route adds is a SECOND, EXPLICIT shape in which a reader can
 * ask for a diagram, where the payload is in the QUERY STRING and therefore
 * does reach the server: it is in the request line, in Vercel's access logs,
 * and in any cache between the reader and us. Every time someone opens a page
 * carrying such an image, the model travels again.
 *
 * That is a real cost and it was accepted deliberately, for the one thing the
 * fragment can never buy: a picture in a document the author does not control.
 * It is not a default and nothing mints these URLs behind anyone's back — a
 * reader gets one only by asking for markdown to paste elsewhere. The
 * fragment remains the way to share a diagram with a person; this is the way
 * to put one in a page.
 *
 * ═══ WHAT IT KEEPS FROM `/api/mcp` ═══
 *
 * Stateless, unauthenticated and read-only, for the same reasons and with the
 * same consequence: there is nothing to provision and nothing to get wrong
 * across serverless instances. It stores nothing, reads nothing and holds no
 * secrets. The one real abuse surface is a pathological payload reaching the
 * recursive parser, which {@link MAX_PAYLOAD_CHARS} caps before any parsing
 * starts.
 *
 * NOT A MINTING TARGET. `deploy.md` requires every share link to be minted
 * against bare `/live`, and this route is not a share link — nothing links a
 * reader here, and `check:share-capacity` should never see it. It is also
 * outside the sitemap, like every other `/api` route.
 *
 * Node runtime, not Edge: the share codec decompresses through
 * `Blob`/`DecompressionStream`/`Response` and the parse plus layout is plain
 * synchronous CPU work — the same two reasons `/api/mcp` gives.
 */

import { renderErrorCard } from "@/features/render/lib/error-card";
import { renderDocument } from "@/features/render/lib/render-document";
import {
  SHARE_PARAM_DIAGRAM,
  SHARE_PARAM_MODEL,
  decodeShareFragment,
} from "@/features/viewer/share/codec";
import {
  SHARE_PARAM_EXPIRES,
  SHARE_PARAM_SIGNATURE,
} from "@/features/viewer/share/signature";
import { exportPaletteFor } from "@/features/viewer/export/palette.generated";
import { DEFAULT_THEME_BY_SCHEME, THEMES, type Theme } from "@/lib/constants";
import { DEFAULT_ICON_STYLE, type IconStyle } from "@/lib/icon-style";

export const runtime = "nodejs";

/** Bounded like `/api/mcp`: an unbounded handler turns one bad payload into a
 * stuck function. A large model parses and lays out in milliseconds. */
export const maxDuration = 60;

/**
 * The ceiling on the compressed payload, checked BEFORE anything decompresses
 * it.
 *
 * Deliberately below `MAX_SHARE_URL_LENGTH`'s neighbourhood rather than at
 * it: a share link is a thing a person carries once, where this URL is fetched
 * every time anybody opens the page holding the image, and platforms cap
 * request lines well under what a browser address bar tolerates. A model too
 * big to draw this way is one whose link still opens perfectly.
 */
const MAX_PAYLOAD_CHARS = 8000;

/** `?t=` — a theme name, or the light default when absent or unknown. */
function themeFrom(raw: string | null): Theme {
  return THEMES.includes(raw as Theme)
    ? (raw as Theme)
    : DEFAULT_THEME_BY_SCHEME.light;
}

/**
 * `?i=` — one ink or two, the canvas's own switch.
 *
 * IT WAS LEFT OUT WHILE C4 WAS REFUSED, because C4 is the only notation whose
 * drawing carries stack icons: accepting the parameter then would have meant
 * accepting it and ignoring it, which is worse than absent — a caller sets it,
 * sees no change, and cannot tell whether the style or the route was at fault.
 * C4 draws now, so the parameter means something and is read.
 *
 * An unknown value takes the default rather than refusing. The reader's own
 * preference is not in the document and not in the link (`lib/icon-style.ts`
 * argues why), so a render URL is the ONLY place this choice can be expressed
 * at all — and a diagram in the default style is a better answer to a typo
 * than a card explaining the spelling of "colour".
 */
function iconStyleFrom(raw: string | null): IconStyle {
  return raw === "mono" || raw === "colour" ? raw : DEFAULT_ICON_STYLE;
}

/** An SVG response. `status` still tells the truth; the body is a picture. */
function svgResponse(
  svg: string,
  status: number,
  cacheable: boolean,
): Response {
  return new Response(svg, {
    status,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      /* The URL IS the content: the same payload always draws the same
         picture, so a hit never needs revalidating. A refusal is not cached —
         an expired link that gets re-minted should stop showing the expiry
         card, and a parser fix should not be shadowed by a stale error. */
      "Cache-Control": cacheable
        ? "public, max-age=31536000, immutable"
        : "no-store",
      /* The document is built from text a third party can craft. Nothing in
         the renderers emits a script and every string goes through
         `escapeXml`, but an SVG served from our own origin executes in it, so
         the response carries its own lockdown rather than relying on that. */
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const theme = themeFrom(url.searchParams.get("t"));
  const palette = exportPaletteFor(theme);

  const refuse = (headline: string, detail: string, status: number) => {
    const card = renderErrorCard(headline, detail, palette);
    return svgResponse(card.svg, status, false);
  };

  const payload = url.searchParams.get(SHARE_PARAM_MODEL);
  if (payload === null) {
    return refuse(
      "No diagram in this URL",
      `/api/render needs a ${SHARE_PARAM_MODEL}= payload — the same one a share link carries in its fragment.`,
      400,
    );
  }
  if (payload.length > MAX_PAYLOAD_CHARS) {
    return refuse(
      "This diagram is too large to render from a URL",
      `Its payload is ${payload.length} characters and the ceiling is ${MAX_PAYLOAD_CHARS}. The share link for the same model still opens — link to it instead of embedding it.`,
      413,
    );
  }

  /* Decoded by the SHARE decoder, not a second implementation of it. The
     query string is rebuilt into the fragment body that function already
     understands, so the version marker, the base64url handling, the expiry
     verification and — most of all — the error wording are the ones a reader
     sees everywhere else. Only the parameters that mean something to a
     drawing are forwarded: no `p=` beat, because a still image has no
     playhead to open on. */
  const body = new URLSearchParams();
  body.set(SHARE_PARAM_MODEL, payload);
  for (const param of [
    SHARE_PARAM_DIAGRAM,
    SHARE_PARAM_EXPIRES,
    SHARE_PARAM_SIGNATURE,
  ]) {
    const value = url.searchParams.get(param);
    if (value !== null && value !== "") body.set(param, value);
  }

  const decoded = await decodeShareFragment(body.toString());
  if (decoded.status === "expired") {
    return refuse(
      "This diagram link has expired",
      `It was set to stop working on ${new Date(decoded.expiresAt * 1000).toUTCString()}. Ask whoever shared it for a new one.`,
      410,
    );
  }
  if (decoded.status === "error") {
    return refuse("This diagram link is damaged", decoded.message, 400);
  }
  if (decoded.status === "none") {
    return refuse(
      "No diagram in this URL",
      "Its payload was empty once decoded.",
      400,
    );
  }

  const outcome = renderDocument({
    source: decoded.aftText,
    diagramId: decoded.diagramId,
    theme,
    iconStyle: iconStyleFrom(url.searchParams.get("i")),
  });

  if (outcome.status === "error") {
    return refuse("This diagram could not be drawn", outcome.message, 422);
  }
  return svgResponse(outcome.rendered.svg, 200, true);
}
