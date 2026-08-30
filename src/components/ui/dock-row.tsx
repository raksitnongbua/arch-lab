import { cn } from "@/lib/utils";

/**
 * One labelled fact in a viewer's focus dock.
 *
 * ONE COPY, AFTER THREE. The flowchart, sequence and use-case viewers each
 * wrote this out, and the gantt needed a fourth when its selected bar gained a
 * details panel — `dry.md`'s "identical bodies, copy-paste fingerprints" with
 * nothing left to argue about.
 *
 * THE FOURTH COPY HAD DRIFTED, which is the other half of why this exists. The
 * sequence viewer's version had lost `mt-0.5` and, more importantly,
 * `break-words`: the dock is 288px wide on desktop, so a long value — a
 * technology string, a description, a tag list — ran out of it rather than
 * wrapping. That is a defect rather than a decision, and unifying fixes it. The
 * visible change to that one viewer is two pixels of lead and values that now
 * wrap instead of overflowing.
 *
 * `mono` is for values that are IDENTIFIERS rather than prose — a shape name, a
 * tag, an id — where the eye is comparing characters rather than reading words.
 */
export function DockRow({
  term,
  value,
  mono = false,
}: {
  term: string;
  value: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm break-words text-foreground",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
