import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/app/providers";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants";

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

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — C4 architecture editor`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
};

export const viewport: Viewport = {
  // Single value on purpose: the app is dark by default regardless of the OS
  // preference (enableSystem={false}), so keying this off prefers-color-scheme
  // would paint light browser chrome around a dark page. sRGB approximation of
  // the dark `--background` token.
  themeColor: "#1b1b23",
};

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
