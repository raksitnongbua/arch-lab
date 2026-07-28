import type { SVGProps } from "react";

/**
 * Generic analytics — bar-chart motif for warehouses and BI, hand-authored
 * (D15). Monochrome; follows `currentColor`.
 */
export function AnalyticsIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M3.5 3.5v17h17" />
      <path d="M7.5 16.5v-4M12 16.5V7.5M16.5 16.5v-6.5" />
    </svg>
  );
}
