/**
 * What a link preview says, decided once for four templates.
 *
 * Four stacks put head metadata in four idiomatic places — Next's `metadata`
 * export, Nuxt's `useHead`, Astro's markup, and a zero-build page rewritten by
 * `frames`. That is four chances to disagree about what the card contains, and
 * a disagreement is invisible: every page renders, and the previews differ.
 *
 * So the mechanism stays per-template and the VALUES come from here.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cardFields } from "../lib/social-card.mjs";

const STORY = { title: "Acme — the real title", description: "What this is about." };
const SITE = "https://you.github.io/repo/";

describe("cardFields", () => {
  it("takes its words from the story", () => {
    const card = cardFields({ story: STORY, siteUrl: SITE });
    assert.equal(card.title, "Acme — the real title");
    assert.equal(card.description, "What this is about.");
  });

  it("resolves the image under the site rather than beside it", () => {
    const card = cardFields({ story: STORY, siteUrl: SITE });
    assert.equal(card.image, "https://you.github.io/repo/og.jpg");
    assert.equal(card.url, SITE);
  });

  it("keeps the card under a base path, for every template", () => {
    // The correction that came out of actually building astro. An absolute
    // "/og.jpg" is right only at an origin root: under a GitHub Pages project
    // site it resolves to https://you.github.io/og.jpg, which serves nothing —
    // and it looks perfectly correct in the markup.
    //
    // siteUrl already carries the base path, so the plain filename is right
    // whether the site is at a root or a subdirectory. There is no per-template
    // split here on purpose.
    assert.equal(
      cardFields({ story: STORY, siteUrl: "https://you.github.io/repo/" }).image,
      "https://you.github.io/repo/og.jpg",
    );
    assert.equal(
      cardFields({ story: STORY, siteUrl: "https://example.com/" }).image,
      "https://example.com/og.jpg",
    );
  });

  it("names the card without being told to", () => {
    // Every template gets the same answer without passing anything, which is
    // what stops one of them passing something different.
    assert.equal(cardFields({ story: STORY, siteUrl: SITE }).image, `${SITE}og.jpg`);
  });

  it("has no image and no url when nobody said where the site is", () => {
    // Degrade to no card, never a wrong one: a relative image resolves against
    // the crawler's own base and fetches something else.
    const card = cardFields({ story: STORY });
    assert.equal(card.image, null);
    assert.equal(card.url, null);
    assert.equal(card.title, "Acme — the real title", "the words still cost nothing");
  });

  it("asks for the small card when there is no image to put on a large one", () => {
    // summary_large_image with no image renders as an empty box. The four
    // templates have to agree on this too, or the same story previews
    // differently depending on the stack.
    assert.equal(cardFields({ story: STORY, siteUrl: SITE }).twitterCard,
      "summary_large_image");
    assert.equal(cardFields({ story: STORY }).twitterCard, "summary");
  });

  it("survives a story that sets nothing", () => {
    const card = cardFields({ story: {}, siteUrl: SITE });
    assert.equal(card.title, null);
    assert.equal(card.description, null);
    assert.equal(card.image, "https://you.github.io/repo/og.jpg");
  });

  it("survives no story at all rather than throwing mid-build", () => {
    // A template renders this during ITS build. Throwing here would fail a
    // build over a link preview, which is the wrong trade.
    const card = cardFields({});
    assert.equal(card.title, null);
    assert.equal(card.image, null);
    assert.equal(card.type, "website");
  });

  it("refuses to invent an image from a site url it cannot parse", () => {
    const card = cardFields({ story: STORY, siteUrl: "not a url" });
    assert.equal(card.image, null);
  });
});
