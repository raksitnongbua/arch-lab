import type { SVGProps } from "react";

/**
 * Google Cloud — the cloud with the arc cut. Monochrome; follows `currentColor`.
 */
export function GcpIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M7.6 19a4.6 4.6 0 0 1-.5-9.2 5.6 5.6 0 0 1 10.6 1.4A3.9 3.9 0 0 1 17 19H7.6Z" />
      <path d="M9.8 12.6h4.6" />
    </svg>
  );
}
