import type { SVGProps } from "react";

/**
 * PHP — the wordmark ellipse with an elephant silhouette inside. Letterforms
 * at this size turn to mush, so the mark carries the shape instead.
 * Monochrome; follows `currentColor`.
 */
export function PhpIcon(props: SVGProps<SVGSVGElement>) {
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
      <ellipse cx="12" cy="12" rx="10" ry="6.4" />
      {/* head, trunk and two legs */}
      <path d="M7.6 14.6v-3a3 3 0 0 1 3-3h3.2a2.6 2.6 0 0 1 2.6 2.6v3.4" />
      <path d="M16.4 11.4c.9.3 1.3 1 1.3 2v1.6" />
      <path d="M9.4 14.6v1.2M13.2 14.6v1.2" />
    </svg>
  );
}
