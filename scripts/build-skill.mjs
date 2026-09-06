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

import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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

/*
 * WHICH NOTATIONS THIS FILE ACTUALLY TEACHES, derived from the section list
 * rather than typed out — the same pair of constants the MCP tool description
 * reads, and for the same reason.
 *
 * The description below said "(C4 diagrams and sequence diagrams)" for as long
 * as it took gantt, timeline and lifecycle sections to arrive, and the preamble
 * called itself "the complete .alab grammar" while four notations had no
 * section at all. That second one is the exact failure the MCP handshake was
 * fixed for: an agent told to read the grammar before writing a flowchart found
 * no mention of flowcharts and could reasonably conclude the format has none.
 */
const { KINDS_WITH_SYNTAX_SECTIONS, KINDS_WITHOUT_SYNTAX_SECTIONS } =
  await import(
    pathToFileURL(path.join(ROOT, "src/features/mcp/catalog.ts")).href
  );
const { EXAMPLE_NOTATION_LABEL } = await import(
  pathToFileURL(path.join(ROOT, "src/features/playground/lib/kind-copy.ts"))
    .href
);

/*
 * The notations' READABLE names, from the table the demo index and the
 * playground already read. The slugs are keys, not prose: "c4, usecase, er and
 * dict" in a sentence written for a person is the shape of a set that leaked
 * out of a Record.
 */
