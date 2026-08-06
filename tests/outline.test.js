/**
 * Keeping the story outline in step with the story.
 *
 * The outline is load-bearing twice: it is what assistive technology reads,
 * and it IS the page under reduced motion. A template with a render step
 * builds it from the story data on every render, so it cannot drift. A
 * zero-build page has no render step, so something has to write it.
 *
 * Hand-writing it was the alternative and is worse than it sounds: the copy
 * would live in two files with nothing tying them, and a conformance check
 * that merely looks for the marker class would PASS on drifted copy — the
 * suite certifying the broken state.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderOutline, replaceOutline } from "../lib/outline.mjs";

const STORY = {
  brand: "ORBIT",
  description: "How it comes apart.",
  sections: [
    { at: 0, align: "left", heading: "First", body: "one" },
    { at: 1, align: "right", heading: "Second", body: "two" },
  ],
};

describe("renderOutline", () => {
  it("carries the brand, the description and every beat", () => {
    const html = renderOutline(STORY);
    for (const text of ["ORBIT", "How it comes apart.", "First", "one", "Second", "two"]) {
      assert.ok(html.includes(text), `expected the outline to contain ${text}`);
    }
  });

  it("keeps the class the stylesheet hangs off", () => {
    // Without it the outline is neither hidden for sighted visitors nor
    // promoted to the page under reduced motion.
    assert.match(renderOutline(STORY), /class="story-outline"/);
  });

  it("escapes copy rather than injecting it", () => {
    // The story is authored by hand, so this is not a security boundary so
    // much as a correctness one: an ampersand or a less-than in a heading
    // should render, not break the document.
    const html = renderOutline({
      brand: "A & B",
      description: "1 < 2",
      sections: [{ heading: "<script>", body: 'He said "no"' }],
    });
    assert.ok(html.includes("A &amp; B"));
    assert.ok(html.includes("1 &lt; 2"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes("<script>"), "a heading must never become markup");
  });

  it("renders a story with no beats without inventing any", () => {
    const html = renderOutline({ brand: "X", description: "Y", sections: [] });
    assert.ok(html.includes("X"));
    assert.ok(!html.includes("<section>"));
  });
});

describe("replaceOutline", () => {
  const page = [
    "<body>",
    "<!-- scrollytelling:outline -->",
    "<main class=\"story-outline\"><h1>OLD</h1></main>",
    "<!-- /scrollytelling:outline -->",
    "<p>hand-written, keep me</p>",
    "</body>",
  ].join("\n");

  it("replaces only what is between the markers", () => {
    const next = replaceOutline(page, STORY);
    assert.ok(next.includes("hand-written, keep me"), "the rest of the page is the author's");
    assert.ok(!next.includes("OLD"));
    assert.ok(next.includes("ORBIT"));
  });

  it("leaves the markers in place so it can run again", () => {
    const once = replaceOutline(page, STORY);
    const twice = replaceOutline(once, STORY);
    assert.equal(once, twice, "regenerating must be idempotent");
  });

  it("refuses a page with no markers rather than guessing", () => {
    // Silently doing nothing would leave the outline stale forever, and the
    // page would look fine to everyone who is not using a screen reader.
    assert.throws(() => replaceOutline("<body><p>nothing here</p></body>", STORY), /marker/i);
  });

  it("refuses a page whose markers are the wrong way round", () => {
    const broken = "<!-- /scrollytelling:outline -->x<!-- scrollytelling:outline -->";
    assert.throws(() => replaceOutline(broken, STORY), /marker/i);
  });
});
