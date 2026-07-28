import type { SVGProps } from "react";

/**
 * Kafka — broker nodes joined to a spine. Monochrome; follows `currentColor`.
 */
export function KafkaIcon(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="7" cy="5.6" r="2" />
      <circle cx="7" cy="18.4" r="2" />
      <circle cx="7" cy="12" r="2.2" />
      <circle cx="17.4" cy="8.4" r="2" />
      <circle cx="17.4" cy="15.6" r="2" />
      <path d="M9 11.2 15.5 9.2M9 12.8l6.5 2M7 7.6v2.2M7 14.2v2.2" />
    </svg>
  );
}
