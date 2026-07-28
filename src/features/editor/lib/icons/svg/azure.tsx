import type { SVGProps } from "react";

/**
 * Azure — the two-plane A. Monochrome; follows `currentColor`.
 */
export function AzureIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M9.4 3.6h5.2L21 20.4H14L9.4 3.6Z" />
      <path d="M9.4 3.6 3 17.4h5l3.6-7" />
    </svg>
  );
}
