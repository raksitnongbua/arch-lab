import type { SVGProps } from "react";

/**
 * Generic search — magnifier motif for search and indexing services,
 * hand-authored (D15). Monochrome; follows `currentColor`.
 */
export function SearchIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="10.6" cy="10.6" r="6.6" />
      <path d="m15.4 15.4 4.6 4.6" />
    </svg>
  );
}
