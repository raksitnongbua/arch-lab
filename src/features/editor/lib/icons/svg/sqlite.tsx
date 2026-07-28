import type { SVGProps } from "react";

/**
 * SQLite — an embedded database: a cylinder inside the host's frame,
 * hand-authored (D15). Monochrome; follows `currentColor`.
 */
export function SqliteIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="3" y="3.5" width="18" height="17" rx="2.5" />
      <ellipse cx="12" cy="9.5" rx="4.2" ry="1.7" />
      <path d="M7.8 9.5v5c0 .94 1.88 1.7 4.2 1.7s4.2-.76 4.2-1.7v-5" />
    </svg>
  );
}
