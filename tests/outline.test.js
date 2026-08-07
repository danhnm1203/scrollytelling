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

import { OPEN_MARKER, CLOSE_MARKER, renderOutline, replaceOutline } from "../lib/outline.mjs";

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

describe("the page's own title", () => {
  // components/story.js declares `title` and `description`, and the framework
  // templates put both in the document head — Next reads them for <title> and
  // for Open Graph. The zero-build template has no render step, so if `frames`
  // does not write them, they are silently dropped: the page carries the
  // template's placeholder title forever.
  //
  // The symptom is invisible from inside the page. The body says one thing, the
  // browser tab and every social preview say "ORBIT — every part accounted for",
  // and nothing warns. This was found on a published page.

  const PAGE = [
    "<!doctype html>",
    "<html>",
    "  <head>",
    "    <title>ORBIT — every part accounted for</title>",
    '    <meta name="description" content="A scroll-driven look at Orbit." />',
    "  </head>",
    "  <body>",
    `    ${OPEN_MARKER}`,
    "    <main class=\"story-outline\"></main>",
    `    ${CLOSE_MARKER}`,
    "  </body>",
    "</html>",
  ].join("\n");

  const STORY_WITH_HEAD = {
    brand: "ACME",
    title: "Acme — the real title",
    description: "What this page is actually about.",
    sections: [{ heading: "One", body: "First." }],
  };

  it("comes from the story", () => {
    const out = replaceOutline(PAGE, STORY_WITH_HEAD);
    assert.match(out, /<title>Acme — the real title<\/title>/);
  });

  it("takes the meta description with it", () => {
    const out = replaceOutline(PAGE, STORY_WITH_HEAD);
    assert.match(out, /name="description" content="What this page is actually about\."/);
  });

  it("escapes what it writes into the head", () => {
    const out = replaceOutline(PAGE, { ...STORY_WITH_HEAD, title: 'Ampersand & "quote"' });
    assert.match(out, /<title>Ampersand &amp; &quot;quote&quot;<\/title>/);
    assert.doesNotMatch(out, /<title>[^<]*"quote"/);
  });

  it("leaves a page with no title alone rather than inventing one", () => {
    // Someone may have deleted the tag on purpose. Rewriting the outline is
    // this function's job; adding markup nobody asked for is not.
    const headless = PAGE.replace(/\s*<title>.*<\/title>/, "");
    assert.doesNotMatch(replaceOutline(headless, STORY_WITH_HEAD), /<title>/);
  });

  it("leaves the title alone when the story does not set one", () => {
    const out = replaceOutline(PAGE, { brand: "ACME", sections: [] });
    assert.match(out, /<title>ORBIT — every part accounted for<\/title>/);
  });
});
