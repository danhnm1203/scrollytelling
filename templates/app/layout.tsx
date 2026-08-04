import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { story } from "@/components/story";

import "./globals.css";

// Self-hosted by next/font, so the page makes no network request for it.
const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: story.title,
  description: story.description,
  openGraph: {
    title: story.title,
    description: story.description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} tracking-tight`}>{children}</body>
    </html>
  );
}
