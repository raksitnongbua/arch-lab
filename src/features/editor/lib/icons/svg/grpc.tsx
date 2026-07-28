import type { SVGProps } from "react";

/**
 * gRPC — a bidirectional call between two peers, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function GrpcIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="2.5" y="7.5" width="5.5" height="9" rx="1.5" />
      <rect x="16" y="7.5" width="5.5" height="9" rx="1.5" />
      {/* request */}
      <path d="M9.5 10.3h5m-1.6-1.5 1.6 1.5-1.6 1.5" />
      {/* response */}
      <path d="M14.5 13.7h-5m1.6 1.5-1.6-1.5 1.6-1.5" />
    </svg>
  );
}
