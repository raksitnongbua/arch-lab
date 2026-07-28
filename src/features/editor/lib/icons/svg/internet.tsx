import type { SVGProps } from "react";

/**
 * Generic internet — globe with meridian and equator, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function InternetIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="12" cy="12" r="8.7" />
      <path d="M3.3 12h17.4" />
      <ellipse cx="12" cy="12" rx="4" ry="8.7" />
    </svg>
  );
}
