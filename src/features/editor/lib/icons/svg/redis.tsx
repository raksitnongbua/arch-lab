import type { SVGProps } from "react";

/**
 * Redis — stacked-rhombus stack motif, hand-authored (D15). Monochrome;
 * follows `currentColor`.
 */
export function RedisIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* top layer, solid */}
      <path
        d="M12 3.5 19.5 7 12 10.5 4.5 7 12 3.5Z"
        fill="currentColor"
        stroke="none"
      />
      {/* middle and bottom layers */}
      <path d="m4.5 11.5 7.5 3.5 7.5-3.5" />
      <path d="m4.5 16 7.5 3.5L19.5 16" />
    </svg>
  );
}
