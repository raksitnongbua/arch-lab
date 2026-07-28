import type { SVGProps } from "react";

/**
 * Generic identity provider — key motif for auth, SSO and IAM,
 * hand-authored (D15). Monochrome; follows `currentColor`.
 */
export function IdentityIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="8.6" cy="9.4" r="4.6" />
      <path d="m11.9 12.7 8.1 8.1" />
      <path d="m17.4 18.2 2-2" />
    </svg>
  );
}
