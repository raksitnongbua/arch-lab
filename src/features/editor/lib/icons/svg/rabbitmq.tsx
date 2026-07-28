import type { SVGProps } from "react";

/**
 * RabbitMQ — the ears over the queue block. Monochrome; follows `currentColor`.
 */
export function RabbitmqIcon(props: SVGProps<SVGSVGElement>) {
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
      <path d="M5 9.4V4.8h3.2v4.6h3V4.8h3.2v4.6H19v9.8H5V9.4Z" />
      <circle cx="15.4" cy="14.6" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
