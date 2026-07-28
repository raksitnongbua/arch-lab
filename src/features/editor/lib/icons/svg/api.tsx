import type { SVGProps } from "react";

/**
 * Generic API — curly braces around a payload, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function ApiIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M9.5 4.5C8 4.5 8 8 8 9.5S6.5 12 5.5 12c1 0 2.5.5 2.5 2.5s0 5 1.5 5" />
      <path d="M14.5 4.5c1.5 0 1.5 3.5 1.5 5s1.5 2.5 2.5 2.5c-1 0-2.5.5-2.5 2.5s0 5-1.5 5" />
      <circle cx="9.6" cy="12" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="14.4" cy="12" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}
