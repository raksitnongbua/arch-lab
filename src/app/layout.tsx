import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import { Providers } from "@/app/providers";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Toaster } from "@/components/ui/toast";
import { publicOrigin } from "@/features/mcp/lib/origin";
import {
  SHARE_FORWARD_ATTRIBUTE,
  SHARE_PARAM_MODEL,
} from "@/features/viewer/share/codec";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";
import { THEME_DEFAULT_SCRIPT } from "@/lib/theme-default";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/* THE TITLE HAS ~60 CHARACTERS BEFORE A RESULT TRUNCATES IT, and it used to
   spend them on "beautiful C4 and sequence diagram editor" — an enumeration of
   TWO while six notations shipped. A reader who arrived for a flowchart, a use
   case, an ER diagram or a data dictionary read a title saying this site does
   not draw one. `APP_DESCRIPTION` gave its own enumeration up for exactly this
   reason (see the note there); the title was the last budgeted surface still
   counting, and it was counting to two.

   SO THE LIST WENT AND THE PROMISE TOOK ITS PLACE. "architecture diagrams"
   covers all six without naming any, and the space it buys goes to what the
   project is actually sold on (`.claude/rules/purpose.md`: presentation is the
   product) — the same claim the home page's H1 makes ("Architecture diagrams
   you can present"), and the reason the playground route is called `/live`.

   NO ADJECTIVE, AND THAT IS A CHOICE WITH A COST. The slot held "beautiful",
   which was not a matter of taste: "beautiful C4 diagram" is a phrase people
   type, it is in `keywords` below for that reason, and an adjective is the
   usual way a title earns a click against twenty results describing the same
   category. What replaced it is a claim rather than a boast — "built to be
   presented" says what the product is FOR, which no competitor's title says
   and which a reader can check against the page in one scroll. The quality
   claim did not disappear from the site; it moved to the surfaces with room
   to back it up, the hero copy and the notation cards.

   THE NAMES ARE STILL SOMEWHERE WITH ROOM — the home page's notation cards, the
   JSON-LD `featureList` derived from them, `/llms.txt`, and `/live`'s own
   description, which names all six because that is the route ranking for them.

   IT NO LONGER BRANCHES ON `CANVAS_EDIT_ENABLED`. That branch existed because
   "editor" is a claim about a canvas you can move things on, so the word had to
   disappear with the flag. The title makes no editing claim now, leaving the
   flag nothing to gate here; the editing claim lives on the home page and on
   `/live`, both of which do read it.

   Measured at 54 characters. Measure any replacement before shipping it. */
const DEFAULT_TITLE = `${APP_NAME} — architecture diagrams built to be presented`;

