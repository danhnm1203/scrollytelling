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

import { pathToFileURL } from "node:url";

import { CARD_FILE, framePathSource, renderContract, run } from "../scripts/frames.mjs";
import { run as scaffoldRun } from "../scripts/scaffold.mjs";
import { TEMPLATES, templateNames } from "../lib/template-manifest.mjs";

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
  return readFileSync(join(projectDir, "components/frames.js"), "utf8");
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

/**
 * A directory the frame pipeline will accept.
 *
 * The version record is the realistic setup, not ceremony: a project always
 * comes from `scaffold`, and `frames` now refuses a directory whose template it
 * cannot determine. Guessing there would write the contract and the frames to
 * paths nothing reads — a project that builds, renders nothing, and reports no
 * error.
 */
function prepareProject(dir) {
  mkdirSync(join(dir, "components"), { recursive: true });
  writeFileSync(
    join(dir, ".scrollytelling-version"),
    `${JSON.stringify({ version: "test", template: "next", files: {} })}\n`,
  );
  return dir;
}

describe("frames — from a directory of stills", () => {
  let project;

  before(async () => {
    project = join(tempDir(), "site");
    prepareProject(project);
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
    prepareProject(dest);

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
    prepareProject(project);

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
    prepareProject(project);

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
    prepareProject(project);

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
    prepareProject(project);

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
    prepareProject(project);

    const { code } = await runCapturing([src, project], { frames: 2 });

    assert.equal(code, 0, "a 1px difference should be normalized, not fatal");
  });
});

