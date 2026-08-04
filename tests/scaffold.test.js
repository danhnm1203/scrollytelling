/**
 * Scaffold behaviour, exercised through the module the CLI calls.
 *
 * These assert what a user can observe: which files exist afterwards, what got
 * skipped, and what the exit code was. They deliberately say nothing about how
 * the copy is performed.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
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

  it("requires a project directory", async () => {
    const { code, stderr } = await runCapturing([]);

    assert.notEqual(code, 0);
    assert.match(stderr, /project/i);
  });
});
