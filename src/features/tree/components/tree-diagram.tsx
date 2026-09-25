/**
 * The decomposition-tree canvas, drawn straight from `layoutTree` coordinates.
 *
 * NO `@xyflow/react` HERE, matching the lifecycle and the timeline: nothing on
 * this canvas drags, because there is no coordinate in the grammar for a drag
 * to write to (`src/types/tree.ts` — containment is nesting, and nesting has
 * no x). A node library would ship pan, zoom and drag handles for a picture
 * that is wholly determined by its text.
 *
 * SVG FOR THE CONNECTORS, HTML FOR THE BOXES, and that split is deliberate
 * rather than incidental. A node label and a cell both hold the author's prose
 * — Thai, Arabic, a long English sentence — and SVG `<text>` does not wrap. The
 * elbows need exact geometry, which is SVG's job; the prose needs a line
 * breaker, which is the browser's. Drawing the boxes as `<rect>` with manual
 * word-wrapping would reimplement text layout badly, which is precisely what
 * `src/features/viewer/export/render-svg.ts` exists to do only for EXPORT,
 * where there is no browser to ask.
 *
 * COLOUR COMES FROM THE BRANCH INDEX, never from the document. The accent
 * cycles a fixed set of theme tokens, so an author writes no colours and the
 * palette cannot ship half-populated.
 */

import type { TreeLabFile } from "@/types";

import { layoutTree, relatedTo } from "../lib/layout";

/** How many distinct branch accents the stylesheet defines. */
const ACCENT_COUNT = 6;

const accentClass = (branch: number | null): string =>
  branch === null ? "aft-root" : `aft-b${branch % ACCENT_COUNT}`;

export interface TreeDiagramProps {
  file: TreeLabFile;
  /** Rendered above the drawing when the document carries a title. */
  showTitle?: boolean;
  /** The focused node, or `null` for the resting state where all are lit. */
  focusedId?: string | null;
  /** Called with a node id, or `null` when the backdrop clears the focus. */
  onFocus?: (id: string | null) => void;
}

export function TreeDiagram({
  file,
  showTitle = true,
  focusedId = null,
  onFocus,
}: TreeDiagramProps) {
  const layout = layoutTree(file);
  /* The lit set is derived from the CONNECTORS (see `relatedTo`), so what is
     lit and what is drawn cannot disagree. `null` means nothing is focused and
     everything is lit, which is the resting state a no-JS reader also gets. */
  const lit = focusedId === null ? null : relatedTo(layout, focusedId);
  const dimmed = (id: string) => lit !== null && !lit.has(id);
  const title = file.metadata?.title ?? "";
  /* The column band sits above the drawing, so everything below it shifts by
     its height. One number, used by both layers, so they cannot disagree. */
  const headBand =
    layout.columns.length > 0 || layout.levels.length > 0 ? 30 : 0;

  return (
    <figure
      className="aft-tree"
      aria-label={describe(layout.placements.length, title)}
    >
      {showTitle && title !== "" ? (
        <figcaption className="aft-tree-title">{title}</figcaption>
      ) : null}
      <div className="aft-tree-scroll">
        <div
          className="aft-tree-stage"
          style={{ width: layout.width, height: layout.height + headBand }}
        >
          <svg
            className="aft-tree-wires"
            width={layout.width}
            height={layout.height + headBand}
            aria-hidden="true"
          >
            {layout.connectors.map((wire) => (
              <path
                key={`${wire.parentId}->${wire.childId}`}
                className={[
                  "aft-tree-wire",
                  accentClass(wire.branch),
                  dimmed(wire.childId) ? "is-dim" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                d={`M ${wire.fromX} ${wire.fromY + headBand} H ${wire.elbowX} V ${wire.toY + headBand} H ${wire.toX}`}
                fill="none"
              />
            ))}
          </svg>

          {/* THE LANES, drawn first so everything else sits on them. A tree
              centres its root, so the outermost column is one box and a lot of
              nothing; a band gives that emptiness the identity of a column
              instead of leaving it looking like a fault. Alternating, because
              a rule between every pair would be ten hairlines competing with
              the connectors for the reader's attention. */}
          {layout.lanes.map((lane, index) => (
            <div
              key={`lane-${lane.depth ?? "c"}-${lane.x}`}
              className={`aft-tree-lane${index % 2 === 1 ? "is-alt" : ""}`}
              style={{ left: lane.x, width: lane.width, top: 0, bottom: 0 }}
              aria-hidden="true"
            />
          ))}

          {layout.levels.map((level) => (
            <div
              key={`level-${level.x}`}
              className="aft-tree-colhead"
              style={{ left: level.x, top: 8, width: level.width }}
            >
              {level.label}
            </div>
          ))}

          {layout.columns.map((column) => (
            <div
              key={column.label}
              className="aft-tree-colhead"
              style={{ left: column.x, top: 8, width: column.width }}
            >
              {column.label}
            </div>
          ))}

          {layout.placements.map((node) => (
            <div key={node.id}>
              <button
                type="button"
                aria-pressed={focusedId === node.id}
                onClick={() =>
                  onFocus?.(focusedId === node.id ? null : node.id)
                }
                className={[
                  "aft-tree-node",
                  node.depth === 0
                    ? "is-root"
                    : node.leaf
                      ? "is-leaf"
                      : "is-branch",
                  accentClass(node.branch),
                  dimmed(node.id) ? "is-dim" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  left: node.x,
                  top: node.y + headBand,
                  width: node.width,
                  height: node.height,
                }}
              >
                {node.leaf ? (
                  <span className="aft-tree-id">{node.id}</span>
                ) : null}
                <span className="aft-tree-label">{node.label}</span>
              </button>

              {node.cells.map((text, index) =>
                text === "" ? null : (
                  <button
                    type="button"
                    key={`${node.id}-c${index}`}
                    /* A CELL PRESSES AS ITS NODE. It is the same row and says
                       the same thing, so giving it a different answer — or no
                       answer — would leave half the table inert for a reader
                       who aimed at the words they were reading. */
                    onClick={() =>
                      onFocus?.(focusedId === node.id ? null : node.id)
                    }
                    aria-pressed={focusedId === node.id}
                    /* JOINED, NEVER CONCATENATED. This line shipped as a
                       template literal whose space went missing, making the
                       class `aft-tree-cellis-alt` — which matches no rule, so
                       every odd cell lost `position: absolute` and fell into
                       normal flow at the left edge. A CSS selector that
                       matches nothing is not an error, so nothing reported it.
                       `new-diagram-type.md` names this exact failure. */
                    className={[
                      "aft-tree-cell",
                      index % 2 === 1 ? "is-alt" : "",
                      dimmed(node.id) ? "is-dim" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      left: layout.columns[index]?.x ?? 0,
                      top: node.y + headBand,
                      width: layout.columns[index]?.width ?? 0,
                      height: node.height,
                    }}
                  >
                    {text}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </figure>
  );
}

/** The one sentence a screen reader gets in place of the drawing. */
function describe(nodeCount: number, title: string): string {
  const named =
    title === "" ? "A decomposition tree" : `Decomposition tree: ${title}`;
  return `${named}. ${nodeCount} item${nodeCount === 1 ? "" : "s"}, broken down by nesting.`;
}
