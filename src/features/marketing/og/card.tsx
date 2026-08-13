/**
 * The shared frame every social card is built from — one card per DOCUMENT
 * KIND, all wearing the same skin.
 *
 * WHY THIS MODULE EXISTS. There used to be exactly one card, at the root, and
 * its copy said "C4 architecture diagrams" — so a link to the sequence
 * playground previewed as an advert for the other half of the product, and a
 * link to anything previewed as the landing page. Two more cards without a
 * shared frame would have been three hand-tuned layouts drifting apart on the
 * first palette change, which is the same reasoning that keeps the card
 * generated from JSX rather than committed as a PNG.
 *
 * SATORI, NOT A BROWSER. `next/og` renders this with Satori, which supports a
 * deliberate subset of CSS. Three rules govern everything below and are not
 * stylistic preferences:
 *   - every element that contains more than one child declares `display:
 *     "flex"` explicitly; there is no block layout and no CSS grid;
 *   - colours are sRGB hex, hand-converted from the dark theme's `oklch()`
 *     tokens in `globals.css`, because Satori does not parse `oklch()`;
 *   - no external font or image is fetched — the cards are built at deploy
 *     time and must not depend on a network.
 *
 * The palette follows the dark theme because the app is dark by default
 * (`enableSystem={false}`), so the card matches the page a click lands on.
 */

/* Dark-theme tokens, sRGB approximations of the oklch() values. */
export const OG = {
  background: "#1b1b23",
  card: "#232330",
  border: "#3c3c4d",
  foreground: "#f2f2f8",
  muted: "#a3a3b5",
  primary: "#9d8cff",
  accent: "#4fd6e4",
  /** The sequence lanes, verbatim from `--seq-lane-*` (already hex there). */
  lanes: ["#1baf7a", "#eb6834", "#2a78d6", "#e87ba4", "#4a3aa7"],
} as const;

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

/**
 * The card: an eyebrow, a two-part headline whose second half carries the
 * primary→accent gradient (Satori supports `background-clip: text`), a footer
 * line, and an illustration column on the right.
 *
 * `headlineTail` is separate from `headline` rather than parsed out of one
 * string because the gradient applies to a whole element — and which words get
 * the emphasis is an editorial decision per card, not something to infer from
 * punctuation.
 */
export function OgCard({
  eyebrow,
  headline,
  headlineTail,
  footer,
  art,
}: {
  eyebrow: string;
  headline: string;
  headlineTail: string;
  footer: string;
  art: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: OG.background,
        // The landing page's grid, so the card and the page read as one thing.
        backgroundImage:
          "linear-gradient(to right, #26262f 1px, transparent 1px), linear-gradient(to bottom, #26262f 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 620 }}>
        <span
          style={{
            fontSize: 26,
            letterSpacing: 2,
            color: OG.accent,
            marginBottom: 20,
          }}
        >
          {eyebrow}
        </span>
        <span
          style={{
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.15,
            color: OG.foreground,
          }}
        >
          {headline}
        </span>
        <span
          style={{
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.15,
            backgroundImage: `linear-gradient(90deg, ${OG.primary}, ${OG.accent})`,
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {headlineTail}
        </span>
        <span style={{ fontSize: 28, color: OG.muted, marginTop: 32 }}>
          {footer}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>{art}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Illustrations — one per document kind, each a miniature of the real thing   */
/* -------------------------------------------------------------------------- */

/** One C4 node card: name over technology, the editor's proportions. */
export function OgNode({
  name,
  tech,
  width = 300,
}: {
  name: string;
  tech: string;
  width?: number;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        padding: "18px 22px",
        borderRadius: 14,
        border: `1.5px solid ${OG.border}`,
        background: OG.card,
      }}
    >
      <span style={{ fontSize: 24, fontWeight: 600, color: OG.foreground }}>
        {name}
      </span>
      <span style={{ fontSize: 18, color: OG.muted }}>{tech}</span>
    </div>
  );
}

/** The vertical rule between two stacked nodes — offset so the stack reads as
 * a diagram rather than as a list. */
export function OgConnector({
  height = 26,
}: {
  height?: number;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        width: 2,
        height,
        marginLeft: 60,
        background: OG.border,
      }}
    />
  );
}

