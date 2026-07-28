import type { SVGProps } from "react";

/**
 * Google Cloud — hexagon enclosing the wedge motif, hand-authored (D15). Not
 * the trademarked logo. Monochrome; follows `currentColor`.
 */
export function GcpIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5L12 2.5Z" />
      <path d="M12 8.4 15.4 14.6H8.6L12 8.4Z" />
    </svg>
  );
}
