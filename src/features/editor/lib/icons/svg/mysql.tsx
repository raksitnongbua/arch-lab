import type { SVGProps } from "react";

/**
 * MySQL — stylised dolphin silhouette, hand-authored (D15). Monochrome;
 * follows `currentColor`.
 */
export function MysqlIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* body arc */}
      <path d="M3 16.5c2.6-6.4 7-9 11.2-8 1.6.4 3-.3 4-1.7.4 1.8-.2 3.3-1.7 4.2 1.8.8 2.7 2.3 2.5 4.3-1.2-1.3-2.8-1.7-4.6-1.2-3.4.9-5.3 3.4-11.4 2.4Z" />
      {/* tail fin */}
      <path d="M6.8 16.9c-.9 1.3-2.1 2-3.8 2.1 1-1 1.5-2 1.6-3.1" />
      {/* eye */}
      <circle cx="15.4" cy="10.6" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
