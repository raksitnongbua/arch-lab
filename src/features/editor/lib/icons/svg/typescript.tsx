import type { SVGProps } from "react";

/**
 * TypeScript — rounded tile with the "TS" monogram, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function TypescriptIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="3" y="3" width="18" height="18" rx="3" />
      {/* T */}
      <path d="M6.8 10.2h4.6M9.1 10.2V17" />
      {/* S */}
      <path d="M17.6 11a2 2 0 1 0-1.5 3.4 2 2 0 1 1-1.4 3.4" />
    </svg>
  );
}
