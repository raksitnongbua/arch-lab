import type { SVGProps } from "react";

/**
 * GraphQL — the hexagon of linked vertices. Monochrome; follows `currentColor`.
 */
export function GraphqlIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 3.4 19.4 7.7v8.6L12 20.6 4.6 16.3V7.7L12 3.4Z" />
      <path d="m5.6 8.3 12.8 7.4M5.6 15.7 18.4 8.3M12 4.2v15.6" />
      <circle cx="12" cy="3.6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19.2" cy="7.8" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19.2" cy="16.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="20.4" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4.8" cy="16.2" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4.8" cy="7.8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
