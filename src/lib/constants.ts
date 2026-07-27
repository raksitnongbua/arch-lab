import type { C4Level } from "@/types";

export const APP_NAME = "arch-flow";

export const APP_DESCRIPTION =
  "A local-first workspace for architecture documentation — C4 model diagrams today, with sequence diagrams, a data dictionary, and network diagrams planned. Everything saves as reviewable JSON.";

/* -------------------------------------------------------------------------- */
/* Theming                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every theme the app knows about. Each entry needs exactly one matching CSS
 * block in `src/app/globals.css` (see the EXTENSION POINT comment there).
 * The provider and the toggle both read this list, so adding "midnight" here
 * plus a `.midnight { ... }` CSS block is the whole change.
 */
export const THEMES = ["light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/** Dark is a deliberate product decision (AF-E6-S1), not an OS preference. */
export const DEFAULT_THEME: Theme = "dark";

/** localStorage key next-themes persists the choice under. */
export const THEME_STORAGE_KEY = "arch-flow-theme";

/* -------------------------------------------------------------------------- */
/* C4 level presentation                                                       */
/* -------------------------------------------------------------------------- */

export interface C4LevelMeta {
  level: C4Level;
  /** 1-4, as shown in C4 documentation. */
  order: number;
  label: string;
  audience: string;
  summary: string;
  /** Example node types you would place at this level. */
  examples: string[];
}

/** Copy for the landing page, ordered outermost → innermost. */
export const C4_LEVEL_META: readonly C4LevelMeta[] = [
  {
    level: "context",
    order: 1,
    label: "Context",
    audience: "Everyone",
    summary:
      "The system as one box, the people who use it, and the third parties it depends on.",
    examples: ["Person", "Software System", "External System"],
  },
  {
    level: "container",
    order: 2,
    label: "Container",
    audience: "Architects & developers",
    summary:
      "The deployable units inside the boundary — apps, services, gateways, and data stores.",
    examples: ["Container", "Database", "Queue"],
  },
  {
    level: "component",
    order: 3,
    label: "Component",
    audience: "Developers",
    summary:
      "The internal structure of one container: handlers, use cases, adapters, and repositories.",
    examples: ["Component", "Database", "Queue"],
  },
  {
    level: "code",
    order: 4,
    label: "Code",
    audience: "Whoever is in the file",
    summary:
      "The last mile — the classes, interfaces, and functions that make a component real.",
    examples: ["Code Element"],
  },
];
