import type { SVGProps } from "react";

/**
 * ClickHouse — the column-store bar motif, hand-authored (D15). Monochrome;
 * follows `currentColor`.
 */
export function ClickhouseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* four full-height columns */}
      <path d="M4.5 4v16M9 4v16M13.5 4v16M18 4v16" />
      {/* the short accent column */}
      <path d="M21.5 10.5v3" />
    </svg>
  );
}
