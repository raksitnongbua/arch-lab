import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import { Providers } from "@/app/providers";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { publicOrigin } from "@/features/mcp/lib/origin";
import {
  SHARE_FORWARD_ATTRIBUTE,
  SHARE_PARAM_MODEL,
} from "@/features/viewer/share/codec";
import { SOURCE_FOLD_SCRIPT } from "@/features/playground/lib/source-fold";
import { APP_DESCRIPTION, APP_NAME, EDITOR_ENABLED } from "@/lib/constants";

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

const DEFAULT_TITLE = EDITOR_ENABLED
  ? `${APP_NAME} — C4 and sequence diagram editor`
  : `${APP_NAME} — C4 and sequence diagrams as text`;

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
  // The phrases people actually type — including the spaced "arch lab",
  // which the hyphenated name alone would never match.
  keywords: [
    "arch lab",
    "arch-lab",
    "C4 model",
    "C4 diagram",
    "C4 architecture diagram",
    "architecture diagram as code",
    "diagram as code",
    "software architecture diagram",
    ".alab",
    "C4 editor",
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
  // Single value on purpose: the app is dark by default regardless of the OS
  // preference (enableSystem={false}), so keying this off prefers-color-scheme
  // would paint light browser chrome around a dark page. sRGB approximation of
  // the dark `--background` token.
  themeColor: "#1b1b23",
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
            used to sit inside `/view/page.tsx`, where React 19 logged
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
            `/view/sequence` with no share link in sight. The warning is also
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
        {/* Kept apart from the share flag rather than merged into one tag:
            they answer to different features and fail independently, and a
            single try/catch around both would let a change to one silently
            take the other down with it. Both are two lines and neither
            fetches anything. */}
        <Script
          id="source-fold-state"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: SOURCE_FOLD_SCRIPT }}
        />
        <Providers>
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
