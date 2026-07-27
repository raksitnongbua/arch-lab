import type { C4NodeType } from "@/types";

/** C4 metadata line, e.g. "[Container: Kong Gateway 3.7]". */
export const TYPE_LABEL: Record<C4NodeType, string> = {
  person: "Person",
  softwareSystem: "Software System",
  externalSystem: "External System",
  container: "Container",
  database: "Database",
  queue: "Queue",
  component: "Component",
  codeElement: "Code Element",
};
