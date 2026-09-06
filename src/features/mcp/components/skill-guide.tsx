/**
 * `/skill` — the `.alab` grammar as an Agent Skill, with no server involved.
 *
 * WHY IT IS A PAGE AND NOT A SECTION. It was a section — `#skill` on `/mcp` —
 * and that reached everyone who had already decided they wanted an MCP server.
 * The two are different products answering different searches: one is "an MCP
 * server for architecture diagrams", the other is "an agent skill that writes
 * architecture diagrams", and a page whose `h1` names the first cannot be the
 * result for the second. `/mcp` now carries a short pointer here rather than
 * the whole argument, so the two pages do not compete for the same canonical.
 *
 * Server-rendered, like `/mcp` and for the same reason: AI crawlers do not run
 * JavaScript, and this page's entire content is the passage an assistant would
 * quote when asked whether such a skill exists.
 *
 * EVERY CLAIM IS DERIVED. The commands, the destination path and the count of
 * notations with a grammar file all come from `../catalog.ts`; `check:skill`
 * asserts the generated files on disk match, so this page cannot advertise a
 * skill that was not built. The one thing it must not do is grow a hand-typed
 * file list — the skill's shape is decided by `scripts/build-skill.mjs`, and a
 * second list here would be a second thing to keep true.
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";

import {
  KINDS_WITH_SYNTAX_SECTIONS,
  SKILL_DESTINATION,
  SKILL_INSTALL,
  SKILL_INSTALL_ALTERNATIVE,
  SKILL_NAME,
  SKILL_REPO,
} from "../catalog";
import { CopySnippet } from "./copy-snippet";
import { Bullet, Code, P, Section } from "./guide-prose";

export function SkillGuide(): React.JSX.Element {
  return (
    /* The same single measure `/mcp` sets, and set in the same one place —
       two integration guides that disagreed about their column width would
       read as two sites. */
    <div className="mx-auto w-full max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="af-mcp-fade mb-6 flex flex-wrap items-center gap-2">
        <Badge variant="accent">
          <span className="af-mcp-pulse size-1.5 rounded-full bg-accent" />
          Integration · Agent Skill
        </Badge>
      </div>

      {/* NAMES THE CATEGORY, not the product — the same decision `/mcp`'s
          heading records, and it is load-bearing for the same reason: nobody
          searching for this knows what arch-lab is, and the heading is the
          first thing both a search result and a cited answer show. */}
      <h1 className="af-mcp-rise af-mcp-d1 text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
        An Agent Skill for architecture diagrams
      </h1>
      <p className="af-mcp-rise af-mcp-d2 mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">
        arch-lab publishes its <Code>.alab</Code> grammar as an{" "}
        <a
          href="https://code.claude.com/docs/en/skills"
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-primary hover:underline"
        >
          Agent Skill
        </a>
        , so Claude Code — or any agent that reads skills — can write C4 models,
        sequence diagrams, gantt charts, timelines and lifecycles as text. It is
        markdown in your repository: nothing connects, nothing runs, and there
        is no server in the loop.
      </p>

      <div className="af-mcp-rise af-mcp-d3 mt-6">
        <CopySnippet
          snippet={SKILL_INSTALL}
          caption="bash"
          label={`Install the ${SKILL_NAME} skill`}
        />
      </div>

      <div className="af-mcp-card af-mcp-rise af-mcp-d4 mt-8 rounded-lg border border-border bg-card px-5 py-4">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          What this is for
        </h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Your agent can already write files. What it cannot do is guess a
          grammar — <Code>.alab</Code> has significant indentation and
          order-free attributes, and a model writing it from memory produces
          files that look right and do not parse. This is that grammar, in exact
          detail, sitting where the agent will read it.
        </p>
      </div>

      {/* ---- what lands ------------------------------------------------------ */}
      <Section id="installs" title="What it puts in your repository">
        <P>
          <Code>{SKILL_DESTINATION}</Code> and a <Code>reference/</Code> folder
          beside it — plain markdown you can read, diff and review like any
          other file.
        </P>
        <ul className="mt-4 space-y-3 text-muted-foreground">
          <Bullet>
            <strong className="text-foreground">
              The entry file is short on purpose.
            </strong>{" "}
            It carries what every <Code>.alab</Code> document needs whatever its
            notation, and a table pointing at one grammar file per notation. An
            agent writing a gantt reads the gantt reference and never pays for
            the C4 or sequence grammar, which is the whole reason a skill is
            cheap.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">
              {KINDS_WITH_SYNTAX_SECTIONS.length} notations have a grammar file
            </strong>{" "}
            of their own, plus one on reading the parser&apos;s error messages.
            The remaining notations are taught by a worked example rather than a
            grammar — see the{" "}
            <Link
              href="/demo"
              className="font-medium text-primary hover:underline"
            >
              gallery
            </Link>
            .
          </Bullet>
          <Bullet>
            <strong className="text-foreground">
              It is generated, not written.
            </strong>{" "}
            Every file comes from the same syntax reference this site serves at{" "}
            <Link
              href="/syntax"
              className="font-medium text-primary hover:underline"
            >
              /syntax
            </Link>
            , and every example in it is checked against the real parser on
            every build. A skill that taught a grammar the parser had moved on
            from would be worse than no skill.
          </Bullet>
        </ul>
      </Section>

      {/* ---- the second command ---------------------------------------------- */}
      <Section id="install" title="Installing it without the CLI">
        {/* OFFERED RATHER THAN HIDDEN. The skills CLI reports installs to its
            own telemetry endpoint by default and links the skill into every
            agent directory it recognises; both are reasonable defaults and
            neither is something to hand a reader with no way out. */}
        <P>
          The command above uses the{" "}
          <a
            href="https://github.com/vercel-labs/skills"
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-primary hover:underline"
          >
            skills CLI
          </a>
          , which brings a lockfile you can commit and an update command. If you
          would rather copy the directory and nothing else — no CLI, no
          telemetry, no symlinks into other agents&rsquo; folders:
        </P>
        <div className="mt-4">
          <CopySnippet
            snippet={SKILL_INSTALL_ALTERNATIVE}
            caption="bash"
            label="Install it by copying the directory instead"
          />
        </div>
        <P className="mt-4">
          Both land the same files at the same path. The source is{" "}
          <a
            href={`https://github.com/${SKILL_REPO}`}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-primary hover:underline"
          >
            {SKILL_REPO}
          </a>
          , and there is no publish step between the repository and either
          command.
        </P>
      </Section>

      {/* ---- the boundary ----------------------------------------------------- */}
      <Section id="limits" title="What a skill cannot do">
        {/* THE HONEST BOUNDARY, and it is the reason this page exists rather
            than the reason not to have it: someone who thinks a skill replaces
            the server will trust an invalid file because "the skill said so",
            which is a worse outcome than not offering the skill at all. */}
        <P>
          It carries the grammar. It cannot carry the verdict — a file in your
          repository has no way to tell you whether the model your agent just
          wrote actually parses.
        </P>
        <ul className="mt-4 space-y-3 text-muted-foreground">
          <Bullet>
            <strong className="text-foreground">
              For a verdict, paste it into{" "}
              <Link
                href="/validate"
                className="font-medium text-primary hover:underline"
              >
                the validator
              </Link>
            </strong>{" "}
            — the real parser, running in your browser, reporting the line and
            column of anything wrong.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">
              Or let the agent ask for it, over{" "}
              <Link
                href="/mcp"
                className="font-medium text-primary hover:underline"
              >
                MCP
              </Link>
            </strong>{" "}
            — the same parser as a tool call, so the agent checks its own work
            before handing it to you. The two are not exclusive: plenty of
            people install the skill for everyday writing and connect the server
            for the check at the end.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">
              Nothing here reaches your files.
            </strong>{" "}
            The skill is text your agent reads. Whatever it then writes, it
            writes with its own editing tools, under your review.
          </Bullet>
        </ul>
      </Section>
    </div>
  );
}
