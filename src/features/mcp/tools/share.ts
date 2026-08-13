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
 * BOTH DOCUMENT KINDS. The codec compresses arbitrary text, so what makes a
 * link a C4 link or a sequence link is the ROUTE it lands on, not the payload
 * (see `sequence/share/share-button.tsx`, which shares the same reasoning): a
 * C4 model mints against `/view/c4`, a sequence document against
 * `/view/sequence`. Detection is by the document's first meaningful line —
 * the same sniff the playgrounds use — so an agent that authored a sequence
 * flow gets a working link from the same tool, not a C4 parse error.
 *
 * Length is reported in the codec's honest tiers (see the reasoning on the
 * constants in `codec.ts`): under `SHARE_URL_SAFE_LENGTH` the link goes out
 * clean; up to `MAX_SHARE_URL_LENGTH` it goes out WITH a caveat that
 * plain-text email may break it; past the ceiling this refuses — but
 * usefully, with the canonical `.alab` text inline and, when one fits, a
 * measured diagram-scoped link, so the caller is never sent away for another
 * round trip.
 */

import {
  parseArchText,
  serializeArchText,
  serializeSequenceText,
} from "@/features/archtext";
import { MERMAID_SEQUENCE_CAVEAT } from "@/features/sequence/input/parse";
import type { CheckChoice } from "@/features/validate/lib/check";
import {
  canEncodeShare,
  encodeShareFragment,
  MAX_SHARE_URL_LENGTH,
  SHARE_URL_SAFE_LENGTH,
  shareDigestFor,
  type ShareExpiry,
} from "@/features/viewer/share/codec";
import { signExpiry } from "@/features/viewer/share/sign-server";
import type { ArchLabFile, C4Node } from "@/types";
import type { SequenceLabFile } from "@/types/sequence";

import { publicOrigin } from "../lib/origin";
import { readSource } from "../lib/read";
import {
  errorResult,
  fence,
  joinSections,
  textResult,
  type McpTextResult,
} from "../lib/render";
import { readSequence } from "./sequence";

/**
 * The caveat handed out with links in the middle tier, and with scoped links
 * that land there. One string so the wording cannot drift between the two.
 */
const EMAIL_CAVEAT =
  "Caveat: plain-text email wraps lines at 998 octets (RFC 5322), so a " +
  "link this long can arrive broken from a plain-text mail client. It is " +
  "fine in browsers and chat apps; for email, send the model as a `.alab` " +
  "file instead.";

/**
 * The model cut down to one diagram plus the ancestor chain it hangs from.
 *
 * The chain is kept — not just the one diagram — because the parser requires
 * the root to be a parentless `@context`, so a bare `@container` cannot stand
 * alone as a file. Ancestors are what make the scoped model valid, and they
 * are cheap: it is sibling SUBTREES, usually the bulk of a big model, that
 * get dropped. Nodes whose drill-down pointer leads into a dropped subtree
 * lose the pointer (they become leaves); `null` markers and pointers into the
 * kept chain survive untouched.
 *
 * Returns `null` when no valid scoped file exists (a broken or cyclic parent
 * chain) — the caller simply does not offer that diagram.
 */
function scopedTo(file: ArchLabFile, diagramId: string): ArchLabFile | null {
  const byId = new Map(file.diagrams.map((diagram) => [diagram.id, diagram]));
  const keep = new Set<string>();
  for (
    let current = byId.get(diagramId);
    current !== undefined;
    current =
      current.parentDiagramId === null
        ? undefined
        : byId.get(current.parentDiagramId)
  ) {
    if (keep.has(current.id)) return null; // cyclic parent chain
    keep.add(current.id);
  }
  if (!keep.has(file.rootDiagramId)) return null;

  return {
    ...file,
    diagrams: file.diagrams
      .filter((diagram) => keep.has(diagram.id))
      .map((diagram) => ({
        ...diagram,
        nodes: diagram.nodes.map((node) => {
          if (node.childDiagramId == null || keep.has(node.childDiagramId)) {
            return node;
          }
          // The key must be ABSENT (not undefined) for the serializer to
          // treat the node as a leaf, hence delete on a copy.
          const leaf: C4Node = { ...node };
          delete leaf.childDiagramId;
          return leaf;
        }),
      })),
  };
}

