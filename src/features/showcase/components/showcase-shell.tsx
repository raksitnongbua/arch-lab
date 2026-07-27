"use client";

/**
 * The showcase page body: a short, confident header naming what this is,
 * the route into the real editor, and the view-only canvas underneath.
 */

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";

import { DEMO_MODEL } from "../data/demo-model";
import { ShowcaseCanvas } from "./showcase-canvas";

export function ShowcaseShell(): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {DEMO_MODEL.title}
              </h1>
              <Badge variant="accent">
                <span className="size-1.5 rounded-full bg-accent" />
                Live demo · view-only
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-pretty text-muted-foreground">
              A real e-commerce architecture, told at four altitudes. Click any
              numbered node to zoom into it — Context to Code and back — the way
              every arch-flow model reads.
            </p>
          </div>
          <Link
            href="/editor"
            className={buttonClasses({ size: "sm", className: "shrink-0" })}
          >
            Build yours in the editor
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="relative min-h-96 flex-1">
        <ShowcaseCanvas />
      </div>
    </div>
  );
}
