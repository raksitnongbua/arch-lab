import type { SVGProps } from "react";

/**
 * Generic webhook — three endpoints wired into a callback, hand-authored
 * (D15). Monochrome; follows `currentColor`.
 */
export function WebhookIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="12" cy="5.8" r="2.6" />
      <circle cx="6.2" cy="17" r="2.6" />
      <circle cx="17.8" cy="17" r="2.6" />
      <path d="M10.7 8.1 7.6 14.6" />
      <path d="M13.3 8.1l3.1 6.5" />
      <path d="M8.8 17h6.4" />
    </svg>
  );
}
