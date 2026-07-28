import type { SVGProps } from "react";

/**
 * AWS — a cloud over the curved "smile" arrow, hand-authored (D15). A
 * stylised motif, not the trademarked logo. Monochrome; follows
 * `currentColor`.
 */
export function AwsIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* cloud */}
      <path d="M7 14.6h10a3.4 3.4 0 0 0 .4-6.8A5.4 5.4 0 0 0 7.2 7 3.9 3.9 0 0 0 7 14.6Z" />
      {/* the smile, curling into its arrow tail */}
      <path d="M3.2 18c5 2.6 12.2 2.6 17.1-.5" />
      <path d="M18.5 17c1.5-.4 2.5-.2 2.7.2.2.5-.2 1.1-1.1 1.9" />
    </svg>
  );
}
