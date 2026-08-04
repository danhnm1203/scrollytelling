import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs, UsageError } from "../lib/cli-args.mjs";

test("no arguments asks for help instead of failing", () => {
  assert.equal(parseArgs([]).command, "help");
});

test("--help and -h resolve to the help command", () => {
  assert.equal(parseArgs(["--help"]).command, "help");
  assert.equal(parseArgs(["-h"]).command, "help");
  assert.equal(parseArgs(["help"]).command, "help");
});

test("--version resolves to the version command", () => {
  assert.equal(parseArgs(["--version"]).command, "version");
  assert.equal(parseArgs(["-v"]).command, "version");
});

test("unknown command names itself in the error", () => {
  assert.throws(() => parseArgs(["frame"]), (err) => {
    assert.ok(err instanceof UsageError);
    assert.match(err.message, /frame/);
    return true;
  });
});

test("frames takes an input and a project directory", () => {
  const parsed = parseArgs(["frames", "clip.mp4", "./site"]);
  assert.equal(parsed.command, "frames");
  assert.deepEqual(parsed.positionals, ["clip.mp4", "./site"]);
});

test("frames applies documented defaults", () => {
  const { flags } = parseArgs(["frames", "clip.mp4", "./site"]);
  assert.equal(flags.frames, 50);
  assert.equal(flags["max-width"], 1280);
  assert.equal(flags.quality, 82);
  assert.equal(flags.preview, false);
  assert.equal(flags.check, false);
  // Centred by default: without a stated subject, the middle is the least
  // wrong place to aim the portrait crop.
  assert.equal(flags.focus, 0.5);
  assert.equal(flags["skip-portrait"], false);
});

test("numeric flags parse as numbers, in both --flag=value forms", () => {
  const spaced = parseArgs(["frames", "clip.mp4", "./site", "--frames", "120"]);
  assert.equal(spaced.flags.frames, 120);

  const equals = parseArgs(["frames", "clip.mp4", "./site", "--frames=120"]);
  assert.equal(equals.flags.frames, 120);
});

test("a numeric flag rejects a non-number instead of silently becoming NaN", () => {
  assert.throws(
    () => parseArgs(["frames", "clip.mp4", "./site", "--frames", "many"]),
    UsageError,
  );
});

test("a numeric flag rejects a missing value instead of eating the next flag", () => {
  assert.throws(
    () => parseArgs(["frames", "clip.mp4", "./site", "--frames", "--quality", "70"]),
    UsageError,
  );
});

test("boolean flags do not consume the following argument", () => {
  const parsed = parseArgs(["frames", "--preview", "clip.mp4"]);
  assert.equal(parsed.flags.preview, true);
  assert.deepEqual(parsed.positionals, ["clip.mp4"]);
});

test("--focus parses as a number", () => {
  // It names where the portrait crop sits horizontally, 0 to 1 — not a pixel
  // geometry. Asking someone to compute a crop box against source dimensions
  // they never see is a worse interface than pointing at a position.
  assert.equal(parseArgs(["frames", "clip.mp4", "./site", "--focus", "0.25"]).flags.focus, 0.25);
  assert.equal(parseArgs(["frames", "clip.mp4", "./site", "--focus=0.8"]).flags.focus, 0.8);
});

test("--skip-portrait is accepted", () => {
  const { flags } = parseArgs(["frames", "clip.mp4", "./site", "--skip-portrait"]);
  assert.equal(flags["skip-portrait"], true);
});

test("scaffold accepts --force", () => {
  assert.equal(parseArgs(["scaffold", "./site", "--force"]).flags.force, true);
});

test("scaffold accepts --diff", () => {
  assert.equal(parseArgs(["scaffold", "./site", "--diff"]).flags.diff, true);
});

test("a flag belonging to another command is rejected, not ignored", () => {
  assert.throws(() => parseArgs(["scaffold", "./site", "--frames", "50"]), UsageError);
  assert.throws(() => parseArgs(["frames", "clip.mp4", "./site", "--force"]), UsageError);
});

test("an unknown flag names itself in the error", () => {
  assert.throws(() => parseArgs(["frames", "clip.mp4", "--fps", "24"]), (err) => {
    assert.match(err.message, /--fps/);
    return true;
  });
});

test("-- ends flag parsing so a file named --force stays a positional", () => {
  const parsed = parseArgs(["scaffold", "--", "--force"]);
  assert.deepEqual(parsed.positionals, ["--force"]);
  assert.equal(parsed.flags.force, false);
});

test("a filename holding shell metacharacters survives parsing untouched", () => {
  const nasty = "a;b$(whoami)&&c.mp4";
  const parsed = parseArgs(["frames", nasty, "./site"]);
  assert.equal(parsed.positionals[0], nasty);
});

test("too many positionals is an error, not a silently dropped argument", () => {
  assert.throws(() => parseArgs(["frames", "a.mp4", "./site", "./other"]), UsageError);
});
