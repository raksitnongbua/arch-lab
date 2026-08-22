import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";
import { FAQ_ENTRIES, FAQ_TOPICS } from "@/features/marketing/faq";
import { publicOrigin } from "@/features/mcp/lib/origin";
import { APP_NAME } from "@/lib/constants";

/**
 * `/faq` — the questions somebody asks before they decide, answered in one
 * server-rendered page.
 *
 * The content, and the reasoning for having this page at all, live in
 * `features/marketing/faq.ts`. This file is the presentation and the markup.
 *
 * THE TITLE NAMES THE CATEGORY, not the product, for the same reason `/mcp`'s
 * does: "FAQ" alone identifies the page only to a reader who is already on the
 * site, and neither a search result nor an assistant's answer has that reader.
 *
 * NO SEARCH BOX, which the checklist this page was audited against asks for.
 * Two reasons, and the second is the binding one: the questions sit behind a
 * contents list and there are well under twenty of them, which is not a volume
 * that needs querying — and a search box is a client component, while this is
 * the most citable page on the site and AI crawlers do not run JavaScript.
 * Trading server-rendered answers for a filter over a list this short would be
 * the wrong way round. If this grows past a screenful per topic, the answer is
 * more topics, not a search box. (Deliberately not a COUNT: the number was
 * written as "thirteen" and was three out of date before anyone noticed.)
 */
export const metadata: Metadata = {
  title: "FAQ — diagrams as text, share links and MCP",
  description:
    "Answers about arch-lab: how text diagrams compare to Mermaid, what it exports, whether anything is uploaded, and what an AI agent can do over MCP.",
  alternates: { canonical: "/faq" },
};

/**
 * `FAQPage`, serialised from the SAME entries the page renders — the derivation
 * rule `check:seo` enforces elsewhere, applied here because a hand-written copy
 * of every answer is one chance per answer to tell a reader one thing and a
 * machine another.
 *
 * ON THE TYPE ITSELF, since `/` and `/mcp` are pinned AGAINST using it and a
 * reader arriving from those files deserves the distinction. The rule there is
 * that `FAQPage` is misapplied — a landing page and a connect guide are not
 * FAQs, and marking them up as one was a claim about the content that the
 * content did not support. This page IS an FAQ, so the type is accurate.
 *
 * What it will NOT do is produce a rich result. Google restricted FAQ rich
 * snippets to well-known government and health sites in 2023, and this is
 * neither; nobody should add a question here expecting stars in a SERP. It
 * earns its place as machine-readable question/answer pairs for the consumers
 * that do still read it — assistants and non-Google engines — which is the same
 * audience `/llms.txt` is written for.
 *
 * Serialized inline: every string here comes from a module this repo owns, and
 * `JSON.stringify` escapes what it should.
 */
function faqJsonLd(): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: `${publicOrigin()}/faq`,
    mainEntity: FAQ_ENTRIES.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  });
}

export default function FaqPage(): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqJsonLd() }}
      />

      <header className="max-w-2xl">
        <p className="flex items-center gap-2 font-mono text-xs tracking-wide text-muted-foreground uppercase">
          <span className="grid size-8 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
            <MessageCircleQuestion aria-hidden="true" className="size-4" />
          </span>
          FAQ
        </p>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          Questions about {APP_NAME}
        </h1>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          What the format is, how it compares to what you already use, what
          leaves your browser, and what an AI agent is allowed to do. If the
          answer you need is not here, the last section says where to ask.
        </p>
      </header>

      {/* The contents list. It is a real navigation landmark rather than a row
          of styled links, because on a phone it is the only way to reach the
          fifth topic without scrolling past four. */}
      <nav
        aria-labelledby="contents-heading"
        className="mt-10 border-y border-border/60 py-5"
      >
        <h2
          id="contents-heading"
          className="font-mono text-xs tracking-wide text-muted-foreground uppercase"
        >
          Contents
        </h2>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {FAQ_TOPICS.map((topic) => (
            <li key={topic.id}>
              <Link
                href={`#${topic.id}`}
                className="text-sm font-medium text-primary hover:underline"
              >
                {topic.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-14 flex flex-col gap-14">
        {FAQ_TOPICS.map((topic) => (
          <section
            key={topic.id}
            id={topic.id}
            aria-labelledby={`${topic.id}-heading`}
            /* Offsets the sticky header, so following a contents link does not
               park the heading underneath it. */
            className="scroll-mt-24"
          >
            <h2
              id={`${topic.id}-heading`}
              className="text-2xl font-semibold tracking-tight text-foreground"
            >
              {topic.title}
            </h2>

            {/* A definition list, which is what a question and its answer
                actually are — and it gives a screen reader the pairing for
                free, where a run of headings and paragraphs would not. */}
            <dl className="mt-7 flex flex-col gap-8 border-t border-border/60 pt-7">
              {topic.entries.map((entry) => (
                <div
                  key={entry.question}
                  className="grid gap-2 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-10"
                >
                  <dt className="text-base font-medium text-balance text-foreground">
                    {entry.question}
                  </dt>
                  <dd className="max-w-2xl leading-relaxed text-pretty text-muted-foreground">
                    {entry.answer}
                    {entry.links === undefined ? null : (
                      <span className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                        {entry.links.map((link) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            className="text-sm font-medium text-primary hover:underline"
                          >
                            {link.label}
                          </Link>
                        ))}
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      {/* The checklist item this page would otherwise fail: a reader whose
          question is not answered above needs somewhere to go, and it has to be
          somewhere that actually reaches somebody. There is no support inbox
          and inventing one would be worse than saying so — GitHub issues is
          where this project is really read. */}
      <section
        aria-labelledby="ask-heading"
        className="mt-16 scroll-mt-24 border-t border-border/60 pt-10"
        id="still-asking"
      >
        <h2
          id="ask-heading"
          className="text-2xl font-semibold tracking-tight text-foreground"
        >
          Still asking?
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          Open an issue on GitHub — that is where this project is actually read,
          and a question there tends to become either a fix or a new answer on
          this page. If your question is about the grammar, the{" "}
          <Link
            href="/syntax"
            className="font-medium text-primary hover:underline"
          >
            syntax reference
          </Link>{" "}
          is more precise than anything here, and{" "}
          <Link
            href="/validate"
            className="font-medium text-primary hover:underline"
          >
            the validator
          </Link>{" "}
          will answer it against the real parser in one paste.
        </p>

        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <Link href="/view?d=seq" className={buttonClasses({ size: "md" })}>
            Open a live diagram
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            href="https://github.com/raksitnongbua/arch-lab/issues"
            className={buttonClasses({ variant: "outline", size: "md" })}
          >
            Ask on GitHub
          </Link>
        </div>
      </section>
    </div>
  );
}
