/**
 * `SequenceLabFile` → standalone SVG string, with no browser anywhere.
 *
 * ═══ THE SECOND RENDERER THIS NOTATION SAID IT WOULD NEVER HAVE ═══
 *
 * `./render-svg.ts` clones the LIVE canvas, and its header argues the case
 * properly: the sequence export adds nothing to the drawing, so a from-model
 * exporter would be a copy of `sequence-diagram.tsx` that drifts from it,
 * where a clone cannot drift because there is only one renderer. That
 * argument is still correct about the DOWNLOAD, which is why the clone stays
 * and stays the only thing the Export button and the GIF exporter call.
 *
 * What changed is that a second question turned up which the clone cannot
 * answer at all: `/api/render` draws a diagram in a route handler, where
 * there is no document, no `getComputedStyle` and no node to clone. Sequence
 * was the ONE kind that route refused, so it was also the one kind Copy
 * markdown refused, and "every notation except this one" is not a feature.
 *
 * SO THE DRIFT IS REAL AND IT IS PAID FOR, not waved away:
 *   - Every coordinate comes from `lib/layout.ts`, the same pure function the
 *     canvas reads. Nothing here computes geometry, so the two renderers
 *     cannot disagree about WHERE anything is — only about how it is painted.
 *   - Every colour comes from `theme.seq`, resolved from the same tokens the
 *     stylesheet paints with. Nothing here holds a colour recipe either.
 *   - What remains — which shape carries which paint — is what
 *     `scripts/sequence-render-check.mjs` pins, element by element, against
 *     the canvas renderer. That is the same deal `check:bezier-path` and
 *     `check:icon-markup` struck for the two C4 dependencies this route used
 *     to refuse over.
 *
 * ═══ WHAT IT DELIBERATELY DOES NOT DRAW ═══
 *
 * The same two categories the clone drops, for the same reasons (its header
 * has the argument): CHROME — hit regions, the fold pill, the truncation
 * mark, all of which are affordances for a pointer — and MOTION, the idle
 * comet bands, which frozen are three bright stripes across every message.
 * Focus and dimming are viewer STATE, not document content, so a
 * server-drawn diagram is always the resting, undimmed whole.
 */

import { countOf, svgAccessibility } from "@/lib/svg-a11y";
import { escapeXml, fmt } from "@/lib/svg-markup";
import { TINT_WASH_OPACITY } from "@/lib/tint";
import type { SequenceLabFile } from "@/types";

/* THE GENERATED TABLE, NOT THE REGISTRY, and the reason is that the registry
   imports React components: a `.tsx` chain takes this module out of reach of
   Node's type stripping, and `check:sequence-render` loads it. The table is
   keyed `<style>:<slug>` over exactly the registry's slugs — `check:icon-
   markup` byte-compares the two — so asking it "does this slug resolve?"
   is the same question with a loadable answer. */
import { ICON_MARKUP } from "@/features/viewer/export/icon-markup.generated";
import type { EmbedIcon } from "@/features/viewer/export/icon-markup";
import { resolveExportGround } from "@/features/viewer/export/ground";
import type {
  ExportTheme,
  SequenceLanePaint,
} from "@/features/viewer/export/theme";
import type { IconStyle } from "@/lib/icon-style";

import type { SequenceHeadEnd } from "../lib/arrow-heads";
import {
  SEQUENCE_HEAD_LINE_INSET,
  SEQUENCE_HEAD_SHAPES,
} from "../lib/arrow-heads";
import type { LaidParticipant, SequenceLayout } from "../lib/layout";
import { estimateTextWidth, layoutSequence, SEQ } from "../lib/layout";

const FONT_SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
/** The chip's word is monospaced on screen (`var(--font-mono)`). */
const FONT_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/** What the render route answers with. Structurally the shared `RenderedSvg`. */
export interface RenderedSequenceFileSvg {
  svg: string;
  width: number;
  height: number;
}

export interface RenderSequenceFileOptions {
  /**
   * How a participant's stack icon becomes markup. The route passes
   * `embeddedIconSvgServer`; absent means the cards draw without icons, which
   * is also what the canvas does for a slug this build does not have.
   */
  embedIcon?: EmbedIcon;
  iconStyle?: IconStyle;
}

/**
 * A participant's lane paint. `lane` is 1-based and CYCLES past five — the
 * layout's own rule (see `LaidParticipant.lane`), restated here as a modulo
 * rather than trusted, because a palette shorter than the layout's lane count
 * would otherwise index past the end and paint `undefined`.
 */
