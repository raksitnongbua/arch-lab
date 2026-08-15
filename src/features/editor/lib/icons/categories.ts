/**
 * Icon categories. The groups the picker renders, in display order. Owned by
 * T2-A. The first six are the dev-handoff §4.6 originals; `devops`,
 * `observability` and `saas` were added with the thesvg brand set
 * (registry.ts header) — CI, monitoring and third-party SaaS had no home, and
 * folding ~20 brands into `generic` would have buried the generic silhouettes
 * the fallback path depends on. `generic` stays last: it is the "none of the
 * above" bucket, and the picker's no-match affordance points at it.
 */

export type IconCategory =
  | "languages"
  | "databases"
  | "messaging"
  | "networking"
  | "cloud"
  | "devops"
  | "observability"
  | "saas"
  | "generic";

/** Display order in the icon picker. */
export const ICON_CATEGORY_ORDER: readonly IconCategory[] = [
  "languages",
  "databases",
  "messaging",
  "networking",
  "cloud",
  "devops",
  "observability",
  "saas",
  "generic",
];

/**
 * Human-readable group headings (AF-E4-S2). "Data & Databases" rather than
 * the original "Databases": the group now also holds the pipeline tools
 * (Airflow, Spark, dbt) that live beside the stores they feed.
 */
export const ICON_CATEGORY_LABELS: Record<IconCategory, string> = {
  languages: "Languages & Runtimes",
  databases: "Data & Databases",
  messaging: "Caching & Messaging",
  networking: "Networking & Edge",
  cloud: "Cloud",
  devops: "CI/CD & DevOps",
  observability: "Observability",
  saas: "SaaS & Identity",
  generic: "Generic",
};
