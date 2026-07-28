import type { SVGProps } from "react";

/**
 * Generic serverless function — the lambda motif (Lambda, Cloud Functions),
 * hand-authored (D15). Monochrome; follows `currentColor`.
 */
export function ServerlessIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M5.5 19.5 12.6 4.5" />
      <path d="M9.6 11.2 14.4 19.5" />
      <path d="M9.5 4.5h3.1" />
    </svg>
  );
}
