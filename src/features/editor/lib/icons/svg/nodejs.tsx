import type { SVGProps } from "react";

/**
 * Node.js — the hexagon, with the wordmark stroke inside. Monochrome; follows `currentColor`.
 */
export function NodejsIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 2.6 20.5 7.3v9.4L12 21.4 3.5 16.7V7.3L12 2.6Z" />
      <path d="M9 15V9.6l6 4.8V9" />
    </svg>
  );
}
