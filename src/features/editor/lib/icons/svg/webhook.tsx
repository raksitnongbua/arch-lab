import type { SVGProps } from "react";

/**
 * Generic webhook — the three-armed callback motif, hand-authored (D15).
 * Deliberately armed curves rather than joined nodes, so it never reads as
 * the Kafka broker-graph mark. Monochrome; follows `currentColor`.
 */
export function WebhookIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M18 16.98h-6c-1.1 0-1.95.94-2.48 1.9A4 4 0 1 1 6.5 15" />
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
      <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
    </svg>
  );
}
