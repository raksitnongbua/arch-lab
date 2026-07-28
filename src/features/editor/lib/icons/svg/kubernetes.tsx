import type { SVGProps } from "react";

/**
 * Kubernetes — the heptagonal helm with the hub. Monochrome; follows `currentColor`.
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
      <path d="M12 2.8 20 6.6v8.8L12 21.2 4 15.4V6.6L12 2.8Z" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 4.6v4.8M12 14.6v4.8M6.2 8.4l4.1 2.4M13.7 13.2l4.1 2.4M17.8 8.4l-4.1 2.4M10.3 13.2l-4.1 2.4" />
    </svg>
  );
}
