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
      "components/story.ts",
      "components/frames.ts",
      "components/ScrollSequence.tsx",
      // Copied from lib/, not duplicated under templates/, so there is only
      // ever one copy of the display math in this repo.
      "lib/scroll-math.mjs",
      "lib/scroll-math.d.ts",
      // Same rule for the decisions the scrubbing engine makes. The component
      // imports these, so a project without them does not build.
      "lib/scroll-engine-state.mjs",
      "lib/scroll-engine-state.d.ts",
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

    const sequence = readFileSync(join(dir, "components/ScrollSequence.tsx"), "utf8");
    const css = readFileSync(join(dir, "app/globals.css"), "utf8");
    const page = readFileSync(join(dir, "app/page.tsx"), "utf8");

    assert.match(sequence, /prefers-reduced-motion: reduce/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    // The outline has to be addressable from CSS for the media query to
    // promote it from screen-reader-only to the page itself.
    assert.match(page, /story-outline/);
    assert.match(css, /\.story-outline/);
  });

  it("wires the decode worker to a failure handler", async () => {
    // The decision of what to do when the worker dies is unit-tested in
    // decode-strategy.test.js. What that cannot see is whether the component
    // ever asks. A worker that 404s constructs successfully and reports
    // asynchronously, so without this handler the page waits forever on frames
    // that are never coming — silently, which the project does not allow.
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const sequence = readFileSync(join(dir, "components/ScrollSequence.tsx"), "utf8");

    // Both spellings, so moving to addEventListener during the engine
    // extraction is a refactor rather than a false failure.
    const handler = /worker\.onerror|addEventListener\(\s*["']error["']/;
    assert.match(sequence, handler, "the worker needs a failure handler");

    // An empty handler satisfies the line above and fixes nothing. What makes
    // it a fallback is recovering the frames that were in flight, so require
    // that inside the handler rather than merely somewhere in the file.
    //
    // Bounded by the next statement after the worker block rather than a
    // character count, which would break every time the warning text grew. If
    // that marker ever moves the slice runs to end of file, which still rules
    // out the case that matters: the import sits above the handler, so a
    // forward slice can never be satisfied by it alone.
    const from = sequence.search(handler);
    const to = sequence.indexOf("ensureWindowRef.current =", from);
    const body = sequence.slice(from, to === -1 ? undefined : to);

    assert.match(
      body,
      /framesToRetry/,
      "the failure handler must re-request the frames abandoned with the worker",
    );

    // Asserted against the handler, not the file. There is a second
    // console.warn further down for failed frames, so a file-wide check would
    // pass with this warning deleted — which is the whole diagnostic gone.
    assert.match(body, /console\.warn/, "a silent fallback is the bug, not the fix");
    assert.match(body, /WORKER_URL|filename/, "the warning has to say which URL failed");
  });

  it("leaves an edited file untouched and says which files it skipped", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const storyPath = join(dir, "components/story.ts");
    writeFileSync(storyPath, "// my own copy\n");

    const { code, stdout } = await runCapturing([dir]);

    assert.equal(code, 0);
    assert.equal(readFileSync(storyPath, "utf8"), "// my own copy\n");
    assert.match(stdout, /components\/story\.ts/);
    assert.match(stdout, /skip/i);
  });

  it("replaces edited files when forced, and reports that it did", async () => {
    const dir = join(tempDir(), "site");
    await runCapturing([dir]);

    const storyPath = join(dir, "components/story.ts");
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
