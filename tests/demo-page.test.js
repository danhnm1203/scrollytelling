/**
 * Putting the demo's own sections under the scroll.
 *
 * The rule that matters is that it survives being run twice. `scaffold` leaves
 * an already-generated page alone, so the second `npm run sample` into the same
 * directory reads a page that already has these sections in it — and the first
 * version of this appended a second copy underneath the first. Nothing failed:
 * the build exited 0, the page rendered, and the duplicate only showed up as a
 * selector matching twice in a browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withSections, OPEN, CLOSE } from "../tools/demo-page.mjs";

const PAGE = [
  "<body>",
  '    <div data-scrollytelling-runway aria-hidden="true">',
  "      <div data-scrollytelling></div>",
  "    </div>",
  "",
  "    <div data-scrollytelling-empty hidden></div>",
  '    <script type="module" src="./main.js"></script>',
  "  </body>",
].join("\n");

const SECTIONS = "<div class='after'>the rest of the page</div>";

describe("putting sections under the scroll", () => {
  it("puts them after the scroll, not before it", () => {
    const out = withSections(PAGE, SECTIONS);
    assert.ok(out.indexOf("runway") < out.indexOf("the rest of the page"));
  });

  it("leaves them above the script that mounts the engine", () => {
    // Markup after the module script still works, but a reader looking for the
    // page's content should not have to scroll past its machinery.
    const out = withSections(PAGE, SECTIONS);
    assert.ok(out.indexOf("the rest of the page") < out.indexOf("main.js"));
  });

  it("adds them exactly once, however many times it runs", () => {
    const once = withSections(PAGE, SECTIONS);
    const twice = withSections(once, SECTIONS);
    const thrice = withSections(twice, SECTIONS);
    assert.equal(thrice.split("the rest of the page").length - 1, 1);
    assert.equal(thrice, once, "a repeat run should leave the page byte-identical");
  });

  it("replaces what it put there before, rather than keeping both", () => {
    const first = withSections(PAGE, "<p>old copy</p>");
    const second = withSections(first, "<p>new copy</p>");
    assert.match(second, /new copy/);
    assert.doesNotMatch(second, /old copy/);
  });

  it("keeps everything it did not write", () => {
    const out = withSections(PAGE, SECTIONS);
    for (const kept of ["runway", "data-scrollytelling-empty", "main.js"]) {
      assert.ok(out.includes(kept), `lost ${kept}`);
    }
  });

  it("says so when the template has moved rather than guessing", () => {
    assert.throws(() => withSections("<body></body>", SECTIONS), /template has moved/);
  });

  it("says so when its own block was left half-written", () => {
    assert.throws(() => withSections(`<body>${OPEN}</body>`, SECTIONS), /never closed/);
  });

  it("marks what it owns, so a reader can tell", () => {
    const out = withSections(PAGE, SECTIONS);
    assert.ok(out.includes(OPEN) && out.includes(CLOSE));
  });
});
