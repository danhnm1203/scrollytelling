/**
 * What `npm run sample` decides before it touches the disk.
 *
 * The runner installs packages, spawns a dev server and writes a whole project,
 * so none of that belongs in `npm test`. What is worth testing is the part that
 * decides: which template, where it goes, which clip, and whether there is a
 * dev server to start afterwards. That part is pure, so it is tested directly
 * and the runner is left to do only what cannot be tested cheaply.
 *
 * The rule this file cares most about: a flag nobody recognises is an error,
 * never a shrug. Silently ignoring `--frame 12` would build fifty frames and
 * say nothing, and the person who typed it would conclude the flag does not
 * work rather than that they misspelled it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { templateNames } from "../lib/template-manifest.mjs";
import { planSample } from "../tools/sample-plan.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pkg = JSON.parse(read("../package.json"));
const gitignore = read("../.gitignore");

/**
 * Whether a .gitignore rule covers a directory name. Only the shapes this
 * repository actually writes: a literal name, either with a trailing slash or
 * with a single trailing `*`.
 */
function covers(rule, dir) {
  const pattern = rule.replace(/\/$/, "");
  return pattern.endsWith("*") ? dir.startsWith(pattern.slice(0, -1)) : pattern === dir;
}

describe("a sample build reaches nobody else", () => {
  // Two ways a local sample escapes: committed, or published. Both are quiet —
  // a publish that carries an extra directory says nothing, and a generated
  // project is thousands of files nobody reviews line by line.

  it("is not committed — for every output the planner will accept, not just the default", () => {
    // The weaker version of this test asserted the default path only, while
    // --out accepted anything. The planner now constrains --out to `.sample…`,
    // so one ignore rule can cover the whole space, and this checks a spread of
    // it rather than one point.
    const outs = [
      planSample([]).out,
      ...templateNames().map((t) => planSample(["--template", t]).out),
      planSample(["--out", ".sample-whatever-someone-types"]).out,
    ];
    const rules = gitignore
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    for (const out of outs) {
      assert.ok(
        rules.some((rule) => covers(rule, out)),
        `.gitignore does not cover ${out}`,
      );
    }
  });

  it("refuses an output that .gitignore would not cover", () => {
    for (const bad of ["demo", "../escape", "/tmp/anywhere", "public"]) {
      assert.throws(() => planSample(["--out", bad]), /--out/, `--out ${bad}`);
    }
  });

  it("is not published", () => {
    // `files` is a whitelist, so the sample directory is excluded by not being
    // listed. This asserts nobody adds it, and that the tooling that builds it
    // stays out too — a generated project has no use for either.
    for (const entry of pkg.files) {
      assert.doesNotMatch(entry, /^(tools|\.sample-site)\b/, `package.json files ships ${entry}`);
    }
  });

  it("is one command", () => {
    assert.ok(pkg.scripts.sample, "expected an npm script to build the sample");
  });
});

describe("planning a sample site", () => {
  it("needs no arguments at all", () => {
    const plan = planSample([]);
    assert.equal(plan.template, "next");
    assert.equal(plan.out, ".sample-next");
    assert.equal(plan.clip, null, "no clip means synthesise one");
    assert.ok(plan.frames > 0);
  });

  it("gives each template its own directory", () => {
    // Scaffolding one template over a project generated from another is
    // refused, so sharing one directory would make `--template astro` fail for
    // anyone who had already run the default.
    const outs = templateNames().map((t) => planSample(["--template", t]).out);
    assert.equal(new Set(outs).size, outs.length, `overlapping outputs: ${outs}`);
  });

  it("takes a template by name", () => {
    assert.equal(planSample(["--template", "astro"]).template, "astro");
  });

  it("refuses a template that does not exist, and says what does", () => {
    assert.throws(
      () => planSample(["--template", "svelte"]),
      (err) => /svelte/.test(err.message) && /next/.test(err.message) && /astro/.test(err.message),
    );
  });

  it("takes a clip to use instead of a synthesised one", () => {
    assert.equal(planSample(["--clip", "./kitchen.mov"]).clip, "./kitchen.mov");
  });

  it("takes a frame count", () => {
    assert.equal(planSample(["--frames", "12"]).frames, 12);
  });

  it("refuses a frame count that is not a positive whole number", () => {
    for (const bad of ["abc", "0", "-4", "2.5", ""]) {
      assert.throws(() => planSample(["--frames", bad]), new RegExp(bad || "frames"), `--frames ${bad}`);
    }
  });

  it("refuses a flag it does not know", () => {
    assert.throws(() => planSample(["--frame", "12"]), /--frame\b/);
  });

  it("refuses a flag left without its value", () => {
    assert.throws(() => planSample(["--template"]), /--template/);
  });

  it("refuses an empty value", () => {
    // `--out ""` resolved to the repository root, and `--clip ""` resolved to
    // the working directory, which exists — so both passed their later checks.
    assert.throws(() => planSample(["--out", ""]), /empty/);
    assert.throws(() => planSample(["--clip", ""]), /empty/);
  });

  it("refuses the same flag twice rather than quietly taking the last", () => {
    assert.throws(() => planSample(["--frames", "10", "--frames", "20"]), /twice/);
  });

  it("knows how to start the templates that have a dev server", () => {
    for (const template of ["next", "nuxt", "astro"]) {
      const plan = planSample(["--template", template]);
      assert.deepEqual(plan.dev, ["npm", "run", "dev"], template);
      assert.ok(plan.install, `${template} has dependencies to install`);
    }
  });

  it("knows the html template has neither, and says why rather than failing", () => {
    // Nothing to install and nothing to run is the whole claim of that
    // template. The runner has to explain that instead of looking broken.
    const plan = planSample(["--template", "html"]);
    assert.equal(plan.dev, null);
    assert.equal(plan.install, null);
    assert.match(plan.note, /server/i);
  });
});
