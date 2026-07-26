import type { SVGProps } from "react";

/**
 * PostgreSQL — stylised elephant-head (Slonik) motif, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function PostgresqlIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* head outline with trunk sweeping down-left */}
      <path d="M18.5 9.5c.6-3.7-1.5-6.5-5.5-6.5-4.4 0-7.5 3.2-7.5 8 0 4.3 2 7.8 4.5 9.5.9.6 1.8.3 2-.7l.3-2.3" />
      {/* trunk tip curling */}
      <path d="M18.5 9.5c-.2 3.6-1.6 6.4-4 7.6-1.5.7-2.9.3-3.2-1.2" />
      {/* brow / forehead crease */}
      <path d="M9.5 6.8c1.2-.8 2.6-1 4-.6" />
      {/* eye */}
      <circle cx="13.6" cy="7.9" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  );
}
