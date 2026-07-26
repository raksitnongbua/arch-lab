import type { SVGProps } from "react";

/**
 * Generic browser — window-with-chrome motif, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function BrowserIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M3 8.5h18" />
      <circle cx="5.7" cy="6.5" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="8" cy="6.5" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}
