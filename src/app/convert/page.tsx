import type { Metadata } from "next";

import { Converter } from "@/features/convert";

export const metadata: Metadata = {
  title: "Convert Mermaid to .alab — arch-lab",
  description:
    "Paste Mermaid C4 or a Mermaid sequenceDiagram and get the canonical .alab text arch-lab stores — copy it, download it, or open it in the playground that renders it. Import is one-way and lossy, and the page says exactly what it drops. Runs entirely in your browser.",
  alternates: { canonical: "/convert" },
};

/**
 * `/convert` — the Mermaid importer as a destination rather than a side
 * effect. A top-level route beside `/validate` for the same reason that one
 * is: "how do I get my Mermaid into this format?" is a question the syntax
 * reference creates, and the answer should not require first choosing which
 * playground your diagram belongs to.
 */
export default function ConvertPage(): React.JSX.Element {
  return <Converter />;
}
