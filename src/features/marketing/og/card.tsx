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
 * The palette follows the HIGH CONTRAST theme, because that is what
 * `DEFAULT_THEME` now is (`enableSystem={false}`, so it is what everyone lands
 * on) and the card's whole job is to look like the page behind the link.
 */

/* `.contrast` tokens, exactly converted — no hand-lifting, which this file did
   for years and no longer needs to.
   THE GROUND IS #000000 AND THE CARD IS #060606, and that is not a conversion
   bug: `.contrast` puts its ground at `oklch(0.05 0 0)` and its cards 0.07 above
   it, and sRGB has no room to show a 0.07 step that close to black. In the app it
   does not need to — the theme separates by OUTLINE, not by fill, which is what
   "high contrast" means there. So on this card the node boxes read as bright
   `#a2a4ab` rules on black with white type inside, exactly as they do on the
   page, and the fill step being invisible costs nothing.
   The old hand-lift existed because a near-black card "looks broken rather than
   dark" in a feed. That risk is real and this palette does not fully escape it:
   sampling the rendered PNG, 77% of it is pure black and only 2.8% of pixels
   carry bright ink. What keeps it from reading as a blank rectangle is the grid
   below at 12.8% and the white headline — not a lot. If it ever needs to be
   louder in a feed, the honest lever is `grid`, which costs nothing anywhere
   else, rather than lifting the ground away from the theme it is meant to
   mirror. */
