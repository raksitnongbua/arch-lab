import {
  ArrowRight,
  Bot,
  FileText,
  GitBranch,
  Layers,
  MessagesSquare,
  MousePointerClick,
  Table2,
  Users,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { DotGrid } from "@/features/marketing/dot-grid";
import { DotGridStudioGate } from "@/features/marketing/dot-grid-studio-gate";
import { HeroDiagram } from "@/features/marketing/hero-diagram";
import { LiveDiagramMark } from "@/features/marketing/live-diagram-mark";
import { McpFlow } from "@/features/marketing/mcp-flow";
import {
  CONNECT_RECIPES,
  MCP_STATUS_LABEL,
  MCP_TOOLS,
  mcpEndpointUrl,
} from "@/features/mcp/catalog";
import { CopySnippet } from "@/features/mcp/components/copy-snippet";
import { publicOrigin } from "@/features/mcp/lib/origin";
import { APP_DESCRIPTION, APP_NAME, EDITOR_ENABLED } from "@/lib/constants";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * THE LANDING PAGE, rewritten for someone who has never heard of this.
 *
 * It used to be five long sections — a four-card grid of diagram kinds (two of
 * them "coming soon"), the four C4 altitudes, the four constructs of a
 * sequence document with their literal syntax tokens, and six principles. All
 * of it accurate, and most of it REFERENCE: the C4 levels are taught by the
 * demo, the sequence grammar by `/syntax`, and a visitor who does not yet know
 * what the site is cannot use either. A first-time reader had to scroll past
 * roughly four screens of it before anything said "click here to see one".
 *
 * So the page now answers three questions in order, and stops:
 *
 *   1. WHAT IS THIS — one sentence, then a button that puts a real diagram on
 *      screen. The primary CTA goes to `/view/sequence` rather than `/view`
 *      deliberately: the chooser asks a question ("C4 or sequence?") that a
 *      newcomer has no basis to answer, while the sequence playground opens
 *      seeded with a working flow they can click immediately.
 *   2. WHAT IT DRAWS and WHO CAN WRITE IT — the four notations, one link
 *      each into the playground, then the MCP server that lets an agent author
 *      any of them. Both sections end in a link that does the thing.
 *
 *      This used to be a PRESENTATION section instead of the notations one: a
 *      half-page animated sequence preview with three gesture rows (click,
 *      double-click, immersive). It went because the argument was already made
 *      twice above it — the headline says "present" and the hero animates four
 *      real diagrams, one of them drilling — while the page never once said in
 *      prose which kinds it draws. Presentation is still the product's selling
 *      point; it is just not something this page has to argue three times.
 *   3. WHAT DO I DO WITH IT — three steps, then the format and the footer.
 *
 * WHAT WAS CUT, so nobody restores it by reflex: the "coming soon" cards for
 * the data dictionary and network diagrams (a newcomer cannot act on a
 * roadmap, and two dashed cards were a third of the fold), the C4 levels
 * grid, the sequence-constructs grid, and three of the six principles. The
 * roadmap is not published here, which is where a roadmap
 * belongs.
 */

/* -------------------------------------------------------------------------- */
/* Content                                                                     */
/* -------------------------------------------------------------------------- */

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

/**
 * The three steps, in the order they actually happen. Written for someone who
 * has not yet decided this is for them, so each one names a thing they do,
 * not a feature the product has.
 */
const STEPS: readonly Step[] = [
  {
    icon: MousePointerClick,
    title: "Open a playground",
    body: "Nothing to install and no account. A worked example is already on screen — edit the text beside it and the diagram follows as you type.",
  },
  {
    icon: Bot,
    title: "Or let your agent write it",
    body: "Point Claude Code, Cursor or any MCP client at the server. It gets the grammar and the real parser's verdict, so what it hands you is valid before you open it.",
  },
  {
    icon: GitBranch,
    title: "Commit the text",
    body: "The diagram is one .alab file — stable ids, one line per element. It sits next to the code it describes and a reviewer sees what changed in the architecture.",
  },
];

/**
 * The five notations, in the order the docs and the playground list them.
 *
 * A FOUR-CARD GRID OF DIAGRAM KINDS USED TO BE THE FIRST THING ON THIS PAGE
 * and was deliberately cut — read the note above before restoring it by
 * reflex, because the reason it was cut no longer holds and that matters. It
 * was cut because two of the four were "coming soon": a newcomer cannot act on
 * a roadmap, and two dashed placeholder cards were a third of the fold. All
 * five are now shipped, in real use, and each one opens in the playground from
 * here. A card that opens a working diagram is not the card that got cut.
 *
 * It is also the page's answer to a question no other section asks for it. A
 * reader arriving from a search for "sequence diagram as text" or an assistant
 * asked "does arch-lab do ER diagrams" needs the kinds NAMED, in prose, on the
 * page that ranks — and until this existed the only place that said "flowchart"
 * was a menu item inside the playground, which neither a crawler nor a model
 * summarising the site will ever see. The `body` lines carry the notation's own
 * vocabulary (lifelines, guards, «include») for the same reason: those are the
 * words somebody searches with.
 *
 * `href` seeds the ONE playground rather than pointing at five routes. The
 * `?d=` values are the short aliases `playground/lib/seed.ts` accepts.
 */
const KINDS: readonly {
  icon: LucideIcon;
  name: string;
  /* What this kind is called in a LIST of capabilities, which is not its
     heading: the headings are singular ("Sequence diagram") because each one
     labels one card, and appending "diagrams" to those to build the structured
     data produced "Sequence diagram diagrams" — caught by reading the served
     JSON-LD rather than the source. Two spellings of one name, in one table, is
     still one place to change. */
  feature: string;
  body: string;
  href: string;
}[] = [
  {
    icon: Layers,
    name: "C4 model",
    feature: "C4 models",
    body: "Context, container and component levels in one file — zoom in and drill from a box into what it contains.",
    href: "/view?d=c4",
  },
  {
    icon: MessagesSquare,
    name: "Sequence diagram",
    feature: "Sequence diagrams",
    body: "Lifelines, activation, loops and alt fragments — clickable message by message, with the payload beside each one.",
    href: "/view?d=seq",
  },
  {
    icon: Workflow,
    name: "Flowchart",
    feature: "Flowcharts",
    body: "Terminators, guarded decisions, io and call symbols, and loops that hook back — traced end to end as it draws.",
    href: "/view?d=flow",
  },
  {
    icon: Users,
    name: "Use case",
    feature: "Use case diagrams",
    body: "Actors outside a system boundary, associations into it, and «include» or «extend» between cases.",
    href: "/view?d=uc",
  },
  {
    icon: Table2,
    name: "ER diagram",
    feature: "Entity-relationship diagrams",
    body: "Tables with their columns, primary and foreign keys, and crow's-foot cardinality on every relationship.",
    href: "/view?d=er",
  },
];

/** The Claude Code recipe, read from the same catalogue `/mcp` renders, so the
 * command on the landing page cannot drift from the one that works. */
const CLAUDE_CODE_RECIPE = CONNECT_RECIPES.find(
  (recipe) => recipe.client === "Claude Code",
);

/**
 * Structured data for the one page that represents the product. Two nodes:
 * `WebSite` names the site (with the spaced "arch lab" as an alternateName,
 * since that is how people type it into a search box), and
 * `SoftwareApplication` describes what the site IS — free, browser-based, a
 * developer tool. Serialized inline because there are no user-controlled
 * strings here; everything comes from constants this file already owns.
 */
function homeJsonLd(): string {
  const origin = publicOrigin();
  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: APP_NAME,
        alternateName: "arch lab",
        url: origin,
        description: APP_DESCRIPTION,
      },
      {
        "@type": "SoftwareApplication",
        name: APP_NAME,
        url: origin,
        description: APP_DESCRIPTION,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web browser",
        /* DERIVED FROM KINDS, never typed out beside it. This is the machine
           half of the section that names the four notations, and the failure
           mode of a hand-written copy is the worst kind: a fifth kind ships,
           the page shows it, the structured data keeps claiming four, and an
           assistant answering "what can arch-lab draw" reads the stale half. */
        featureList: [
          ...KINDS.map((kind) => kind.feature),
          "Mermaid import and export",
          `MCP server for AI agents (${MCP_TOOLS.length} read-only tools)`,
        ],
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/* The page                                                                    */
/* -------------------------------------------------------------------------- */

export default function Home() {
  const endpoint = mcpEndpointUrl(publicOrigin());

  return (
    /* `isolate` IS LOAD-BEARING, and its absence is why nothing in the backdrop
       below has ever been visible — not the dots, not the line grid, not the
       glows, not the wash.
       The backdrop sits at `-z-10`. Without a stacking context here, the nearest
       one is the ROOT element, and the CSS painting order inside a stacking
       context puts negative-z-index descendants (step 3) BEFORE the backgrounds
       of in-flow descendants (step 4) — and `body` carries `bg-background`, an
       opaque fill. So the whole backdrop was painted and then covered by the
       body's own background on every frame.
       `isolation: isolate` makes this element the stacking context, so `-z-10` is
       resolved inside it: above this element's background, below every section,
       and entirely above `body`. `check:dot-grid` asserts it. */
    <div className="relative isolate flex flex-1 flex-col overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: homeJsonLd() }}
      />
      <Backdrop />

      {/* The dot field's tuning panel, and it costs a visitor nothing: this
          renders null unless the URL carries `?dots`, and the panel itself is a
          dynamic import behind that check. Open http://localhost:3000/?dots — or
          the same on the deployed site — to tune the field, then paste what the
          copy button gives you into `dot-grid-config.ts`. Nothing it changes is
          persisted; it is a way to choose values, not a setting. */}
      <DotGridStudioGate />

      {/* ---------------------------------------------------------------- hero */}
      <section className="mx-auto w-full max-w-6xl px-5 pt-14 pb-12 sm:px-8 sm:pt-20 sm:pb-16">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16">
          <div>
            <Badge variant="accent" className="mb-6">
              <span className="size-1.5 rounded-full bg-accent" />
              Runs in your browser · no account, nothing uploaded
            </Badge>

            {/* The promise is what the diagram DOES, not what it is made of.
                The previous headline ("diagrams that survive code review")
                sold the format to someone who already believed in the format;
                a newcomer's question is "why not draw.io", and the answer is
                the two things below it. */}
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
              Architecture diagrams you can{" "}
              <span className="af-running-gradient bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                present
              </span>
              , and an agent can write.
            </h1>

            {/* A DEFINITION FIRST, then the detail. The lead used to open
                "Describe a system in a few lines of text and arch-lab draws
                it" — which describes an action and never says what the thing
                IS. Both audiences want the same sentence: a newcomer asking
                "what is this", and an assistant asked "what is arch-lab",
                which extracts an "X is a Y that Z" sentence and paraphrases
                anything else. Twelve words buys a claim that can be quoted
                back correctly. */}
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
              <span className="font-mono text-base text-foreground sm:text-lg">
                {APP_NAME}
              </span>{" "}
              is a browser-based editor for architecture diagrams written as
              plain text. Describe a system in a few lines and it draws it — a
              beautiful, zoomable C4 model you can drill into level by level, a
              sequence flow you can click through message by message, a
              flowchart, or a use-case diagram. Your AI agent can write that
              text for you, over MCP.
            </p>

            {/* ONE primary destination, and now ACTUALLY one. The old hero
                offered three buttons and a badge, and a newcomer had to pick
                between "demo", "sequence diagrams" and "editor preview" before
                seeing anything at all. Trimming to two did not finish the job:
                "Build a C4 model" sat beside "Open a live diagram" pointing at
                the SAME playground, asking a reader who has never seen the
                product to choose between reading one and building one — a
                choice they cannot make yet, and the second button was the
                weaker offer besides, since building starts from a blank
                intention while opening starts from a working diagram. The
                playground's own "Sample diagrams" menu is where picking a kind
                belongs, once someone is actually in it. */}
            <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {/* ICON-LED, not word-led. The label is still here for anyone
                  who cannot see the icon — `sr-only` text, which is what gives
                  the link its accessible name — but sighted readers get a
                  play mark that pulses and an arrow that runs, because a
                  button that MOVES says "this does something now" faster than
                  four words say it.

                  The words are not merely deleted, though: the note beside
                  this link ("Opens with a worked example") is the visible
                  explanation, and it is why an icon-only face is affordable
                  here at all. An icon alone next to nothing would be a riddle;
                  `aria-describedby` already tied the two together. */}
              <Link
                href="/view?d=seq"
                aria-describedby="cta-note"
                className={buttonClasses({
                  size: "lg",
                  className: "af-cta-live group gap-2.5",
                })}
              >
                <LiveDiagramMark />
                Open a live diagram
                <ArrowRight
                  aria-hidden="true"
                  className="transition-transform duration-200 group-hover:translate-x-1"
                />
              </Link>
              <p id="cta-note" className="text-sm text-muted-foreground">
                Opens with a worked example — nothing to set up.
              </p>
            </div>
          </div>

          {/* The hero visual, and it is no longer desktop-only. It used to be
              `hidden lg:block`, which meant a phone got a headline, a sentence
              and a button on an empty ground — the one thing the hero is for,
              missing on the viewport most first-time readers arrive with.

              Below `lg` it sits UNDER the copy rather than beside it, which is
              the right order on a narrow screen: the promise and the button stay
              at the top of the fold, and the diagram is what a reader meets on
              the first scroll. `af-hero-fit` shrinks the fixed-size card to fit
              the gutters — see the note on that class in globals.css for why it
              uses `zoom` and not a transform.

              Still `aria-hidden` inside the component, on every viewport: the
              copy above states everything it depicts. */}
          <div className="mt-14 flex justify-center lg:mt-0 lg:block">
            <HeroDiagram className="af-hero-fit" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ what it draws */}
      {/* MINIMAL BY REQUEST, and this is what replaced the section that was
          here: "A diagram you can talk through", a half-page figure with an
          animated sequence preview and three gesture rows. It sold presentation
          well and it sold it TWICE — the hero above already animates four real
          diagrams and the headline already says "present" — so what it actually
          cost was the first screen after the fold, on a page whose own doc
          comment says a newcomer should reach "what do I do with it" fast.

          What the page did NOT have anywhere was the plain sentence "it draws
          these four kinds". That is the thing a search result and an assistant
          summary both need, so the space went to saying it once, in prose, with
          a link per kind. */}
      <section
        aria-labelledby="kinds-heading"
        className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-20"
      >
        <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          Five notations
        </p>
        <h2
          id="kinds-heading"
          className="mt-2 text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl"
        >
          One text format, five kinds of diagram
        </h2>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          The same editor, viewer, share link and export for all of them — and
          Mermaid pastes straight into any of the five.
        </p>

        {/* Three columns at `lg`, not five: five cards across put each one
            under 200px on a 1024px viewport, which clips the two-word names
            and leaves the body text three words to a line. Two rows of a
            readable width beat one row of unreadable ones. */}
        <ul className="mt-9 grid grid-cols-1 gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {KINDS.map((kind) => {
            const Icon = kind.icon;
            return (
              <li key={kind.name}>
                {/* The WHOLE card is the link, so the target is the size of the
                    thing you are looking at rather than three words at the
                    bottom of it. `group` lets the icon answer the hover. */}
                <Link href={kind.href} className="group flex flex-col gap-2.5">
                  <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary/60 text-primary transition-colors group-hover:border-primary/40 group-hover:bg-primary/10">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="flex items-center gap-1.5 text-base font-medium text-foreground">
                    {kind.name}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    {kind.body}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ------------------------------------------------------- agents + MCP */}
      <section
        aria-labelledby="agent-heading"
        className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8 sm:pb-20"
      >
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          {/* `min-w-0` IS LOAD-BEARING, and without it this section overflowed
              the viewport on a phone — the heading, the paragraph and both
              buttons all clipped, not just the snippet.

              The cause is the install command below. A grid item's automatic
              minimum size is its CONTENT's minimum, so the item refused to
              shrink narrower than one unbreakable ~90-character line, the
              single-column track grew to match, and `w-full` on the section
              resolved against something wider than the screen. The
              `overflow-x-auto` inside `CopySnippet` cannot save this: it scrolls
              the line once the block has a width to scroll within, and this item
              never gave it one.
              `/mcp` already knew — every wrapper around a `CopySnippet` over
              there carries `min-w-0` (`mcp-guide.tsx`). This was the one call
              site that did not.

              The `lg:` track above is `minmax(0,1fr)` for the same reason, which
              is why the bug only ever showed below `lg`: the explicit 0 minimum
              did this job on desktop and there was nothing doing it on a phone. */}
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
                <Bot aria-hidden="true" className="size-5" />
              </span>
              <Badge variant="outline">{MCP_STATUS_LABEL}</Badge>
            </div>
            <h2
              id="agent-heading"
              className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              Ask your agent for the diagram
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
              The format is plain text, so an AI agent can write it — and the
              MCP server gives it the two things it cannot guess: the exact
              grammar, and the real parser&apos;s verdict on what it just wrote.{" "}
              {MCP_TOOLS.length} read-only tools, over all {KINDS.length}{" "}
              document kinds. Nothing here can change your files.
            </p>

            {CLAUDE_CODE_RECIPE === undefined ? null : (
              <div className="mt-6">
                <CopySnippet
                  snippet={CLAUDE_CODE_RECIPE.snippet(endpoint)}
                  caption="Claude Code"
                  label="Claude Code install command"
                />
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/mcp" className={buttonClasses({ size: "md" })}>
                Connect your agent
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link
                href="/syntax"
                className={buttonClasses({ variant: "outline", size: "md" })}
              >
                Read the format
              </Link>
            </div>
          </div>

          <McpFlow />
        </div>
      </section>

      {/* ---------------------------------------------------------- three steps */}
      <section
        aria-labelledby="start-heading"
        className="border-t border-border/60 bg-card/30"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-16">
          <h2
            id="start-heading"
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
          >
            How you actually use it
          </h2>
          <ol className="mt-8 grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex flex-col gap-2">
                  <span className="flex items-center gap-2.5">
                    <span className="grid size-8 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {index + 1} of {STEPS.length}
                    </span>
                  </span>
                  <h3 className="text-base font-medium text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              );
            })}
          </ol>

          {/* The format, in one paragraph rather than a principles grid. A
              newcomer needs to know the file is theirs and readable; the six
              design principles that used to sit here answer questions nobody
              has yet asked, and the README answers them properly. */}
          <div className="mt-12 flex flex-col gap-3 border-t border-border/60 pt-8 sm:flex-row sm:items-start sm:gap-8">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-secondary/60 text-primary">
              <FileText aria-hidden="true" className="size-5" />
            </span>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">
                It is your file, and you can read it.
              </span>{" "}
              A model is one{" "}
              <code className="font-mono text-[0.95em] text-foreground">
                .alab
              </code>{" "}
              text file — stable ids, one line per element, deterministic order,
              so a diff shows what changed in the architecture rather than a
              reshuffled blob. JSON is one click away for tools that want it,
              and Mermaid pastes straight in. No account, no server, nothing
              uploaded: git is the collaboration layer.{" "}
              <Link
                href="/demo"
                className="font-medium text-primary hover:underline"
              >
                See finished examples
              </Link>
              {EDITOR_ENABLED ? (
                <>
                  {" · "}
                  <Link
                    href="/editor"
                    className="font-medium text-primary hover:underline"
                  >
                    Try the canvas editor
                  </Link>
                </>
              ) : null}
            </p>
          </div>

          {/* THE SAME OFFER AS THE HERO, at the end of the page. A reader who
              scrolled the whole way is the most convinced reader this page has,
              and until now the last thing they met was a paragraph about file
              format and three text links — so the one action the page is asking
              for was three screens behind them.

              Deliberately the SAME destination and the same words as the hero
              button, not a second, weaker offer. A different CTA down here would
              re-open the choice the hero exists to close; repeating it just
              means the answer is in reach wherever somebody stopped reading.

              The FAQ sits beside it as the outlet for the other kind of reader
              who reaches the bottom: not convinced, and holding a specific
              objection the page never addressed. */}
          <div className="mt-12 flex flex-col items-start gap-3 border-t border-border/60 pt-8 sm:flex-row sm:items-center">
            <Link
              href="/view?d=seq"
              className={buttonClasses({
                size: "lg",
                className: "group gap-2.5",
              })}
            >
              Open a live diagram
              <ArrowRight
                aria-hidden="true"
                className="transition-transform duration-200 group-hover:translate-x-1"
              />
            </Link>
            <p className="text-sm text-muted-foreground">
              Still deciding?{" "}
              <Link
                href="/faq"
                className="font-medium text-primary hover:underline"
              >
                The FAQ
              </Link>{" "}
              answers what leaves your browser, what it exports, and how it
              compares to Mermaid.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The page's ground: a wash, a line grid, a dot field over it, and two still
 * glows. Decorative in full — `aria-hidden`, `pointer-events-none`, `-z-10` —
 * and every layer is a CSS background rather than an element or an image, so the
 * whole thing costs one paint and no requests.
 *
 * NOTHING HERE MOVES ON ITS OWN, which is a narrower claim than the one this
 * comment used to make and the distinction is the whole rule. An animated wire
 * layer lived here and was removed: it moved unprompted, behind a headline,
 * where it either could not be seen at all or would have had to shout to be —
 * and two rounds of raising its opacity to chase visibility was the signal to
 * stop rather than to keep going.
 * The dot field is not that. It is inert until a pointer arrives, it never
 * loops, and its resting frame is exactly what a reader who wants no motion is
 * shown — so it can be quiet enough to sit behind words and still be felt when
 * someone reaches for it. Responding is not competing.
 *
 * Every layer's fade is masked in ABSOLUTE units, never percentages: this
 * element is `inset-0` of the page, which is thousands of pixels tall, so a
 * percentage is measured against a box nobody can see the bottom of.
 */
function Backdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-transparent to-transparent" />
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--canvas-grid) 1px, transparent 1px), linear-gradient(to bottom, var(--canvas-grid) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, black 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 55% at 50% 0%, black 20%, transparent 75%)",
        }}
      />

      {/* THE DOT FIELD. Pitched at exactly half the line grid's 56px, so every
          dot lands either on a grid intersection or on the midpoint of a line
          and the two patterns read as one surface — at an unrelated pitch they
          beat against each other and the backdrop looks like a rendering fault.

          IT REACTS TO THE POINTER, which is the one exception to "nothing here
          moves" above, and it earns the exception the way the hero card does: it
          responds rather than performs. Nothing happens until a hand arrives,
          nothing loops, and the resting frame is the same field of dots a reader
          who wants no motion gets. That is the opposite of the wire layer that
          was removed — that one moved on its own, unprompted, behind words.

          PAINTED IN `--node-border`, and the first two attempts at this are
          worth recording because both were invisible and both measured "fine"
          against the wrong reference. `--canvas-grid` — what the lines above use
          — tops out at 1.16:1 on the dark ground, since the ground moved up to
          meet it. `--border` tops out at 1.63:1 and was running at half, so
          1.32:1. Neither can be seen, and the reason the numbers looked
          acceptable is that they were compared to the LINE GRID, which measures
          1.08:1 and cannot be seen either. A reference has to be something you
          can actually point at.
          `--node-border` measures 1.98:1 composited on the dark ground and
          1.86:1 on the light one. Quiet, and present. THE LESSON, since this is
          the third time in this file's history: ink is area × contrast, and a
          dot at a 28px pitch has almost no area — 0.90% of its cell — so it
          needs contrast a line never would.

          `fixed`, NOT `absolute`, and that is the difference between the navbar
          being part of the page and being a black bar on top of it. The header is
          in normal flow, so the page — and anything positioned inside it — begins
          BELOW the header: an absolute layer here started at y=64 and the row
          above it had nothing in it to see. Sampling a screenshot of that state
          found 25,800 non-black pixels immediately below the header and exactly
          zero inside it.
          Fixed positioning resolves against the viewport instead, so this one
          layer starts at y=0 and runs behind the header, which the header's own
          fading ground then reveals. It is not clipped by the page root's
          `overflow-hidden` (a fixed element's containing block is the viewport,
          so an ancestor's overflow does not apply) and `isolation: isolate` does
          not capture it either — only transform, filter and friends do that.
          WHAT IT COSTS: the field no longer scrolls away, so it reads as a
          permanent texture at the top of the viewport rather than as hero
          decoration. That is the right trade with a STICKY header — the two stay
          together at every scroll position, which is the whole point — and the
          fade below keeps it out of the way of everything else.

          BOUNDED IN PIXELS, both the height and the fade, so the layer builds one
          viewport of dots rather than one per lattice point of a page thousands
          of pixels tall — each of which would be a `ctx.fill()` every frame. */}
      <div
        className="fixed inset-x-0 top-0 h-[820px] opacity-[0.65] dark:opacity-[0.35]"
        style={{
          /* A VERTICAL FADE, not the ellipse this started as, and the reason is
             that an ellipse made the measured contrast a lie. `check:dot-grid`
             asserts what a dot measures against its ground; an elliptical mask
             then multiplies that by an alpha which falls off in TWO axes, so at
             the left margin — 750px off centre — the real figure was a fifth of
             the asserted one. A number you cannot trust at the edges is worse
             than no number.
             Fading only downward keeps every dot in the band at full strength, so
             the asserted contrast is the contrast on screen. The band ends at
             700px rather than the 760 it had while this layer scrolled: a fixed
             field is on screen at every scroll position, so it has to be out of
             the way by mid-viewport instead of merely by the end of the hero. */
          maskImage:
            "linear-gradient(to bottom, black 0px, black 380px, transparent 700px)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 0px, black 380px, transparent 700px)",
        }}
      >
        <DotGrid className="h-full w-full" />
      </div>

      <div className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-accent/10 blur-[120px]" />
      <div className="absolute -top-24 -left-32 size-[26rem] rounded-full bg-primary/10 blur-[120px]" />
    </div>
  );
}
