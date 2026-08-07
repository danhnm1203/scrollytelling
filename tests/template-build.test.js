/**
 * What the per-template build gate checks, minus the building.
 *
 * The gate itself needs a network, an install and a bundler, so it lives in
 * continuous integration rather than here. What lives here is the part that
 * decides whether a finished build is acceptable — because that decision is
 * where the interesting bug was.
 *
 * The bug worth remembering: the engine once built its worker URL through a
 * variable rather than the literal `new URL("./decoder.worker.js",
 * import.meta.url)`, and Vite emitted no worker file at all. Every test passed.
 * The Next build passed. Turbopack traced it independently, so even the default
 * template was fine. Only Astro was broken, and only in a browser.
 *
 * So the gate does not assert "the build exited 0" — that was always true. It
 * asserts the specific files whose absence is silent.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { BUILD_PLANS, ARTIFACTS, GATE_SITE_URL, missingArtifacts } from "../ci/template-build.mjs";
import { templateNames } from "../lib/template-manifest.mjs";

/** A build output that has everything, as {path, text} pairs. */
function goodBuild() {
  return [
    { path: "_astro/decoder.worker.Br9kQ2.js", text: 'self.onmessage=async e=>{...Error("HTTP "+r.status);const b=await createImageBitmap(x);self.postMessage({index:i},[b])}' },
    { path: "_astro/index.CxY1.css", text: ".st-beat__scrim{background:radial-gradient(...)}@media (prefers-reduced-motion:reduce){.story-outline{position:static}}" },
    { path: "frames/landscape_0.webp", text: "" },
    { path: "og.jpg", text: "" },
    {
      path: "index.html",
      text: `<meta property="og:image" content="${GATE_SITE_URL}og.jpg" />`,
    },
  ];
}

describe("the build plans", () => {
  it("covers every template the manifest knows about", () => {
    // A template added to the manifest without a build plan ships unverified.
    // That is exactly how three templates ended up verified only by hand.
    for (const name of templateNames()) {
      assert.ok(BUILD_PLANS[name], `${name} has no build plan — it would ship unverified`);
    }
  });

  it("agrees with the manifest about where public files go", () => {
    for (const name of templateNames()) {
      assert.equal(typeof BUILD_PLANS[name].outDir, "string", `${name}.outDir`);
    }
  });

  it("gives the no-build template no build command", () => {
    // html's whole claim is that it needs no bundler. A build plan that runs
    // one would be testing a different product.
    assert.equal(BUILD_PLANS.html.build, null);
    assert.equal(BUILD_PLANS.html.install, null);
  });

  it("builds the templates that have a bundler", () => {
    for (const name of ["next", "nuxt", "astro"]) {
      assert.ok(Array.isArray(BUILD_PLANS[name].build), `${name} must build`);
      assert.ok(Array.isArray(BUILD_PLANS[name].install), `${name} must install`);
    }
  });

  it("is listed in every workflow that runs the gate", () => {
    // The matrix is spelled out twice in YAML, once to gate pull requests and
    // once to gate the publish, and YAML cannot read the manifest. So a
    // template can be added to the manifest, given a build plan, and still
    // never built by anyone — which is the exact "ships unverified" hole this
    // whole file exists to close, reopened one layer up.
    for (const file of ["test.yml", "release.yml"]) {
      const yaml = readFileSync(
        fileURLToPath(new URL(`../.github/workflows/${file}`, import.meta.url)),
        "utf8",
      );
      const matrix = /template:\s*\[([^\]]*)\]/.exec(yaml);
      assert.ok(matrix, `${file} has no template matrix`);
      const listed = matrix[1].split(",").map((name) => name.trim());
      assert.deepEqual(
        listed.sort(),
        templateNames().sort(),
        `${file}'s matrix disagrees with the manifest`,
      );
    }
  });

  it("stays out of the published package", () => {
    // The gate is repository tooling, not something a generated project needs,
    // and this repository's whole shape is that heavy tooling does not ship.
    // Adding "ci" to `files` would put a build harness in every install.
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    );
    assert.ok(!pkg.files.includes("ci"), "ci/ must not be in the published files");
  });
});

