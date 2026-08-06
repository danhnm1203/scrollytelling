/**
 * Types for story.js.
 *
 * The story itself is plain JavaScript so a page with no build step can import
 * it. This file is what keeps your editor honest about it — a mistyped `align`
 * or a missing `body` is still a red squiggle, and still fails `next build`.
 */

export type Align = "left" | "center" | "right";
export type Anchor = "middle" | "bottom";

export type Beat = {
  /** Scroll position, 0 to 1, where this beat is fully readable. */
  at: number;
  align: Align;
  /** "bottom" puts the copy under the subject instead of across it. */
  anchor?: Anchor;
  heading: string;
  body: string;
};

export type Story = {
  brand: string;
  title: string;
  description: string;
  sections: Beat[];
};

export declare const story: Story;
