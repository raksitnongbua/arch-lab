/**
 * `create_share_link` — turn a model into a URL a human can open.
 *
 * The payoff of the whole endpoint: an agent authors a model in a terminal
 * and hands its human a link that renders it, with no file to move and no
 * account to create.
 *
 * It reuses the viewer's REAL share codec (`viewer/share/codec.ts`), the same
 * one the Share button and the syntax page's "Open in view mode" links use,
 * which matters for two reasons: the model travels in the URL **fragment**,
 * so it is never sent to any server — not even this one, on open — and the
 * link is therefore identical to one a human would have produced by hand.
 *
 * The length ceiling is enforced honestly. Past `MAX_SHARE_URL_LENGTH` the
 * codec's own limit applies (plenty of chat apps and mail clients truncate
 * long URLs, and a truncated link fails silently for the RECIPIENT), so
 * rather than hand back a link that might not survive the trip, this refuses
 * and says what to do instead.
 */

import type { CheckChoice } from "@/features/validate/lib/check";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
  shareDigestFor,
  type ShareExpiry,
} from "@/features/viewer/share/codec";
import { signExpiry } from "@/features/viewer/share/sign-server";

import { publicOrigin } from "../lib/origin";
import { readSource } from "../lib/read";
import {
  errorResult,
  joinSections,
  textResult,
  type McpTextResult,
} from "../lib/render";

export async function createShareLink(
  source: string,
  format: CheckChoice,
  diagramId: string | undefined,
  ttlDays: number | undefined,
): Promise<McpTextResult> {
  const read = readSource(source, format);
  if (read.status === "error") return errorResult(read.message);

  const { file, aftText, summary } = read.value;

  if (diagramId !== undefined) {
    const known = file.diagrams.map((diagram) => diagram.id);
    if (!known.includes(diagramId)) {
      return errorResult(
        `This model has no diagram \`${diagramId}\` to open at. ` +
          `Known diagrams: ${known.join(", ")}.`,
      );
    }
  }

  if (!canEncodeShare()) {
    return errorResult(
      "This server cannot build share links — its JavaScript runtime lacks " +
        "CompressionStream. Convert the model with convert_model and send " +
        "the .alab text instead.",
    );
  }

  // Expiry, when asked for. Signed HERE rather than by POSTing to
  // `/api/share/sign`: this tool already runs on the server, so it can use the
  // private key directly — a self-fetch would need an absolute origin and add a
  // hop that can fail for reasons unrelated to signing.
  let expiry: ShareExpiry | undefined;
  let expiryLine: string | undefined;
  if (ttlDays !== undefined) {
    if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 400) {
      return errorResult(
        "`ttl_days` must be a whole number of days between 1 and 400.",
      );
    }
    const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 86_400;
    const signed = await signExpiry(await shareDigestFor(aftText), expiresAt);
    if (signed.status !== "ok") {
      // Refuse rather than silently hand back a permanent link: the caller
      // asked for an expiry, and a link that quietly lacks one is worse than
      // an error that says why.
      return errorResult(
        `Could not create an expiring link — ${signed.message}. ` +
          "Omit `ttl_days` for a link that never expires.",
      );
    }
    expiry = { expiresAt, signature: signed.signature };
    expiryLine =
      `Expires ${new Date(expiresAt * 1000).toISOString()} ` +
      `(${ttlDays.toString()} day${ttlDays === 1 ? "" : "s"}). The expiry is signed, so editing it ` +
      "in the URL breaks the link — but it is not access control: anyone with " +
      "the link can read the model until then.";
  }

  // The canonical `.alab` text is what travels: it is deterministic, lossless
  // and materially smaller than the JSON, which is what makes a whole model
  // fit in a URL at all.
  const fragment = await encodeShareFragment(
    aftText,
    diagramId ?? null,
    expiry,
  );
  const url = `${publicOrigin()}/view/new#${fragment}`;

  if (url.length > MAX_SHARE_URL_LENGTH) {
    return errorResult(
      joinSections(
        `This model does not fit in a share link: the URL would be ` +
          `${url.length.toLocaleString("en-US")} characters, over the ` +
          `${MAX_SHARE_URL_LENGTH.toLocaleString("en-US")}-character limit ` +
          `(many chat and mail clients truncate longer URLs, which would ` +
          `break the link for whoever receives it).`,
        "Send the model as a file instead — call convert_model with " +
          'to="alab" and save the result as a `.alab` file, which the ' +
          "two-pane editor at /view/new accepts by paste or drop.",
      ),
    );
  }

  return textResult(
    joinSections(
      `Share link for ${JSON.stringify(summary.title)} ` +
        `(${url.length.toLocaleString("en-US")} characters, within the ` +
        `${MAX_SHARE_URL_LENGTH.toLocaleString("en-US")} limit):`,
      url,
      diagramId === undefined
        ? "Opens in the two-pane viewer at the model's root diagram."
        : `Opens in the two-pane viewer at diagram \`${diagramId}\`.`,
      ...(expiryLine === undefined ? [] : [expiryLine]),
      // Precise about what did and did not leave the machine. With `ttl_days`
      // a SHA-256 of the payload was signed here; the model itself still never
      // travels to a server, and nothing was stored either way.
      "The model travels in the URL fragment (after `#`), which browsers " +
        "never send to a server" +
        (expiry === undefined
          ? " — nothing about this model is uploaded, stored or logged anywhere."
          : ". Signing the expiry used a SHA-256 fingerprint of the payload, " +
            "never the model itself, and nothing was stored."),
    ),
  );
}