describe("missingArtifacts", () => {
  it("catches a build that emitted no card image", () => {
    const files = goodBuild().filter((f) => !f.path.endsWith("og.jpg") || f.path.endsWith(".html"));
    assert.deepEqual(missingArtifacts(files), ["link preview card"]);
  });

  it("catches a page whose card tags were never filled", () => {
    // The empty-tag case a successful build can still leave: everything else
    // shipped, and every share of the page is a bare url.
    const files = goodBuild().map((f) =>
      f.path.endsWith(".html") ? { ...f, text: '<meta property="og:image" content="" />' } : f,
    );
    assert.deepEqual(missingArtifacts(files), ["card tags"]);
  });

  it("catches a card named at the origin root rather than under the site", () => {
    // The bug this artifact was added for. "/og.jpg" is right at an origin root
    // and silently wrong under a base path, and it looks correct in the markup.
    const files = goodBuild().map((f) =>
      f.path.endsWith(".html")
        ? { ...f, text: '<meta property="og:image" content="https://example.test/og.jpg" />' }
        : f,
    );
    assert.deepEqual(missingArtifacts(files), ["card tags"]);
  });

  it("is not satisfied by a framework that merely mentions og:image", () => {
    // Nuxt bundles unhead, whose own source contains "og:image". Matching the
    // property name would make this check unfailable on that stack.
    const files = goodBuild().map((f) =>
      f.path.endsWith(".html")
        ? { ...f, text: 'const tags=["og:image","og:image:url","og:image:secure_url"]' }
        : f,
    );
    assert.deepEqual(missingArtifacts(files), ["card tags"]);
  });

  it("passes a build that emitted everything", () => {
    assert.deepEqual(missingArtifacts(goodBuild()), []);
  });

  it("catches a build that emitted no worker", () => {
    // The Vite regression, reproduced. The page still builds and still loads;
    // it just never decodes a frame off the main thread, and if the URL 404s it
    // hangs forever instead.
    const files = goodBuild().filter((f) => !f.path.includes("worker"));
    assert.deepEqual(missingArtifacts(files), ["decoder worker"]);
  });

  it("catches a build that emitted no engine stylesheet", () => {
    const files = goodBuild().filter((f) => !f.path.endsWith(".css"));
    assert.deepEqual(
      missingArtifacts(files).sort(),
      ["engine stylesheet", "reduced-motion rules"].sort(),
    );
  });

  it("catches a stylesheet that dropped the reduced-motion rules", () => {
    // Its own artifact rather than a detail of the stylesheet, because it is
    // the whole page for a visitor who asked for it. A CSS pipeline that tree
    // shakes an unused-looking media query takes the page away from them, and
    // nothing else would notice.
    const files = goodBuild().map((f) =>
      f.path.endsWith(".css") ? { ...f, text: ".st-beat__scrim{background:red}" } : f,
    );
    assert.deepEqual(missingArtifacts(files), ["reduced-motion rules"]);
  });

  it("catches a build that shipped no frames", () => {
    const files = goodBuild().filter((f) => !f.path.endsWith(".webp"));
    assert.deepEqual(missingArtifacts(files), ["frame images"]);
  });

  it("reports every missing artifact rather than the first", () => {
    // One CI run should name everything wrong with the build. Failing on the
    // first turns one broken template into three round trips.
    assert.equal(missingArtifacts([]).length, ARTIFACTS.length);
  });

  it("does not mistake the engine for the worker", () => {
    // The engine names `createImageBitmap` in a feature test and calls
    // `postMessage` on the worker, so neither identifies a worker chunk. The
    // marker has to be something only the worker's body contains.
    const engineOnly = [
      {
        path: "_astro/index.CxY1.js",
        text: 'typeof e.createImageBitmap>"u"...w.postMessage({index:i,url:u})',
      },
    ];
    assert.ok(missingArtifacts(engineOnly).includes("decoder worker"));
  });

  it("does not accept the engine's own media query as the reduced-motion rules", () => {
    // The engine calls matchMedia("(prefers-reduced-motion: reduce)") so it can
    // respond when the setting is toggled with the page open. That string
    // literal survives minification and sits in the JS chunk of every build.
    //
    // Matching it would make this artifact unfailable: the rules could be
    // dropped from the stylesheet entirely and the gate would still pass off
    // the engine. The artifact is about the CSS that turns the outline into the
    // page, so only a stylesheet can satisfy it.
    const engineJsOnly = goodBuild().map((f) =>
      f.path.endsWith(".css") ? { ...f, path: "_astro/index.CxY1.js" } : f,
    );
    assert.ok(missingArtifacts(engineJsOnly).includes("reduced-motion rules"));
  });

  it("does not accept framework code that happens to say HTTP", () => {
    // Measured, not assumed: a Next build contains `HTTP ` in its own bundled
    // node_modules chunks. That string is unique to the worker across lib/ and
    // templates/, which is not the same as being unique inside .next — so on
    // its own it passes on next whether or not a worker was emitted.
    const frameworkNoise = goodBuild().map((f) =>
      f.path.includes("worker")
        ? { path: "static/chunks/node_modules_a1b2.js", text: 'throw new Error("HTTP "+s)' }
        : f,
    );
    assert.ok(missingArtifacts(frameworkNoise).includes("decoder worker"));
  });

  it("does not accept a sourcemap or a build cache as the worker", () => {
    // Next walks .next, which holds sourcemaps and cached module records that
    // embed the worker's source text verbatim. Either would satisfy a
    // content-only match while no worker asset was served — the same false pass
    // the gate exists to prevent, on the template it defends least.
    const notServed = goodBuild().map((f) =>
      f.path.includes("worker") ? { ...f, path: "static/chunks/pages.js.map" } : f,
    );
    assert.ok(missingArtifacts(notServed).includes("decoder worker"));
  });
});

