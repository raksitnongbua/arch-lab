import type { SVGProps } from "react";

/**
 * Cloudflare — edge-cloud motif with the horizontal base cut, hand-authored
 * (D15). Monochrome; follows `currentColor`.
 */
export function CloudflareIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* cloud silhouette, flat base */}
      <path d="M6 17h12.2a3.3 3.3 0 0 0 .5-6.6A5.5 5.5 0 0 0 8 8.9 4.1 4.1 0 0 0 6 17Z" />
      {/* speed dashes under the base */}
      <path d="M5 20h6M13.5 20h3" />
    </svg>
  );
}
