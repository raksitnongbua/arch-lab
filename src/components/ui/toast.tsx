"use client";

import { useSyncExternalStore } from "react";
import { AlertTriangle, Info, X, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Contract, frozen after Batch 1)                           */
/* -------------------------------------------------------------------------- */

export interface ToastInput {
  message: string;
  tone?: "info" | "warning" | "error";
  action?: { label: string; run: () => void };
  /** Auto-dismiss delay. Default 5000. */
  durationMs?: number;
}

interface ToastEntry extends Required<Pick<ToastInput, "message" | "tone">> {
  id: number;
  action?: ToastInput["action"];
}

/* -------------------------------------------------------------------------- */
/* Module store — lets `toast()` be called from anywhere (event handlers,     */
/* store actions) without a React context in scope.                           */
/* -------------------------------------------------------------------------- */

let nextId = 1;
let entries: readonly ToastEntry[] = [];
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit(next: readonly ToastEntry[]): void {
  entries = next;
  listeners.forEach((listener) => listener());
}

function dismiss(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
  emit(entries.filter((entry) => entry.id !== id));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly ToastEntry[] {
  return entries;
}

const EMPTY: readonly ToastEntry[] = [];

function getServerSnapshot(): readonly ToastEntry[] {
  return EMPTY;
}

/** Imperative toast API. Safe to call before `<Toaster />` has mounted. */
export function toast(input: ToastInput): void {
  const entry: ToastEntry = {
    id: nextId++,
    message: input.message,
    tone: input.tone ?? "info",
    action: input.action,
  };
  emit([...entries, entry]);
  timers.set(
    entry.id,
    setTimeout(() => dismiss(entry.id), input.durationMs ?? 5000),
  );
}

/* -------------------------------------------------------------------------- */
/* Renderer                                                                   */
/* -------------------------------------------------------------------------- */

const TONE_ICON = {
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
} as const;

const TONE_CLASSES = {
  info: "text-accent",
  warning: "text-warning",
  error: "text-destructive",
} as const;

/**
 * Toast stack. Mounted exactly once, by `editor-shell.tsx`. Frozen after
 * Batch 1.
 */
export function Toaster(): React.JSX.Element {
  const current = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {current.map((entry) => {
        const Icon = TONE_ICON[entry.tone];
        return (
          <div
            key={entry.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-popover px-3.5 py-3 text-sm text-popover-foreground shadow-lg"
          >
            <Icon
              aria-hidden="true"
              className={cn("mt-0.5 size-4 shrink-0", TONE_CLASSES[entry.tone])}
            />
            <p className="flex-1">{entry.message}</p>
            {entry.action ? (
              <button
                type="button"
                className="shrink-0 rounded-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => {
                  entry.action?.run();
                  dismiss(entry.id);
                }}
              >
                {entry.action.label}
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Dismiss notification"
              className="shrink-0 rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              onClick={() => dismiss(entry.id)}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
