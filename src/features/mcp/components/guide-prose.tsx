/**
 * The prose furniture shared by the two integration guides — `/mcp` and
 * `/skill`.
 *
 * These lived inside `mcp-guide.tsx` as local primitives, correctly, while that
 * page was the only consumer. It stopped being the only one when the skill got
 * a page of its own, and four copied components would be four places for the
 * two pages to drift apart in — a section rule that draws on one page and not
 * the other reads as one of them being unfinished, which is exactly the kind of
 * "nothing is broken, it is just DIFFERENT" defect `codebase.md` habit 2 is
 * about. `dry.md`: two consumers, one definition.
 *
 * The `af-mcp-*` classes are declared in `styles/mcp-motion.css`, which
 * `globals.css` imports, so both routes get them without either importing a
 * stylesheet.
 */

import { cn } from "@/lib/utils";

/**
 * One numbered-off part of a guide, with an anchor a table of contents links
 * to and the top rule that separates it from the part above.
 */
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="mt-14 scroll-mt-20 border-t border-border/60 pt-10"
    >
      <h2
        id={`${id}-heading`}
        className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
      >
        {title}
      </h2>
      {/* Draws out from the left under the title. Decorative — the heading
          above it already says where you are — so it is hidden from the
          accessibility tree rather than announced as a separator. */}
      <span
        aria-hidden="true"
        className="af-mcp-rule mt-3 block h-px w-16 rounded-full bg-primary/60"
      />
      {children}
    </section>
  );
}

/** A paragraph at the guides' shared measure. `className` replaces the top margin. */
export function P({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <p
      className={cn(
        "leading-relaxed text-muted-foreground",
        className ?? "mt-4",
      )}
    >
      {children}
    </p>
  );
}

/** One item of a list whose marker is a dot rather than a disc. */
export function Bullet({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <li className="flex gap-3 leading-relaxed">
      <span
        aria-hidden="true"
        className="mt-2 size-1.5 shrink-0 rounded-full bg-accent"
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** An identifier, a filename or a fragment of grammar, inline. */
export function Code({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm text-foreground">
      {children}
    </code>
  );
}
