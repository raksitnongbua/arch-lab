import type { SVGProps } from "react";

/**
 * Generic mobile — phone outline motif, hand-authored (D15). Monochrome;
 * follows `currentColor`.
 */
export function MobileIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="7.5" y="3" width="9" height="18" rx="2" />
      <path d="M10.8 18.4h2.4" />
    </svg>
  );
}
