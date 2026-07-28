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
} from "@/features/viewer/share/codec";

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

  // The canonical `.alab` text is what travels: it is deterministic, lossless
  // and materially smaller than the JSON, which is what makes a whole model
  // fit in a URL at all.
  const fragment = await encodeShareFragment(aftText, diagramId ?? null);
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
      "The model travels in the URL fragment (after `#`), which browsers " +
        "never send to a server — nothing about this model is uploaded, " +
        "stored or logged anywhere.",
    ),
  );
}
