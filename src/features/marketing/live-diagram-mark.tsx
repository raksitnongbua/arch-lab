/**
 * The hero call to action's face: a miniature C4 diagram that DRAWS ITSELF.
 *
 * A generic play triangle sat here first, and it said "media" rather than
 * "diagram" — the one thing the button actually opens. This mark is the product
 * in 16 pixels: two nodes, the relationship between them, and a spark running
 * that relationship. It is also the only control in the app whose icon performs
 * what the destination does, which is the argument for it existing at all.
 *
 * THE GESTURES ARE THE APP'S OWN, not new ones. The edge draws by
 * `stroke-dashoffset` over `pathLength=1` exactly as a flowchart edge does in
 * its entrance trace, and the spark is the travelling band the idle pulse uses,
 * at the same one-dash-period-per-cycle so its wrap is invisible. Someone who
 * has watched a real diagram load has already seen both.
 *
 * House glyph conventions (see `C4Glyph` and friends in app/demo/page.tsx): a
 * 16x16 viewBox, `currentColor`, hairline strokes, no fill — so the mark takes
 * the button's own text colour and needs no palette of its own.
 *
 * The choreography, the hover speed-up and the reduced-motion stop all live in
 * `globals.css` under `af-cta-*`; nothing here animates, so this stays a plain
 * server component.
 */
export function LiveDiagramMark(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="af-cta-mark size-4 overflow-visible"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      {/* The two nodes: a system and the container it drills into — the same
          nested-rectangle shorthand the demo index's C4 glyph uses. */}
      <rect
        className="af-cta-node af-cta-node-a"
        x="0.9"
        y="1.4"
        width="6.4"
        height="5"
        rx="1.6"
      />
      <rect
        className="af-cta-node af-cta-node-b"
        x="8.7"
        y="9.6"
        width="6.4"
        height="5"
        rx="1.6"
      />
      {/* The relationship, drawn as an elbow so it reads as routed rather than
          as a diagonal scratch — the orthogonal routing the real canvases use. */}
      <path className="af-cta-edge" d="M 4.1 6.4 V 12.1 H 8.7" pathLength={1} />
      {/* The spark rides the SAME path, so it can never drift off the line it
          is meant to be travelling. */}
      <path
        className="af-cta-spark"
        d="M 4.1 6.4 V 12.1 H 8.7"
        pathLength={1}
      />
    </svg>
  );
}
