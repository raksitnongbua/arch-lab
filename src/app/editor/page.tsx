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
  title: "Editor",
  description:
    "The arch-lab C4 canvas — draw your system, drill from Context to Code.",
};

export default function EditorPage(): React.JSX.Element {
  return <EditorShell />;
}
