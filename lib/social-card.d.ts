/**
 * Types for social-card.mjs.
 *
 * The module is plain JavaScript so a page with no build step can import it
 * directly; this file exists so editors and `tsc` still understand it. Same
 * split as lib/scroll-math.mjs and its .d.ts, for the same reason.
 */

export type Card = {
  title: string | null;
  description: string | null;
  type: string;
  url: string | null;
  /** Absolute, or null when there is no site url to resolve against. */
  image: string | null;
  twitterCard: "summary" | "summary_large_image";
};

/** What a link preview says about a page, decided once for every template. */
export declare function cardFields(input?: {
  story?: { title?: string; description?: string } | null;
  siteUrl?: string | null;
  cardPath?: string | null;
}): Card;
