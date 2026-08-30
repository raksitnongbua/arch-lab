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
import type {
  LaidGanttDependency,
  LaidGanttItem,
  LaidGanttTick,
  GanttLayout,
} from "./layout";

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
 * What one item's bar says when a reader selects it: the days it actually
 * occupies, worked out for them.
 *
 * WHY IT EXISTS. The bar is labelled with its DURATION — `6d` — which is the
 * one number a plan already tells you and the one nobody has to compute. What
 * a reader wants when they stop on a bar is the other end: "starts the 12th,
 * six days, so it is done WHEN?". Doing that arithmetic in your head against a
 * tick rail is the thing a chart is supposed to save you.
 *
 * THE LAST DAY, NOT THE DAY AFTER, and this is the whole subtlety. `finish` is
 * an EXCLUSIVE offset — a six-day task starting on day 12 has `finish` 18,
 * because 18 is where the next thing may start — so printing `finish` would
 * name a day the work is not being done on. A reader asking "when is it done"
 * means the last day it is worked, which is `finish - 1`. Getting this wrong is
 * the classic off-by-one on every gantt ever drawn, and it is invisible: the
 * dates look plausible and every task silently claims a day it does not use.
 *
 * A MILESTONE IS ONE DAY. Its duration is zero, so `finish - 1` would be the
 * day BEFORE it and the range would run backwards; it gets a single date.
 *
 * WITHOUT AN ORIGIN IT STILL ANSWERS, in the relative units the axis is already
 * labelled in. The alternative — saying nothing on a document with no `starts`
 * line — would make the affordance appear and disappear depending on a header
 * the reader may not have written.
 */
export function itemSchedule(file: GanttLabFile, item: LaidGanttItem): string {
  const lastDay = item.milestone ? item.start : item.finish - 1;
  const from = ganttDateAt(file, item.start);
  const to = ganttDateAt(file, lastDay);
  if (!from || !to) {
    return item.milestone || lastDay === item.start
      ? `day ${item.start}`
      : `day ${item.start}–${lastDay}`;
  }
  const day = (date: Date) => date.getUTCDate();
  const month = (date: Date) => MONTHS[date.getUTCMonth()];
  /* A ONE-DAY TASK IS A DATE, NOT A RANGE. `finish - 1 === start` for it, so
     the range arm printed "6–6 Apr", which reads as a typo rather than as a
     day. Keyed off the resolved dates rather than off `duration === 1`, so a
     milestone and a one-day task reach the same answer by the same route. */
  if (item.milestone || from.getTime() === to.getTime()) {
    return `${day(from)} ${month(from)}`;
  }
  /* ONE MONTH NAMED WHEN BOTH ENDS SHARE IT. "12 Apr – 17 Apr" spends four
     characters restating something the first half already said, on a label
     that has to fit beside a bar. */
  return month(from) === month(to)
    ? `${day(from)}–${day(to)} ${month(to)}`
    : `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`;
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
