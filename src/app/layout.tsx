import type { Metadata } from "next";
import { TopNav } from "@/components/top-nav";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

/**
 * One description, used for the meta tag and the link preview alike, so the
 * two can't drift into saying different things about what the site is.
 *
 * It matches the landing page's framing: a jobs board, both sides vetted, free
 * on both sides. No metro in it — the old "regional, local-first" wording
 * outlived the Richmond-only positioning and was still being served to search
 * results and every shared link.
 */
const DESCRIPTION =
  "A curated jobs board for freelance video and production crew — and the companies, " +
  "agencies and producers who hire them. Free to post, free to apply.";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://productioncircles.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Production Circles",
  description: DESCRIPTION,
  // Without an explicit openGraph block Next emits no og:* tags at all, and
  // each crawler guesses differently. Spelling it out is what makes the
  // description above actually the one that shows in a shared link.
  openGraph: {
    type: "website",
    siteName: "Production Circles",
    title: "Production Circles",
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: "summary",
    title: "Production Circles",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TopNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
