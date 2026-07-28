import type { SVGProps } from "react";

/**
 * Amazon DynamoDB — cylinder with a throughput bolt, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function DynamodbIcon(props: SVGProps<SVGSVGElement>) {
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
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v13c0 1.55 3.1 2.8 7 2.8s7-1.25 7-2.8v-13" />
      {/* throughput bolt across the barrel */}
      <path
        d="M13.4 9.5 9.6 14.2h2.4l-1 3.6 4.2-5h-2.5l.7-3.3Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