/** A diagram-scoped link that was actually built and measured to fit. */
interface ScopedOffer {
  diagramId: string;
  title: string;
  url: string;
}

/**
 * Tries to build a fitting diagram-scoped link for every diagram, requested
 * one first. Every offer returned here was genuinely encoded, measured under
 * the ceiling, and its scoped text re-parsed — nothing is promised that was
 * not computed.
 *
 * When the caller asked for an expiry, each scoped link gets its OWN signed
 * expiry (the main link's signature covers a different payload digest and
 * cannot be reused). A candidate whose signing fails is skipped rather than
 * emitted permanent: the caller asked for expiring links, and a link that
 * quietly lacks one is worse than one fewer offer.
 */
async function scopedOffers(
  file: ArchLabFile,
  requestedDiagramId: string | undefined,
  origin: string,
  expiresAt: number | undefined,
): Promise<ScopedOffer[]> {
  const ordered = [...file.diagrams].sort((a, b) =>
    a.id === requestedDiagramId ? -1 : b.id === requestedDiagramId ? 1 : 0,
  );

  const offers: ScopedOffer[] = [];
  for (const diagram of ordered) {
    const scoped = scopedTo(file, diagram.id);
    if (scoped === null) continue;
    // Scoping dropped nothing — the "smaller" link would be the same size.
    if (scoped.diagrams.length === file.diagrams.length) continue;

    const scopedText = serializeArchText(scoped);
    try {
      parseArchText(scopedText);
    } catch {
      continue; // never offer a link whose payload does not round-trip
    }

    let expiry: ShareExpiry | undefined;
    if (expiresAt !== undefined) {
      const signed = await signExpiry(
        await shareDigestFor(scopedText),
        expiresAt,
      );
      if (signed.status !== "ok") continue;
      expiry = { expiresAt, signature: signed.signature };
    }

    const fragment = await encodeShareFragment(
      scopedText,
      diagram.id === file.rootDiagramId ? null : diagram.id,
      expiry,
    );
    const url = `${origin}/view/c4#${fragment}`;
    if (url.length > MAX_SHARE_URL_LENGTH) continue;
    offers.push({ diagramId: diagram.id, title: diagram.title, url });
  }
  return offers;
}

/**
 * A signed expiry for the given payload text, or the reason there is none.
 * One function for both document kinds: the signature covers a digest of the
 * TEXT, so the codec — and this — never needs to know which grammar wrote it.
 */
type MintedExpiry =
  | { status: "ok"; expiry: ShareExpiry | undefined; line: string | undefined }
  | { status: "error"; message: string };

async function mintExpiry(
  payloadText: string,
  ttlDays: number | undefined,
): Promise<MintedExpiry> {
  if (ttlDays === undefined) {
    return { status: "ok", expiry: undefined, line: undefined };
  }
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 400) {
    return {
      status: "error",
      message: "`ttl_days` must be a whole number of days between 1 and 400.",
    };
  }
  // Signed HERE rather than by POSTing to `/api/share/sign`: this tool
  // already runs on the server, so it can use the private key directly — a
  // self-fetch would need an absolute origin and add a hop that can fail for
  // reasons unrelated to signing.
  const expiresAt = Math.floor(Date.now() / 1000) + ttlDays * 86_400;
  const signed = await signExpiry(await shareDigestFor(payloadText), expiresAt);
  if (signed.status !== "ok") {
    // Refuse rather than silently hand back a permanent link: the caller
    // asked for an expiry, and a link that quietly lacks one is worse than
    // an error that says why.
    return {
      status: "error",
      message:
        `Could not create an expiring link — ${signed.message}. ` +
        "Omit `ttl_days` for a link that never expires.",
    };
  }
  return {
    status: "ok",
    expiry: { expiresAt, signature: signed.signature },
    line:
      `Expires ${new Date(expiresAt * 1000).toISOString()} ` +
      `(${ttlDays.toString()} day${ttlDays === 1 ? "" : "s"}). The expiry is signed, so editing it ` +
      "in the URL breaks the link — but it is not access control: anyone with " +
      "the link can read the model until then.",
  };
}