export const OG = {
  background: "#000000",
  card: "#060606",
  border: "#a2a4ab",
  foreground: "#ffffff",
  muted: "#d7d7d7",
  primary: "#baafff",
  accent: "#53f2f2",
  /* The grid, and it is IN this table because it was not: the lines were a
     hardcoded `#26262f` — a leftover from a theme two changes ago — and they are
     12.8% of the rendered image's pixels, more than every bright element on the
     card put together. Nothing complained, because the assertion that pins this
     palette to the theme's tokens only knew about the seven keys that were
     already here. Sampling the actual PNG is what found it. */
  grid: "#2e2e2e",
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
        backgroundImage: `linear-gradient(to right, ${OG.grid} 1px, transparent 1px), linear-gradient(to bottom, ${OG.grid} 1px, transparent 1px)`,
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
 * The KIND-AGNOSTIC illustration: a C4 container pair over a two-message
 * exchange.
 *
 * It exists because two routes have to speak for all six document kinds at
 * once — the site root, and `/live`, which is the single playground every share
 * link is minted against. A card can carry one image, so neither can show "the"
 * diagram; what they can show is that there is more than one kind of diagram
 * here, without becoming a collage. Six full miniatures competing for the same
 * 400px would be unreadable at 1200x630; two fragments read instantly.
 *
 * AND THE COPY NAMES THE COUNT RATHER THAN THE KINDS. The footer used to list
 * them, on the argument that a strip of text scales where artwork does not — it
 * does not scale to six at 28px in a 620px column, which is why both cards now
 * say "six notations" and spend the rest of the line on the capability. The
 * reasoning is on `app/opengraph-image.tsx`.
 *
 * IT IS SHARED RATHER THAN COPIED because the two cards had drifted already:
 * `/live` was previewing a three-node C4 stack, so a use-case or flowchart link
 * — the exact failure the per-kind cards were built to fix — previewed as an
 * advert for C4.
 */
export function OgKindMix(): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <OgNode name="Web App" tech="Next.js · SSR" />
        <OgConnector height={24} />
        <OgNode name="Orders DB" tech="PostgreSQL" />
      </div>

      {/* A two-message exchange — the sequence half, at a glance. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <OgMessage label="Place the order" colour={OG.lanes[2]} />
        <OgMessage label="charge.succeeded" colour={OG.lanes[0]} />
      </div>
    </div>
  );
}

/**
 * The MCP illustration: a client, the endpoint it connects to, and three of the
 * tools it gets — each with the verdict the real parser hands back.
 *
 * `/mcp` had no card of its own, so every link to it previewed with the root
 * card: "Architecture diagrams that survive review", over a C4 stack. That is
 * the wrong promise for the one page whose subject is not a diagram at all —
 * someone shares `/mcp` to say "your agent can drive this", and the preview said
 * nothing about agents. This draws the connection instead of a diagram.
 *
 * A WORD, NOT A TICK, for the verdict column. A check mark (U+2713) is outside
 * Latin-1 and no font is fetched, so it would ship as a tofu box — the failure
 * `og-cards-check` exists to catch, and that check reads this file's PROSE too,
 * so the glyph cannot even be named here. "valid" in the queue green says the
 * same thing and is legible at feed size, where a 12px glyph is not.
 *
 * THE ROWS ARE A PARAMETER, not literals in this file. Nothing in
 * `features/marketing` may know what the MCP server registers — `catalog.ts`
 * says so in as many words, and it is where the card's three are resolved and
 * paired with their outcome word (`MCP_CARD_TOOLS`). Three rows is what the
 * frame has room for; a fourth would set the type below feed-legible size.
 */
export function OgMcpMini({
  tools,
}: {
  tools: readonly { name: string; result: string }[];
}): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 400 }}>
      <OgNode name="Claude Code" tech="any MCP client" width={400} />
      <OgConnector height={24} />
      <OgNode name="/api/mcp" tech="stateless · read-only" width={400} />
      <OgConnector height={24} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tools.map((tool) => (
          <div
            key={tool.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: 400,
              padding: "12px 20px",
              borderRadius: 10,
              border: `1.5px solid ${OG.border}`,
              background: OG.card,
            }}
          >
            <span style={{ fontSize: 21, color: OG.foreground }}>
              {tool.name}
            </span>
            <span style={{ fontSize: 18, color: OG.lanes[0] }}>
              {tool.result}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A flowchart miniature: a terminator, a step, a decision diamond, and the
 * two things only a flowchart draws — a guarded branch and a loop back.
 *
 * Absolutely-positioned rules and rotated bordered boxes, the same Satori
 * vocabulary as `OgSequenceMini` and for the same reasons: no marker-ended
 * paths, no clip-path, arrowheads as two strokes meeting at a rotated
 * corner. The diamond is a rotated square with its label overlaid
 * UN-rotated — rotating the text with the box would put the one word on the
 * card at 45°. Hand-set geometry: an illustration of the view, not a call
 * into `layoutFlowchart`.
 */
export function OgFlowMini(): React.ReactElement {
  const cx = 190;
  return (
    <div
      style={{ display: "flex", position: "relative", width: 400, height: 430 }}
    >
      {/* start terminator */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "absolute",
          left: cx - 90,
          top: 0,
          width: 180,
          height: 52,
          borderRadius: 999,
          border: `1.5px solid ${OG.lanes[0]}`,
          background: OG.card,
          fontSize: 18,
          color: OG.foreground,
        }}
      >
        Order placed
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: cx - 1,
          top: 52,
          width: 2,
          height: 26,
          background: OG.border,
        }}
      />

      {/* step */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "absolute",
          left: cx - 100,
          top: 78,
          width: 200,
          height: 56,
          borderRadius: 12,
          border: `1.5px solid ${OG.lanes[2]}`,
          background: OG.card,
          fontSize: 18,
          color: OG.foreground,
        }}
      >
        Charge the card
      </div>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: cx - 1,
          top: 134,
          width: 2,
          height: 28,
          background: OG.border,
        }}
      />

      {/* decision: a rotated square, its label overlaid un-rotated */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: cx - 40,
          top: 178,
          width: 80,
          height: 80,
          borderRadius: 10,
          border: `1.5px solid ${OG.lanes[1]}`,
          background: OG.card,
          transform: "rotate(45deg)",
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          position: "absolute",
          left: cx - 40,
          top: 206,
          width: 80,
          fontSize: 18,
          color: OG.foreground,
        }}
      >
        Paid?
      </div>

      {/* yes branch, arrowhead down into the end terminator */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: cx - 1,
          top: 276,
          width: 2,
          height: 56,
          background: OG.lanes[0],
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: cx - 5,
          top: 322,
          width: 10,
          height: 10,
          borderBottom: `2px solid ${OG.lanes[0]}`,
          borderRight: `2px solid ${OG.lanes[0]}`,
          transform: "rotate(45deg)",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: cx + 12,
          top: 288,
          fontSize: 16,
          color: OG.muted,
        }}
      >
        yes
      </span>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "absolute",
          left: cx - 80,
          top: 336,
          width: 160,
          height: 52,
          borderRadius: 999,
          border: `1.5px solid ${OG.lanes[4]}`,
          background: OG.card,
          fontSize: 18,
          color: OG.foreground,
        }}
      >
        Receipt sent
      </div>

      {/* retry loop: out of the diamond's right tip, back up into the step —
          the elbow that says "this is a flowchart" at card size */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: cx + 46,
          top: 217,
          width: 330 - (cx + 46),
          height: 2,
          background: OG.lanes[1],
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 329,
          top: 106,
          width: 2,
          height: 112,
          background: OG.lanes[1],
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: cx + 102,
          top: 105,
          width: 330 - (cx + 102),
          height: 2,
          background: OG.lanes[1],
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: cx + 103,
          top: 101,
          width: 10,
          height: 10,
          borderBottom: `2px solid ${OG.lanes[1]}`,
          borderLeft: `2px solid ${OG.lanes[1]}`,
          transform: "rotate(45deg)",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 340,
          top: 152,
          fontSize: 16,
          color: OG.muted,
        }}
      >
        retry
      </span>
    </div>
  );
}

