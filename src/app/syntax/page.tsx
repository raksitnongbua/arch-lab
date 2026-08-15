import type { Metadata } from "next";

import { SyntaxReference } from "@/features/syntax-docs";

export const metadata: Metadata = {
  title: "The .alab syntax — arch-lab text format reference",
  description:
    "The .alab text format, construct by construct — nodes, edges, drill-down, sequence messages and fragments. Every example is verified against the real parser.",
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
