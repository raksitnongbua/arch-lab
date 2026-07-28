import type { SVGProps } from "react";

/**
 * Python — coiled-snake motif, hand-authored (D15). In the same stylised
 * animal family as the gopher and dolphin marks, not the trademarked logo.
 * Monochrome; follows `currentColor`.
 */
export function PythonIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* body, coiling inward to the head */}
      <path d="M12 21a9 9 0 1 1 9-9 6 6 0 1 1-6-6 3 3 0 1 1-3 3" />
      {/* eye, at the head */}
      <circle cx="12.9" cy="10.1" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
