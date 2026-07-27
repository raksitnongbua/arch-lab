import type { Metadata } from "next";

import { ShowcaseShell } from "@/features/showcase";

export const metadata: Metadata = {
  title: "Live demo",
  description:
    "Explore a real C4 model in view-only mode — click into any layer, from Context down to Code, and zoom back out.",
};

export default function DemoPage() {
  return <ShowcaseShell />;
}
