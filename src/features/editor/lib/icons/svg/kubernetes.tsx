import type { SVGProps } from "react";

/**
 * Kubernetes — the helm-wheel motif: heptagon hull, hub and spokes,
 * hand-authored (D15). Monochrome; follows `currentColor`.
 */
export function KubernetesIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 2.6 20 6.4l2 8.6-5.5 6.4h-9L2 15 4 6.4 12 2.6Z" />
      <circle cx="12" cy="12" r="3.1" />
      {/* spokes */}
      <path d="M12 8.9V5.4M14.9 10.3 18 8.4M14.7 14 17.9 15.9M9.3 14 6.1 15.9M9.1 10.3 6 8.4" />
    </svg>
  );
}
