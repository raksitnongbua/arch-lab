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
 * EVERY DOCUMENT KIND — C4, sequence, flowchart and use case. The codec compresses
 * arbitrary text, so nothing in a link says which grammar wrote it; every kind
 * mints against bare `/live`, because the playground is one route and a share
 * link needs no seed in its URL — it carries the document, and the reader
 * detects the kind from the text. Detection here is by the first meaningful
 * line, the same sniff the playground uses, so an agent that authored a
 * sequence flow or a flowchart gets a working link from this one tool rather
 * than a C4 parse error about the wrong grammar.
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
  serializeFlowchartText,
  serializeSequenceText,
  serializeUseCaseText,
  serializeErText,
  serializeDictText,
} from "@/features/archtext";
import { MERMAID_FLOWCHART_CAVEAT } from "@/features/flowchart/input/parse";
import { MERMAID_USECASE_CAVEAT } from "@/features/usecase/input/parse";
import { MERMAID_ER_CAVEAT } from "@/features/er/input/parse";
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

import { publicOrigin } from "../lib/origin";
import { readSource } from "../lib/read";
import {
  errorResult,
  fence,
  joinSections,
  textResult,
  type McpTextResult,
} from "../lib/render";
import { readFlowchart } from "./flowchart";
import { readUseCase } from "./usecase";
import { readEr } from "./er";
import { readDict } from "./dict";
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
    const url = `${origin}/live#${fragment}`;
    if (url.length > MAX_SHARE_URL_LENGTH) continue;
    offers.push({ diagramId: diagram.id, title: diagram.title, url });
  }
  return offers;
}

/**
 * A signed expiry for the given payload text, or the reason there is none.
 * One function for every document kind: the signature covers a digest of the
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
 * What distinguishes one single-document share from another. Everything else —
 * codec, tiers, expiry, privacy, the oversize ceiling — is shared, so only the
 * caller-facing WORDS and the canonical payload live here.
 */
interface SingleDocumentShare {
  /** Canonical `.alab` text: deterministic, and the same bytes the matching
   * `format_*` tool hands out, so a shared document and a committed one agree. */
  payload: string;
  title: string;
  sourceFormat: "alab" | "mermaid";
  /** How the refusals name the document ("a sequence document", "a flowchart"). */
  noun: string;
  /** The tool whose output to send when the runtime cannot build links. */
  formatTool: string;
  /** Why there is nothing smaller to scope an oversize link to. */
  indivisibleBecause: string;
  /** The one-line "where this opens" note on success. */
  opensIn: string;
  /** Named on success when the caller pasted Mermaid, because after this only
   * the `.alab` form travels. */
  mermaidCaveat: string;
}

/**
 * The non-C4 half of `create_share_link`, shared by the sequence and flowchart
 * branches. Same codec, same tiers, same privacy as the C4 path — the
 * differences are that these documents mint against bare `/live` and have no
 * sub-diagram to scope a smaller link to, so an oversize refusal offers the
 * canonical text and nothing else.
 *
 * ONE function for two kinds rather than two near-identical ones: everything
 * that differed was a sentence, and a sentence is a parameter (`dry.md`). If a
 * third kind ever needs genuinely different tiers or a route of its own, that
 * is the point to split it — not before.
 */
