import type { SVGProps } from "react";

/**
 * Kong — angular gateway monogram, hand-authored (D15). A stylised jagged
 * "K" mark, not the trademarked logo. Monochrome; follows `currentColor`.
 */
export function KongIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* angular K strokes */}
      <path d="M6 20V4" />
      <path d="M18 4l-8 8 8 8" />
      {/* gateway notch */}
      <path d="M13 12h7" />
    </svg>
  );
}
