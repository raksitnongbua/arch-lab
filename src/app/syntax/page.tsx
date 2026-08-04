import type { Metadata } from "next";

import { SyntaxReference } from "@/features/syntax-docs";

export const metadata: Metadata = {
  title: "The .alab syntax — arch-lab text format reference",
  description:
    "Reference for the .alab text format: a readable, Mermaid-like, lossless twin of .archlab.json. Header lines, diagrams, nodes, edges, unknown-field escapes, indentation rules and error format — every example verified against the real parser.",
  alternates: { canonical: "/syntax" },
};

/**
 * `/syntax` — the `.alab` text-format reference. Chosen as a top-level route
 * because the format is a first-class product surface (it is what `/view`
 * asks you to write), not a docs subtree.
 */
export default function SyntaxPage(): React.JSX.Element {
  return <SyntaxReference />;
}
