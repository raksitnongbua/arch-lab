import type { Metadata } from "next";

import { EditorShell } from "@/features/editor";

/*
 * EDITOR GATE (see EDITOR_ENABLED in src/lib/constants.ts).
 *
 * The flag is ON, so this route renders the real editor.
 *
 * Turning it off is two edits, and the second is not optional: flip the flag,
 * then replace the import and render below with a coming-soon page. The IMPORT
 * is the actual gate — a `{EDITOR_ENABLED ? <EditorShell/> : <ComingSoon/>}`
 * would still pull the canvas, React Flow and the editor store into the
 * deployed bundle, so the flag would claim the editor is not shipped while
 * every visitor downloaded it. The metadata below changes with it.
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
