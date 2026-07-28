import type { SVGProps } from "react";

/**
 * HAProxy — one inbound stream fanned across a highly-available pair,
 * hand-authored (D15). Monochrome; follows `currentColor`.
 */
export function HaproxyIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* inbound */}
      <path d="M2.5 12h4.5" />
      {/* the split */}
      <path d="M7 12l4.5-5H15" />
      <path d="M7 12l4.5 5H15" />
      {/* the pair */}
      <rect x="15.5" y="4.5" width="6" height="5" rx="1.5" />
      <rect x="15.5" y="14.5" width="6" height="5" rx="1.5" />
    </svg>
  );
}
