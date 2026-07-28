import type { SVGProps } from "react";

/**
 * Serverless — the lambda. Monochrome; follows `currentColor`.
 */
export function LambdaIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M5.4 19 12 5h1.4l5.2 14" />
      <path d="M10 12.2 5.6 19" />
    </svg>
  );
}
