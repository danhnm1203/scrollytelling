/**
 * Whole-pipeline golden master.
 *
 * The one test that exercises everything at once: a clip is synthesized, run
 * through the real command, and the measured values in the generated contract
 * are asserted. It covers the part nobody can check by eye — whether the
 * numbers the page depends on are actually right.
 *
 * The fixture is deliberately varied in three independent ways, because a
 * uniform one makes this test vacuous. An earlier version used three flat grey
 * segments and passed unchanged when the luma coefficients were altered, when
 * edge sampling was reduced to one side, and when frame sampling was shifted —
 * on a flat grey clip none of those are observable.
 *
 *   colour changes every frame  ->  catches sampling the wrong moment
 *   colours are not grey        ->  catches wrong luma coefficients
 *   a bright stripe on top only ->  catches sampling only some edges
 *
 * This is why sharp and ffmpeg-static are pinned exactly in package.json.
 * Upgrading either is deliberate work that includes re-deriving these values.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { after, before, describe, it } from "node:test";

import sharp from "sharp";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));

const WIDTH = 320;
const HEIGHT = 180;
const SOURCE_FRAMES = 25;
const STRIPE_HEIGHT = 30;
const SAMPLED = 5;

/** Recorded from the pinned sharp and ffmpeg-static, on macOS arm64. */
const EXPECTED_EDGES = [
  [214, 108, 108],
  [124, 161, 82],
  [82, 169, 188],
  [114, 145, 227],
  [219, 90, 126],
];

/**
 * How far a channel may sit from the recorded value.
 *
 * Not slack for convenience: libvips and ffmpeg are built differently on each
 * platform, and the same pinned versions produce values a point or two apart on
 * Linux and macOS. Asserting exact equality made this test pass only on the
 * machine that recorded it, which CI found immediately.
 *
 * Three is comfortably above the observed platform spread and far below any
 * real regression — reading one edge instead of four moves these by a hundred
 * or more, and sampling the wrong moment changes the hue outright.
 */
const CHANNEL_TOLERANCE = 3;

