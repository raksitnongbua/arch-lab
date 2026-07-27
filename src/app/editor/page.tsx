import type { Metadata } from "next";
import { ArrowRight, PencilRuler } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";

/*
 * EDITOR GATE (see EDITOR_ENABLED in src/lib/constants.ts).
 *
 * While the editor is disabled this route renders the coming-soon page below
 * and deliberately imports NOTHING from `@/features/editor` — that is what
 * keeps the editor UI out of the deployed bundle, so a conditional render
 * alone would not be enough. To re-enable the real editor, flip the flag and
 * restore these two lines:
 *
 *   import { EditorShell } from "@/features/editor";
 *   export default function EditorPage() { return <EditorShell />; }
 *
 * (metadata below reverts to: title "Editor", description "The arch-flow C4
 * canvas — draw your system, drill from Context to Code.")
 */

export const metadata: Metadata = {
  title: "Editor — coming soon",
  description:
    "The arch-flow C4 editor is coming soon. Explore the read-only demo models, or paste your own model into view mode today.",
};

export default function EditorPage(): React.JSX.Element {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-5 py-20 sm:px-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <span className="grid size-14 place-items-center rounded-2xl border border-border bg-secondary/60 text-muted-foreground">
          <PencilRuler aria-hidden="true" className="size-6" />
        </span>

        <Badge variant="outline" className="mt-6">
          Coming soon
        </Badge>

        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          The editor is coming soon
        </h1>

        <p className="mt-4 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
          The C4 editor — drag, connect, drill from Context to Code, and save
          your model as plain JSON — is not part of this release. In the
          meantime, everything view mode offers works today.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/demo" className={buttonClasses({ size: "lg" })}>
            Explore the live demo
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            href="/view/new"
            className={buttonClasses({ variant: "outline", size: "lg" })}
          >
            Paste your own model
          </Link>
        </div>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          Have an{" "}
          <span className="font-mono text-foreground">.archflow.json</span> file
          or Mermaid C4 code already? View mode renders it read-only, right in
          your browser — nothing is uploaded.
        </p>
      </div>
    </div>
  );
}
