/**
 * The copy that describes this tool to a stranger, asserted from the outside.
 *
 * Four surfaces claim what the tool is before anyone reads a line of code: the
 * npm package, the plugin manifest, the marketplace listing and the skill. They
 * fail as one — a stranger who meets two of them meets two different products
 * unless they agree — so they are asserted against one rule in one place.
 *
 * The CLI's `--help` says the same thing and is deliberately NOT asserted here:
 * the CLI gets subprocess tests, so that assertion lives in `cli.test.js` where
 * the binary is actually run.
 *
 * The rules worth testing are the ones whose failure is quiet. A description
 * that drifts back to naming one framework still installs fine; a keyword list
 * that loses `landing-page` still publishes. Nothing throws. The only symptom is
 * a stranger who reads the front page, wrongly concludes the tool is not for
 * them, and leaves — which is invisible from inside the repo.
 *
 * These assert criteria, never wording. "The description does not single out one
 * framework" is what a reader experiences; "the description is 92 characters" is
 * a detail that dies on the next edit.
 *
 * Later slices of the distribution work extend this file with the README and the
 * issue forms. Neither is asserted yet.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pkg = JSON.parse(read("../package.json"));
const plugin = JSON.parse(read("../.claude-plugin/plugin.json"));
const marketplace = JSON.parse(read("../.claude-plugin/marketplace.json"));
const skill = read("../skills/scrollytelling/SKILL.md");

/**
 * The four stacks `templates/` ships. Named here rather than imported from the
 * manifest on purpose: this file asserts what the *marketing copy* claims, and
 * importing the manifest would make the claim agree with the code by
 * construction instead of by check.
 */
const FRAMEWORKS = ["next", "nuxt", "astro", "html"];

/**
 * Every framework name that appears in `text`, as a whole word. The optional
 * `js` suffix is not decoration: prose writes "Next.js" and npm keywords write
 * "nextjs", and both have to count as naming the same stack.
 */
function frameworksNamedIn(text) {
  return FRAMEWORKS.filter((f) => new RegExp(`\\b${f}(\\.?js)?\\b`, "i").test(text));
}

/**
 * Four stacks have shipped. Copy that names exactly one of them tells a builder
 * on the other three that the tool is not for them — the most expensive false
 * negative this repo can produce. Naming all four is fine; naming none is fine;
 * naming some is the failure.
 */
function assertNamesAllFrameworksOrNone(what, text) {
  const named = frameworksNamedIn(text);
  assert.ok(
    named.length === 0 || named.length === FRAMEWORKS.length,
    `${what} names ${named.join(", ") || "no framework"} — name all four or none`,
  );
}

describe("the copy every shelf shows", () => {
  const surfaces = [
    ["the npm description", pkg.description],
    ["the npm keywords", pkg.keywords.join(" ")],
    ["the plugin manifest", plugin.description],
    ["the marketplace listing", marketplace.description],
    ["the marketplace plugin entry", marketplace.plugins[0].description],
    ["the skill description", skill],
  ];

  for (const [what, text] of surfaces) {
    it(`${what} names every framework, or none`, () => {
      assertNamesAllFrameworksOrNone(what, text);
    });
  }
});

describe("the npm package metadata", () => {
  it("describes an outcome rather than a technique", () => {
    // The positioning rests on the input being a video the reader already has.
    assert.match(pkg.description, /\bvideo\b/i);
  });

  it("is findable by the problem, not only by the technique", () => {
    for (const keyword of ["landing-page", "hero-section", "scrollytelling", "image-sequence"]) {
      assert.ok(pkg.keywords.includes(keyword), `keywords are missing ${keyword}`);
    }
  });

  it("keeps `video`, which the whole positioning stands on", () => {
    assert.ok(pkg.keywords.includes("video"));
  });

  it("names the stacks that are easiest to miss", () => {
    // The all-or-none rule above is satisfied by naming no framework at all, so
    // it cannot by itself keep `nuxt` and `astro` on the shelf. These two are
    // the ones a reader assumes are absent, so they are required by name.
    for (const keyword of ["nuxt", "astro"]) {
      assert.ok(pkg.keywords.includes(keyword), `keywords are missing ${keyword}`);
    }
  });

  it("still points at the repository it lives in", () => {
    // Cheap, but this is the only link npm shows before a homepage exists.
    assert.match(pkg.repository.url, /github\.com\/danhnm1203\/scrollytelling/);
  });
});
