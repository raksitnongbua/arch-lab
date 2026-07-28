import type { SVGProps } from "react";

/**
 * Java — steam over the cup. Monochrome; follows `currentColor`.
 */
export function JavaIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M5 13h11v3.2a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V13Z" />
      <path d="M16 14h1.4a2 2 0 1 1 0 4H16" />
      <path d="M9 4.2c-1.4 1.2-1.4 2.2 0 3.4s1.4 2.2 0 3.4M13 5.4c-1 .8-1 1.6 0 2.4s1 1.6 0 2.4" />
    </svg>
  );
}
