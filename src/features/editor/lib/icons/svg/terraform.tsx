import type { SVGProps } from "react";

/**
 * Terraform — the three offset parallelogram slabs. Monochrome; follows `currentColor`.
 */
export function TerraformIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M4 4.6 9 7.2v5.4L4 10V4.6Z" />
      <path d="M10.4 8 15.4 10.6V16l-5-2.6V8Z" />
      <path d="M16.8 4.6 21.8 7.2v5.4l-5-2.6V4.6Z" />
      <path d="M10.4 16.6 15.4 19.2" />
    </svg>
  );
}