/** `a, b and c` — an English list, so a derived set reads as a sentence. */
function sentenceList(kinds) {
  const items = kinds.map((kind) => EXAMPLE_NOTATION_LABEL[kind] ?? kind);
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export const SKILL_SOURCE_DIR = "skills/alab";
export const SKILL_PATH = `${SKILL_SOURCE_DIR}/SKILL.md`;

/**
 * The frontmatter description is the ONLY part an agent reads before deciding
 * whether to open the skill, so it names the file extension and the failure it
 * prevents rather than describing the format in the abstract. A description
 * like "the .alab format" gets a skill loaded when nobody needed it and
 * skipped when they did.
 */
const NAME = "alab";
const DESCRIPTION =
  `Write and edit arch-lab .alab architecture files (${sentenceList(
    KINDS_WITH_SYNTAX_SECTIONS,
  )}). Use whenever creating or modifying a .alab file — ` +
  "the format has significant indentation and order-free attributes, so " +
  "writing it from memory produces plausible, invalid files.";

const PREAMBLE = `The \`.alab\` grammar for the ${sentenceList(KINDS_WITH_SYNTAX_SECTIONS)},
generated from the same source the arch-lab MCP server serves and verified
against the real parser on every build.

**arch-lab draws ${KINDS_WITHOUT_SYNTAX_SECTIONS.length} more notations this file does not cover** — the
${sentenceList(KINDS_WITHOUT_SYNTAX_SECTIONS)}. That is deliberate rather than a
gap: their constructs are arrows and named rows, and one worked example teaches
them faster than a grammar would. Ask the MCP server's \`get_example_model\` for
one, or read a bundled document at ${DEFAULT_PUBLIC_ORIGIN}/demo — every one is
parser-verified, which makes it the real reference for its grammar.

**Read the relevant section before writing \`.alab\`, not after.** The format
has significant indentation and order-free attributes; both are easy to guess
wrong in ways that look right.

**You do not need a server to write these files.** \`.alab\` is plain text —
use your own file tools. What this skill gives you is the grammar. What it
cannot give you is the parser's verdict on a file you have written: for that,
either connect the [arch-lab MCP server](${DEFAULT_PUBLIC_ORIGIN}/mcp) and call
\`validate_model\`, or paste the file into the validator at ${DEFAULT_PUBLIC_ORIGIN}/validate.`;

/**
 * WHAT STAYS IN `SKILL.md`, AND WHY ONLY THIS.
 *
 * The Agent Skills spec asks for a body under ~5,000 tokens and under 500
 * lines; the whole reference is ~7,700 tokens and was all of it in one file. It
 * was not merely over budget — it was the wrong SHAPE. An agent writing a gantt
 * had to carry the C4 node table, the frame rules and the entire sequence
 * grammar to reach four hundred tokens about `starts`, and paying for a
 * notation you are not writing is exactly what progressive disclosure exists to
 * stop.
 *
 * These three are what EVERY `.alab` document needs whatever its notation: what
 * the format is and how the header picks a parser, one worked document, and the
 * indentation rules. Everything else is per-notation and lives one file away.
 */
const SKILL_SECTIONS = ["overview", "example", "layout"];

/**
 * The rest, grouped by the DECISION a reader has already made — the notation
 * they are writing — rather than by size.
 *
 * `when` is the load-bearing field. A list of files is not progressive
 * disclosure; a reader has to be able to tell which one is theirs WITHOUT
 * opening any of them, so each line answers "am I doing this?" and nothing
 * else. Grouping by notation is what makes that possible: the C4 productions
 * are one decision, not seven.
 */
const REFERENCE_FILES = [
  {
    file: "c4.md",
    title: "The C4 model grammar",
    when: "you are writing `archlab 1.0` — systems, containers, components",
    sections: [
      "header",
      "diagrams",
      "frames",
      "nodes",
      "edges",
      "paths",
      "unknown-fields",
    ],
  },
  {
    file: "sequence.md",
    title: "The sequence grammar",
    when: "you are writing `archlab 1.0 sequence` — participants and messages",
    sections: ["sequence"],
  },
  {
    file: "gantt.md",
    title: "The gantt grammar",
    when: "you are writing `archlab 1.0 gantt` — durations and dependencies",
    sections: ["gantt"],
  },
  {
    file: "timeline.md",
    title: "The timeline grammar",
    when: "you are writing `archlab 1.0 timeline` — what happened, and when",
    sections: ["timeline"],
  },
  {
    file: "lifecycle.md",
    title: "The lifecycle grammar",
    when: "you are writing `archlab 1.0 lifecycle` — one thing and its states",
    sections: ["lifecycle"],
  },
  {
    file: "errors.md",
    title: "What errors look like",
    when: "the parser rejected your file and you want to read its message",
    sections: ["errors"],
  },
];

export const REFERENCE_DIR = "reference";

/**
 * Every section is placed EXACTLY ONCE, and the generator refuses to run if not.
 *
 * A section added to `syntax-sections.ts` and to no list here would simply
 * vanish from the skill — the file would still build, still be byte-identical
 * to itself, and quietly teach one construct less. Failing here rather than in
 * the check is deliberate: the build is what a person runs after adding a
 * section, and it should tell them in the same minute.
 */
function assertEverySectionPlaced() {
  const placed = [
    ...SKILL_SECTIONS,
    ...REFERENCE_FILES.flatMap((entry) => entry.sections),
  ];
  const missing = SYNTAX_SECTION_IDS.filter((id) => !placed.includes(id));
  const duplicated = placed.filter((id, index) => placed.indexOf(id) !== index);
  const unknown = placed.filter((id) => !SYNTAX_SECTION_IDS.includes(id));
  if (missing.length > 0 || duplicated.length > 0 || unknown.length > 0) {
    throw new Error(
      [
        "the skill's section layout does not cover the syntax reference:",
        missing.length > 0 ? `  never written: ${missing.join(", ")}` : null,
        duplicated.length > 0
          ? `  written twice: ${duplicated.join(", ")}`
          : null,
        unknown.length > 0 ? `  not a section: ${unknown.join(", ")}` : null,
        "  fix SKILL_SECTIONS / REFERENCE_FILES in scripts/build-skill.mjs",
      ]
        .filter((line) => line !== null)
        .join("\n"),
    );
  }
}

function renderSections(ids) {
  return ids.flatMap((id) => {
    const section = syntaxSection(id);
    return [`## ${section.title}`, "", section.body.trim(), ""];
  });
}

const FOOTER = [
  "---",
  "",
  "*Generated from arch-lab's syntax reference — do not edit by hand.*",
  "*Regenerate with `pnpm build:skill`.*",
  "",
];

/**
 * Every file the skill is made of, keyed by its path inside the skill
 * directory. Both install routes copy the whole directory, so the reference
 * files travel with `SKILL.md` either way.
 */
export function buildSkillFiles() {
  assertEverySectionPlaced();

  const map = REFERENCE_FILES.map(
    (entry) =>
      `| ${entry.when} | [\`${REFERENCE_DIR}/${entry.file}\`](${REFERENCE_DIR}/${entry.file}) |`,
  ).join("\n");

  const files = new Map();

  files.set(
    "SKILL.md",
    [
      "---",
      `name: ${NAME}`,
      `description: ${DESCRIPTION}`,
      "---",
      "",
      "# The .alab format",
      "",
      PREAMBLE,
      "",
      ...renderSections(SKILL_SECTIONS),
      "## Which reference to open",
      "",
      /* THE INSTRUCTION, not just the table. An agent that has been handed a
         list of files will often read all of them, which costs more than the
         single file this replaced — so the rule is stated before the table
         rather than left to be inferred from it. */
      "**Read one row, not the table.** Each file below is the complete grammar",
      "for one notation; you need the row matching the header line you are",
      "writing, and nothing else. Open the errors file only when a parse fails.",
      "",
      "| If | Read |",
      "| --- | --- |",
      map,
      "",
      ...FOOTER,
    ].join("\n"),
  );

  for (const entry of REFERENCE_FILES) {
    files.set(
      `${REFERENCE_DIR}/${entry.file}`,
      [
        `# ${entry.title}`,
        "",
        `Part of the \`${NAME}\` skill — open this when ${entry.when}.`,
        "",
        ...renderSections(entry.sections),
        ...FOOTER,
      ].join("\n"),
    );
  }

  return files;
}

/** The entry file alone, for callers that only want the skill's own body. */
export function buildSkill() {
  return buildSkillFiles().get("SKILL.md");
}

/*
 * WRITTEN ONLY WHEN RUN DIRECTLY — `check:skill` imports `buildSkillFiles`
 * instead, so verifying can never be what makes the check pass.
 *
 * Stale files are REMOVED, not left. Renaming a reference file used to be
 * impossible to get wrong when there was one file; now a rename leaves the old
 * one in the directory, both install routes copy the whole directory, and the
 * reader gets a grammar file nothing links to and nothing regenerates.
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = buildSkillFiles();
  const root = path.join(ROOT, SKILL_SOURCE_DIR);

  for (const [relative, contents] of files) {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }

  const referenceDir = path.join(root, REFERENCE_DIR);
  if (existsSync(referenceDir)) {
    for (const name of readdirSync(referenceDir)) {
      if (files.has(`${REFERENCE_DIR}/${name}`)) continue;
      rmSync(path.join(referenceDir, name), { recursive: true });
      console.log(`removed stale ${SKILL_SOURCE_DIR}/${REFERENCE_DIR}/${name}`);
    }
  }

  console.log(`wrote ${files.size} file(s) under ${SKILL_SOURCE_DIR}/`);
}
