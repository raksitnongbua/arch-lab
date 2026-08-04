import type { Metadata } from "next";

import { EditorShell } from "@/features/editor";

/*
 * EDITOR GATE (see EDITOR_ENABLED in src/lib/constants.ts).
 *
 * While the editor is disabled this route must render a coming-soon page and
 * import NOTHING from `@/features/editor` — that is what keeps the editor UI
 * out of the deployed bundle, so a conditional render alone would not be
 * enough. The two lines above are the ones to drop when turning it back off,
 * along with reverting metadata to the coming-soon copy.
 */

export const metadata: Metadata = {
  title: "C4 editor — draw architecture diagrams on a canvas",
  description:
    "The arch-lab C4 editor: drag, snap, and connect nodes on an interactive canvas, drill from Context down to Code, and save the whole model as one diff-reviewable .alab text file. Local-first — no account, nothing leaves your browser.",
  alternates: { canonical: "/editor" },
};

export default function EditorPage(): React.JSX.Element {
  return <EditorShell />;
}
