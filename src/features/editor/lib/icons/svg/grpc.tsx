import type { SVGProps } from "react";

/**
 * gRPC — a call travelling between two stubs. Monochrome; follows `currentColor`.
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
      <rect x="2.6" y="8.6" width="5.4" height="6.8" rx="1.4" />
      <rect x="16" y="8.6" width="5.4" height="6.8" rx="1.4" />
      <path d="M8.6 10.8h6.6M15.2 10.8l-1.8-1.6M15.4 13.2H8.8M8.8 13.2l1.8 1.6" />
    </svg>
  );
}
