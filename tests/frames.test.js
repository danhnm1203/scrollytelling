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
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
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

    assert.ok(sequences.length >= 1, "at least the landscape sequence");
    for (const seq of sequences) {
      assert.equal(seq.totalFrames, 6, `${seq.id} frame count`);
      assert.equal(seq.edgeColors.length, seq.totalFrames, `${seq.id} edgeColors`);
      assert.equal(seq.lumaGrid.length, seq.totalFrames, `${seq.id} lumaGrid`);
    }
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

describe("frames — portrait sequence", () => {
  let project;

  before(async () => {
    project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });
    const src = await stillsDir(10, { width: 320, height: 180 });
    const { code } = await runCapturing([src, project], { frames: 5 });
    assert.equal(code, 0);
  });

  it("produces a landscape and a portrait sequence by default", () => {
    // Portrait is not opt-in: a phone showing a contained widescreen frame is
    // the defect this exists to remove, and most landing-page traffic is phones.
    const seqs = contractValue(readContract(project), "SEQUENCES");
    assert.deepEqual(
      seqs.map((s) => s.id).sort(),
      ["landscape", "portrait"],
    );
  });

  it("gives the portrait sequence a taller-than-wide shape", () => {
    const portrait = contractValue(readContract(project), "SEQUENCES").find(
      (s) => s.id === "portrait",
    );
    assert.ok(portrait.height > portrait.width, `${portrait.width}x${portrait.height} is not tall`);
  });

  it("keeps each sequence internally consistent", () => {
    for (const seq of contractValue(readContract(project), "SEQUENCES")) {
      assert.equal(seq.edgeColors.length, seq.totalFrames, `${seq.id} edgeColors`);
      assert.equal(seq.lumaGrid.length, seq.totalFrames, `${seq.id} lumaGrid`);
      for (const cells of seq.lumaGrid) assert.equal(cells.length, 24, `${seq.id} grid width`);
    }
  });

  it("writes frames for both sequences", () => {
    assert.ok(existsSync(join(project, "public/frames/landscape_0.webp")));
    assert.ok(existsSync(join(project, "public/frames/portrait_0.webp")));
  });

  it("can be skipped when the extra weight is not wanted", async () => {
    const dest = join(tempDir(), "site");
    mkdirSync(join(dest, "components"), { recursive: true });
    const src = await stillsDir(6, { width: 320, height: 180 });

    await runCapturing([src, dest], { frames: 3, "skip-portrait": true });

    const seqs = contractValue(readContract(dest), "SEQUENCES");
    assert.deepEqual(seqs.map((s) => s.id), ["landscape"]);
  });

  it("aims the crop with --focus", async () => {
    // A gradient that runs dark on the left to bright on the right, so where
    // the crop lands is visible in the measured border color.
    const src = tempDir();
    for (let i = 0; i < 4; i++) {
      await sharp({
        create: { width: 320, height: 180, channels: 3, background: "#000000" },
      })
        .composite([
          {
            input: {
              create: { width: 160, height: 180, channels: 3, background: "#ffffff" },
            },
            left: 160,
            top: 0,
          },
        ])
        .png()
        .toFile(join(src, `f_${i}.png`));
    }

    const readEdge = async (focus) => {
      const dest = join(tempDir(), "site");
      mkdirSync(join(dest, "components"), { recursive: true });
      await runCapturing([src, dest], { frames: 2, focus });
      const portrait = contractValue(readContract(dest), "SEQUENCES").find(
        (s) => s.id === "portrait",
      );
      return portrait.edgeColors[0][0];
    };

    const left = await readEdge(0.15);
    const right = await readEdge(0.85);
    assert.ok(right > left, `focus 0.85 (${right}) should be brighter than 0.15 (${left})`);
  });

  it("rejects a focus outside the frame", async () => {
    const dest = join(tempDir(), "site");
    mkdirSync(join(dest, "components"), { recursive: true });
    const src = await stillsDir(4, { width: 320, height: 180 });

    const { code, stderr } = await runCapturing([src, dest], { frames: 2, focus: 5 });

    assert.notEqual(code, 0);
    assert.match(stderr, /focus/i);
  });

  it("skips portrait when the source is already tall", async () => {
    // Cropping a portrait source to portrait would just shave its sides off
    // for no benefit.
    const dest = join(tempDir(), "site");
    mkdirSync(join(dest, "components"), { recursive: true });
    const src = await stillsDir(4, { width: 180, height: 320 });

    await runCapturing([src, dest], { frames: 2 });

    const seqs = contractValue(readContract(dest), "SEQUENCES");
    assert.equal(seqs.length, 1, "a tall source needs no second sequence");
  });
});

