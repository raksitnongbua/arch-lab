import type { SVGProps } from "react";

/**
 * MongoDB — leaf motif, hand-authored (D15). Monochrome; follows
 * `currentColor`.
 */
export function MongodbIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 2.5c3.4 3.9 5 7 5 10 0 3.6-2.1 6.2-4.4 7.3L12 22l-.6-2.2C9.1 18.7 7 16.1 7 12.5c0-3 1.6-6.1 5-10Z" />
      <path d="M12 6.5v12" />
    </svg>
  );
}