/**
 * A use-case miniature: two stick-free actors (a circle head with a name —
 * Satori draws no stick figures worth having at this size), a bordered
 * system boundary titled like the real renderer's, stadium-shaped use cases
 * inside it, and the three line kinds that make the diagram a use-case
 * diagram: PLAIN association rules (no arrowhead — a UML association is
 * undirected, and adding a head here would draw the exact mistake the
 * importer refuses), a dashed «include» dependency with its arrowhead, and a
 * generalization from Customer up to Guest.
 *
 * Same Satori vocabulary as its three siblings — absolutely-positioned
 * rules, arrowheads as two border strokes on a rotated box — and hand-set
 * geometry: an illustration of the view, not a call into `layoutUseCase`.
 */
export function OgUseCaseMini(): React.ReactElement {
  /** [circle-left, circle-top, lane, name] per actor. */
  const actors: [number, number, number, string][] = [
    [26, 92, 3, "Guest"],
    [26, 232, 4, "Customer"],
  ];
  /** [top, lane, label] per stadium, all sharing the boundary's column. */
  const usecases: [number, number, string][] = [
    [92, 2, "Browse the menu"],
    [232, 0, "Place an order"],
    [340, 1, "Pay for it"],
  ];
  return (
    <div
      style={{ display: "flex", position: "relative", width: 400, height: 430 }}
    >
      {/* the system boundary, titled the way the real renderer titles it */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 150,
          top: 24,
          width: 240,
          height: 396,
          borderRadius: 16,
          border: `1.5px solid ${OG.border}`,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 170,
          top: 40,
          fontSize: 18,
          color: OG.muted,
        }}
      >
        Web Shop
      </span>

      {actors.map(([left, top, lane, name]) => (
        <div
          key={name}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "absolute",
            left,
            top,
            width: 90,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 34,
              height: 34,
              borderRadius: 999,
              border: `2px solid ${OG.lanes[lane]}`,
              background: OG.card,
            }}
          />
          <span style={{ fontSize: 17, color: OG.foreground, marginTop: 6 }}>
            {name}
          </span>
        </div>
      ))}

      {usecases.map(([top, lane, label]) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "absolute",
            left: 172,
            top,
            width: 196,
            height: 52,
            borderRadius: 999,
            border: `1.5px solid ${OG.lanes[lane]}`,
            background: OG.card,
            fontSize: 18,
            color: OG.foreground,
          }}
        >
          {label}
        </div>
      ))}

      {/* associations: plain rules, NO arrowhead — undirected is the point */}
      {[118, 258].map((y) => (
        <div
          key={`assoc-${y}`}
          style={{
            display: "flex",
            position: "absolute",
            left: 92,
            top: y - 1,
            width: 80,
            height: 2,
            background: OG.border,
          }}
        />
      ))}

      {/* «include»: a dashed rule from the order down into Pay, with a head */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 269,
          top: 284,
          width: 0,
          height: 50,
          borderLeft: `2px dashed ${OG.lanes[1]}`,
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 265,
          top: 326,
          width: 10,
          height: 10,
          borderBottom: `2px solid ${OG.lanes[1]}`,
          borderRight: `2px solid ${OG.lanes[1]}`,
          transform: "rotate(45deg)",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 284,
          top: 296,
          fontSize: 16,
          color: OG.muted,
        }}
      >
        «include»
      </span>

      {/* generalization: Customer is-a Guest — the head points at the parent */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 42,
          top: 150,
          width: 0,
          height: 82,
          borderLeft: `2px solid ${OG.lanes[4]}`,
        }}
      />
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 38,
          top: 148,
          width: 10,
          height: 10,
          borderTop: `2px solid ${OG.lanes[4]}`,
          borderLeft: `2px solid ${OG.lanes[4]}`,
          transform: "rotate(45deg)",
        }}
      />
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
