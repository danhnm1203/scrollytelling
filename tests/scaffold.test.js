/**
 * Scaffold behaviour, exercised through the module the CLI calls.
 *
 * These assert what a user can observe: which files exist afterwards, what got
 * skipped, and what the exit code was. They deliberately say nothing about how
 * the copy is performed.
 */

import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { run } from "../scripts/scaffold.mjs";

const temps = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "ost-scaffold-"));
  temps.push(d);
  return d;
}
after(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

/** Every file in the tree, as path -> contents. Used to prove nothing moved. */
function fingerprint(dir, prefix = "") {
  const out = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, fingerprint(join(dir, entry.name), rel));
    else out[rel] = readFileSync(join(dir, entry.name), "utf8");
  }
  return out;
}

/** Capture stdout/stderr around a run so tests can assert on what the user saw. */
async function runCapturing(positionals, flags = {}) {
  const out = [];
  const err = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => (out.push(String(chunk)), true);
  process.stderr.write = (chunk) => (err.push(String(chunk)), true);
  try {
    const code = await run(positionals, flags);
    return { code, stdout: out.join(""), stderr: err.join("") };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

describe("scaffold — the Astro template", () => {
  it("generates a project laid out the way Astro expects", async () => {
    const dir = join(tempDir(), "site");
    const { code } = await runCapturing([dir], { template: "astro" });
    assert.equal(code, 0);

    for (const f of [
      "package.json",
      "astro.config.mjs",
      "src/pages/index.astro",
      "src/components/frames.js",
      "src/lib/scroll-engine.mjs",
    ]) {
      assert.ok(existsSync(join(dir, f)), `${f} must exist`);
    }
  });

  it("puts the worker beside the engine", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "astro" });

    assert.ok(existsSync(join(dir, "src/lib/scroll-engine.mjs")));
    assert.ok(existsSync(join(dir, "src/lib/decoder.worker.js")));
  });

  it("builds its own outline rather than needing one written in", async () => {
    // Astro renders at build time, so index.astro maps the story itself. Only
    // the template with no render step needs `frames` to write the outline.
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "astro" });

    const page = readFileSync(join(dir, "src/pages/index.astro"), "utf8");
    assert.match(page, /story\.sections\.map/, "the outline comes from the story");
    assert.match(page, /class="story-outline"/);
    assert.match(page, /data-scrollytelling-poster/, "the server-rendered first frame");
    assert.ok(!/scrollytelling:outline/.test(page), "no generated block is needed here");
  });

  it("checks its JavaScript, so a mistyped beat still fails the build", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "astro" });

    const tsconfig = JSON.parse(
      readFileSync(join(dir, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""),
    );
    assert.equal(tsconfig.compilerOptions.checkJs, true);
    assert.ok(
      tsconfig.exclude.some((e) => e.includes("decoder.worker")),
      "the worker cannot be checked against DOM globals",
    );
  });

  it("commits the frames", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "astro" });

    const ignore = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.match(ignore, /^!public\/frames\//m);
    assert.match(ignore, /^!\.scrollytelling-version$/m);
  });
});

