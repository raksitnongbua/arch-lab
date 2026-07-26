import type { SVGProps } from "react";

/**
 * Generic queue — horizontal pipe motif with message ticks, hand-authored
 * (D15). Monochrome; follows `currentColor`.
 */
export function QueueIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* pipe body: open rim at the left, closed cap at the right */}
      <ellipse cx="5.5" cy="12" rx="2.4" ry="5" />
      <path d="M5.5 7h13a2.4 5 0 0 1 0 10h-13" />
      {/* queued messages */}
      <path d="M10 12h1.5M13.5 12H15" />
    </svg>
  );
}
