import type { SVGProps } from "react";

/**
 * Memcached — a memory bank holding a hot entry, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function MemcachedIcon(props: SVGProps<SVGSVGElement>) {
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
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      {/* contact pins */}
      <path d="M6 18v2M12 18v2M18 18v2" />
      {/* the cached entry */}
      <path
        d="M13 8.6 9.6 12.8H12l-.9 3.1 3.9-4.6h-2.3l.3-2.7Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}
