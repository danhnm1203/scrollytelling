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
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

describe("the page the workflow publishes", () => {
  // The deploy uploads a directory by name. If the planner's naming changes and
  // the workflow's does not, the upload finds nothing and publishes an empty
  // site — a green deploy of a blank page, which is the worst shape of failure
  // available here.
  const workflow = read("../.github/workflows/pages.yml");

  it("builds the template it uploads", () => {
    const built = workflow.match(/sample-site\.mjs --template (\S+)/)?.[1];
    assert.ok(built, "the workflow does not build a sample");
    // Anchored to the upload step: `path:` on its own would match the first
    // one anywhere in the file, and a later step that happens to have a path
    // would silently move what this asserts.
    const uploaded = workflow.match(/upload-pages-artifact@v\d[\s\S]*?path:\s*(\S+)/)?.[1];
    assert.equal(uploaded, planSample(["--template", built]).out);
  });

  it("refuses to publish a page with no frames", () => {
    // The html template renders fine with an empty sequence, so this cannot be
    // left to the build's exit code.
    assert.match(workflow, /frames\/\*\.webp/);
    assert.match(workflow, /::error::/);
  });

  it("publishes a page that continues after the scroll", () => {
    // The demo exists to show what the tool produces. A page that stops at the
    // bottom of the hero shows half of it.
    const sections = workflow.match(/--sections (\S+)/)?.[1];
    assert.ok(sections, "the workflow publishes a hero with nothing under it");
    assert.ok(existsSync(new URL(`../${sections}`, import.meta.url)), `${sections} does not exist`);
  });

  it("publishes copy written for the footage, not the template's placeholder", () => {
    // The template ships a story about an invented product, which is right for
    // a scaffolded project and wrong for a published page. The demo page is
    // written as a real landing page for the suite in the clip — what someone
    // would actually build — rather than as a page about this tool.
    const story = workflow.match(/--story (\S+)/)?.[1];
    assert.ok(story, "the workflow does not override the template's copy");
    assert.ok(existsSync(new URL(`../${story}`, import.meta.url)), `${story} does not exist`);
  });

  it("builds from footage that is actually in the repository", () => {
    // Tracked, not merely present. CI clones the repository; a clip sitting
    // untracked on someone's laptop passes an existsSync check here and then
    // fails the deploy. A missing --clip is quieter still: the runner would
    // synthesise a clip and publish a different page than the one intended.
    const clip = workflow.match(/--clip (\S+)/)?.[1];
    assert.ok(clip, "the workflow does not name a clip, so it would synthesise one");
    assert.doesNotThrow(
      () => execFileSync("git", ["ls-files", "--error-unmatch", clip], { stdio: "ignore" }),
      `${clip} is not tracked by git — CI would not have it`,
    );
  });

  it("keeps that footage out of the published package", () => {
    // 2.7MB of video in every `npx @danhnm1203/scrollytelling` would be a cost
    // paid by every user for a page none of them asked for.
    const clip = workflow.match(/--clip (\S+)/)?.[1] ?? "";
    const top = clip.split("/")[0];
    assert.ok(!pkg.files.includes(top), `package.json files ships ${top}, which holds the demo clip`);
  });

  it("does not publish from a pull request", () => {
    assert.match(workflow, /if:\s*github\.event_name != 'pull_request'/);
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

  it("takes a block of page sections to put under the scroll", () => {
    // A hero is not a landing page. The README says the rest of the page goes
    // below the runway; this is how the published demo shows that rather than
    // ending in blank space.
    assert.equal(planSample(["--sections", "./more.html"]).sections, "./more.html");
  });

  it("wants no sections unless asked", () => {
    assert.equal(planSample([]).sections, null);
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
