import type { SVGProps } from "react";

/**
 * Generic scheduler — clock face for cron jobs and timers, hand-authored
 * (D15). Monochrome; follows `currentColor`.
 */
export function SchedulerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="8.7" />
      <path d="M12 6.8V12l3.6 2.1" />
    </svg>
  );
}