describe("frames — corrupt frames", () => {
  /** A file that looks like an image and is not one. */
  function writeCorrupt(dir, name) {
    writeFileSync(join(dir, name), Buffer.from("not an image, just bytes", "utf8"));
  }

  /** `count` good stills, plus corrupt files at the given positions. */
  async function mixedDir(count, corruptAt) {
    const dir = tempDir();
    for (let i = 0; i < count; i++) {
      const name = `f_${String(i).padStart(3, "0")}.png`;
      if (corruptAt.includes(i)) {
        writeCorrupt(dir, name);
        continue;
      }
      const v = Math.round((i / Math.max(1, count - 1)) * 255);
      await sharp({
        create: { width: 160, height: 90, channels: 3, background: { r: v, g: v, b: v } },
      })
        .png()
        .toFile(join(dir, name));
    }
    return dir;
  }

  it("skips one bad frame and completes the run", async () => {
    const src = await mixedDir(20, [7]);
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { code } = await runCapturing([src, project], { frames: 20, "skip-portrait": true });

    assert.equal(code, 0, "one bad file should not cost the whole run");
  });

  it("names the file it skipped", async () => {
    const src = await mixedDir(20, [7]);
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { stdout, stderr } = await runCapturing([src, project], {
      frames: 20,
      "skip-portrait": true,
    });

    assert.match(`${stdout}${stderr}`, /f_007\.png/);
  });

  it("keeps the contract consistent with the frames actually written", async () => {
    // The page indexes frames by position. A gap would 404 at runtime and show
    // as the animation sticking, which reads as a scrub bug rather than a
    // missing file.
    const src = await mixedDir(20, [3, 11]);
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    await runCapturing([src, project], { frames: 20, "skip-portrait": true });

    const [seq] = contractValue(readContract(project), "SEQUENCES");
    const written = readdirSync(join(project, "public/frames")).filter((f) => f.endsWith(".webp"));

    assert.equal(seq.totalFrames, written.length);
    assert.equal(seq.edgeColors.length, seq.totalFrames);
    assert.equal(seq.lumaGrid.length, seq.totalFrames);

    // Numbered contiguously from zero, with no gaps.
    for (let i = 0; i < seq.totalFrames; i++) {
      assert.ok(
        existsSync(join(project, `public/frames/landscape_${i}.webp`)),
        `frame ${i} is missing — the sequence has a hole in it`,
      );
    }
  });

  it("keeps both sequences the same length when one source is bad", async () => {
    const src = await mixedDir(20, [5]);
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    await runCapturing([src, project], { frames: 20 });

    const sequences = contractValue(readContract(project), "SEQUENCES");
    const counts = new Set(sequences.map((s) => s.totalFrames));
    assert.equal(counts.size, 1, `sequences disagree on length: ${[...counts]}`);
  });

  it("aborts when a large fraction of frames are unreadable", async () => {
    // At this point the input itself is wrong, and quietly producing a much
    // shorter animation would hide that.
    const src = await mixedDir(20, [1, 3, 5, 7, 9, 11, 13]);
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { code, stderr } = await runCapturing([src, project], {
      frames: 20,
      "skip-portrait": true,
    });

    assert.notEqual(code, 0);
    assert.match(stderr, /unreadable|corrupt|could not/i);
  });

  it("says how many failed when it aborts", async () => {
    const src = await mixedDir(20, [1, 3, 5, 7, 9, 11, 13]);
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { stderr } = await runCapturing([src, project], { frames: 20, "skip-portrait": true });
    assert.match(stderr, /7/);
  });

  it("leaves a previous sequence intact when it aborts", async () => {
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const good = await stillsDir(8, { width: 160, height: 90 });
    await runCapturing([good, project], { frames: 8, "skip-portrait": true });
    const before = readContract(project);

    const bad = await mixedDir(20, [1, 3, 5, 7, 9, 11, 13]);
    const { code } = await runCapturing([bad, project], { frames: 20, "skip-portrait": true });

    assert.notEqual(code, 0);
    assert.equal(readContract(project), before, "the working sequence must survive");
  });

  it("fails clearly when every frame is unreadable", async () => {
    const src = await mixedDir(6, [0, 1, 2, 3, 4, 5]);
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { code, stderr } = await runCapturing([src, project], { frames: 6 });

    assert.notEqual(code, 0);
    assert.ok(stderr.length > 0);
    assert.ok(!/^\s*at /m.test(stderr), "must not surface as a stack trace");
  });
});

