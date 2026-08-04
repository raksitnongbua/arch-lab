import type { Metadata } from "next";

import { Validator } from "@/features/validate";

export const metadata: Metadata = {
  title: "Validate a model — arch-lab",
  description:
    "Check .alab text, arch-lab JSON, or Mermaid C4 against the real parsers. Get the exact line and column of any problem, and a summary of what a valid model contains. Runs entirely in your browser.",
  alternates: { canonical: "/validate" },
};

/**
 * `/validate` — the model checker. A top-level route alongside `/syntax`:
 * "does this parse, and where exactly does it break?" is the question the
 * syntax reference creates, so the answer lives one click away from it.
 */
export default function ValidatePage(): React.JSX.Element {
  return <Validator />;
}
