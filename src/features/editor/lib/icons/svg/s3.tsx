import type { SVGProps } from "react";

/**
 * Object storage — the bucket with a contents rule. Monochrome; follows `currentColor`.
 */
export function S3Icon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M4.6 6.4h14.8l-1.3 12.1a1.6 1.6 0 0 1-1.6 1.5H7.5a1.6 1.6 0 0 1-1.6-1.5L4.6 6.4Z" />
      <path d="M3.4 6.4h17.2" />
      <path d="M9.6 11.2h4.8M9.2 15h5.6" />
    </svg>
  );
}
