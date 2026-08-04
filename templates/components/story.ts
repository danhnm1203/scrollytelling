/**
 * The only file you need to edit to change what this page says.
 *
 * Each beat declares `at` — the scroll position, 0 to 1, where it should be
 * clearest. Its fade in and out are derived from where its neighbours sit, so
 * adding, moving or removing a beat means editing this list and nothing else.
 *
 * Place beats against what the footage is actually doing, not round numbers.
 * `open-scrollytelling frames --check <this project>` reads this file and tells
 * you which beats will be hard to read against the frames behind them.
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

export const story: Story = {
  brand: "ORBIT",
  title: "Orbit — every part accounted for",
  description:
    "A scroll-driven look at how Orbit comes apart, and how precisely it goes back together.",
  sections: [
    {
      at: 0.0,
      align: "center",
      heading: "Orbit",
      body: "Scroll to take it apart.",
    },
    {
      at: 0.3,
      align: "left",
      heading: "Nothing wasted",
      body: "Every component earns the space it occupies.",
    },
    {
      at: 0.6,
      align: "right",
      heading: "Built to be understood",
      body: "The structure is the design, not something hidden behind it.",
    },
    {
      at: 0.92,
      align: "center",
      anchor: "bottom",
      heading: "Back together",
      body: "Assembled to a tolerance you can feel.",
    },
  ],
};