export const metadata: Metadata = {
  // The same resolution order share links use (env override → Vercel
  // production host → the committed fallback), so pointing the app at a
  // custom domain fixes canonicals, OG urls, and the sitemap in one place
  // instead of leaving a second constant to go stale.
  metadataBase: new URL(publicOrigin()),
  title: {
    default: DEFAULT_TITLE,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  /*
   * The phrases people actually type — including the spaced "arch lab", which
   * the hyphenated name alone would never match.
   *
   * A CAVEAT worth keeping honest: Google has ignored `<meta name="keywords">`
   * since 2009, so nothing in this array ranks anything by itself. It is kept
   * because some non-Google engines and internal site searches still read it,
   * and because writing the list is how the vocabulary gets agreed. The words
   * that actually rank are the ones in the title, the description and the H1 —
   * which is why "beautiful" and "zoomable" were added THERE too
   * (APP_DESCRIPTION, and the hero copy in app/page.tsx) rather than only here.
   */
  keywords: [
    "arch lab",
    "arch-lab",
    "C4 model",
    "C4 diagram",
    "C4 architecture diagram",
    // The two qualities people search for once they know the category exists:
    // they are not looking for "a C4 tool", they are looking for one whose
    // output is presentable and explorable.
    "beautiful C4 diagram",
    "zoomable C4 diagram",
    "interactive C4 diagram",
    "C4 diagram you can zoom",
    "drill-down C4 diagram",
    "presentation-ready architecture diagram",
    // Added with the title's own move to presentation: the phrases that match
    // what the title now promises, so the vocabulary here and the field that
    // ranks say the same thing.
    "live architecture diagram",
    "present architecture diagrams",
    "architecture diagram as code",
    "diagram as code",
    "software architecture diagram",
    ".alab",
    "C4 editor",
    "C4 diagram viewer",
    "local-first",
  ],
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  category: "developer tools",
  // og:image and twitter:image come from the file convention
  // (`opengraph-image.tsx` beside this layout), so neither block names an
  // image here — only the card shape and the text that travels with it.
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: DEFAULT_TITLE,
    description: APP_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  /* TWO VALUES, keyed the same way the default theme now is. This was a single
     "#000000", and the comment defending it said the app has one default theme
     regardless of the OS preference — true then, wrong the moment
     `lib/theme-default.ts` started resolving that default from
     `prefers-color-scheme`. A light-preference reader would have got the light
     page it now gives them, wrapped in black browser chrome.

     THE COLOURS ARE THE TWO GROUNDS, converted by hand from the palettes the
     default resolves to: `:root`'s `oklch(0.985 0.002 250)` is #f2f4f7, and
     `.contrast`'s `oklch(0.05 0 0)` is exactly #000000 — it falls below the sRGB
     transfer function's linear segment. Pure black reads as a deliberate choice
     on a phone rather than as a missing value, which is the risk with #000 here.

     WHAT THIS STILL CANNOT KNOW is a stored choice. A reader who picked `paper`
     on a dark machine gets black chrome around a cream page, because a static
     viewport export cannot read localStorage. That was true of the single value
     too, for every reader whose theme was not the default; keying off the media
     query makes it right for the one group it can be right for — everybody who
     has not touched the picker. */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

/**
 * Built from the codec's own constant so the param name stays defined once, and
 * wrapped in try/catch because a thrown pre-paint script would abort the rest of
 * the parse — a flag is never worth a blank page.
 */
const SHARE_FLAG_SCRIPT =
  `try{var h=location.hash.slice(1);` +
  `if(h&&new URLSearchParams(h).has(${JSON.stringify(SHARE_PARAM_MODEL)}))` +
  `document.documentElement.setAttribute(${JSON.stringify(SHARE_FORWARD_ATTRIBUTE)},"")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes stamps the theme class onto <html>
    // from a pre-paint inline script, so the server and client markup for this
    // one element legitimately differ. Required, not a workaround.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        {/* PRE-PAINT SHARE FLAG. Stamps `data-share-forward` on <html> when the
            URL carries a share payload, so the playground can hide its seeded
            example — via CSS rules in globals.css — until the decoded document
            replaces it, instead of flashing an example the visitor would take
            for what they were sent.

            IT LIVES HERE, in the root layout, and that is the whole point. It
            used to sit inside `/live/page.tsx`, where React 19 logged
            "Encountered a script tag while rendering React component" on every
            client navigation to the route: a client render inserts the tag
            without executing it, so the warning was correct and the script was
            dead weight on that path. The root layout is rendered once, on the
            server, and never re-rendered by client navigation — so the tag only
            ever appears in parsed HTML, where an inline script does run.

            That is also the only path that needs it. The pre-paint window
            exists on a FRESH DOCUMENT LOAD, which is exactly how a pasted share
            link arrives; a client navigation has already painted, and the
            playground's own hashchange subscription handles it there.

            Site-wide rather than route-scoped is deliberate: the flag states a
            fact about the URL, not about a route, and nothing reads it unless it
            opts in. Same technique and same reason as the next-themes script
            above it.

            WHY `next/script` AND NOT A BARE `<script>`. Moving the tag up here
            was not enough. React 19 warns "Encountered a script tag while
            rendering React component" for ANY script element it renders on the
            client, and the root layout does get re-rendered client-side — a
            Fast Refresh in dev is enough, and the warning fired on
            `/live/sequence` with no share link in sight. The warning is also
            correct: a client-rendered script tag is inserted and never
            executed, so on that path the tag was pure noise.
            `strategy="beforeInteractive"` is the sanctioned way to say what
            this needs — Next injects the source into the initial HTML, where
            it runs before hydration, and renders nothing into the React tree
            at all. `beforeInteractive` is only legal in the root layout, which
            is a second reason the tag lives here. */}
        <Script
          id="share-forward-flag"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: SHARE_FLAG_SCRIPT }}
        />
        {/* THE DEFAULT THEME, resolved from the reader's system preference
            before anything paints. It has to run before next-themes' own
            blocking script — which is inside `<Providers>`, in the body — and
            `beforeInteractive` puts it in <head>, which is what guarantees the
            order. The whole argument, including what it deliberately does NOT
            do, is in `lib/theme-default.ts`. */}
        <Script
          id="theme-default"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_DEFAULT_SCRIPT }}
        />
        <Providers>
          {/* ONE Toaster, for the whole app. It lived in `editor-shell.tsx`,
              which meant `toast()` was a silent no-op on every route except
              /editor — the store emitted and nothing rendered it. That is not
              a missing feature but a broken one: the export path reported both
              success and failure through it and neither ever appeared. The API
              is global (`toast()` is callable from any handler), so its
              renderer belongs at the root rather than inside one feature. */}
          <Toaster />
          <a
            href="#main"
            className="sr-only rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:ring-2 focus:ring-ring"
          >
            Skip to content
          </a>
          <Header />
          <main id="main" className="flex flex-1 flex-col">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
