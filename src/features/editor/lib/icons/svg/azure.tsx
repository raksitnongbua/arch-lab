import type { SVGProps } from "react";

/**
 * Microsoft Azure — the two-sail "A" motif, hand-authored (D15). Not the
 * trademarked logo. Monochrome; follows `currentColor`.
 */
export function AzureIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* back sail */}
      <path d="M9.6 3.5h4.6L21 19.5h-5" />
      {/* front sail */}
      <path d="M9.6 3.5 3 17.3h4.3" />
      {/* base sweep */}
      <path d="M7.3 17.3 13 12.6l2.2 6.9H7.3l3.4-1.3" />
    </svg>
  );
}
