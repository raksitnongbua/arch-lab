import type { SVGProps } from "react";

/**
 * Generic load balancer — one ingress distributed over three backends,
 * hand-authored (D15). Monochrome; follows `currentColor`.
 */
export function LoadBalancerIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="4.5" cy="12" r="2" />
      <path d="M6.5 12h3.5" />
      <path d="M10 12 14 5.5h3.5" />
      <path d="M10 12h7.5" />
      <path d="M10 12 14 18.5h3.5" />
      <circle cx="19.5" cy="5.5" r="1.6" />
      <circle cx="19.5" cy="12" r="1.6" />
      <circle cx="19.5" cy="18.5" r="1.6" />
    </svg>
  );
}
