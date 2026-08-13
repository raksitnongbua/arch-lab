/**
 * One term/value row in a detail panel's `<dl>`.
 *
 * Shared by the node and edge panels, which sit side by side in the same dock
 * and had each grown an identical copy. The rows must line up between them —
 * clicking a node then an edge should not shift the type scale or the gap — and
 * one definition is what makes that structural rather than coincidental.
 */

export function MetaRow({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
        {term}
      </dt>
      <dd className="min-w-0 text-right text-[11px] text-foreground">
        {children}
      </dd>
    </div>
  );
}
