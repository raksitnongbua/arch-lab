import type { SVGProps } from "react";

/**
 * Generic AI model — an inference chip, hand-authored (D15). Monochrome;
 * follows `currentColor`.
 */
export function AiModelIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.2" />
      {/* pins */}
      <path d="M9.5 6.5V3.5M14.5 6.5V3.5M9.5 20.5v-3M14.5 20.5v-3" />
      <path d="M6.5 9.5h-3M6.5 14.5h-3M20.5 9.5h-3M20.5 14.5h-3" />
    </svg>
  );
}