const temps = [];
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), "ost-golden-"));
  temps.push(d);
  return d;
}
after(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

/** Hue sweeping across the clip, with a bright stripe along the top edge only. */
async function makeClip(dir) {
  const src = join(dir, "src");
  mkdirSync(src, { recursive: true });

  for (let i = 0; i < SOURCE_FRAMES; i++) {
    const body = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
      .modulate({ hue: Math.round((i / SOURCE_FRAMES) * 360) })
      .png()
      .toBuffer();

    await sharp(body)
      .composite([
        {
          input: {
            create: {
              width: WIDTH,
              height: STRIPE_HEIGHT,
              channels: 3,
              background: { r: 250, g: 250, b: 250 },
            },
          },
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toFile(join(src, `f_${String(i).padStart(2, "0")}.png`));
  }

  const clip = join(dir, "varied.mp4");
  await run(ffmpegPath, [
    "-framerate", "25",
    "-i", join(src, "f_%02d.png"),
    "-pix_fmt", "yuv420p",
    "-y", clip,
  ]);
  return clip;
}

async function pipeline(dir) {
  const clip = await makeClip(dir);
  const project = join(dir, "site");

  // Scaffold first, because that is the pipeline. `frames` refuses a directory
  // whose template it cannot determine — guessing would write the contract and
  // the frames to paths nothing reads.
  await run(process.execPath, [CLI, "scaffold", project]);

  await run(process.execPath, [
    CLI, "frames", clip, project, "--frames", String(SAMPLED), "--skip-portrait",
  ]);
  const source = readFileSync(join(project, "components/frames.ts"), "utf8");
  const m = /SEQUENCES\s*=\s*(\[[\s\S]*?\])\s*as const/.exec(source);
  assert.ok(m, "expected a SEQUENCES array in the generated contract");
  return { project, sequence: JSON.parse(m[1])[0] };
}

describe("golden master — a clip through the whole pipeline", () => {
  let project;
  let sequence;

  before(async () => {
    ({ project, sequence } = await pipeline(tempDir()));
  });

  it("writes one encoded frame per requested frame", () => {
    const files = readdirSync(join(project, "public/frames")).filter((f) => f.endsWith(".webp"));
    assert.equal(files.length, SAMPLED);
    assert.equal(sequence.totalFrames, SAMPLED);
  });

  it("keeps the source dimensions when they are under the width cap", () => {
    assert.equal(sequence.width, WIDTH);
    assert.equal(sequence.height, HEIGHT);
  });

  it("measures the recorded border colors", () => {
    // What fails if sharp or ffmpeg change behaviour. Compared per channel with
    // a tolerance rather than deep-equal, so a platform's build of libvips
    // cannot fail it for being a point out.
    assert.equal(sequence.edgeColors.length, EXPECTED_EDGES.length);

    sequence.edgeColors.forEach((actual, frame) => {
      const expected = EXPECTED_EDGES[frame];
      actual.forEach((value, channel) => {
        const drift = Math.abs(value - expected[channel]);
        assert.ok(
          drift <= CHANNEL_TOLERANCE,
          `frame ${frame} channel ${channel}: ${value} vs recorded ${expected[channel]} ` +
            `(drift ${drift}, allowed ${CHANNEL_TOLERANCE})`,
        );
      });
    });
  });

  it("samples a different moment for every frame", () => {
    // Proves the recorded values above come from walking the clip rather than
    // repeating one moment. A sampling bug would collapse these.
    const seen = new Set(sequence.edgeColors.map((c) => c.join(",")));
    assert.equal(seen.size, SAMPLED, "every sampled frame should differ");
  });

  it("reads all four edges, not just one", () => {
    // The top stripe is near-white and everything else is saturated colour. A
    // reader that took only the top would report near-white for every frame.
    for (const [r, g, b] of sequence.edgeColors) {
      const min = Math.min(r, g, b);
      assert.ok(min < 235, `border ${r},${g},${b} looks like the top stripe alone`);
    }
  });

  it("measures colour, not brightness alone", () => {
    // Grey borders would mean the channels were being flattened somewhere.
    const spreads = sequence.edgeColors.map(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b));
    assert.ok(Math.max(...spreads) > 60, `expected saturated borders, spreads: ${spreads}`);
  });

  it("gives every frame a full luminance grid", () => {
    assert.equal(sequence.lumaGrid.length, SAMPLED);
    for (const cells of sequence.lumaGrid) assert.equal(cells.length, 24);
  });

  it("sees the bright stripe in the top row and not below it", () => {
    // The stripe covers the top sixth of the frame, so it lands in row 0 only.
    for (const [i, cells] of sequence.lumaGrid.entries()) {
      const topRow = cells.slice(0, 6);
      const lowerRows = cells.slice(6);
      assert.ok(
        Math.min(...topRow) > Math.max(...lowerRows),
        `frame ${i}: top row ${topRow[0].toFixed(2)} should exceed the rest`,
      );
    }
  });

  it("measures a different luminance for every sampled frame", () => {
    // The luma grid must walk the clip too, not just the border colors. An
    // earlier version of this test tried to re-derive the Rec. 709 weighting
    // from here and was wrong to: it compared border hue against body
    // brightness, and cyan is legitimately brighter than olive green. The
    // coefficients are asserted directly in measure.test.js, which is the level
    // they belong at.
    const bodyLuma = sequence.lumaGrid.map(
      (cells) => cells.slice(6).reduce((a, b) => a + b, 0) / 18,
    );
    const rounded = new Set(bodyLuma.map((v) => v.toFixed(3)));
    assert.equal(rounded.size, SAMPLED, `expected ${SAMPLED} distinct values, got ${[...rounded]}`);
  });

  it("produces identical output when run again", async () => {
    // Determinism. Without it none of the values above mean anything — they
    // would just be whatever the last run happened to produce.
    const { project: second, sequence: again } = await pipeline(tempDir());

    assert.deepEqual(again.edgeColors, sequence.edgeColors);
    assert.deepEqual(again.lumaGrid, sequence.lumaGrid);

    for (let i = 0; i < SAMPLED; i++) {
      const a = readFileSync(join(project, `public/frames/landscape_${i}.webp`));
      const b = readFileSync(join(second, `public/frames/landscape_${i}.webp`));
      assert.ok(a.equals(b), `frame ${i} differs between runs`);
    }
  });
});
