import type { SVGProps } from "react";

/**
 * Generic database — cylinder motif, hand-authored (D15). Monochrome; follows
 * `currentColor`.
 */
export function DatabaseIcon(props: SVGProps<SVGSVGElement>) {
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
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v13c0 1.55 3.1 2.8 7 2.8s7-1.25 7-2.8v-13" />
      <path d="M5 12c0 1.55 3.1 2.8 7 2.8s7-1.25 7-2.8" />
    </svg>
  );
}
