import type { Metadata } from "next";
import { Inter } from "next/font/google";

import * as frames from "@/components/frames";
import { story } from "@/components/story";
import { cardFields } from "@/lib/social-card";

import "./globals.css";
import "@/lib/scroll-engine.css";

// Self-hosted by next/font, so the page makes no network request for it.
const inter = Inter({ subsets: ["latin"], display: "swap" });

// What the card contains comes from lib/social-card.mjs, which every template
// reads. This is Next's way of putting it in a head — the mechanism, not the
// answer. Four mechanisms is right; four answers would drift, and the drift is
// invisible because every page still renders.
//
// It points at og.jpg rather than at the opening frame. The frames are webp
// because this page decodes them and this page is a browser; a link unfurler is
// somebody else's code, and webp support across that set is unverified. `frames`
// writes a jpeg card for exactly this.
//
// SITE_URL first, then the environment. SITE_URL is what `frames --site-url`
// recorded, so it is the same answer the other three templates get; the env var
// stays as the way to set it for a `next build` that has not been given one.
const siteUrl = frames.SITE_URL ?? process.env.SITE_URL ?? null;
const card = cardFields({ story, siteUrl });

// `frames.SITE_URL` was validated by the CLI. `process.env.SITE_URL` was not,
// and `new URL()` on a typo would throw at module load — killing `next build`
// over a link preview, which is the trade lib/social-card.mjs exists to refuse.
function baseOrLocalhost(value: string | null): URL {
  const fallback = new URL("http://localhost:3000");
  if (!value) return fallback;
  try {
    return new URL(value);
  } catch {
    return fallback;
  }
}

export const metadata: Metadata = {
  // Next resolves any remaining relative url in this file against this. It is
  // separate from the card, which is already absolute or absent.
  metadataBase: baseOrLocalhost(siteUrl),
  title: story.title,
  description: story.description,
  openGraph: {
    title: card.title ?? undefined,
    description: card.description ?? undefined,
    type: "website",
    url: card.url ?? undefined,
    // Omitted rather than empty when there is no site url: an empty og:image is
    // a relative reference that resolves to the page itself, so a strict
    // crawler fetches the HTML and calls that the preview image.
    images: card.image ? [{ url: card.image }] : undefined,
  },
  twitter: {
    card: card.twitterCard,
    title: card.title ?? undefined,
    description: card.description ?? undefined,
    images: card.image ? [card.image] : undefined,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} tracking-tight`}>{children}</body>
    </html>
  );
}
