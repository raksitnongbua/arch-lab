import type { SVGProps } from "react";

/**
 * dotnet — the dot and the N. Monochrome; follows `currentColor`.
 */
export function DotnetIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="4.4" cy="17.6" r="1.6" fill="currentColor" stroke="none" />
      <path d="M9.4 18V6l7 12V6" />
    </svg>
  );
}
