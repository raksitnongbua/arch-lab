/**
 * The only calendar-aware code in the gantt feature, and the only place a
 * connector's arrowhead is turned into points.
 *
 * IT LIVES HERE RATHER THAN IN THE CANVAS because there are two painters, not
 * one: `../components/gantt-diagram.tsx` draws the screen and
 * `../export/render-svg.ts` draws the file, and an exported axis that labelled
 * its ticks differently from the drawn one would be a diagram that disagrees
 * with the screenshot beside it. The exporter also runs where React does not,
 * so it cannot reach into a `.tsx` module for them.
 *
 * `layoutGantt` deliberately hands over DAY OFFSETS and a relative label
 * (`W1`, `D3`) and never a date — keeping the calendar on this side of the
 * line is what stops `file.origin` leaking into the geometry, the routing and
 * the float pass. These functions are the boundary, and they are the whole of
 * it: with an origin the ticks read as dates, without one the same document
 * reads `W1, W2, W3` and nothing else about it changes.
 */

import { ganttDateAt } from "@/types";
import type { GanttLabFile } from "@/types";

import { GANTT } from "./layout";
import type { LaidGanttDependency, LaidGanttTick, GanttLayout } from "./layout";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * What a tick says.
 *
 * Without an origin it returns the layout's relative label unchanged; with one
 * it formats the date the offset lands on. Month ticks drop the day, because
 * "1 Sep, 1 Oct, 1 Nov" spends three characters on a number that is the same
 * every time.
 */
export function axisLabel(
  file: GanttLabFile,
  tick: LaidGanttTick,
  tickStep: number,
): string {
  const date = ganttDateAt(file, tick.day);
  if (!date) return tick.label;
  const month = MONTHS[date.getUTCMonth()];
  return tickStep >= 30
    ? `${month} ${date.getUTCFullYear()}`
    : `${date.getUTCDate()} ${month}`;
}

/** The caption above the rail, naming the span and its unit. */
export function axisCaption(file: GanttLabFile, layout: GanttLayout): string {
  const unit =
    layout.tickStep === 1 ? "day" : layout.tickStep === 7 ? "week" : "month";
  const first = ganttDateAt(file, 0);
  const last = ganttDateAt(file, layout.span);
  if (!first || !last) {
    return `Day 0 – ${layout.span}, by ${unit}`;
  }
  return (
    `${first.getUTCDate()} ${MONTHS[first.getUTCMonth()]} – ` +
    `${last.getUTCDate()} ${MONTHS[last.getUTCMonth()]} ` +
    `${last.getUTCFullYear()}, by ${unit}`
  );
}

/**
 * The arrowhead, as an explicit triangle.
 *
 * Two orientations only — down and right — because those are the two ways a
 * routed dependency can arrive. Never an SVG `marker`: a marker takes its
 * orientation from the path's tangent, and half of these arrive travelling
 * down while half arrive travelling right.
 */
export function arrowPoints(dependency: LaidGanttDependency): string {
  const { tipX: x, tipY: y } = dependency;
  const a = GANTT.arrowLength;
  return dependency.tipDirection === "down"
    ? `${x - 4},${y - a} ${x + 4},${y - a} ${x},${y}`
    : `${x - a},${y - 4} ${x - a},${y + 4} ${x},${y}`;
}
