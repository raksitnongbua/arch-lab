import { ArrowRight, Bot, MousePointer2, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

/*
 * EDITOR GATE (see EDITOR_ENABLED in src/lib/constants.ts).
 *
 * This file imports NOTHING from `@/features/editor`, and that is the whole
 * mechanism: the gate is a build-time boundary, not a conditional render. A
 * `{EDITOR_ENABLED ? <EditorShell/> : <ComingSoon/>}` here would still pull the
 * canvas, React Flow and the editor store into the deployed bundle — the flag
 * would claim the editor is not shipped while every visitor downloaded it.
 *
 * To turn the editor back on: flip EDITOR_ENABLED, then restore
 * `import { EditorShell } from "@/features/editor"` and the editor metadata
 * below. Those two edits are the entire switch.
 */

export const metadata: Metadata = {
  title: "C4 editor — coming soon",
  description:
    "The arch-lab canvas editor is still in progress. Meanwhile the C4 viewer, the sequence-diagram viewer and the MCP server all work today, and models are plain .alab text you can already author by hand or with an agent.",
  alternates: { canonical: "/editor" },
};

/** Where a reader who wanted the editor should go instead. */
const ALTERNATIVES = [
  {
    href: "/demo",
    icon: MousePointer2,
    title: "Explore a real model",
    body: "Two complete example systems, Context down to Code. Click a node to open the level beneath it and breadcrumb back out — the same drill-down the editor will build.",
    cta: "Open the demo",
  },
  {
    href: "/view/sequence",
    icon: Workflow,
    title: "Sequence diagrams",
    body: "Working today: write .alab sequence text or paste a Mermaid sequenceDiagram, then click any message, participant or alt branch to spotlight its flow.",
    cta: "Open the viewer",
  },
  {
    href: "/mcp",
    icon: Bot,
    title: "Let an agent write it",
    body: "The MCP server hands an agent the grammar and the real parser's verdict, so a model it authors is valid before you open it. Ten read-only tools, both document kinds.",
    cta: "Connect an agent",
  },
] as const;

export default function EditorPage(): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-16 sm:px-8 sm:py-24">
      <Badge variant="outline" className="mb-6 self-start">
        Editor — coming soon
      </Badge>

      <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        The canvas editor is still in progress.
      </h1>

      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
        Drawing C4 models by hand — drag, snap, connect, drill down — is the
        next thing {APP_NAME} ships. It is not ready, so this page says so
        rather than showing you a canvas that would disappoint.
      </p>

      <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
        Nothing is blocked on it, though. A model is{" "}
        <Link href="/syntax" className="underline">
          plain <code className="font-mono text-[0.9em]">.alab</code> text
        </Link>{" "}
        — a format designed to be written by hand in any editor, or by an agent,
        and to round-trip losslessly to JSON. The viewers below read what you
        write today.
      </p>

      <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ALTERNATIVES.map((alternative) => {
          const Icon = alternative.icon;
          return (
            <li key={alternative.href} className="flex">
              <Card className="group flex w-full flex-col transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                <CardHeader className="flex flex-1 flex-col gap-3">
                  <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary/60 text-primary transition-colors group-hover:border-primary/40">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <CardTitle className="text-lg">{alternative.title}</CardTitle>
                  <CardDescription className="flex-1">
                    {alternative.body}
                  </CardDescription>
                  <Link
                    href={alternative.href}
                    className={`${buttonClasses({
                      variant: "outline",
                      size: "sm",
                    })} mt-1 self-start`}
                  >
                    {alternative.cta}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </CardHeader>
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="mt-12 text-sm text-muted-foreground">
        No account, no cloud, no waiting list — everything here runs in your
        browser, and nothing you paste leaves it.
      </p>
    </div>
  );
}
