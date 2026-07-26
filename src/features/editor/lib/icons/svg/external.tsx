import type { SVGProps } from "react";

/**
 * Generic external system — box with an outbound arrow, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function ExternalIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M19 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4.5" />
      <path d="M14.5 4H20v5.5" />
      <path d="M20 4l-8 8" />
    </svg>
  );
}