describe("scaffold — the Nuxt template", () => {
  it("generates a project laid out the way Nuxt expects", async () => {
    const dir = join(tempDir(), "site");
    const { code } = await runCapturing([dir], { template: "nuxt" });
    assert.equal(code, 0);

    for (const f of [
      "package.json",
      "nuxt.config.ts",
      "app/app.vue",
      "app/components/frames.js",
      "app/lib/scroll-engine.mjs",
    ]) {
      assert.ok(existsSync(join(dir, f)), `${f} must exist`);
    }
  });

  it("puts the worker beside the engine", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "nuxt" });

    assert.ok(existsSync(join(dir, "app/lib/scroll-engine.mjs")));
    assert.ok(existsSync(join(dir, "app/lib/decoder.worker.js")));
  });

  it("builds its own outline rather than needing one written in", async () => {
    // Nuxt renders on the server, so app.vue maps the story itself. Only the
    // template with no render step needs `frames` to write the outline.
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "nuxt" });

    const page = readFileSync(join(dir, "app/app.vue"), "utf8");
    assert.match(page, /v-for="beat in story\.sections"/, "the outline comes from the story");
    assert.match(page, /class="story-outline"/);
    assert.match(page, /data-scrollytelling-poster/, "the server-rendered first frame");
    assert.ok(!/scrollytelling:outline/.test(page), "no generated block is needed here");
  });

  it("keeps frames.js and story.js out of the component scan", async () => {
    // Nuxt registers everything under app/components/ as a component, .js
    // included. These two are data. Without narrowing the scan they become
    // phantom components named Frames and Story — nothing renders them, so
    // nothing fails loudly, which is the reason to pin it with a test.
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "nuxt" });

    const config = readFileSync(join(dir, "nuxt.config.ts"), "utf8");
    assert.match(config, /extensions:\s*\["vue"\]/, "the scan must be narrowed to .vue");
  });

  it("stops the engine when the page goes away", async () => {
    // Nuxt keeps the page alive across client-side navigation, so the engine
    // has to be told to stop. Without this its scroll listener, its animation
    // frame and every pinned ImageBitmap outlive the page that made them. No
    // other template navigates away from itself, so no other one needs it.
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "nuxt" });

    const page = readFileSync(join(dir, "app/app.vue"), "utf8");
    assert.match(page, /onBeforeUnmount/);
    assert.match(page, /dispose\?\.\(\)/, "dispose is what mount() hands back");
  });

  it("checks its JavaScript, so a mistyped beat still fails the build", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "nuxt" });

    const tsconfig = JSON.parse(
      readFileSync(join(dir, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""),
    );
    assert.equal(tsconfig.compilerOptions.checkJs, true);
    assert.ok(
      tsconfig.exclude.some((e) => e.includes("decoder.worker")),
      "the worker cannot be checked against DOM globals",
    );
  });

  it("commits the frames", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "nuxt" });

    const ignore = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.match(ignore, /^!public\/frames\//m);
    assert.match(ignore, /^!\.scrollytelling-version$/m);
  });
});

describe("scaffold — the no-build template", () => {
  it("generates a page that needs nothing installed", async () => {
    const dir = join(tempDir(), "site");
    const { code } = await runCapturing([dir], { template: "html" });
    assert.equal(code, 0);

    for (const f of ["index.html", "main.js", "components/frames.js", "lib/scroll-engine.mjs"]) {
      assert.ok(existsSync(join(dir, f)), `${f} must exist`);
    }
    // The whole claim of this template. A package.json would mean npm install.
    assert.ok(!existsSync(join(dir, "package.json")), "there is nothing to install");
    assert.ok(!existsSync(join(dir, "tsconfig.json")), "there is nothing to compile");
  });

  it("puts the worker beside the engine it is resolved from", async () => {
    // `new URL("./decoder.worker.js", import.meta.url)` resolves relative to the
    // engine. With no bundler to rewrite it, the two being siblings is the only
    // thing making the worker reachable.
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "html" });

    assert.ok(existsSync(join(dir, "lib/scroll-engine.mjs")));
    assert.ok(existsSync(join(dir, "lib/decoder.worker.js")));
  });

  it("renders a poster the engine adopts, and the outline markers", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "html" });

    const html = readFileSync(join(dir, "index.html"), "utf8");
    assert.match(html, /data-scrollytelling-poster/, "the server-rendered first frame");
    assert.match(html, /data-scrollytelling\b/, "the container the engine mounts into");
    assert.match(html, /scrollytelling:outline/, "the block frames regenerates");
    assert.match(html, /class="story-outline"/, "what assistive technology reads");
    assert.match(html, /lib\/scroll-engine\.css/, "the engine stylesheet, not Tailwind");
  });

  it("commits the frames, like every other template", async () => {
    // A deploy builds from a fresh clone. Without this the page has nothing
    // to draw and nothing says so.
    const dir = join(tempDir(), "site");
    await runCapturing([dir], { template: "html" });

    const ignore = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.match(ignore, /^!frames\//m);
    assert.match(ignore, /^!\.scrollytelling-version$/m);
  });
});