describe("templates whose document does not exist until it is asked for", () => {
  // Nuxt renders per request, so its head is in no built file. The card url in
  // particular is composed at request time from SITE_URL: the bundle carries
  // the origin and the filename, never the joined string a crawler reads.
  //
  // CI is what found this. The gate walked 47 emitted files, proved the worker,
  // the stylesheet and the frames had shipped, and could say nothing about the
  // head — so it failed nuxt while the template was in fact correct. A gate
  // that had matched on "og:image" instead would have passed it for the wrong
  // reason, because unhead is in that bundle.

  it("declares which templates have to be asked", () => {
    assert.ok(BUILD_PLANS.nuxt.serve, "nuxt renders per request");
    assert.deepEqual(BUILD_PLANS.nuxt.serve.argv, ["node", ".output/server/index.mjs"]);
    assert.equal(BUILD_PLANS.nuxt.serve.path, "/");
  });

  it("leaves the templates that build a document alone", () => {
    // Starting a server for a template that already wrote its page would be
    // slower and prove nothing extra.
    for (const name of ["next", "astro", "html"]) {
      assert.equal(BUILD_PLANS[name].serve, undefined, `${name} builds a document`);
    }
  });

  it("treats a served response as a document the artifacts can match", () => {
    // The pseudo-path the gate gives a fetched page has to satisfy the same
    // predicate a real .html file does, or every artifact silently skips it.
    const served = {
      path: "served/index.html",
      text: `<meta property="og:image" content="${GATE_SITE_URL}og.jpg" />`,
    };
    const files = goodBuild()
      .filter((f) => !f.path.endsWith(".html"))
      .concat(served);
    assert.deepEqual(missingArtifacts(files), []);
  });
});
