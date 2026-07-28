import type { SVGProps } from "react";

/**
 * Firebase — the folded flame. Monochrome; follows `currentColor`.
 */
export function FirebaseIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M5 16.6 8.2 3.4l3 5.2M5 16.6 12 20.6l7-4L16.4 6.2 5 16.6Z" />
    </svg>
  );
}
