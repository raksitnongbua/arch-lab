import type { Metadata } from "next";

import { SkillGuide } from "@/features/mcp/components/skill-guide";
import { publicOrigin } from "@/features/mcp/lib/origin";
import {
  KINDS_WITH_SYNTAX_SECTIONS,
  SKILL_INSTALL,
  SKILL_NAME,
  SKILL_REPO,
} from "@/features/mcp/catalog";
import { APP_NAME } from "@/lib/constants";

/*
 * TITLE AND DESCRIPTION NAME THE CATEGORY, and the category is "Agent Skill",
 * not "arch-lab". The same targeting decision `/mcp` records: the reader this
 * page is for is searching for a kind of thing, and has never heard of the
 * product. It is a SECOND category rather than a rewording of the first —
 * somebody who wants a skill has decided not to run a server, so a page whose
 * title says "MCP server" is not their result however well it ranks.
 */
export const metadata: Metadata = {
  title: "Agent Skill for architecture diagrams",
  description:
    "Install the .alab grammar as an Agent Skill: your agent writes C4, sequence and gantt diagrams as text, with no MCP server to connect and nothing running.",
  alternates: { canonical: "/skill" },
};

/**
 * `/skill` — the `.alab` grammar as a file, rather than as a connector.
 *
 * A top-level route beside `/mcp` because it is the same kind of thing: a
 * first-class way to use the format. It was a section on `/mcp` for one
 * release, which reached only readers who had already decided they wanted a
 * server — see the header of `skill-guide.tsx` for why that is the wrong
 * audience for it.
 *
 * PRERENDERED, unlike `/mcp`. That page reads `headers()` because it hands out
 * an endpoint URL that must work when pasted, whatever host served it; this
 * one hands out a command that names a GitHub repository, so there is no host
 * to derive and no reason to pay a function invocation per view.
 */
function skillJsonLd(origin: string): string {
  /*
   * `SoftwareSourceCode`, not `SoftwareApplication`. What this page documents
   * is not a program that runs — it is markdown an agent reads, and calling it
   * an application would claim an `operatingSystem` and a runtime it does not
   * have. `/mcp`'s node is the `SoftwareApplication`, because a server IS one;
   * the two nodes describing two different things is the point of having both.
   */
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: `${APP_NAME} .alab Agent Skill`,
    alternateName: SKILL_NAME,
    url: `${origin}/skill`,
    codeRepository: `https://github.com/${SKILL_REPO}`,
    programmingLanguage: "Markdown",
    applicationCategory: "DeveloperApplication",
    description:
      "An Agent Skill carrying the arch-lab .alab grammar, so an AI agent " +
      "can write C4 models, sequence diagrams, gantt charts, timelines and " +
      "lifecycles as text without connecting to a server.",
    /* Read from the catalogue rather than typed, the same rule `/mcp`'s
       `featureList` follows: a count that drifts from what is generated is a
       claim nobody would notice going stale. */
    keywords: [
      "agent skill",
      "claude code skill",
      "architecture diagrams as text",
      `${KINDS_WITH_SYNTAX_SECTIONS.length} notations with a grammar reference`,
    ],
    installUrl: `${origin}/skill`,
    isAccessibleForFree: true,
    license: "https://opensource.org/licenses/MIT",
    potentialAction: {
      "@type": "InstallAction",
      name: SKILL_INSTALL,
    },
  });
}

export default function SkillPage(): React.JSX.Element {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: skillJsonLd(publicOrigin()) }}
      />
      <SkillGuide />
    </>
  );
}
