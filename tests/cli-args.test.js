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

/* ------------------------------------------------------------- --site-url -- */

test("--site-url is absent unless asked for, so nothing changes by default", () => {
  const { flags } = parseArgs(["frames", "clip.mp4", "./site"]);
  assert.equal("site-url" in flags, false);
});

test("--site-url keeps a base path, because a project site is not just an origin", () => {
  // Dropping the path would break the exact deploy target this exists for: a
  // GitHub Pages project site is served from /<repo>/, not from the root.
  const { flags } = parseArgs([
    "frames", "clip.mp4", "./site", "--site-url", "https://danhnm1203.github.io/scrollytelling/",
  ]);
  assert.equal(flags["site-url"], "https://danhnm1203.github.io/scrollytelling/");
});

test("--site-url resolves the same whether or not a trailing slash was typed", () => {
  // The real criterion is not the stored string, it is the url a page ends up
  // requesting. Without the trailing slash, url resolution drops the last
  // segment — `new URL("og.png", ".../scrollytelling")` is `.../og.png` — which
  // is a wrong path rather than a doubled slash, and harder to spot.
  const withSlash = parseArgs([
    "frames", "c.mp4", "./s", "--site-url", "https://example.com/site/",
  ]).flags["site-url"];
  const without = parseArgs([
    "frames", "c.mp4", "./s", "--site-url", "https://example.com/site",
  ]).flags["site-url"];

  assert.equal(withSlash, without);
  assert.equal(new URL("og.png", withSlash).href, "https://example.com/site/og.png");
  assert.equal(new URL("og.png", without).href, "https://example.com/site/og.png");
});

test("--site-url at an origin root still ends in a single slash", () => {
  const { flags } = parseArgs(["frames", "c.mp4", "./s", "--site-url", "https://example.com"]);
  assert.equal(flags["site-url"], "https://example.com/");
  assert.equal(new URL("og.png", flags["site-url"]).href, "https://example.com/og.png");
});

test("--site-url accepts the inline form", () => {
  const { flags } = parseArgs(["frames", "c.mp4", "./s", "--site-url=https://example.com/x/"]);
  assert.equal(flags["site-url"], "https://example.com/x/");
});

test("--site-url rejects a relative url, and says what it got", () => {
  assert.throws(() => parseArgs(["frames", "c.mp4", "./s", "--site-url", "/scrollytelling/"]),
    (err) => {
      assert.ok(err instanceof UsageError);
      assert.match(err.message, /--site-url/);
      assert.match(err.message, /\/scrollytelling\//);
      return true;
    });
});

test("--site-url rejects a scheme a browser will not fetch a card from", () => {
  // A file: or data: base produces og:image values that every crawler drops,
  // silently. Better to refuse than to emit a card nobody can read.
  for (const bad of ["file:///tmp/site/", "ftp://example.com/", "javascript:alert(1)"]) {
    assert.throws(() => parseArgs(["frames", "c.mp4", "./s", "--site-url", bad]),
      (err) => {
        assert.ok(err instanceof UsageError, `${bad} should be refused`);
        assert.match(err.message, /http/);
        return true;
      });
  }
});

test("--site-url with no value is an error, not an empty origin", () => {
  assert.throws(() => parseArgs(["frames", "c.mp4", "./s", "--site-url"]), (err) => {
    assert.ok(err instanceof UsageError);
    assert.match(err.message, /needs a value/);
    return true;
  });
});

test("--site-url does not swallow the flag after it", () => {
  assert.throws(() => parseArgs(["frames", "c.mp4", "./s", "--site-url", "--frames", "20"]),
    UsageError);
});

test("--site-url rejects a query or fragment rather than storing one nothing sends", () => {
  // Url resolution drops both, so keeping them would put a value in the page
  // that no request ever carries.
  for (const bad of ["https://example.com/site/?utm=x", "https://example.com/site/#top"]) {
    assert.throws(() => parseArgs(["frames", "c.mp4", "./s", "--site-url", bad]),
      (err) => {
        assert.ok(err instanceof UsageError, `${bad} should be refused`);
        assert.match(err.message, /--site-url/);
        return true;
      });
  }
});
