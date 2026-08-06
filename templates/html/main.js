/**
 * The whole of the client side.
 *
 * No framework, no build step, no bundler. The engine is the same file every
 * other template gets — a fix to the scrubbing lands once, not once per
 * template — and this is the sixty lines that hand it a container.
 *
 * `type="module"` in index.html is what makes the bare imports below work, and
 * what lets the engine construct its worker with
 * `new URL("./decoder.worker.js", import.meta.url)`. Both need the page served
 * over http(s): opening index.html from the filesystem will not work, because
 * module scripts and workers are same-origin only.
 */

import { SEQUENCES, framePath } from "./components/frames.js";
import { story } from "./components/story.js";
import { mount } from "./lib/scroll-engine.mjs";
import { scrollHeightVh } from "./lib/scroll-math.mjs";

const container = document.querySelector("[data-scrollytelling]");
const runway = document.querySelector("[data-scrollytelling-runway]");
const empty = document.querySelector("[data-scrollytelling-empty]");

if (!container) {
  throw new Error(
    "scrollytelling: no [data-scrollytelling] element on the page. " +
      "The engine needs a container to draw into.",
  );
}

const sequence = SEQUENCES[0];

if (!sequence) {
  // Nothing has been encoded yet. Say so on the page rather than leaving a
  // blank rectangle and a clean console.
  if (empty) empty.hidden = false;
} else {
  // The runway is what there is to scroll through. Its height comes from the
  // frame count so scroll distance per frame stays constant.
  if (runway) runway.style.height = `${scrollHeightVh(sequence.totalFrames)}vh`;

  mount(container, { sequences: SEQUENCES, story, framePath });
}
