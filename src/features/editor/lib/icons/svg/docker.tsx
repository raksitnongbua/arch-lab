import type { SVGProps } from "react";

/**
 * Docker — stacked containers under the whale's back. Monochrome; follows `currentColor`.
 */
export function DockerIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M3 12.6h13.2v3A3.4 3.4 0 0 1 12.8 19H7.4A4.4 4.4 0 0 1 3 14.6v-2Z" />
      <path d="M16.2 13.4c1.4-1 3.1-.9 4.8.2-.4 1.6-1.6 2.6-3.4 2.8" />
      <path d="M5.6 12.6V9.9h2.7v2.7M9.5 12.6V9.9h2.7v2.7M13.4 12.6V9.9h2.7v2.7M9.5 8.7V6h2.7v2.7" />
    </svg>
  );
}
