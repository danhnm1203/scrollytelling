/**
 * The frames pipeline, exercised through the module the CLI calls.
 *
 * Asserts what a user can observe: which files exist afterwards, what the
 * generated contract says, the exit code, and the message on failure. Says
 * nothing about how the work is done.
 *
 * Inputs are synthesized here rather than committed as fixtures, so the suite
 * runs from a clean checkout with no binaries in the repo.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import sharp from "sharp";

import { run } from "../scripts/frames.mjs";

const temps = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "ost-frames-"));
  temps.push(d);
  return d;
}
after(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

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

/**
 * A directory of stills whose brightness rises with the frame number, so tests
 * can tell frames apart by their measured values.
 */
async function stillsDir(count, { width = 160, height = 90, names } = {}) {
  const dir = tempDir();
  for (let i = 0; i < count; i++) {
    const v = Math.round((i / Math.max(1, count - 1)) * 255);
    const name = names ? names[i] : `frame_${i + 1}.png`;
    await sharp({
      create: { width, height, channels: 3, background: { r: v, g: v, b: v } },
    })
      .png()
      .toFile(join(dir, name));
  }
  return dir;
}

/** Reads the generated contract without importing it as TypeScript. */
function readContract(projectDir) {
  return readFileSync(join(projectDir, "components/frames.ts"), "utf8");
}

/**
 * Pulls a JSON array out of the generated module by exported name.
 * Takes the bracketed literal only, so trailing type assertions
 * (`as const satisfies …`) do not end up inside JSON.parse.
 */
function contractValue(source, name) {
  const m = new RegExp(`${name}\\s*=\\s*(\\[[\\s\\S]*?\\])\\s*(?:as const|satisfies|;)`).exec(
    source,
  );
  assert.ok(m, `expected the contract to export ${name}`);
  return JSON.parse(m[1]);
}

describe("frames — from a directory of stills", () => {
  let project;

  before(async () => {
    project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });
    const src = await stillsDir(12);
    const { code } = await runCapturing([src, project], { frames: 6 });
    assert.equal(code, 0, "pipeline should succeed");
  });

  it("writes the requested number of encoded frames", () => {
    for (let i = 0; i < 6; i++) {
      assert.ok(
        existsSync(join(project, `public/frames/landscape_${i}.webp`)),
        `frame ${i} missing`,
      );
    }
  });

  it("generates a contract whose array lengths agree with its own frame count", () => {
    const src = readContract(project);
    const sequences = contractValue(src, "SEQUENCES");

    assert.equal(sequences.length, 1, "one sequence until portrait lands");
    const [seq] = sequences;
    assert.equal(seq.totalFrames, 6);
    assert.equal(seq.edgeColors.length, seq.totalFrames);
    assert.equal(seq.lumaGrid.length, seq.totalFrames);
  });

  it("gives every frame a full luminance grid", () => {
    const [seq] = contractValue(readContract(project), "SEQUENCES");
    for (const cells of seq.lumaGrid) {
      assert.equal(cells.length, 24);
    }
  });

  it("records dimensions and a frame path pattern", () => {
    const [seq] = contractValue(readContract(project), "SEQUENCES");
    assert.ok(seq.width > 0);
    assert.ok(seq.height > 0);
    assert.equal(seq.id, "landscape");
  });

  it("preserves the first and last source frame", () => {
    // The stills ramp from black to white, so the measured sequence must too.
    const [seq] = contractValue(readContract(project), "SEQUENCES");
    const first = seq.edgeColors[0][0];
    const last = seq.edgeColors.at(-1)[0];

    assert.ok(first < 30, `first frame should be dark, got ${first}`);
    assert.ok(last > 225, `last frame should be bright, got ${last}`);
  });

  it("orders frames naturally, so frame_10 follows frame_9", async () => {
    // Named so a plain string sort would interleave them wrongly.
    const names = Array.from({ length: 12 }, (_, i) => `shot_${i + 1}.png`);
    const src = await stillsDir(12, { names });
    const dest = join(tempDir(), "site");
    mkdirSync(join(dest, "components"), { recursive: true });

    await runCapturing([src, dest], { frames: 12 });

    const [seq] = contractValue(readContract(dest), "SEQUENCES");
    const brightness = seq.edgeColors.map((c) => c[0]);
    for (let i = 1; i < brightness.length; i++) {
      assert.ok(
        brightness[i] >= brightness[i - 1],
        `frame ${i} (${brightness[i]}) is darker than ${i - 1} (${brightness[i - 1]}) — out of order`,
      );
    }
  });
});

