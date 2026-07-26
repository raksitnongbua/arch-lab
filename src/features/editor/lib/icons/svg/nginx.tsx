import type { SVGProps } from "react";

/**
 * nginx — hexagon with the "N" motif, hand-authored (D15). Monochrome;
 * follows `currentColor`.
 */
export function NginxIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M9 15.5v-7l6 7v-7" />
    </svg>
  );
}
