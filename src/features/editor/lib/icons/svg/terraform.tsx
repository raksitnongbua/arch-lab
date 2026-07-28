import type { SVGProps } from "react";

/**
 * Terraform — the interlocking-parallelogram motif, hand-authored (D15).
 * Monochrome; follows `currentColor`.
 */
export function TerraformIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* upper-left block */}
      <path d="M4 3.2 9.5 5.95v5.5L4 8.7V3.2Z" />
      {/* lower-left block */}
      <path d="M4 9.9l5.5 2.75v5.5L4 15.4V9.9Z" />
      {/* upper-right block, leaning the other way */}
      <path d="M10.5 5.95 16 3.2v5.5l-5.5 2.75V5.95Z" />
    </svg>
  );
}
