import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { SEQUENCES, framePath } from "@/components/frames";
import { story } from "@/components/story";

import "./globals.css";
import "@/lib/scroll-engine.css";

// Self-hosted by next/font, so the page makes no network request for it.
const inter = Inter({ subsets: ["latin"], display: "swap" });

// The opening frame doubles as the link preview image, so sharing the page
// shows the footage rather than a blank card.
const poster = SEQUENCES[0] ? framePath(SEQUENCES[0].id, 0) : undefined;

export const metadata: Metadata = {
  // Set this to your deployed origin so the preview image resolves absolutely.
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: story.title,
  description: story.description,
  openGraph: {
    title: story.title,
    description: story.description,
    type: "website",
    images: poster ? [{ url: poster }] : undefined,
  },
  twitter: {
    card: poster ? "summary_large_image" : "summary",
    title: story.title,
    description: story.description,
    images: poster ? [poster] : undefined,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} tracking-tight`}>{children}</body>
    </html>
  );
}
