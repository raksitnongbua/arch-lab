import type {
  DiagramHeading,
  DiagramHeadingMetrics,
} from "@/lib/diagram-heading";

/**
 * A `DiagramHeading` painted at the top of a canvas.
 *
 * INSIDE THE DRAWING, so it travels with exports — which is the whole reason
 * the title is on the canvas rather than only in the page chrome. See
 * `@/lib/diagram-heading` for that argument.
 *
 * `aria-hidden`, because every canvas's `<svg>` already opens its `aria-label`
 * with the document's title; a screen reader hearing it twice per diagram is
 * noise.
 *
 * NO CSS CLASSES, on purpose. The heading must render identically in the
 * exported SVG, which carries no stylesheet — so the type scale and the two
 * fills are attributes here, and `diagramHeadingMarkup` writes the same ones.
 *
 * KNOWN ASYMMETRY: the sequence, flowchart and use-case canvases still carry
 * their own copy of this markup inline. They predate this component, they are
 * visually settled, and swapping them is a pure refactor with real visual risk
 * and no benefit to the change that introduced this file. Their arithmetic is
 * already shared (`layoutDiagramHeading`); only the ~30 lines of JSX are not.
 * A future change that touches one of those canvases should move it here.
 */
export function DiagramHeadingText({
  heading,
  x,
  top,
  metrics,
}: {
  heading: DiagramHeading;
  /** Left edge the text is aligned to, in drawing units. */
  x: number;
  /** Top of the heading block — the title's first baseline sits a font size below. */
  top: number;
  metrics: DiagramHeadingMetrics;
}): React.JSX.Element | null {
  if (
    heading.titleLines.length === 0 &&
    heading.descriptionLines.length === 0
  ) {
    return null;
  }
  return (
    <g aria-hidden="true" className="pointer-events-none">
      <text
        x={x}
        y={top + metrics.titleFontSize}
        fontSize={metrics.titleFontSize}
        fontWeight={600}
        fill="var(--foreground)"
      >
        {heading.titleLines.map((line, index) => (
          <tspan
            key={index}
            x={x}
            {...(index === 0 ? {} : { dy: metrics.titleLineHeight })}
          >
            {line}
          </tspan>
        ))}
      </text>
      {heading.descriptionLines.length > 0 ? (
        <text
          x={x}
          y={
            top +
            heading.titleLines.length * metrics.titleLineHeight +
            metrics.titleDescriptionGap +
            metrics.descriptionFontSize
          }
          fontSize={metrics.descriptionFontSize}
          fill="var(--muted-foreground)"
        >
          {heading.descriptionLines.map((line, index) => (
            <tspan
              key={index}
              x={x}
              {...(index === 0 ? {} : { dy: metrics.descriptionLineHeight })}
            >
              {line}
            </tspan>
          ))}
        </text>
      ) : null}
    </g>
  );
}
