import type { SVGProps } from "react";

/**
 * Generic object storage — the bucket motif (S3 and friends), hand-authored
 * (D15). Monochrome; follows `currentColor`.
 */
export function ObjectStorageIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M4 6.2 5.6 19a2.2 2.2 0 0 0 2.2 1.9h8.4a2.2 2.2 0 0 0 2.2-1.9L20 6.2" />
      <ellipse cx="12" cy="5.6" rx="8" ry="2.4" />
    </svg>
  );
}
