import type { SVGProps } from "react";

/**
 * Node.js — hexagon with the lowercase "n" motif, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function NodejsIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5L12 2.5Z" />
      <path d="M9.4 15.8V9.6" />
      <path d="M9.4 12.1a2.6 2.6 0 0 1 5.2 0v3.7" />
    </svg>
  );
}