function laneOf(
  theme: ExportTheme,
  participant: LaidParticipant,
): SequenceLanePaint {
  const lanes = theme.seq.lanes;
  return lanes[(participant.lane - 1) % lanes.length];
}

export function renderSequenceFileSvg(
  file: SequenceLabFile,
  theme: ExportTheme,
  options: RenderSequenceFileOptions = {},
): RenderedSequenceFileSvg {
  const layout = layoutSequence(file);
  const laneById = new Map(
    layout.participants.map((p) => [p.id, laneOf(theme, p)] as const),
  );
  const autonumber = file.autonumber === true;

  const parts: string[] = [];
  const push = (part: string): void => {
    parts.push(part);
  };

  /* THE FRAME IS THE LAYOUT'S OWN, minX included. A `note left` of the first
     participant legitimately draws at a negative x, and the canvas starts its
     viewBox there rather than shifting every coordinate right; a frame at
     `0 0` would crop exactly those notes off the image. */
  const frame = {
    x: layout.minX,
    y: 0,
    width: layout.width,
    height: layout.height,
  };

  const a11y = svgAccessibility({
    title: file.metadata.title,
    description: file.metadata.description,
    summary: `A sequence diagram of ${countOf(
      layout.participants.length,
      "participant",
    )} and ${countOf(layout.stepCount, "message")}.`,
    idSeed: file.metadata.title,
  });

  push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(frame.width)}" height="${fmt(frame.height)}" ` +
      `viewBox="${fmt(frame.x)} ${fmt(frame.y)} ${fmt(frame.width)} ${fmt(frame.height)}" font-family="${FONT_SANS}"${a11y.attributes}>`,
  );
  push(a11y.elements);
  // Explicit backdrop: without one the file composites over whatever the
  // viewer paints behind it — black in most image viewers.
  push(
    `<rect x="${fmt(frame.x)}" y="${fmt(frame.y)}" width="${fmt(frame.width)}" height="${fmt(frame.height)}" fill="${theme.canvas}"/>`,
  );

  /* The sheet the drawing was read on, exactly as the other builders carry
     it — and, on the server, exactly as empty. `ground.ts` records that its
     absence is a real loss on `blueprint`, `paper` and `eink`; this notation
     inherits both the call and the loss rather than inventing a third
     answer. */
  const ground = resolveExportGround();
  push(`<defs>${ground.defs}</defs>`);
  push(ground.layers(frame.x, frame.y, frame.width, frame.height));

  /* ---- the card gradients -------------------------------------------------
     One per participant, the vertical lift the canvas mints in its <defs>.
     Both stops come resolved from the palette, so this file restates the
     GEOMETRY of the gradient (top to bottom, bounding-box units) and none of
     its colour. Ids are seeded from the participant id, which the grammar
     already constrains to an identifier — no slugging needed, and stable
     across renders of the same document. */
  const cardGradId = (participantId: string) => `seq-card-${participantId}`;
  const lineGradId = (step: number) => `seq-line-${step}`;
  push("<defs>");
  for (const participant of layout.participants) {
    const paint = laneById.get(participant.id);
    if (paint === undefined) continue;
    push(
      `<linearGradient id="${escapeXml(cardGradId(participant.id))}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0%" stop-color="${paint.cardTop}"/>` +
        `<stop offset="100%" stop-color="${paint.cardBottom}"/>` +
        `</linearGradient>`,
    );
  }
  /* A MESSAGE'S RAMP, sender's lane to receiver's, in USER SPACE so a reply's
     right-to-left run ramps right-to-left too and a self-loop ramps across
     the loop. The canvas mints these inside each message group because its
     stylesheet reaches the comet bands with a descendant selector; nothing
     here has a stylesheet, so they live with the other defs. */
  for (const message of layout.messages) {
    const from = laneById.get(message.from);
    const to = laneById.get(message.to);
    if (from === undefined || to === undefined) continue;
    const x2 = message.self ? message.fromX + SEQ.selfLoopWidth : message.toX;
    const y2 = message.self ? message.y + SEQ.selfLoopHeight : message.y;
    push(
      `<linearGradient id="${lineGradId(message.step)}" gradientUnits="userSpaceOnUse" ` +
        `x1="${fmt(message.fromX)}" y1="${fmt(message.y)}" x2="${fmt(x2)}" y2="${fmt(y2)}">` +
        `<stop offset="0%" stop-color="${from.line}"/>` +
        `<stop offset="100%" stop-color="${to.line}"/>` +
        `</linearGradient>`,
    );
  }
  push("</defs>");

  /* ---- fragment boxes, outermost first (paint order = nesting order) ----- */
  for (const fragment of layout.fragments) {
    const wash =
      fragment.tint !== undefined
        ? `fill="${escapeXml(fragment.tint)}" fill-opacity="${TINT_WASH_OPACITY}"`
        : `fill="${theme.canvas}" fill-opacity="0.5"`;
    push(
      `<rect x="${fmt(fragment.x)}" y="${fmt(fragment.y)}" width="${fmt(fragment.width)}" height="${fmt(fragment.height)}" rx="8" ${wash} stroke="${theme.nodeBorder}" stroke-width="1"/>`,
    );
    for (const divider of fragment.dividers) {
      push(
        `<line x1="${fmt(fragment.x)}" y1="${fmt(divider.y)}" x2="${fmt(fragment.x + fragment.width)}" y2="${fmt(divider.y)}" stroke="${theme.nodeBorder}" stroke-width="1" stroke-dasharray="5 4"/>`,
      );
    }
  }

  /* ---- participant boxes: the bracket around a run of lifelines ---------- */
  for (const box of layout.boxes) {
    const wash =
      box.tint !== undefined
        ? `fill="${escapeXml(box.tint)}" fill-opacity="${TINT_WASH_OPACITY}"`
        : `fill="${theme.canvas}" fill-opacity="0.45"`;
    push(
      `<rect x="${fmt(box.x)}" y="${fmt(box.y)}" width="${fmt(box.width)}" height="${fmt(box.height)}" rx="10" ${wash} stroke="${theme.nodeBorder}" stroke-width="1" stroke-dasharray="4 3"/>`,
    );
    push(
      `<text x="${fmt(box.x + 10)}" y="${fmt(box.y + SEQ.boxLabelHeight - 6)}" font-size="${SEQ.boxLabelFontSize}" font-weight="600" fill="${theme.mutedForeground}">${escapeXml(box.label)}</text>`,
    );
  }

  /* ---- the heading --------------------------------------------------------
     Inside the drawing, which is the whole reason the layout measures it: a
     title that lived in the page's HTML would be missing from every file
     anyone sends on. One <tspan> per wrapped line, at the layout's own
     advances. */
  layout.heading.titleLines.forEach((line, index) => {
    const y = SEQ.marginTop + SEQ.titleFontSize + index * SEQ.titleLineHeight;
    push(
      `<text x="${fmt(SEQ.marginX)}" y="${fmt(y)}" font-size="${SEQ.titleFontSize}" font-weight="600" fill="${theme.foreground}">${escapeXml(line)}</text>`,
    );
  });
  layout.heading.descriptionLines.forEach((line, index) => {
    const y =
      SEQ.marginTop +
      layout.heading.titleLines.length * SEQ.titleLineHeight +
      SEQ.titleDescriptionGap +
      SEQ.descriptionFontSize +
      index * SEQ.descriptionLineHeight;
    push(
      `<text x="${fmt(SEQ.marginX)}" y="${fmt(y)}" font-size="${SEQ.descriptionFontSize}" fill="${theme.mutedForeground}">${escapeXml(line)}</text>`,
    );
  });

  /* ---- lifelines, header cards, footer cards ----------------------------- */
  for (const participant of layout.participants) {
    push(
      participantMarkup(participant, layout, theme, laneById, {
        cardGradId,
        embedIcon: options.embedIcon,
        iconStyle: options.iconStyle,
      }),
    );
  }

  /* ---- activation bars (over lifelines, under arrows) -------------------- */
  for (const bar of layout.activations) {
    push(
      `<rect x="${fmt(bar.x)}" y="${fmt(bar.y0)}" width="${fmt(bar.width)}" height="${fmt(Math.max(0, bar.y1 - bar.y0))}" rx="2" fill="${theme.secondary}" stroke="${theme.nodeBorder}" stroke-width="1"/>`,
    );
  }

  /* ---- fragment labels: chips and guards, OVER the bars -------------------
     Split from the boxes above for the reason the canvas splits them: SVG has
     no z-index, and while these were drawn with their boxes an activation bar
     at a fragment's left edge cut the chip in half. */
  for (const fragment of layout.fragments) {
    const chipWidth = Math.max(
      34,
      Math.ceil(estimateTextWidth(fragment.kind, SEQ.fragmentFontSize)) + 14,
    );
    push(
      `<rect x="${fmt(fragment.x)}" y="${fmt(fragment.y)}" width="${fmt(chipWidth)}" height="18" rx="6" fill="${theme.secondary}" stroke="${theme.border}"/>`,
    );
    push(
      `<text x="${fmt(fragment.x + chipWidth / 2)}" y="${fmt(fragment.y + 13)}" text-anchor="middle" font-size="${SEQ.fragmentFontSize}" font-family="${FONT_MONO}" fill="${theme.secondaryForeground}">${escapeXml(fragment.kind)}</text>`,
    );
    if (fragment.label !== undefined) {
      push(
        `<text x="${fmt(fragment.x + chipWidth + 6)}" y="${fmt(fragment.y + 13)}" font-size="${SEQ.fragmentFontSize}" font-style="italic" fill="${theme.mutedForeground}">${escapeXml(`[${fragment.label}]`)}</text>`,
      );
    }
    for (const divider of fragment.dividers) {
      if (divider.label === undefined) continue;
      push(
        `<text x="${fmt(fragment.x + 10)}" y="${fmt(divider.y - 5)}" font-size="${SEQ.fragmentFontSize}" font-style="italic" fill="${theme.mutedForeground}">${escapeXml(`[${divider.label}]`)}</text>`,
      );
    }
  }

  /* ---- notes --------------------------------------------------------------
     The classic dog-eared box, tinted with the warning wash the palette
     resolved. One <tspan> per WRAPPED line from `note.lines`, never
     `note.text`: SVG text does not wrap, and the raw string put a single
     unbroken line through both walls of the box. */
  for (const note of layout.notes) {
    push(
      `<path d="M ${fmt(note.x)} ${fmt(note.y)} H ${fmt(note.x + note.width - 10)} L ${fmt(note.x + note.width)} ${fmt(note.y + 10)} V ${fmt(note.y + note.height)} H ${fmt(note.x)} Z" fill="${theme.seq.noteFill}" stroke="${theme.seq.noteStroke}" stroke-width="1"/>`,
    );
    push(
      `<path d="M ${fmt(note.x + note.width - 10)} ${fmt(note.y)} v 10 h 10" fill="none" stroke="${theme.seq.noteStroke}" stroke-width="1"/>`,
    );
    const centre = note.x + note.width / 2;
    note.lines.forEach((line, index) => {
      const y =
        note.y +
        note.height / 2 +
        4 -
        ((note.lines.length - 1) * SEQ.noteLineHeight) / 2 +
        index * SEQ.noteLineHeight;
      push(
        `<text x="${fmt(centre)}" y="${fmt(y)}" text-anchor="middle" font-size="${SEQ.noteFontSize}" fill="${theme.foreground}">${escapeXml(line)}</text>`,
      );
    });
  }

  /* ---- messages ----------------------------------------------------------- */
  for (const message of layout.messages) {
    const { y, fromX, toX, lineStyle, headStyle, self } = message;
    const dir = toX >= fromX ? 1 : -1;

    /* Head geometry, from the shared table. A self-message's head points
       LEFT, back at the lifeline, and its SOURCE end points the other way —
       which is what makes a bidirectional self-message draw two heads facing
       each other across the loop. */
    const target: SequenceHeadEnd = self
      ? { x: fromX + 7, y: y + SEQ.selfLoopHeight, direction: -1 }
      : { x: toX, y, direction: dir };
    const source: SequenceHeadEnd = self
      ? { x: fromX, y, direction: 1 }
      : { x: fromX, y, direction: dir === 1 ? -1 : 1 };
    const head = SEQUENCE_HEAD_SHAPES[headStyle](target, source);

    const inset = SEQUENCE_HEAD_LINE_INSET[headStyle];
    const lineEndX = self
      ? target.x - inset.target * target.direction
      : toX - inset.target * dir;
    const linePath = self
      ? `M ${fmt(fromX)} ${fmt(y)} h ${SEQ.selfLoopWidth} v ${SEQ.selfLoopHeight} H ${fmt(lineEndX)}`
      : `M ${fmt(fromX)} ${fmt(y)} L ${fmt(lineEndX)} ${fmt(y)}`;

    /* The ramp when both endpoints have a lane, and the flat `--edge` line
       otherwise — the same fallback the stylesheet's `var(--seq-line-paint,
       var(--edge))` gives the canvas, never a dangling url(). */
    const hasRamp = laneById.has(message.from) && laneById.has(message.to);
    const stroke = hasRamp ? `url(#${lineGradId(message.step)})` : theme.edge;
    const dash = lineStyle === "dotted" ? ' stroke-dasharray="6 5"' : "";
    push(
      `<path d="${linePath}" fill="none" stroke="${stroke}" stroke-width="1.5"${dash}/>`,
    );

    for (const d of head.filled) {
      push(`<path d="${d}" fill="${theme.edge}"/>`);
    }
    for (const d of head.stroked) {
      push(
        `<path d="${d}" fill="none" stroke="${theme.edge}" stroke-width="1.5"/>`,
      );
    }

    const midX = (fromX + toX) / 2;
    const labelX = self ? fromX + SEQ.selfLoopWidth + 10 : midX;
    const labelY = self ? y + SEQ.selfLoopHeight / 2 + 4 : y - 7;
    const anchor = self ? "start" : "middle";
    /* THE LABEL IS ONE <text> OF UP TO THREE SPANS, because two of them are a
       different colour: the step number and the technology suffix are muted
       where the label itself is not. Nested tspans keep them on one advance,
       which is what stops `[gRPC]` from landing back at the anchor. */
    const spans = [
      autonumber
        ? `<tspan fill="${theme.mutedForeground}">${message.step}. </tspan>`
        : "",
      escapeXml(message.label),
      message.technology === undefined
        ? ""
        : `<tspan fill="${theme.mutedForeground}"> ${escapeXml(`[${message.technology}]`)}</tspan>`,
    ].join("");
    /* `xml:space="preserve"`, and it is load-bearing rather than tidy. Both
       gaps above are LEADING or TRAILING whitespace in their own text node —
       exactly what the default XML whitespace handling strips — so without
       it the words jam against the number and the suffix: "1.Clicks Place
       order[HTTPS]". The canvas needs no equivalent because the browser
       keeps the gap for the surrounding flow. A non-breaking space was the
       first fix and is NOT enough: librsvg drops that too. The reserved
       label width already counts these spaces (`messageLabelWidth` measures
       the suffix with its own), so preserving them is also what keeps the
       drawn label inside the gap the layout planned for it. */
    push(
      `<text x="${fmt(labelX)}" y="${fmt(labelY)}" text-anchor="${anchor}" font-size="${SEQ.labelFontSize}" fill="${theme.foreground}" xml:space="preserve">${spans}</text>`,
    );
  }

  push("</svg>");
  return {
    svg: parts.join(""),
    width: Math.round(frame.width),
    height: Math.round(frame.height),
  };
}