async function singleDocumentShareLink(
  spec: SingleDocumentShare,
  diagramId: string | undefined,
  ttlDays: number | undefined,
): Promise<McpTextResult> {
  if (diagramId !== undefined) {
    return errorResult(
      `\`diagram_id\` is for C4 models — ${spec.noun} is a single document ` +
        "with no diagrams to open at. Omit it.",
    );
  }

  if (!canEncodeShare()) {
    return errorResult(
      "This server cannot build share links — its JavaScript runtime lacks " +
        `CompressionStream. Send the canonical .alab text from ` +
        `${spec.formatTool} instead.`,
    );
  }

  const { payload, sourceFormat } = spec;

  const minted = await mintExpiry(payload, ttlDays);
  if (minted.status === "error") return errorResult(minted.message);

  const fragment = await encodeShareFragment(payload, null, minted.expiry);
  // Minted against bare `/live`. The route shares the payload's length
  // budget, and the seed that used to sit in the path is a query param the
  // link does not need: it carries its own document, and the reader detects
  // the kind. Every route this ever minted still forwards here carrying the
  // fragment — the seeded paths (`/live/seq`, `/live/sequence`, …) and the
  // whole `/view/*` family this one was called before the rename — so links
  // minted at any point keep opening. A link already sent is not editable;
  // only what NEW links say can change.
  const url = `${publicOrigin()}/live#${fragment}`;

  if (url.length > MAX_SHARE_URL_LENGTH) {
    return errorResult(
      joinSections(
        `This ${spec.noun.replace(/^an? /, "")} does not fit in a share ` +
          `link: the URL would be ${url.length.toLocaleString("en-US")} ` +
          `characters, over the ` +
          `${MAX_SHARE_URL_LENGTH.toLocaleString("en-US")}-character ceiling ` +
          `past which enough carrier apps truncate that the link would fail ` +
          `silently for whoever receives it. ${spec.indivisibleBecause}`,
        "To share it, save the canonical `.alab` text below as a file and " +
          "send that — the playground at /live accepts it by paste:",
        fence("", payload),
      ),
    );
  }

  const withinSafeLength = url.length <= SHARE_URL_SAFE_LENGTH;
  return textResult(
    joinSections(
      `Share link for ${JSON.stringify(spec.title)} ` +
        `(${url.length.toLocaleString("en-US")} characters — ` +
        (withinSafeLength
          ? `under ${SHARE_URL_SAFE_LENGTH.toLocaleString("en-US")}, safe in essentially any app):`
          : `within the ${MAX_SHARE_URL_LENGTH.toLocaleString("en-US")}-character ceiling):`),
      url,
      withinSafeLength ? null : EMAIL_CAVEAT,
      spec.opensIn,
      minted.line ?? null,
      privacyLine(minted.expiry),
      // The link carries the .alab conversion of what was PASTED, so a caller
      // holding Mermaid must hear the loss here — after this, only the .alab
      // form travels.
      sourceFormat === "mermaid" ? spec.mermaidCaveat : null,
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
  // "usecase-detected", "unknown-format" and "size" all fall through to the
  // C4 reader, which owns
  // those verdicts and their messages.
  const sequence = readSequence(source);
  if (sequence.status === "ok") {
    return singleDocumentShareLink(
      {
        payload: serializeSequenceText(sequence.file),
        title: sequence.file.metadata.title,
        sourceFormat: sequence.format,
        noun: "a sequence document",
        formatTool: "format_sequence",
        indivisibleBecause:
          "A sequence document has no sub-diagrams to scope a smaller link to.",
        opensIn: "Opens in the sequence playground.",
        mermaidCaveat: MERMAID_SEQUENCE_CAVEAT,
      },
      diagramId,
      ttlDays,
    );
  }
  if (sequence.kind === "parse") return errorResult(sequence.message);

  // Flowcharts, on the same terms and for the same reason the sequence guard
  // runs first: `archlab 1.0 flowchart` and a Mermaid `flowchart`/`graph`
  // header can never parse as any C4 reading, so falling through to the C4
  // reader would answer a share request with a parse error about the wrong
  // grammar. A flowchart PARSE error is final — the text IS a flowchart, just
  // a broken one.
  const flowchart = readFlowchart(source);
  if (flowchart.status === "ok") {
    return singleDocumentShareLink(
      {
        payload: serializeFlowchartText(flowchart.file),
        title: flowchart.file.metadata.title,
        sourceFormat: flowchart.format,
        noun: "a flowchart",
        formatTool: "format_flowchart",
        indivisibleBecause:
          "A flowchart is one graph, with no sub-diagrams to scope a smaller " +
          "link to.",
        opensIn: "Opens in the flowchart playground.",
        mermaidCaveat: MERMAID_FLOWCHART_CAVEAT,
      },
      diagramId,
      ttlDays,
    );
  }
  if (flowchart.kind === "parse") return errorResult(flowchart.message);

  // Use-case diagrams, on the same terms and for the same reason: an
  // `archlab 1.0 usecase` header can never parse as any C4 reading, so falling
  // through would answer a share request with a parse error about the wrong
  // grammar. A use-case PARSE error is final — the text IS a use-case diagram,
  // just a broken one.
  const usecase = readUseCase(source);
  if (usecase.status === "ok") {
    return singleDocumentShareLink(
      {
        payload: serializeUseCaseText(usecase.file),
        title: usecase.file.metadata.title,
        sourceFormat: usecase.format,
        noun: "a use-case diagram",
        formatTool: "format_usecase",
        indivisibleBecause:
          "A use-case diagram is one picture of a system's edge, with no " +
          "sub-diagrams to scope a smaller link to.",
        opensIn: "Opens in the use-case playground.",
        mermaidCaveat: MERMAID_USECASE_CAVEAT,
      },
      diagramId,
      ttlDays,
    );
  }
  if (usecase.kind === "parse") return errorResult(usecase.message);

  // ER diagrams, on the same terms and for the same reason as the three
  // above. Both ER dialects have a real header, so a text that reads as one
  // can never be a C4 reading, and falling through would answer a share
  // request with a parse error about the wrong grammar.
  const er = readEr(source);
  if (er.status === "ok") {
    return singleDocumentShareLink(
      {
        payload: serializeErText(er.file),
        title: er.file.metadata.title,
        sourceFormat: er.format,
        noun: "an ER diagram",
        formatTool: "format_er",
        indivisibleBecause:
          "An ER diagram is one picture of a schema, with no sub-diagrams " +
          "to scope a smaller link to.",
        opensIn: "Opens in the ER playground.",
        mermaidCaveat: MERMAID_ER_CAVEAT,
      },
      diagramId,
      ttlDays,
    );
  }
  if (er.kind === "parse") return errorResult(er.message);

  // Data dictionaries, on the same terms: `archlab 1.0 dict` is exact, so a
  // text that reads as one can never be a C4 reading.
  const dict = readDict(source);
  if (dict.status === "ok") {
    return singleDocumentShareLink(
      {
        payload: serializeDictText(dict.file),
        title: dict.file.metadata.title,
        sourceFormat: dict.format,
        noun: "a data dictionary",
        formatTool: "format_dict",
        indivisibleBecause:
          "A dictionary is one reference document, with no sub-diagrams to " +
          "scope a smaller link to.",
        opensIn: "Opens in the dictionary playground.",
        mermaidCaveat: "",
      },
      diagramId,
      ttlDays,
    );
  }
  if (dict.kind === "parse") return errorResult(dict.message);

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
  // Minted against bare `/live` — see the sequence tool above for why the
  // route carries no seed.
  const url = `${publicOrigin()}/live#${fragment}`;

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
          "a `.alab` file and send that — the playground at /live " +
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
