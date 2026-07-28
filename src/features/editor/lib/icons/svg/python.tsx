import type { SVGProps } from "react";

/**
 * Python — the two interlocking halves, simplified. Monochrome; follows `currentColor`.
 */
export function PythonIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 3.2c-2.7 0-4.3.7-4.3 2.5v2.1h4.6" />
      <path d="M7.7 7.8H5.4c-1.7 0-2.6 1.4-2.6 3.4s.8 3.4 2.6 3.4h1.6v-2.3c0-1.6 1.2-2.8 2.8-2.8h4.1" />
      <path d="M12 20.8c2.7 0 4.3-.7 4.3-2.5v-2.1h-4.6" />
      <path d="M16.3 16.2h2.3c1.7 0 2.6-1.4 2.6-3.4s-.8-3.4-2.6-3.4H17v2.3c0 1.6-1.2 2.8-2.8 2.8h-4.1" />
    </svg>
  );
}
