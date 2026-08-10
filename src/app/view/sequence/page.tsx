import type { Metadata } from "next";

import { SequencePlayground } from "@/features/sequence";

export const metadata: Metadata = {
  title: "Sequence diagram playground — write it, then play it",
  description:
    "Write .alab sequence text or paste a Mermaid sequenceDiagram and watch it play: messages draw in order with step-through controls, activation bars, notes and nested fragments. Click any message or participant to focus it. Everything stays in your browser.",
  alternates: { canonical: "/view/sequence" },
};

/**
 * `/view/sequence` — the sequence playground: text pane on the left, the
 * animated player on the right. Like its `c4` sibling this is a STATIC
 * segment shadowing `/view/[modelId]`, so `sequence` is a reserved model id
 * (asserted at build time in the `[modelId]` page).
 *
 * No share links land here: the share codec is C4-specific, so this page
 * neither offers a Share button nor decodes fragments.
 */
export default function ViewSequencePage(): React.JSX.Element {
  return <SequencePlayground />;
}