describe("frames — failure paths", () => {
  it("reports a missing input and names the path it tried", async () => {
    const project = join(tempDir(), "site");
    const { code, stderr } = await runCapturing(["/no/such/clip.mp4", project]);

    assert.notEqual(code, 0);
    assert.match(stderr, /\/no\/such\/clip\.mp4/);
  });

  it("reports an empty directory and lists what it accepts", async () => {
    const empty = tempDir();
    const project = join(tempDir(), "site");
    const { code, stderr } = await runCapturing([empty, project]);

    assert.notEqual(code, 0);
    assert.match(stderr, /png|jpe?g|webp/i);
  });

  it("requires both an input and a project directory", async () => {
    const { code, stderr } = await runCapturing([]);
    assert.notEqual(code, 0);
    assert.ok(stderr.length > 0);
  });

  it("leaves a previous sequence intact when a run fails", async () => {
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const good = await stillsDir(4);
    await runCapturing([good, project], { frames: 4 });
    const before = readContract(project);
    assert.ok(existsSync(join(project, "public/frames/landscape_0.webp")));

    // Now fail: the directory has no images at all.
    const { code } = await runCapturing([tempDir(), project], { frames: 4 });

    assert.notEqual(code, 0);
    assert.equal(readContract(project), before, "contract must be untouched");
    assert.ok(
      existsSync(join(project, "public/frames/landscape_0.webp")),
      "previous frames must survive",
    );
  });

  it("uses every image and warns when asked for more than exist", async () => {
    const src = await stillsDir(3);
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { code, stdout, stderr } = await runCapturing([src, project], { frames: 50 });

    assert.equal(code, 0);
    const [seq] = contractValue(readContract(project), "SEQUENCES");
    assert.equal(seq.totalFrames, 3);
    assert.match(`${stdout}${stderr}`, /3/);
  });

  it("handles a filename containing shell metacharacters", async () => {
    const src = tempDir();
    const nasty = "a; echo pwned && touch $(pwd)_x.png";
    await sharp({ create: { width: 32, height: 32, channels: 3, background: "#123456" } })
      .png()
      .toFile(join(src, nasty));
    await sharp({ create: { width: 32, height: 32, channels: 3, background: "#654321" } })
      .png()
      .toFile(join(src, "b.png"));

    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { code } = await runCapturing([src, project], { frames: 2 });

    assert.equal(code, 0, "a hostile filename must be handled like any other");
    assert.ok(existsSync(join(project, "public/frames/landscape_0.webp")));
  });

  it("rejects images whose aspect ratios differ wildly, naming the file", async () => {
    const src = tempDir();
    await sharp({ create: { width: 160, height: 90, channels: 3, background: "#111" } })
      .png()
      .toFile(join(src, "a.png"));
    await sharp({ create: { width: 90, height: 160, channels: 3, background: "#222" } })
      .png()
      .toFile(join(src, "b_tall.png"));

    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { code, stderr } = await runCapturing([src, project], { frames: 2 });

    assert.notEqual(code, 0);
    assert.match(stderr, /b_tall\.png/);
  });

  it("normalizes a one-pixel difference instead of failing", async () => {
    // A render that came out 1px short must not cost someone a whole run.
    const src = tempDir();
    await sharp({ create: { width: 160, height: 90, channels: 3, background: "#111" } })
      .png()
      .toFile(join(src, "a.png"));
    await sharp({ create: { width: 159, height: 90, channels: 3, background: "#222" } })
      .png()
      .toFile(join(src, "b.png"));

    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { code } = await runCapturing([src, project], { frames: 2 });

    assert.equal(code, 0, "a 1px difference should be normalized, not fatal");
  });
});

describe("frames — preview mode", () => {
  it("extracts a handful of frames without needing a project", async () => {
    const src = await stillsDir(20);
    const { code, stdout } = await runCapturing([src], { preview: true });

    assert.equal(code, 0);
    // It must tell the caller where the frames went, or they are useless.
    const dir = /(\/[^\s]*ost-preview[^\s]*)/.exec(stdout)?.[1];
    assert.ok(dir, `expected a path in the output, got: ${stdout}`);
    assert.ok(existsSync(dir));
    writeFileSync(join(dir, ".keep"), ""); // proves it is a real, usable directory
  });
});
