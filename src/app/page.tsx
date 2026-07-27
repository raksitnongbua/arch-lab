import {
  ArrowRight,
  Boxes,
  FileJson,
  Layers,
  Puzzle,
  Code2,
  Globe2,
  Keyboard,
  MousePointer2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_NAME, C4_LEVEL_META } from "@/lib/constants";
import type { C4Level } from "@/types";

const LEVEL_ICONS: Record<C4Level, LucideIcon> = {
  context: Globe2,
  container: Boxes,
  component: Puzzle,
  code: Code2,
};

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <Backdrop />

      {/* ---------------------------------------------------------------- hero */}
      <section className="mx-auto w-full max-w-6xl px-5 pt-16 pb-14 sm:px-8 sm:pt-24 sm:pb-20">
        <Badge variant="accent" className="mb-6">
          <span className="size-1.5 rounded-full bg-accent" />
          Pre-alpha · foundation only
        </Badge>

        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
          Architecture diagrams that{" "}
          <span className="af-running-gradient bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            survive code review
          </span>
          .
        </h1>

        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
          <span className="font-mono text-base text-foreground sm:text-lg">
            {APP_NAME}
          </span>{" "}
          is an interactive C4-model editor — drag out your system on a canvas,
          drill from Context down to Code, and save the whole model as one
          diff-readable JSON file.
        </p>

        <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link
            href="/editor"
            aria-describedby="cta-note"
            className={buttonClasses({ size: "lg" })}
          >
            Open Editor
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            href="/demo"
            className={buttonClasses({ variant: "outline", size: "lg" })}
          >
            Explore the live demo
          </Link>
          <p id="cta-note" className="text-sm text-muted-foreground">
            No account, no cloud — the model saves to a JSON file you own.
          </p>
        </div>

        <ul className="mt-14 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6 border-t border-border/60 pt-8 sm:grid-cols-4">
          <Stat value="4" label="C4 levels" />
          <Stat value="1" label="JSON file per model" />
          <Stat value="0" label="Accounts or servers" />
          <Stat value="Git" label="Is the collaboration layer" />
        </ul>
      </section>

      {/* -------------------------------------------------------------- levels */}
      <section
        aria-labelledby="levels-heading"
        className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-24"
      >
        <div className="mb-8 flex flex-col gap-2">
          <h2
            id="levels-heading"
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            One model, four altitudes
          </h2>
          <p className="max-w-2xl leading-relaxed text-muted-foreground">
            Every node can open into the level beneath it. Double-click to
            descend, breadcrumb to climb back out — the same model, told at the
            depth your audience needs.
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {C4_LEVEL_META.map((meta) => {
            const Icon = LEVEL_ICONS[meta.level];
            return (
              <li key={meta.level} className="flex">
                <Card className="group relative flex w-full flex-col overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                  {/* Hover wash — decorative, so it never affects layout. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/8 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <CardHeader className="relative gap-3">
                    <div className="flex items-center justify-between">
                      <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary/60 text-primary transition-colors group-hover:border-primary/40">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <span className="font-mono text-xs text-muted-foreground/60 tabular-nums">
                        L{meta.order}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <CardTitle className="text-lg">{meta.label}</CardTitle>
                      <span className="text-xs font-medium tracking-wide text-muted-foreground/80 uppercase">
                        {meta.audience}
                      </span>
                    </div>
                    <CardDescription>{meta.summary}</CardDescription>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {meta.examples.map((example) => (
                        <li key={example}>
                          <Badge variant="outline">{example}</Badge>
                        </li>
                      ))}
                    </ul>
                  </CardHeader>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ------------------------------------------------------------ features */}
      <section
        aria-labelledby="principles-heading"
        className="border-t border-border/60 bg-card/30"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <h2
            id="principles-heading"
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            What it is built around
          </h2>
          <ul className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            <Principle
              icon={MousePointer2}
              title="A canvas, not a syntax"
              body="Drag, snap, connect. Direct manipulation with alignment guides and undo on every edit — closer to draw.io than to a text DSL."
            />
            <Principle
              icon={FileJson}
              title="Plain JSON on disk"
              body="Stable ids, deterministic key order, sorted arrays. A reviewer sees what changed in the architecture, not a reshuffled blob."
            />
            <Principle
              icon={Layers}
              title="Real drill-down"
              body="Parent relationships are inherited into child levels as read-only boundary nodes, so a component view reads on its own."
            />
            <Principle
              icon={Keyboard}
              title="Keyboard and screen reader first"
              body="Every action reachable without a mouse, and the model exposed as structure — not an image with no alt text."
            />
            <Principle
              icon={Boxes}
              title="Icons for the stack you run"
              body="Go, Next.js, MongoDB, MySQL, Postgres, Redis, Cloudflare, nginx, Kong — inferred from a node's technology, overridable by hand."
            />
            <Principle
              icon={Globe2}
              title="Local-first, no account"
              body="Nothing leaves the machine. Open a file, edit it, save it back. Git is the collaboration layer."
            />
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <li className="flex flex-col gap-1">
      <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-sm leading-snug text-muted-foreground">
        {label}
      </span>
    </li>
  );
}

function Principle({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <li className="flex flex-col gap-2">
      <span className="flex items-center gap-2.5 text-primary">
        <Icon aria-hidden="true" className="size-4.5" />
        <span className="text-[15px] font-medium text-foreground">{title}</span>
      </span>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </li>
  );
}

/**
 * Decorative background: a faint canvas grid plus two soft colour washes.
 * Purely presentational, fixed behind content, ignored by assistive tech.
 */
function Backdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-transparent to-transparent" />
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--canvas-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--canvas-grid) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, black 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, black 20%, transparent 75%)",
        }}
      />
      <div className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-accent/10 blur-[120px]" />
      <div className="absolute -top-24 -left-32 size-[26rem] rounded-full bg-primary/10 blur-[120px]" />
    </div>
  );
}
