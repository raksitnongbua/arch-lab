import type { SVGProps } from "react";

/**
 * React — nucleus with three orbits, hand-authored (D15). Monochrome; follows
 * `currentColor`.
 */
export function ReactIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="12" rx="9.2" ry="3.7" />
      <ellipse cx="12" cy="12" rx="9.2" ry="3.7" transform="rotate(60 12 12)" />
      <ellipse
        cx="12"
        cy="12"
        rx="9.2"
        ry="3.7"
        transform="rotate(120 12 12)"
      />
    </svg>
  );
}
