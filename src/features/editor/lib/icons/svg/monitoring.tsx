import type { SVGProps } from "react";

/**
 * Generic monitoring — a heartbeat trace on a panel, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function MonitoringIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="2.5" y="4.5" width="19" height="15" rx="2" />
      <path d="M5.5 13h3l2-4 2.4 7 2-3h3.6" />
    </svg>
  );
}
