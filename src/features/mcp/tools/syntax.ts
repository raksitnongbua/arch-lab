/**
 * `get_syntax_reference` — the grammar, on demand.
 *
 * `.alab` is a real format with a 1,900-line parser behind it, and an agent
 * guessing at it produces plausible, invalid files. Handing it the reference
 * up front is the difference between one-shot valid output and three
 * correction rounds, so this is deliberately cheap to call and also exposed
 * as an MCP *resource* (`archlab://syntax`) for clients that prefer to pin
 * reference material into context rather than call a tool for it.
 *
 * Sectioned so a caller who only needs the edge grammar pays for the edge
 * grammar.
 */

import {
  allSyntaxSections,
  syntaxSection,
  SYNTAX_SECTION_IDS,
  syntaxReferenceMarkdown,
  type SyntaxSectionId,
} from "../content/syntax-sections";
import { errorResult, textResult, type McpTextResult } from "../lib/render";

export { SYNTAX_SECTION_IDS, syntaxReferenceMarkdown };
export type { SyntaxSectionId };

export function getSyntaxReference(section: string | undefined): McpTextResult {
  if (section === undefined || section === "all") {
    return textResult(syntaxReferenceMarkdown());
  }

  if (!(SYNTAX_SECTION_IDS as readonly string[]).includes(section)) {
    return errorResult(
      `Unknown section \`${section}\`. Available sections: ` +
        `${SYNTAX_SECTION_IDS.join(", ")} — or omit the argument for all of them.`,
    );
  }

  const found = syntaxSection(section as SyntaxSectionId);
  return textResult(`## ${found.title}\n\n${found.body}`);
}

/** Section ids and titles, for the tool description and the `/mcp` page. */
export function syntaxSectionIndex(): { id: string; title: string }[] {
  return allSyntaxSections().map((section) => ({
    id: section.id,
    title: section.title,
  }));
}
