/**
 * Icon categories (dev-handoff §4.6, AF-E4-S2). The six groups the picker
 * renders, in display order. Owned by T2-A.
 */

export type IconCategory =
  "languages" | "databases" | "messaging" | "networking" | "cloud" | "generic";

/** Display order in the icon picker. */
export const ICON_CATEGORY_ORDER: readonly IconCategory[] = [
  "languages",
  "databases",
  "messaging",
  "networking",
  "cloud",
  "generic",
];

/** Human-readable group headings (AF-E4-S2). */
export const ICON_CATEGORY_LABELS: Record<IconCategory, string> = {
  languages: "Languages & Runtimes",
  databases: "Databases",
  messaging: "Caching & Messaging",
  networking: "Networking & Edge",
  cloud: "Cloud",
  generic: "Generic",
};
