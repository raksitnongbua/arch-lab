import type { SVGProps } from "react";

/**
 * Generic file store — folded document motif, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function FileIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M6 2.8h7.5L19 8.3v11a1.9 1.9 0 0 1-1.9 1.9H6a1.9 1.9 0 0 1-1.9-1.9V4.7A1.9 1.9 0 0 1 6 2.8Z" />
      <path d="M13.3 2.9v5.5h5.5" />
      <path d="M8 13h7M8 16.5h5" />
    </svg>
  );
}