/** The privacy line every successful link carries, exact about what left. */
function privacyLine(expiry: ShareExpiry | undefined): string {
  return (
    "The model travels in the URL fragment (after `#`), which browsers " +
    "never send to a server" +
    (expiry === undefined
      ? " — nothing about this model is uploaded, stored or logged anywhere."
      : ". Signing the expiry used a SHA-256 fingerprint of the payload, " +
        "never the model itself, and nothing was stored.")
  );
}

/**
 * The sequence half of `create_share_link`. Same codec, same tiers, same
 * privacy — the differences are the route (`/view/sequence`) and that there
 * is no diagram to scope to: a sequence document is one flow, so the oversize
 * refusal offers the canonical text and nothing smaller.
 */
async function sequenceShareLink(
  file: SequenceLabFile,
  sourceFormat: "alab" | "mermaid",
  diagramId: string | undefined,
  ttlDays: number | undefined,
): Promise<McpTextResult> {
  if (diagramId !== undefined) {
    return errorResult(
      "`diagram_id` is for C4 models — a sequence document is a single flow " +
        "with no diagrams to open at. Omit it.",
    );
  }

  if (!canEncodeShare()) {
    return errorResult(
      "This server cannot build share links — its JavaScript runtime lacks " +
        "CompressionStream. Send the canonical .alab sequence text from " +
        "format_sequence instead.",
    );
  }

  // Canonical text, like the C4 branch: deterministic, and the same bytes
  // format_sequence hands out, so a shared flow and a committed one agree.
  const payload = serializeSequenceText(file);

  const minted = await mintExpiry(payload, ttlDays);
  if (minted.status === "error") return errorResult(minted.message);

  const fragment = await encodeShareFragment(payload, null, minted.expiry);
  // Minted against `/view/seq`, the short alias that forwards to
  // `/view/sequence` with the fragment intact: the route is part of the same
  // length budget as the payload, so the alias's five saved characters go to
  // the document instead. Links minted against the long route still open —
  // the playground's address did not move, only what NEW links say.
  const url = `${publicOrigin()}/view/seq#${fragment}`;

  if (url.length > MAX_SHARE_URL_LENGTH) {
    return errorResult(
      joinSections(
        `This sequence document does not fit in a share link: the URL would ` +
          `be ${url.length.toLocaleString("en-US")} characters, over the ` +
          `${MAX_SHARE_URL_LENGTH.toLocaleString("en-US")}-character ceiling ` +
          `past which enough carrier apps truncate that the link would fail ` +
          `silently for whoever receives it. A sequence document has no ` +
          `sub-diagrams to scope a smaller link to.`,
        "To share it, save the canonical `.alab` sequence text below as a " +
          "file and send that — the playground at /view/sequence accepts it " +
          "by paste:",
        fence("", payload),
      ),
    );
  }

  const withinSafeLength = url.length <= SHARE_URL_SAFE_LENGTH;
  return textResult(
    joinSections(
      `Share link for ${JSON.stringify(file.metadata.title)} ` +
        `(${url.length.toLocaleString("en-US")} characters — ` +
        (withinSafeLength
          ? `under ${SHARE_URL_SAFE_LENGTH.toLocaleString("en-US")}, safe in essentially any app):`
          : `within the ${MAX_SHARE_URL_LENGTH.toLocaleString("en-US")}-character ceiling):`),
      url,
      withinSafeLength ? null : EMAIL_CAVEAT,
      "Opens in the sequence playground.",
      minted.line ?? null,
      privacyLine(minted.expiry),
      // The link carries the .alab conversion of what was PASTED, so a caller
      // holding Mermaid must hear the loss here — after this, only the .alab
      // form travels.
      sourceFormat === "mermaid" ? MERMAID_SEQUENCE_CAVEAT : null,
    ),
  );
}

