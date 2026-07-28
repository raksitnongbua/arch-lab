import type { SVGProps } from "react";

/**
 * AWS — cloud over the smile-arrow. The wordmark itself is unreadable at
 * 16px, so the mark leans on the arc, which survives the size. Monochrome;
 * follows `currentColor`.
 */
export function AwsIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M7.4 13.4a3.5 3.5 0 0 1-.4-7 5 5 0 0 1 9.5 1.2 3.1 3.1 0 0 1-.6 5.8H7.4Z" />
      {/* the smile, and its tail */}
      <path d="M3.6 17.2c4.4 2.5 11.4 2.5 15.8 0" />
      <path d="m17.6 18.6 2.6-1.6-1-2.4" />
    </svg>
  );
}
