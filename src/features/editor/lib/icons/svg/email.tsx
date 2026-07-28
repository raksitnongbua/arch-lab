import type { SVGProps } from "react";

/**
 * Generic email — envelope motif for mail and notification services,
 * hand-authored (D15). Monochrome; follows `currentColor`.
 */
export function EmailIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m2.9 6.6 9.1 6.4 9.1-6.4" />
    </svg>
  );
}
