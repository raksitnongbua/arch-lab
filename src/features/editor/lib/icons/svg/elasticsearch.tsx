import type { SVGProps } from "react";

/**
 * Elasticsearch — the stacked-shard motif, hand-authored (D15). Monochrome;
 * follows `currentColor`.
 */
export function ElasticsearchIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* three shards of decreasing width */}
      <path d="M4 6.5h14" />
      <path d="M4 12h11.5" />
      <path d="M4 17.5h14" />
      {/* the search dot riding the middle shard */}
      <circle cx="19.2" cy="12" r="1.9" />
    </svg>
  );
}
