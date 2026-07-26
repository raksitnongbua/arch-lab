import type { SVGProps } from "react";

/**
 * Golang — stylised gopher face, hand-authored (D15). Monochrome; follows
 * `currentColor` so it stays legible in both themes.
 */
export function GolangIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* head */}
      <path d="M4.5 13.5c0-5 3.3-9 7.5-9s7.5 4 7.5 9-3.3 8-7.5 8-7.5-3-7.5-8Z" />
      {/* ears */}
      <path d="M6.2 5.8 4.8 4.2M17.8 5.8l1.4-1.6" />
      {/* eyes */}
      <circle cx="8.9" cy="10.5" r="2.1" />
      <circle cx="15.1" cy="10.5" r="2.1" />
      <circle cx="9.5" cy="10.9" r="0.5" fill="currentColor" stroke="none" />
      <circle cx="15.7" cy="10.9" r="0.5" fill="currentColor" stroke="none" />
      {/* snout */}
      <path d="M11 14.4h2l-1 1.2Z" fill="currentColor" stroke="none" />
      <path d="M10.6 17.2c.9.6 1.9.6 2.8 0" />
    </svg>
  );
}
