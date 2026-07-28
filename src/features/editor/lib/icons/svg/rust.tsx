import type { SVGProps } from "react";

/**
 * Rust — cog-ring motif, hand-authored (D15). A gear rim around a hub, not
 * the trademarked logo. Monochrome; follows `currentColor`.
 */
export function RustIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3.4" />
      {/* cog teeth */}
      <path d="M12 2.6v1.9M12 19.5v1.9M2.6 12h1.9M19.5 12h1.9" />
      <path d="m5.3 5.3 1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
    </svg>
  );
}
