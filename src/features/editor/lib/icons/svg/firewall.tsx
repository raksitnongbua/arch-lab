import type { SVGProps } from "react";

/**
 * Generic firewall — a shield over a brick course, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function FirewallIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 2.8 19 5.4v5.9c0 4.2-2.9 7.5-7 8.9-4.1-1.4-7-4.7-7-8.9V5.4l7-2.6Z" />
      {/* brick course */}
      <path d="M5.4 9.6h13.2M12 6.2v3.4M9 9.6V13M15 9.6V13M5.6 13h12.8" />
    </svg>
  );
}