describe("scaffold", () => {
  it("produces a project whose files all exist", async () => {
    const dir = join(tempDir(), "site");
    const { code } = await runCapturing([dir]);

    assert.equal(code, 0);
    for (const f of [
      "package.json",
      "next.config.mjs",
      "tsconfig.json",
      "postcss.config.mjs",
      ".gitignore",
      "app/layout.tsx",
      "app/page.tsx",
      "app/globals.css",
      "components/story.js",
      "components/frames.js",
      "components/frames.d.ts",
      "components/story.d.ts",
      "components/ScrollSequence.tsx",
      // Copied from lib/, not duplicated under templates/, so there is only
      // ever one copy of the display math in this repo.
      "lib/scroll-math.mjs",
      "lib/scroll-math.d.ts",
      // Same rule for the decisions the scrubbing engine makes. The component
      // imports these, so a project without them does not build.
      "lib/scroll-engine-state.mjs",
      "lib/scroll-engine-state.d.ts",
      "lib/scroll-engine.mjs",
      "lib/scroll-engine.d.ts",
      "lib/scroll-engine.css",
      // Must sit beside scroll-engine.mjs — the engine resolves it relative to
      // its own module URL, so splitting them 404s the worker.
      "lib/decoder.worker.js",
    ]) {
      assert.ok(existsSync(join(dir, f)), `expected ${f} to exist`);
    }
  });

  it("declares only next, react and tailwind as runtime dependencies", async () => {
    // The whole point of moving the frame tooling into this repo is that the
    // delivered page does not pay for it on every clone, CI run and deploy.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const deps = Object.keys(pkg.dependencies ?? {});
    assert.deepEqual(deps.sort(), ["next", "react", "react-dom"]);

    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const banned of ["sharp", "ffmpeg-static", "framer-motion", "motion"]) {
      assert.ok(!(banned in all), `${banned} must not ship with the generated project`);
    }
  });

  it("does not exclude the frames directory from version control", async () => {
    // A deploy builds from a fresh clone; gitignoring the frames means it cannot.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const ignore = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.ok(!/^\s*public\/frames/m.test(ignore));
  });

  it("does not exclude the baseline that --diff compares against", async () => {
    // `.scrollytelling-version` is what makes `scaffold --diff` able to say what
    // moved in the template. It is a dotfile, so it is exactly the sort of thing
    // a broad ignore rule sweeps up by accident.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const ignore = readFileSync(join(dir, ".gitignore"), "utf8");
    assert.ok(!/^\s*\.?\*?scrollytelling-version/m.test(ignore));
    assert.ok(!/^\s*\.\*\s*$/m.test(ignore), "a bare `.*` rule would hide the baseline");
  });

  it("ignores what a Next.js project regenerates on every build", async () => {
    // Without these a `git status` in a generated project is unusable: .next/
    // alone is thousands of files, and the noise is what makes people stop
    // reading their own diffs.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const rules = readFileSync(join(dir, ".gitignore"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));

    for (const rule of [
      "node_modules/",
      ".next/",
      "out/",
      "/coverage",
      ".vercel",
      "*.tsbuildinfo",
      "next-env.d.ts",
      ".env*.local",
      ".DS_Store",
    ]) {
      assert.ok(rules.includes(rule), `expected .gitignore to contain \`${rule}\``);
    }
  });

  it("gives a visitor who asked for reduced motion a page that does not scrub", async () => {
    // Scroll-scrubbing is motion triggered by interaction, so it has to be
    // possible to turn off. The static outline in page.tsx is what the page
    // becomes: the same story, already written as prose.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    // The engine owns the media query now; the adapter owns the outline.
    const engine = readFileSync(join(dir, "lib/scroll-engine.mjs"), "utf8");
    const page = readFileSync(join(dir, "app/page.tsx"), "utf8");

    // The engine decides; the engine stylesheet renders. globals.css no longer
    // carries either, so a template without Tailwind still gets both.
    const sheet = readFileSync(join(dir, "lib/scroll-engine.css"), "utf8");

    assert.match(engine, /prefers-reduced-motion: reduce/);
    assert.match(sheet, /@media \(prefers-reduced-motion: reduce\)/);
    // The outline has to be addressable from CSS for the media query to
    // promote it from screen-reader-only to the page itself.
    assert.match(page, /story-outline/);
    assert.match(sheet, /\.story-outline/);
    // Exactly one hiding mechanism. Two, interacting by source order, is how
    // the outline ends up visible on a page that should be scrubbing.
    assert.ok(!/sr-only/.test(page), "the engine stylesheet hides the outline, not a utility class");
  });

  it("wires the decode worker to a failure handler", async () => {
    // The decision of what to do when the worker dies is unit-tested in
    // decode-strategy.test.js. What that cannot see is whether the component
    // ever asks. A worker that 404s constructs successfully and reports
    // asynchronously, so without this handler the page waits forever on frames
    // that are never coming — silently, which the project does not allow.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const engine = readFileSync(join(dir, "lib/scroll-engine.mjs"), "utf8");

    // Both spellings, so moving to addEventListener later is a refactor rather
    // than a false failure.
    const handler = /worker\.onerror|addEventListener\(\s*["']error["']/;
    assert.match(engine, handler, "the worker needs a failure handler");

    // An empty handler satisfies the line above and fixes nothing. What makes
    // it a fallback is recovering the frames that were in flight, so require
    // that inside the handler rather than merely somewhere in the file.
    //
    // Bounded by the next statement after the worker block rather than a
    // character count, which would break every time the warning text grew. If
    // that marker ever moves the slice runs to end of file, which still rules
    // out the case that matters: the import sits above the handler, so a
    // forward slice can never be satisfied by it alone.
    const from = engine.search(handler);
    const to = engine.indexOf("const ensureWindow =", from);
    const body = engine.slice(from, to === -1 ? undefined : to);

    assert.match(
      body,
      /framesToRetry/,
      "the failure handler must re-request the frames abandoned with the worker",
    );

    // Asserted against the handler, not the file. There is a second warning
    // further down for failed frames, so a file-wide check would pass with this
    // one deleted — which is the whole diagnostic gone.
    //
    // Either spelling: the engine warns through an injectable console so a test
    // can capture it, and `console.warn` directly is equally valid.
    assert.match(body, /\b(log|console)\.warn/, "a silent fallback is the bug, not the fix");
    assert.match(body, /workerUrl|filename/i, "the warning has to say which URL failed");
  });

  it("keys the version record on project paths, not template source paths", async () => {
    // This is what makes moving templates/* into templates/next/ free. The
    // record maps "where the file lives in YOUR project" to a hash; the source
    // root moving underneath changes nothing it stores. Assert it rather than
    // assume it — the alternative was a migration, and --diff reporting every
    // file as removed-and-added on projects that had not changed.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const record = JSON.parse(readFileSync(join(dir, ".scrollytelling-version"), "utf8"));
    const keys = Object.keys(record.files);

    assert.ok(keys.includes("components/ScrollSequence.tsx"));
    assert.ok(keys.includes("app/page.tsx"));
    assert.ok(keys.includes("lib/scroll-engine.mjs"));
    assert.ok(
      !keys.some((k) => k.startsWith("next/") || k.startsWith("templates/")),
      `no key may carry the template's source directory, got ${keys.filter((k) => k.includes("next/"))}`,
    );
  });

  it("records which template the project came from", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const record = JSON.parse(readFileSync(join(dir, ".scrollytelling-version"), "utf8"));
    assert.equal(record.template, "next");
  });

  it("puts every runtime file in one directory", async () => {
    // The engine finds its worker relative to its own module URL, so they have
    // to be siblings. One libDir cannot separate them; a path per file could.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    for (const f of ["scroll-engine.mjs", "decoder.worker.js", "scroll-engine.css"]) {
      assert.ok(existsSync(join(dir, "lib", f)), `${f} must sit in lib/ with the engine`);
    }
  });

  it("refuses an unknown template and says which are valid", async () => {
    // Better than a sanitiser: a typo is told what it should have been. The
    // name selects a manifest key and never reaches a path join, so traversal
    // is not something that can be sanitised wrongly — it cannot be expressed.
    const dir = join(tempDir(), "site");
    const { code, stderr } = await runCapturing([dir], { template: "nextjs" });

    assert.notEqual(code, 0);
    assert.match(stderr, /nextjs/);
    assert.match(stderr, /next/, "an unknown name should say which are valid");
    assert.ok(!/^\s*at /m.test(stderr), "a bad name must read as a sentence, not a stack trace");
  });

  it("refuses to scaffold a different template over an existing project", async () => {
    // The files would land alongside each other, the record would claim the new
    // template, and every later frames run would resolve paths against the
    // wrong layout. Nothing errors and the page renders empty.
    //
    // The record is written by hand because only one template exists today.
    // The guard compares what the project says against what was asked for, so
    // this exercises it fully; the second template just makes it reachable
    // through the flag as well.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);
    writeFileSync(
      join(dir, ".scrollytelling-version"),
      `${JSON.stringify({ version: "0", template: "astro", files: {} })}\n`,
    );

    const { code, stderr } = await runCapturing([dir], { template: "next" });
    assert.notEqual(code, 0);
    assert.match(stderr, /astro/);
    assert.match(stderr, /next/);
    assert.match(stderr, /--force/, "the refusal has to say how to proceed anyway");
  });

  it("still overwrites across templates when forced", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);
    writeFileSync(
      join(dir, ".scrollytelling-version"),
      `${JSON.stringify({ version: "0", template: "astro", files: {} })}\n`,
    );

    const { code } = await runCapturing([dir], { template: "next", force: true });
    assert.equal(code, 0, "--force is the escape hatch and must still work");
  });

  it("refuses rather than silently not scaffolding when --template has no name", async () => {
    // Listing here would print the templates, exit 0, and leave the caller with
    // no project — they asked for one and the command said it succeeded.
    const dir = join(tempDir(), "site");
    const { code, stderr } = await runCapturing([dir], { template: null });

    assert.notEqual(code, 0, "asking for a project and getting none must not exit 0");
    assert.ok(!existsSync(dir), "nothing should have been written");
    assert.match(stderr, /next/, "it should still say what the options are");
  });

  it("reports rather than refusing when the record names an unknown template", async () => {
    // --diff only reads. The record is data from another version of this
    // package, and a report has no business refusing over it.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);
    writeFileSync(
      join(dir, ".scrollytelling-version"),
      `${JSON.stringify({ version: "0", template: "from-the-future", files: {} })}\n`,
    );

    const { code, stdout, stderr } = await runCapturing([dir], { diff: true });
    assert.equal(code, 0, `a report must not refuse; stderr was ${stderr}`);
    assert.match(stdout, /from-the-future/, "say which template it could not use");
    assert.match(stdout, /next/, "and which one it compared against instead");
  });

  it("lists the templates when --template is given no value and no directory", async () => {
    const { code, stdout } = await runCapturing([], { template: null });
    assert.equal(code, 0);
    assert.match(stdout, /next/);
    assert.match(stdout, /Available templates/i);
  });

  it("keeps the story and the contract type-checked after moving them to .js", async () => {
    // allowJs permits JavaScript in the program; it does not put it there.
    // Without both of these the move to .js would silently stop checking the
    // one file users edit most — a mistyped `align` or a missing `body` would
    // survive to runtime.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const tsconfig = JSON.parse(
      readFileSync(join(dir, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*$/gm, ""),
    );
    assert.equal(tsconfig.compilerOptions.checkJs, true, "JavaScript must be checked");
    assert.ok(tsconfig.include.includes("**/*.js"), "JavaScript must be in the program");

    // The worker runs in a Worker context, not a window. Left in, tsc measures
    // it against DOM globals and a clean scaffold fails to build.
    assert.ok(
      tsconfig.exclude.some((e) => e.includes("decoder.worker")),
      "the worker cannot be checked against DOM globals",
    );
  });

  it("ships types alongside the JavaScript data files", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    for (const f of ["components/frames.js", "components/frames.d.ts",
                     "components/story.js", "components/story.d.ts"]) {
      assert.ok(existsSync(join(dir, f)), `${f} must exist`);
    }
    assert.ok(!existsSync(join(dir, "components/frames.ts")), "the .ts contract is gone");
    assert.ok(!existsSync(join(dir, "components/story.ts")), "the .ts story is gone");
  });

  it("renders a poster the engine can adopt", async () => {
    // The handshake the whole server-rendered-first-frame story rests on. The
    // engine looks for this attribute and adopts the element instead of
    // building its own; without it the page loses what it paints first, what a
    // link preview shows, and what a no-JS visitor gets — on the server, where
    // nothing would report it.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const adapter = readFileSync(join(dir, "components/ScrollSequence.tsx"), "utf8");
    assert.match(adapter, /data-scrollytelling-poster/, "every adapter must render the poster");
  });

  it("leaves an edited file untouched and says which files it skipped", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const storyPath = join(dir, "components/story.js");
    writeFileSync(storyPath, "// my own copy\n");

    const { code, stdout } = await runCapturing([dir]);

    assert.equal(code, 0);
    assert.equal(readFileSync(storyPath, "utf8"), "// my own copy\n");
    assert.match(stdout, /components\/story\.js/);
    assert.match(stdout, /skip/i);
  });

  it("replaces edited files when forced, and reports that it did", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const storyPath = join(dir, "components/story.js");
    writeFileSync(storyPath, "// my own copy\n");

    const { code, stdout } = await runCapturing([dir], { force: true });

    assert.equal(code, 0);
    assert.notEqual(readFileSync(storyPath, "utf8"), "// my own copy\n");
    assert.match(stdout, /overwrote|overwrite/i);
  });

  it("refuses to scaffold into a path that is a file", async () => {
    const filePath = join(tempDir(), "not-a-dir");
    writeFileSync(filePath, "x");

    const { code, stderr } = await runCapturing([filePath]);

    assert.notEqual(code, 0);
    assert.match(stderr, /not a directory/i);
  });

  it("fails clearly when the target cannot be written", async () => {
    const parent = tempDir();
    const readOnly = join(parent, "read-only");
    mkdirSync(readOnly, { mode: 0o555 });

    const { code, stderr } = await runCapturing([join(readOnly, "site")]);

    assert.notEqual(code, 0);
    assert.ok(stderr.length > 0, "a failure must explain itself");
    assert.ok(!/^\s*at /m.test(stderr), "a permission error must not surface as a stack trace");
  });

  it("records what the template looked like, so --diff has a baseline", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const record = JSON.parse(readFileSync(join(dir, ".scrollytelling-version"), "utf8"));
    assert.ok(record.version, "expected a version");
    assert.ok(Object.keys(record.files).length > 5, "expected the installed files to be recorded");
    assert.ok(record.files["components/ScrollSequence.tsx"], "expected a hash per installed file");
  });

  it("reports nothing to do when the template has not moved", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const { code, stdout } = await runCapturing([dir], { diff: true });

    assert.equal(code, 0);
    assert.match(stdout, /nothing to do/i);
  });

  it("never modifies the project when reporting a diff", async () => {
    // The whole premise is that adopting a change is the owner's decision. A
    // report that quietly rewrote files would make re-running this frightening.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);
    const before = fingerprint(dir);

    await runCapturing([dir], { diff: true });

    assert.deepEqual(fingerprint(dir), before);
  });

  it("explains itself when the project has no recorded baseline", async () => {
    const dir = tempDir(); // an empty directory, never scaffolded
    const { code, stdout } = await runCapturing([dir], { diff: true });

    assert.equal(code, 0, "a missing baseline is not an error");
    assert.match(stdout, /no baseline|no \.scrollytelling-version/i);
  });

  it("survives a corrupt baseline instead of crashing", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);
    writeFileSync(join(dir, ".scrollytelling-version"), "{ not json");

    const { code, stdout } = await runCapturing([dir], { diff: true });

    assert.equal(code, 0);
    assert.match(stdout, /baseline/i);
  });

  it("needs a project directory to diff", async () => {
    const { code, stderr } = await runCapturing([], { diff: true });
    assert.notEqual(code, 0);
    assert.match(stderr, /directory/i);
  });

  it("requires a project directory", async () => {
    const { code, stderr } = await runCapturing([]);

    assert.notEqual(code, 0);
    assert.match(stderr, /project/i);
  });
});
