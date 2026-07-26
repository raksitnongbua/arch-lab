import type { Metadata } from "next";

import { EditorShell } from "@/features/editor";

export const metadata: Metadata = {
  title: "Editor",
  description:
    "The arch-flow C4 canvas — draw your system, drill from Context to Code.",
};

export default function EditorPage() {
  return <EditorShell />;
}
