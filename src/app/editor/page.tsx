import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { EditorPlaceholder } from "@/features/editor";

export const metadata: Metadata = {
  title: "Editor",
  description: "The arch-flow C4 canvas. Not implemented yet.",
};

export default function EditorPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col gap-2">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Editor
        </h1>
      </div>
      <EditorPlaceholder />
    </div>
  );
}
