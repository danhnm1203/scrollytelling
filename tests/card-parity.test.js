/**
 * Four templates, one answer about what a link preview says.
 *
 * Each stack puts head metadata where a reader of that stack expects to find
 * it: Next's `metadata` export, Nuxt's `useHead`, Astro's markup, and a
 * zero-build page that `frames` rewrites. Keeping four mechanisms is right.
 * Keeping four ANSWERS is not, and the drift would be invisible — every page
 * renders, and the same story previews differently depending on which template
 * somebody happened to pick.
 *
 * Source-level, deliberately. Actually rendering four frameworks needs four
 * installs and four build steps, which is what `ci/` is for and what `npm test`
 * is not. What this can prove cheaply is the thing that actually drifts: that
 * every template asks lib/social-card.mjs rather than deciding for itself.
 *
 * The weakness of a source-level check is real and worth naming: it catches a
 * template that stops asking, not a template that asks and then renders the
 * answer wrongly. That half is the per-template build gate's, which since #79
 * builds against a site url under a BASE PATH and fails a template whose
 * emitted head does not carry the resulting absolute card url. See the "card
 * tags" artifact in ci/template-build.mjs, and the note there about why it
 * matches the url rather than the property name.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { cardFields } from "../lib/social-card.mjs";
import { OPEN_MARKER, CLOSE_MARKER, replaceOutline } from "../lib/outline.mjs";
import { TEMPLATES, templateNames } from "../lib/template-manifest.mjs";

/** Where each template's head lives, relative to templates/<dir>/. */
const HEAD_FILE = {
  next: "app/layout.tsx",
  nuxt: "app/app.vue",
  astro: "src/pages/index.astro",
  html: "index.html",
};

const read = (name) =>
  readFileSync(
    fileURLToPath(new URL(`../templates/${TEMPLATES[name].dir}/${HEAD_FILE[name]}`, import.meta.url)),
    "utf8",
  );

describe("every template asks the same source what its card says", () => {
  it("covers all four templates, so a fifth cannot be added and forgotten", () => {
    // Without this, adding a template that emits no card would leave the suite
    // green by simply not being in the list.
    assert.deepEqual(templateNames().slice().sort(), Object.keys(HEAD_FILE).sort());
  });

  for (const name of Object.keys(HEAD_FILE)) {
    if (name === "html") {
      it(`${name} has its card written by frames, from the same module`, () => {
        // The zero-build page cannot compute anything at build time — it has no
        // build. `frames` fills its tags, and lib/outline.mjs is what asks.
        const outline = readFileSync(
          fileURLToPath(new URL("../lib/outline.mjs", import.meta.url)),
          "utf8",
        );
        assert.match(outline, /from "\.\/social-card\.mjs"/);
        assert.match(outline, /cardFields\(/);
      });
      continue;
    }

    it(`${name} builds its head from cardFields rather than deciding for itself`, () => {
      const source = read(name);
      // `\bcardFields\s*\(` rather than /cardFields/. A substring match passes
      // on `cardFieldsSomethingElse`, which is how the first version of this
      // test stayed green while astro had been mutated to stop calling it.
      assert.match(source, /\bcardFields\s*\(/, `${name} must CALL cardFields`);
      assert.match(
        source,
        /\bimport\s*\{[^}]*\bcardFields\b[^}]*\}\s*from\s*"[^"]*social-card[^"]*"/,
        `${name} must import cardFields from the shared module, not reimplement it`,
      );
      assert.doesNotMatch(
        source,
        /cardPath\s*:/,
        `${name} must not name the card itself — that is how the four drift apart`,
      );
    });

    it(`${name} reads the recorded origin without breaking a fresh scaffold`, () => {
      // SITE_URL is only in the contract once `frames --site-url` recorded one.
      // A named import of an absent export fails at build time, so a project
      // that has never run frames would not compile.
      const source = read(name);
      assert.match(source, /import \* as frames from/, `${name} needs a namespace import`);
      assert.match(source, /frames\.SITE_URL/, `${name} must read the recorded origin`);
    });
  }
});

describe("what the four agree on", () => {
  // The values themselves, asserted once. Every template renders these; if this
  // changes, all four change together, which is the whole point of the module.
  const story = { title: "T", description: "D" };

  it("names an image only when there is an origin to resolve it against", () => {
    assert.equal(cardFields({ story, cardPath: "/og.jpg" }).image, null);
    assert.equal(
      cardFields({ story, siteUrl: "https://x.test/", cardPath: "/og.jpg" }).image,
      "https://x.test/og.jpg",
    );
  });

  it("names the card the same way for every template", () => {
    // No template passes a card path, so none of them can pass a different one.
    // The absolute "/og.jpg" form that framework templates started with was
    // right only at an origin root and silently wrong under a base path.
    const card = cardFields({ story, siteUrl: "https://you.github.io/repo/" });
    assert.equal(card.image, "https://you.github.io/repo/og.jpg");
  });
});

describe("how each mechanism says there is no image", () => {
  // The one place the four legitimately differ, decided once rather than four
  // times. `image: null` means no image; a template that re-renders omits the
  // tag, and the zero-build page leaves it empty because `frames` may not
  // delete a tag a later run would need to fill.
  //
  // Asserted so the difference stays the documented one. Without this, either
  // side could drift and the suite would not notice.

  it("gives every template the same answer to fall back on", () => {
    assert.equal(cardFields({ story: { title: "T" } }).image, null);
  });

  it("leaves the zero-build page's tag present but empty", () => {
    const page = [
      "<html><head>",
      '<meta property="og:image" content="" />',
      "</head><body>",
      OPEN_MARKER,
      CLOSE_MARKER,
      "</body></html>",
    ].join("\n");
    const out = replaceOutline(page, { title: "T" }, {});
    assert.ok(
      out.includes('<meta property="og:image" content="" />'),
      "the tag must survive, or a later --site-url run has nothing to fill",
    );
  });

  it("has the framework templates omit rather than empty", () => {
    // Source-level, because rendering three frameworks is the gate's job. What
    // this catches is a template dropping the conditional and emitting the tag
    // unconditionally, which is how it would silently become an empty one.
    for (const name of ["nuxt", "astro", "next"]) {
      const source = read(name);
      assert.match(
        source,
        /card\.image\s*(\?|&&)/,
        `${name} must emit the image tag only when there is one`,
      );
    }
  });
});
