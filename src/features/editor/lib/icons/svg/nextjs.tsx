import type { SVGProps } from "react";

/**
 * Next.js — circle with the diagonal "N" motif, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function NextjsIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 15.6V8.4l7 9.4" />
      <path d="M15.2 8.4v5" />
    </svg>
  );
}
