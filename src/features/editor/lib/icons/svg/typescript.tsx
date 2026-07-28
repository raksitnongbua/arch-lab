import type { SVGProps } from "react";

/**
 * TypeScript — the T and S inside the square badge. Monochrome; follows `currentColor`.
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
      <rect x="2.8" y="2.8" width="18.4" height="18.4" rx="2.6" />
      <path d="M6.4 10.6h4.6M8.7 10.6v6.8" />
      <path d="M17.8 11.2a2.2 2.2 0 0 0-3.6 1.5c0 2 3.4 1.6 3.4 3.4a2.1 2.1 0 0 1-3.5 1.4" />
    </svg>
  );
}
