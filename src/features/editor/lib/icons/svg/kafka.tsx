import type { SVGProps } from "react";

/**
 * Apache Kafka — the append-only commit-log motif: log segments feeding a
 * consumer, hand-authored (D15). Monochrome; follows `currentColor`.
 */
export function KafkaIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* log segments */}
      <rect x="2.5" y="8" width="4" height="8" rx="1" />
      <rect x="8" y="8" width="4" height="8" rx="1" />
      <rect x="13.5" y="8" width="4" height="8" rx="1" />
      {/* read head */}
      <path d="M19 12h2.5m-1.2-1.3 1.3 1.3-1.3 1.3" />
    </svg>
  );
}
