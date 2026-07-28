import type { SVGProps } from "react";

/**
 * Docker — the whale-and-containers motif, hand-authored (D15). Monochrome;
 * follows `currentColor`.
 */
export function DockerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* deck containers */}
      <rect x="6" y="9.2" width="3.2" height="3.2" rx="0.4" />
      <rect x="10" y="9.2" width="3.2" height="3.2" rx="0.4" />
      <rect x="14" y="9.2" width="3.2" height="3.2" rx="0.4" />
      <rect x="10" y="5.6" width="3.2" height="3.2" rx="0.4" />
      {/* hull */}
      <path d="M2.5 13.6h19c0 3.4-2.6 5.9-6.4 5.9H8.9c-3.8 0-6.4-2.5-6.4-5.9Z" />
      {/* spout */}
      <path d="M19.5 11.5c1-.9 2-.7 2.6-.2" />
    </svg>
  );
}
