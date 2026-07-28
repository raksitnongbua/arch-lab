import type { SVGProps } from "react";

/**
 * Java — steaming coffee cup motif, hand-authored (D15). Monochrome; follows
 * `currentColor`.
 */
export function JavaIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* cup */}
      <path d="M5.5 10.5h11V15a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4v-4.5Z" />
      {/* handle */}
      <path d="M16.5 11.5h1.2a2.2 2.2 0 0 1 0 4.4h-1.2" />
      {/* steam */}
      <path d="M9.5 7.6c0-1.1 1.1-1.5 1.1-2.6M13 7.6c0-1.1 1.1-1.5 1.1-2.6" />
    </svg>
  );
}