describe("frames — readability report", () => {
  it("prints a luminance table per region and scroll position", async () => {
    const src = await stillsDir(12, { width: 320, height: 180 });
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { stdout } = await runCapturing([src, project], { frames: 6, "skip-portrait": true });

    assert.match(stdout, /left/);
    assert.match(stdout, /centre/);
    assert.match(stdout, /right/);
    // Values, not just labels — a table of headings would be useless.
    assert.match(stdout, /0\.\d\d/);
  });

  it("follows brightness rising across the scroll", async () => {
    // stillsDir ramps black to white, so the table must rise left to right.
    const src = await stillsDir(12, { width: 320, height: 180 });
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { stdout } = await runCapturing([src, project], { frames: 12, "skip-portrait": true });

    const row = /\n\s+centre\s+([\d.\s]+)\n/.exec(stdout);
    assert.ok(row, `expected a centre row, got:\n${stdout}`);
    const values = row[1].trim().split(/\s+/).map(Number);
    assert.ok(values.length >= 4, `expected several buckets, got ${values.length}`);
    assert.ok(
      values.at(-1) > values[0],
      `should brighten across the scroll: ${values.join(" ")}`,
    );
  });

  it("warns when the background will pulse", async () => {
    // Half black, half white: the jump between them is the whole range.
    const src = tempDir();
    for (let i = 0; i < 8; i++) {
      const shade = i < 4 ? 0 : 255;
      await sharp({
        create: { width: 160, height: 90, channels: 3, background: { r: shade, g: shade, b: shade } },
      })
        .png()
        .toFile(join(src, `f_${i}.png`));
    }
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { stdout } = await runCapturing([src, project], { frames: 8, "skip-portrait": true });

    assert.match(stdout, /pulse/i);
  });

  it("says so when the footage is dark throughout", async () => {
    const src = tempDir();
    for (let i = 0; i < 4; i++) {
      await sharp({ create: { width: 160, height: 90, channels: 3, background: "#050505" } })
        .png()
        .toFile(join(src, `f_${i}.png`));
    }
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { stdout } = await runCapturing([src, project], { frames: 4, "skip-portrait": true });

    assert.match(stdout, /dark throughout/i);
    assert.doesNotMatch(stdout, /pulse/i);
  });

  it("does not name beats, which do not exist yet at this point", async () => {
    // The check command does that, after copy has been written.
    const src = await stillsDir(6, { width: 320, height: 180 });
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { stdout } = await runCapturing([src, project], { frames: 4, "skip-portrait": true });

    assert.doesNotMatch(stdout, /beat/i);
  });
});

describe("frames — per-beat check", () => {
  /** A project with a generated sequence of the given uniform brightness. */
  async function projectWith(shade, beats) {
    const src = tempDir();
    for (let i = 0; i < 6; i++) {
      await sharp({
        create: { width: 160, height: 90, channels: 3, background: { r: shade, g: shade, b: shade } },
      })
        .png()
        .toFile(join(src, `f_${i}.png`));
    }
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });
    await runCapturing([src, project], { frames: 6, "skip-portrait": true });

    writeFileSync(
      join(project, "components/story.ts"),
      `export const story = { brand: "X", sections: ${JSON.stringify(beats)} };\n`,
    );
    return project;
  }

  it("names a beat sitting on bright footage", async () => {
    const project = await projectWith(250, [
      { at: 0.5, align: "left", heading: "Too bright", body: "..." },
    ]);

    const { code, stdout } = await runCapturing([project], { check: true });

    assert.equal(code, 0);
    assert.match(stdout, /Too bright/);
  });

  it("stays quiet about beats that read fine", async () => {
    const project = await projectWith(5, [
      { at: 0.5, align: "left", heading: "Reads fine", body: "..." },
    ]);

    const { code, stdout } = await runCapturing([project], { check: true });

    assert.equal(code, 0);
    assert.doesNotMatch(stdout, /Reads fine/);
    assert.match(stdout, /nothing to change/i);
  });

  it("reports the luminance it measured, so the number is checkable", async () => {
    const project = await projectWith(250, [
      { at: 0.5, align: "center", heading: "Bright", body: "..." },
    ]);

    const { stdout } = await runCapturing([project], { check: true });
    assert.match(stdout, /luma 0\.\d\d/);
  });

  it("explains that generation comes first when there are no frames", async () => {
    const bare = join(tempDir(), "site");
    mkdirSync(join(bare, "components"), { recursive: true });
    writeFileSync(join(bare, "components/story.ts"), "export const story = { sections: [] };\n");

    const { code, stderr } = await runCapturing([bare], { check: true });

    assert.notEqual(code, 0);
    assert.match(stderr, /generate/i);
  });

  it("explains when there is no copy to check", async () => {
    const project = await projectWith(5, []);
    rmSync(join(project, "components/story.ts"));

    const { code, stderr } = await runCapturing([project], { check: true });

    assert.notEqual(code, 0);
    assert.match(stderr, /story\.ts/);
  });

  it("requires a project directory", async () => {
    const { code, stderr } = await runCapturing([], { check: true });
    assert.notEqual(code, 0);
    assert.ok(stderr.length > 0);
  });

  it("needs no access to the source footage", async () => {
    // The whole point of reading the generated contract: checking copy after
    // an edit must not mean decoding the clip again.
    const project = await projectWith(250, [
      { at: 0.5, align: "left", heading: "Bright", body: "..." },
    ]);

    const { code } = await runCapturing([project], { check: true });
    assert.equal(code, 0);
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
