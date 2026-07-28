import type { SVGProps } from "react";

/**
 * Generic load balancer — one ingress fanned out over three backends,
 * hand-authored (D15). Drawn as a distributor with arrows rather than joined
 * nodes, so it stays distinct from the Kafka broker-graph mark. Monochrome;
 * follows `currentColor`.
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
      {/* ingress */}
      <path d="M2.5 12h5" />
      {/* the balancer */}
      <rect x="7.5" y="5.5" width="3.6" height="13" rx="1.2" />
      {/* fan-out, each arm arrowed */}
      <path d="M11.1 12 19 7.4m0 0-2.6.2m2.6-.2-.3 2.6" />
      <path d="M11.1 12h8m0 0-1.7-1.7M19.1 12l-1.7 1.7" />
      <path d="M11.1 12 19 16.6m0 0-2.6-.2m2.6.2-.3-2.6" />
    </svg>
  );
}
