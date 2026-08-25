#!/usr/bin/env node
/**
 * Generates `skills/alab/SKILL.md` from the syntax reference.
 *
 * WHY GENERATED RATHER THAN WRITTEN. The skill is the same knowledge the MCP
 * server hands out through `get_syntax_reference` and the `archlab://syntax`
 * resource, delivered a different way — as a file in the reader's project for
 * people who do not want to connect a server. Two hand-maintained copies of a
 * grammar is one copy that is quietly wrong, and the wrong one would be this
 * one, because the server's copy is exercised by every tool call and the
 * skill's is exercised by nobody until it produces an invalid file.
 *
 * So there is one source — `content/syntax-sections.ts`, whose snippets
 * `check:syntax-docs` already runs through the real parser — and this writes
 * the skill out of it. `check:skill` asserts the committed file is exactly
 * what this produces, so the two cannot part company without CI noticing.
 *
 * Run with: pnpm build:skill   (and pnpm check:skill to verify)
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    let resolved = specifier;
    if (resolved.startsWith("@/")) {
      resolved = pathToFileURL(path.join(ROOT, "src", resolved.slice(2))).href;
    }
    if (
      (resolved.startsWith("./") || resolved.startsWith("../")) &&
      typeof context.parentURL === "string"
    ) {
      resolved = new URL(resolved, context.parentURL).href;
    }
    if (resolved.startsWith("file:")) {
      const asPath = fileURLToPath(resolved);
      if (!(existsSync(asPath) && statSync(asPath).isFile())) {
        if (existsSync(`${asPath}.ts`)) {
          resolved = pathToFileURL(`${asPath}.ts`).href;
        } else if (existsSync(path.join(asPath, "index.ts"))) {
          /* A DIRECTORY IMPORT, i.e. a barrel: `@/types` is `src/types/index.ts`.
             Every check script's hook already did this; this one did not, so the
             first module reached from here that imported a barrel failed the
             BUILD rather than a check — and the skill is generated, so the
             failure surfaced as a stale SKILL.md. */
          resolved = pathToFileURL(path.join(asPath, "index.ts")).href;
        }
      }
    }
    return nextResolve(resolved, context);
  },
});

const { SYNTAX_SECTION_IDS, syntaxSection } = await import(
  pathToFileURL(path.join(ROOT, "src/features/mcp/content/syntax-sections.ts"))
    .href
);

/*
 * The site URL comes from the same constant the app falls back to, never
 * typed out here. `lib/origin.ts` exists BECAUSE a hardcoded origin went stale
 * when the subdomain changed and /mcp spent a day advertising a dead endpoint;
 * a second hardcoded copy buried in a generated file is how that happens again
 * somewhere nobody is looking.
 */
const { DEFAULT_PUBLIC_ORIGIN } = await import(
  pathToFileURL(path.join(ROOT, "src/features/mcp/lib/origin.ts")).href
);

export const SKILL_PATH = "skills/alab/SKILL.md";

/**
 * The frontmatter description is the ONLY part an agent reads before deciding
 * whether to open the skill, so it names the file extension and the failure it
 * prevents rather than describing the format in the abstract. A description
 * like "the .alab format" gets a skill loaded when nobody needed it and
 * skipped when they did.
 */
const NAME = "alab";
const DESCRIPTION =
  "Write and edit arch-lab .alab architecture files (C4 diagrams and " +
  "sequence diagrams). Use whenever creating or modifying a .alab file — " +
  "the format has significant indentation and order-free attributes, so " +
  "writing it from memory produces plausible, invalid files.";

const PREAMBLE = `This is the complete \`.alab\` grammar, generated from the same source the
arch-lab MCP server serves and verified against the real parser on every
build.

**Read the relevant section before writing \`.alab\`, not after.** The format
has significant indentation and order-free attributes; both are easy to guess
wrong in ways that look right.

**You do not need a server to write these files.** \`.alab\` is plain text —
use your own file tools. What this skill gives you is the grammar. What it
cannot give you is the parser's verdict on a file you have written: for that,
either connect the [arch-lab MCP server](${DEFAULT_PUBLIC_ORIGIN}/mcp) and call
\`validate_model\`, or paste the file into the validator at ${DEFAULT_PUBLIC_ORIGIN}/validate.`;

export function buildSkill() {
  const sections = SYNTAX_SECTION_IDS.map((id) => syntaxSection(id));
  const toc = sections
    .map((section) => `- [${section.title}](#${slug(section.title)})`)
    .join("\n");

  return [
    "---",
    `name: ${NAME}`,
    `description: ${DESCRIPTION}`,
    "---",
    "",
    "# The .alab format",
    "",
    PREAMBLE,
    "",
    "## Contents",
    "",
    toc,
    "",
    ...sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      section.body.trim(),
      "",
    ]),
    "---",
    "",
    "*Generated from arch-lab's syntax reference — do not edit by hand.*",
    "*Regenerate with `pnpm build:skill`.*",
    "",
  ].join("\n");
}

/** GitHub-flavoured anchor slug, so the contents links actually resolve. */
function slug(title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Only write when run directly — `check:skill` imports `buildSkill` instead,
// so verifying can never be what makes the check pass.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = path.join(ROOT, SKILL_PATH);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, buildSkill());
  console.log(`wrote ${SKILL_PATH}`);
}