export async function createShareLink(
  source: string,
  format: CheckChoice,
  diagramId: string | undefined,
  ttlDays: number | undefined,
): Promise<McpTextResult> {
  // Sequence documents first, and regardless of `format`: the two headers
  // (`archlab 1.0 sequence`, `sequenceDiagram`) can never parse as any C4
  // reading, so honouring a forced C4 `format` here could only produce a
  // misleading parse error. A sequence PARSE error is final — the text is a
  // sequence document, just a broken one — while "c4-detected",
  // "unknown-format" and "size" all fall through to the C4 reader, which owns
  // those verdicts and their messages.
  const sequence = readSequence(source);
  if (sequence.status === "ok") {
    return sequenceShareLink(
      sequence.file,
      sequence.format,
      diagramId,
      ttlDays,
    );
  }
  if (sequence.kind === "parse") return errorResult(sequence.message);

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

  const minted = await mintExpiry(aftText, ttlDays);
  if (minted.status === "error") return errorResult(minted.message);
  const { expiry, line: expiryLine } = minted;

  // The canonical `.alab` text is what travels: it is deterministic, lossless
  // and materially smaller than the JSON, which is what makes a whole model
  // fit in a URL at all.
  const fragment = await encodeShareFragment(
    aftText,
    diagramId ?? null,
    expiry,
  );
  // Minted against /view/c4 — the C4 playground's address since /view became
  // the chooser. Links minted before the move (`/view#m=…`) still resolve:
  // the chooser forwards them with the fragment intact.
  const url = `${publicOrigin()}/view/c4#${fragment}`;

  if (url.length > MAX_SHARE_URL_LENGTH) {
    // Refuse — but leave the caller holding something actionable in THIS
    // response: the canonical `.alab` text, and any diagram-scoped link that
    // was measured to fit. The previous behaviour ("go run convert_model")
    // cost another round trip for text this tool already had in hand.
    const offers = await scopedOffers(
      file,
      diagramId,
      publicOrigin(),
      expiry?.expiresAt,
    );
    const anyOfferOverSafe = offers.some(
      (offer) => offer.url.length > SHARE_URL_SAFE_LENGTH,
    );
    return errorResult(
      joinSections(
        `This model does not fit in a share link: the URL would be ` +
          `${url.length.toLocaleString("en-US")} characters, over the ` +
          `${MAX_SHARE_URL_LENGTH.toLocaleString("en-US")}-character ceiling ` +
          `past which enough carrier apps truncate that the link would fail ` +
          `silently for whoever receives it.`,
        offers.length === 0
          ? null
          : joinSections(
              "A smaller, diagram-scoped link fits. Each carries just that " +
                "diagram plus the ancestors it drills down from:",
              ...offers.map(
                (offer) =>
                  `\`${offer.diagramId}\` ${JSON.stringify(offer.title)} — ` +
                  `${offer.url.length.toLocaleString("en-US")} characters:\n` +
                  offer.url,
              ),
              anyOfferOverSafe ? EMAIL_CAVEAT : null,
            ),
        "To share the WHOLE model, save the canonical `.alab` text below as " +
          "a `.alab` file and send that — the two-pane editor at /view/c4 " +
          "accepts it by paste or drop:",
        fence("", aftText),
      ),
    );
  }

  const withinSafeLength = url.length <= SHARE_URL_SAFE_LENGTH;
  return textResult(
    joinSections(
      `Share link for ${JSON.stringify(summary.title)} ` +
        `(${url.length.toLocaleString("en-US")} characters — ` +
        (withinSafeLength
          ? `under ${SHARE_URL_SAFE_LENGTH.toLocaleString("en-US")}, safe in essentially any app):`
          : `within the ${MAX_SHARE_URL_LENGTH.toLocaleString("en-US")}-character ceiling):`),
      url,
      withinSafeLength ? null : EMAIL_CAVEAT,
      diagramId === undefined
        ? "Opens in the two-pane viewer at the model's root diagram."
        : `Opens in the two-pane viewer at diagram \`${diagramId}\`.`,
      ...(expiryLine === undefined ? [] : [expiryLine]),
      // Precise about what did and did not leave the machine. With `ttl_days`
      // a SHA-256 of the payload was signed here; the model itself still never
      // travels to a server, and nothing was stored either way.
      privacyLine(expiry),
    ),
  );
}