/** A C4 container stack. */
export function OgC4Stack(): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <OgNode name="Web App" tech="Next.js · SSR" />
      <OgConnector />
      <OgNode name="API Service" tech="Go · REST" />
      <OgConnector />
      <OgNode name="Orders DB" tech="PostgreSQL" />
    </div>
  );
}

/**
 * A labelled message: the label over a rule that ends in an arrowhead.
 *
 * The head is not decoration. Without it these read as underlined captions —
 * which is exactly how the root card looked before, two labels with rules under
 * them — and direction is the whole content of a message.
 */
export function OgMessage({
  label,
  colour,
  width = 300,
}: {
  label: string;
  colour: string;
  width?: number;
}): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", width }}>
      <span style={{ fontSize: 17, color: OG.muted }}>{label}</span>
      <div
        style={{
          display: "flex",
          position: "relative",
          width,
          height: 10,
          marginTop: 6,
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            top: 4,
            width,
            height: 2,
            background: colour,
          }}
        />
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: width - 10,
            top: 0,
            width: 10,
            height: 10,
            borderTop: `2px solid ${colour}`,
            borderRight: `2px solid ${colour}`,
            transform: "rotate(45deg)",
          }}
        />
      </div>
    </div>
  );
}

/**
 * A sequence miniature: participant headers in their lane colours, lifelines
 * dropping from them, and messages crossing between.
 *
 * Built from absolutely-positioned rules rather than SVG — Satori's SVG
 * support does not extend to the marker-ended paths the real renderer uses,
 * and an arrowhead is cheaper as a rotated square than as a path here. The
 * geometry is hand-set for 3 lanes at this size; it is an illustration of the
 * view, not a call into `layoutSequence` (that returns pixel geometry for a
 * whole document, which is not what fits in 400px of card).
 */
export function OgSequenceMini(): React.ReactElement {
  const lanes = [0, 1, 2];
  /** Lifeline x, measured to the CENTRE of each header. */
  const laneX = [50, 185, 320];
  /** [from, to, y] — a call, a call deeper, a reply, a reply out. */
  const messages: [number, number, number][] = [
    [0, 1, 140],
    [1, 2, 215],
    [2, 1, 290],
    [1, 0, 365],
  ];
  const names = ["Customer", "Order API", "Payments"];

  return (
    <div
      style={{ display: "flex", position: "relative", width: 400, height: 430 }}
    >
      {/* Headers + lifelines. Positioned from the lifeline x and shifted back
          by half the header's width, so the rule leaves the card's centre. */}
      {lanes.map((lane) => (
        <div
          key={`lane-${lane}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "absolute",
            left: laneX[lane] - 70,
            top: 0,
            width: 140,
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "10px 14px",
              borderRadius: 10,
              border: `1.5px solid ${OG.lanes[lane]}`,
              background: OG.card,
              fontSize: 18,
              color: OG.foreground,
              // A wrapped header is a taller box, which drops its lifeline out
              // of line with its neighbours' — the names are short, so hold
              // them on one line rather than widening every column for one.
              whiteSpace: "nowrap",
            }}
          >
            {names[lane]}
          </div>
          <div
            style={{
              display: "flex",
              width: 2,
              height: 360,
              background: OG.border,
            }}
          />
        </div>
      ))}

      {/* Messages: a rule between two lifelines plus an ARROWHEAD at the
          target. Without the head these read as four underlines rather than as
          a conversation — the direction is the whole content of a sequence
          diagram. The head is a bordered box rotated 45° (Satori has no
          marker-end and no clip-path), so it is two strokes meeting at the
          lifeline, which is what an open arrowhead is. */}
      {messages.map(([from, to, y], index) => {
        const x1 = laneX[from];
        const x2 = laneX[to];
        const rightwards = x2 > x1;
        return (
          <div key={`msg-${index}`} style={{ display: "flex" }}>
            <div
              style={{
                display: "flex",
                position: "absolute",
                left: Math.min(x1, x2),
                top: y,
                width: Math.abs(x2 - x1),
                height: 2,
                background: OG.lanes[from],
              }}
            />
            <div
              style={{
                display: "flex",
                position: "absolute",
                left: x2 + (rightwards ? -11 : 1),
                top: y - 4,
                width: 10,
                height: 10,
                borderTop: `2px solid ${OG.lanes[from]}`,
                ...(rightwards
                  ? { borderRight: `2px solid ${OG.lanes[from]}` }
                  : { borderLeft: `2px solid ${OG.lanes[from]}` }),
                transform: "rotate(45deg)",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