/**
 * One participant column: its lifeline, its actor disc, its header card and
 * the footer card that repeats the name at the foot of a long flow.
 *
 * Everything about the card's TALLNESS comes from the layout — an actor's
 * card starts `actorGlyphHeight` lower to leave the disc its band, and every
 * column keeps one baseline so the row reads as a row.
 */
function participantMarkup(
  participant: LaidParticipant,
  layout: SequenceLayout,
  theme: ExportTheme,
  laneById: ReadonlyMap<string, SequenceLanePaint>,
  options: {
    cardGradId: (participantId: string) => string;
    embedIcon?: EmbedIcon;
    iconStyle?: IconStyle;
  },
): string {
  const { x, headerWidth } = participant;
  const paint = laneById.get(participant.id);
  const lane = paint?.lane ?? theme.nodeBorder;
  const cardFill =
    paint === undefined
      ? theme.node
      : `url(#${options.cardGradId(participant.id)})`;
  const boxTop =
    layout.headerTop +
    (participant.kind === "actor" ? SEQ.actorGlyphHeight : 0);
  const boxHeight = layout.headerHeight - (boxTop - layout.headerTop);

  const parts: string[] = [];

  /* The lifeline wears the lane at reduced strength: it marks the column all
     the way down without out-shouting the message lines that cross it. It
     runs to the FOOTER, not to `lifelineBottom` — the latter is the frontier
     activation bars close against, which is a different fact. */
  parts.push(
    `<line x1="${fmt(x)}" y1="${fmt(layout.lifelineTop)}" x2="${fmt(x)}" y2="${fmt(layout.footerTop)}" stroke="${lane}" stroke-opacity="0.6" stroke-width="1.25" stroke-dasharray="4 4"/>`,
  );

  /* THE ACTOR'S AVATAR — a disc carrying a head-and-shoulders bust, which is
     what a person looks like at 24px. It wears the card's own fill and
     border so it reads as part of the card; the bust is filled in the lane,
     a decorative mark rather than text. */
  if (participant.kind === "actor") {
    const top = layout.headerTop;
    parts.push(
      `<circle cx="${fmt(x)}" cy="${fmt(top + 13)}" r="12" fill="${cardFill}" stroke="${lane}" stroke-width="1.5"/>`,
      `<circle cx="${fmt(x)}" cy="${fmt(top + 10)}" r="3.4" fill="${lane}"/>`,
      `<path d="M ${fmt(x - 5.6)} ${fmt(top + 19)} a 5.6 5.6 0 0 1 11.2 0 Z" fill="${lane}"/>`,
    );
  }

  parts.push(
    `<rect x="${fmt(x - headerWidth / 2)}" y="${fmt(boxTop)}" width="${fmt(headerWidth)}" height="${fmt(boxHeight)}" rx="8" fill="${cardFill}" stroke="${lane}" stroke-width="1.5"/>`,
  );

  /* THE NAME IS ANCHORED, THE ICON IS PLACED — the canvas's own rule, and it
     matters more here: an estimate that moved the name would put it off
     centre above a technology line that is anchored and lands exactly. Only
     the 16px mark rides the estimate, where a pixel of drift is invisible. */
  /* Bundled into one nullable rather than three separate checks: the run
     below has to reserve space for exactly the cases the draw below emits,
     and two independent conditions are how those get to disagree. */
  const { embedIcon, iconStyle } = options;
  const icon =
    participant.icon === undefined ||
    embedIcon === undefined ||
    iconStyle === undefined ||
    ICON_MARKUP[`${iconStyle}:${participant.icon}`] === undefined
      ? null
      : { slug: participant.icon, embed: embedIcon, style: iconStyle };
  const iconRun = icon === null ? 0 : SEQ.iconSize + SEQ.iconGap;
  const nameCentre = x + iconRun / 2;
  const nameY =
    boxTop +
    (participant.technology === undefined
      ? boxHeight / 2 + 4
      : boxHeight / 2 - 3);

  if (icon !== null) {
    /* `type` is required by the embedder's C4-shaped argument and is never
       read here: it only picks a DEFAULT icon, and this branch runs solely
       when the slug already resolved in the registry. An unknown slug draws
       no icon at all, which is what the canvas does — a document naming an
       icon this build lacks is still a valid document. */
    parts.push(
      icon.embed(
        { icon: icon.slug, type: "softwareSystem" },
        nameCentre -
          estimateTextWidth(participant.name, SEQ.nameFontSize) / 2 -
          SEQ.iconGap -
          SEQ.iconSize,
        // Optically centred on the text's x-height: `nameY` is where the
        // glyphs sit, so an icon aligned to it would hang below the word.
        nameY - SEQ.iconSize + 3,
        SEQ.iconSize,
        theme.nodeMeta,
        icon.style,
      ),
    );
  }

  parts.push(
    `<text x="${fmt(nameCentre)}" y="${fmt(nameY)}" text-anchor="middle" font-size="${SEQ.nameFontSize}" font-weight="600" fill="${theme.nodeForeground}">${escapeXml(participant.name)}</text>`,
  );
  if (participant.technology !== undefined) {
    parts.push(
      `<text x="${fmt(x)}" y="${fmt(boxTop + boxHeight / 2 + 12)}" text-anchor="middle" font-size="${SEQ.metaFontSize}" fill="${theme.nodeMeta}">${escapeXml(`[${participant.technology}]`)}</text>`,
    );
  }

  /* THE FOOTER CARD — the name repeated at the foot of the lifeline, the
     convention every hand-drawn sequence diagram uses. No actor glyph (the
     silhouette is an identity cue; repeating it invites reading the footer as
     a second actor) and no technology line (the header already states it). */
  parts.push(
    `<rect x="${fmt(x - headerWidth / 2)}" y="${fmt(layout.footerTop)}" width="${fmt(headerWidth)}" height="${fmt(layout.footerHeight)}" rx="8" fill="${cardFill}" stroke="${lane}" stroke-width="1.5"/>`,
    `<text x="${fmt(x)}" y="${fmt(layout.footerTop + layout.footerHeight / 2 + 4)}" text-anchor="middle" font-size="${SEQ.nameFontSize}" font-weight="600" fill="${theme.nodeForeground}">${escapeXml(participant.name)}</text>`,
  );

  return parts.join("");
}