describe("frames — portrait sequence", () => {
  let project;

  before(async () => {
    project = join(tempDir(), "site");
    prepareProject(project);
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
    prepareProject(dest);
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
      prepareProject(dest);
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
    prepareProject(dest);
    const src = await stillsDir(4, { width: 320, height: 180 });

    const { code, stderr } = await runCapturing([src, dest], { frames: 2, focus: 5 });

    assert.notEqual(code, 0);
    assert.match(stderr, /focus/i);
  });

  it("skips portrait when the source is already tall", async () => {
    // Cropping a portrait source to portrait would just shave its sides off
    // for no benefit.
    const dest = join(tempDir(), "site");
    prepareProject(dest);
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
    prepareProject(project);

    const { code } = await runCapturing([src, project], { frames: 20, "skip-portrait": true });

    assert.equal(code, 0, "one bad file should not cost the whole run");
  });

  it("names the file it skipped", async () => {
    const src = await mixedDir(20, [7]);
    const project = join(tempDir(), "site");
    prepareProject(project);

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
    prepareProject(project);

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
    prepareProject(project);

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
    prepareProject(project);

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
    prepareProject(project);

    const { stderr } = await runCapturing([src, project], { frames: 20, "skip-portrait": true });
    assert.match(stderr, /7/);
  });

  it("leaves a previous sequence intact when it aborts", async () => {
    const project = join(tempDir(), "site");
    prepareProject(project);

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
    prepareProject(project);

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
    prepareProject(project);

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
    prepareProject(project);

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
    prepareProject(project);

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
    prepareProject(project);

    const { stdout } = await runCapturing([src, project], { frames: 4, "skip-portrait": true });

    assert.match(stdout, /dark throughout/i);
    assert.doesNotMatch(stdout, /pulse/i);
  });

  it("does not name beats, which do not exist yet at this point", async () => {
    // The check command does that, after copy has been written.
    const src = await stillsDir(6, { width: 320, height: 180 });
    const project = join(tempDir(), "site");
    prepareProject(project);

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
    prepareProject(project);
    await runCapturing([src, project], { frames: 6, "skip-portrait": true });

    writeFileSync(
      join(project, "components/story.js"),
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
    prepareProject(bare);
    writeFileSync(join(bare, "components/story.js"), "export const story = { sections: [] };\n");

    const { code, stderr } = await runCapturing([bare], { check: true });

    assert.notEqual(code, 0);
    assert.match(stderr, /generate/i);
  });

  it("explains when there is no copy to check", async () => {
    const project = await projectWith(5, []);
    rmSync(join(project, "components/story.js"));

    const { code, stderr } = await runCapturing([project], { check: true });

    assert.notEqual(code, 0);
    assert.match(stderr, /story\.js/);
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

describe("frames — which template a project uses", () => {
  it("refuses to write into a directory whose layout it cannot determine", async () => {
    // Guessing would put the contract and the frames at paths nothing reads:
    // the project builds, renders nothing, and reports no error. That is worth
    // refusing over.
    const src = await stillsDir(2);
    const project = join(tempDir(), "site");
    mkdirSync(project, { recursive: true });

    const { code, stderr } = await runCapturing([src, project], { frames: 2 });
    assert.notEqual(code, 0);
    assert.match(stderr, /scrollytelling-version/);
    assert.match(stderr, /scaffold|--template/, "the refusal has to say how to fix it");
    assert.ok(!/^\s*at /m.test(stderr), "it must read as a sentence, not a stack trace");
  });

  it("accepts an explicit --template instead of the record", async () => {
    const src = await stillsDir(2);
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });

    const { code } = await runCapturing([src, project], { frames: 2, template: "next" });
    assert.equal(code, 0, "being able to say it explicitly is the escape hatch");
  });

  it("--check reports rather than refusing when there is no record", async () => {
    // A reporting command that refuses is the instinct readRecord's deliberate
    // silent recovery was written to avoid. Only the data-writing path errors.
    const project = join(tempDir(), "site");
    mkdirSync(join(project, "components"), { recursive: true });
    writeFileSync(join(project, "components/frames.js"), "export const SEQUENCES = [];\n");
    writeFileSync(
      join(project, "components/story.js"),
      "export const story = { brand: \"x\", title: \"x\", description: \"x\", sections: [] };\n",
    );

    const { stderr } = await runCapturing([project], { check: true });

    // It may still complain about the contract being empty — that is a real
    // thing to report. What it must never do is refuse because it could not
    // work out the template: this command only reads.
    assert.ok(
      !/scrollytelling-version/.test(stderr),
      `--check must not refuse over a missing record; stderr was ${stderr}`,
    );
  });
});

describe("where the generated contract says frames live", () => {
  // A generated page is often deployed under a subdirectory — a GitHub Pages
  // project site is at /<repo>/, not at /. The path the runtime asks for has to
  // survive that, and the failure when it does not is every frame 404ing while
  // the page itself loads fine.
  //
  // Two shapes, because the templates differ in where the frames actually sit:
  // a framework's public/ is served at the site root, while the html template
  // puts frames beside index.html, wherever that has been dropped.
  //
  // Asserted by running the emitted module rather than by matching its text, so
  // that what is checked is the url a browser would request.

  /** Import the generated contract and call its framePath, under a given page url. */
  async function framePathOf(publicDir, pageUrl) {
    const dir = tempDir();
    const file = join(dir, "frames.js");
    writeFileSync(file, renderContract([], publicDir));
    globalThis.document = { baseURI: pageUrl };
    try {
      const { framePath } = await import(pathToFileURL(file).href);
      return framePath("landscape", 3);
    } finally {
      delete globalThis.document;
    }
  }

  it("asks the site root when the frames are served from there", async () => {
    // public/frames/ -> /frames/. A page-relative path would break the moment
    // the page itself is not at the root of its own directory.
    const url = await framePathOf("public", "https://example.com/anywhere/");
    assert.equal(url, "/frames/landscape_3.webp");
  });

  it("resolves against the page when the frames sit beside it", async () => {
    const url = await framePathOf(".", "https://danhnm1203.github.io/scrollytelling/");
    assert.equal(url, "https://danhnm1203.github.io/scrollytelling/frames/landscape_3.webp");
  });

  it("still resolves when that page is at the site root", async () => {
    const url = await framePathOf(".", "https://example.com/");
    assert.equal(url, "https://example.com/frames/landscape_3.webp");
  });

  it("hands the worker something absolute", async () => {
    // The trap this exists to avoid: the engine passes these urls to a worker,
    // and a worker resolves a relative url against its own script in lib/
    // rather than against the page. Only an absolute url reads the same on
    // both threads.
    const url = await framePathOf(".", "https://example.com/base/");
    assert.equal(new URL(url, "https://example.com/base/lib/").href, url);
  });

  it("tells each template's own stub the same story", async () => {
    // The stub shipped in templates/ is what a project has before `frames` has
    // ever run. If it disagrees with the generator, the page works until the
    // first render and then changes behaviour — or the reverse, which is worse.
    for (const name of templateNames()) {
      const t = TEMPLATES[name];
      const stub = readFileSync(new URL(`../templates/${t.dir}/${t.framesPath}`, import.meta.url), "utf8");
      const body = (stub.match(/export function framePath\([^)]*\) \{\n([^\n]*)/) ?? [])[1];
      assert.equal(body, framePathSource(t.publicDir).body, `${name}'s stub has drifted`);
    }
  });
});

describe("the card a link preview shows", () => {
  // The one asset a crawler you do not control has to decode. That is why it is
  // JPEG and not webp: the frames are webp because the page decodes them and the
  // page is a browser, but a link unfurler is somebody else's code and webp
  // support across them is unverified.

  /** A real html project, scaffolded then built, because the page is the point. */
  async function build(flags = {}) {
    const project = join(tempDir(), "site");
    const quiet = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await scaffoldRun([project], { template: "html" });
    } finally {
      process.stdout.write = quiet;
    }
    const stills = await stillsDir(4, { width: 320, height: 180 });
    const { code } = await runCapturing([stills, project], { frames: 4, ...flags });
    assert.equal(code, 0, "the build should succeed");
    return project;
  }

  it("writes a card beside the frames, at the size every unfurler crops to", async () => {
    const project = await build();
    const card = join(project, CARD_FILE);
    assert.ok(existsSync(card), `expected a card at ${CARD_FILE}`);

    const meta = await sharp(card).metadata();
    assert.equal(meta.width, 1200);
    assert.equal(meta.height, 630);
    assert.equal(meta.format, "jpeg", "webp is not safe here — see this block's note");
  });

  it("is built even when nobody said where the site is", async () => {
    // The file is useful on its own; what the site url decides is whether the
    // page can POINT at it, not whether it exists.
    const project = await build();
    assert.ok(existsSync(join(project, CARD_FILE)));
  });

  it("fills the page's card tags with an absolute url", async () => {
    const project = await build({ "site-url": "https://example.com/site/" });
    const page = readFileSync(join(project, "index.html"), "utf8");
    const contentOf = (tag) =>
      (page.match(new RegExp(`<meta (?:property|name)="${tag}" content="([^"]*)"`)) ?? [])[1];

    assert.equal(contentOf("og:image"), `https://example.com/site/${CARD_FILE}`);
    assert.equal(contentOf("twitter:image"), `https://example.com/site/${CARD_FILE}`);
    assert.equal(contentOf("og:url"), "https://example.com/site/");
    assert.ok(contentOf("og:title").length > 0, "og:title should carry the story title");
  });

  it("leaves the page's image tags empty when nobody said where the site is", async () => {
    const project = await build();
    const page = readFileSync(join(project, "index.html"), "utf8");
    assert.match(page, /<meta property="og:image" content="" \/>/);
    assert.match(page, /<meta name="twitter:image" content="" \/>/);
  });

  it("does not fail the run when the card cannot be written", async () => {
    // By the time the card is written the rename has happened and the contract
    // is on disk: the frames encoded fine and the page will scrub. Failing here
    // would send someone back through the whole encode to recover work that
    // already succeeded. Loud, not fatal — the same rule the outline follows.
    const project = join(tempDir(), "site");
    const quiet = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try {
      await scaffoldRun([project], { template: "html" });
    } finally {
      process.stdout.write = quiet;
    }
    // A directory where the file wants to be: sharp cannot write over it.
    mkdirSync(join(project, CARD_FILE), { recursive: true });

    const stills = await stillsDir(3, { width: 320, height: 180 });
    const { code, stdout, stderr } = await runCapturing([stills, project], { frames: 3 });

    assert.equal(code, 0, "the frames succeeded, so the run should succeed");
    assert.ok(existsSync(join(project, "frames/landscape_0.webp")), "frames still written");
    assert.match(`${stdout}${stderr}`, /card/i, "and it has to say so");
  });

  it("ships the template with empty tags, carrying none of this repo's demo values", async () => {
    const stub = readFileSync(new URL("../templates/html/index.html", import.meta.url), "utf8");
    for (const tag of ["og:title", "og:description", "og:url", "og:image",
                       "twitter:title", "twitter:description", "twitter:image"]) {
      assert.match(
        stub,
        new RegExp(`<meta (?:property|name)="${tag}" content="" />`),
        `${tag} must ship empty`,
      );
    }
    // og:type and twitter:card are constants describing the KIND of page, not
    // copy about this one. Everything else must be empty until `frames` fills
    // it, or a scaffolded project would ship telling the world about ORBIT.
    assert.match(stub, /<meta property="og:type" content="website" \/>/);
    assert.match(stub, /<meta name="twitter:card" content="summary_large_image" \/>/);
    const valued = [...stub.matchAll(/<meta (?:property|name)="((?:og|twitter):[a-z]+)" content="([^"]+)"/g)]
      .map(([, tag]) => tag)
      .filter((tag) => tag !== "og:type" && tag !== "twitter:card");
    assert.deepEqual(valued, [], "no card tag may ship carrying copy");
  });
});

describe("where the generated contract says the site itself lives", () => {
  // A page cannot work out its own absolute address at runtime — a zero-build
  // template has no environment to read, and document.baseURI only answers for
  // the page, not for a crawler that has never fetched it. So it is recorded
  // when the frames are written, or it is not known at all.
  //
  // Asserted by running the emitted module, for the same reason as framePath
  // above: what matters is the url something would end up requesting.

  /** Import the generated contract and hand back what it exports. */
  async function contractOf(siteUrl) {
    const dir = tempDir();
    const file = join(dir, `frames-${Math.random().toString(36).slice(2)}.js`);
    writeFileSync(file, renderContract([], ".", siteUrl));
    return import(pathToFileURL(file).href);
  }

  it("says nothing at all when nobody said where the site lives", async () => {
    // Absent rather than `= null`, because the stub in templates/ is what the
    // upgrade record hashes. See the byte-identity test below for what changing
    // the stub would cost.
    const mod = await contractOf(undefined);
    assert.equal("SITE_URL" in mod, false);
  });

  it("records the base url it was given", async () => {
    const { SITE_URL } = await contractOf("https://danhnm1203.github.io/scrollytelling/");
    assert.equal(SITE_URL, "https://danhnm1203.github.io/scrollytelling/");
  });

  it("resolves to a url under the base, not beside it", async () => {
    // The whole point of the trailing slash the parser normalises to. Beside it
    // would be https://example.com/og.png — a live url serving the wrong thing,
    // which is worse than a 404 because nothing reports it.
    const { SITE_URL } = await contractOf("https://example.com/site/");
    assert.equal(new URL("og.png", SITE_URL).href, "https://example.com/site/og.png");
  });

  it("writes the same bytes as the shipped stub when nobody said", () => {
    // The real guard, and the reason the export is absent rather than null.
    //
    // components/frames.js is GENERATED, but it is also shipped as a stub, and
    // the stub is what `scaffold --diff` hashes. The planner skips any file
    // whose template hash still matches what the project recorded — so today a
    // project that has run `frames` never sees its contract mentioned at all.
    // Touch the stub and that stops being true: every existing project is told
    // its contract "changed in the template AND was edited by you", and offered
    // adoption as the remedy, which would replace real measured sequences with
    // an empty placeholder.
    //
    // Asserting against the stub keeps the two facts tied together. If a future
    // change adds an export here, this fails and points at the stub, rather
    // than the damage showing up in someone else's project after an upgrade.
    const generated = renderContract([], ".", undefined);
    for (const name of templateNames()) {
      const t = TEMPLATES[name];
      const stub = readFileSync(new URL(`../templates/${t.dir}/${t.framesPath}`, import.meta.url), "utf8");
      const exportsOf = (src) => (src.match(/^export (?:const|function) (\w+)/gm) ?? []).sort();
      assert.deepEqual(
        exportsOf(generated),
        exportsOf(stub),
        `${name}'s stub and the no-flag contract must export the same names`,
      );
    }
  });

  it("adds the export only when asked, and changes nothing else", () => {
    const without = renderContract([], ".", undefined);
    const with_ = renderContract([], ".", "https://example.com/");
    assert.ok(!without.includes("SITE_URL"), "no mention of SITE_URL without the flag");
    assert.ok(with_.includes("export const SITE_URL"), "the export appears with the flag");
    assert.equal(
      with_.replace(/\n\/\*\*(?:(?!\*\/)[\s\S])*?\*\/\nexport const SITE_URL = .*;\n/, ""),
      without,
      "with the block removed, the two must be byte-identical",
    );
  });
});
