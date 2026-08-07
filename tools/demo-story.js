/**
 * The copy for the published demo page.
 *
 * It is written as a real landing page for the suite in the footage, not as an
 * explainer about this tool. That is the more honest demonstration: what a
 * visitor scrolls is the thing someone would actually build with the command,
 * rather than a page talking about itself.
 *
 * The beats follow the camera. The clip is one continuous walk — basins, then
 * the bath and the daybed, then the bed under its canopy, ending on the
 * balcony — so each beat lands on the room it describes rather than on a round
 * number.
 *
 * The positions are not guesses either. They came from
 * `scrollytelling frames --check`, run against the frames actually behind them,
 * which names the beats that would fight a bright crop and says where the
 * footage is calmer. If the footage changes, re-run it:
 *
 *   node tools/sample-site.mjs --template html --frames 50 \
 *     --clip tools/demo-clip.mp4 --story tools/demo-story.js
 *   node bin/cli.mjs frames --check .sample-html
 *
 * It should say "every beat sits on footage the scrim can handle".
 *
 * `title` and `description` become the document's own title and meta
 * description, so they are what a browser tab and a shared link show.
 */

/** @type {import("../templates/html/components/story").Story} */
export const story = {
  brand: "AMIANA",
  title: "Amiana Suite — a room you walk through",
  description:
    "A suite that opens as you move through it: twin basins and a freestanding bath, " +
    "a bed under linen, and a balcony over the palms.",
  sections: [
    {
      at: 0.0,
      align: "center",
      heading: "The Suite",
      body: "Scroll to walk through it.",
    },
    {
      at: 0.32,
      align: "right",
      heading: "Stone, teak, and a bath in the open",
      body: "The bathroom does not hide at the back. It opens into the room, beside the daybed.",
    },
    {
      at: 0.72,
      align: "left",
      anchor: "bottom",
      heading: "A bed under linen",
      body: "Draped, shaded, and turned toward the light rather than away from it.",
    },
    {
      at: 0.93,
      align: "center",
      anchor: "bottom",
      heading: "Then the balcony",
      body: "Two chairs, the palms, and the pool below. Stay out here a while.",
    },
  ],
};
