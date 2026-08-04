import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const PKG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
);

/** Runs the CLI without a shell, so argv reaches it verbatim. */
async function cli(args) {
  try {
    const { stdout, stderr } = await run(process.execPath, [CLI, ...args]);
    return { code: 0, stdout, stderr };
  } catch (err) {
    return { code: err.code, stdout: err.stdout, stderr: err.stderr };
  }
}

test("--help exits 0 and lists both commands", async () => {
  const { code, stdout } = await cli(["--help"]);
  assert.equal(code, 0);
  assert.match(stdout, /scaffold/);
  assert.match(stdout, /frames/);
});

test("no arguments prints help rather than a stack trace", async () => {
  const { code, stdout, stderr } = await cli([]);
  assert.equal(code, 0);
  assert.match(stdout, /Usage/);
  assert.equal(stderr, "");
});

test("--version prints the package version", async () => {
  const { code, stdout } = await cli(["--version"]);
  assert.equal(code, 0);
  assert.equal(stdout.trim(), PKG.version);
});

test("a bad command exits 2 with a usage error, not a stack trace", async () => {
  const { code, stderr } = await cli(["frame"]);
  assert.equal(code, 2);
  assert.match(stderr, /unknown command "frame"/);
  assert.doesNotMatch(stderr, /at Function/);
});

test("the bin entry declared in package.json is the file that exists", async () => {
  const declared = PKG.bin["scrollytelling"];
  assert.equal(declared, "./bin/cli.mjs");
  const { code } = await cli(["--help"]);
  assert.equal(code, 0);
});

test("sharp and ffmpeg-static are pinned exactly — golden masters depend on them", () => {
  for (const dep of ["sharp", "ffmpeg-static"]) {
    const range = PKG.dependencies[dep];
    assert.match(range, /^\d+\.\d+\.\d+$/, `${dep} must be pinned, got "${range}"`);
  }
});
