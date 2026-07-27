import { APP_NAME } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60">
      {/* Full-bleed to match the header — see the note there. */}
      <div className="flex w-full flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-mono">{APP_NAME}</span> — local-first
          architecture documentation. C4 today; more diagram types planned.
        </p>
        <p>Saves to plain JSON. Diff it, review it, commit it.</p>
      </div>
    </footer>
  );
}
