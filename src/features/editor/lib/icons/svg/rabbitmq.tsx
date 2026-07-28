import type { SVGProps } from "react";

/**
 * RabbitMQ — stylised rabbit head, hand-authored (D15). In the same animal
 * family as the gopher and dolphin marks, not the trademarked logo.
 * Monochrome; follows `currentColor`.
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
      {/* ears */}
      <ellipse
        cx="8.8"
        cy="7"
        rx="1.6"
        ry="3.6"
        transform="rotate(-12 8.8 7)"
      />
      <ellipse
        cx="15.2"
        cy="7"
        rx="1.6"
        ry="3.6"
        transform="rotate(12 15.2 7)"
      />
      {/* head */}
      <path d="M12 11.2c-3.6 0-6.4 2.4-6.4 5.3 0 2.2 1.7 3.9 3.9 3.9h5c2.2 0 3.9-1.7 3.9-3.9 0-2.9-2.8-5.3-6.4-5.3Z" />
      {/* eyes and nose */}
      <circle cx="9.8" cy="15.6" r="0.65" fill="currentColor" stroke="none" />
      <circle cx="14.2" cy="15.6" r="0.65" fill="currentColor" stroke="none" />
      <path d="M11.2 17.8h1.6l-.8.9Z" fill="currentColor" stroke="none" />
    </svg>
  );
}
