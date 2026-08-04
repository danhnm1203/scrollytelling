/**
 * Frame extraction, measurement and encoding.
 *
 *   video or stills ──▶ sample ──▶ decode once ──▶ measure ──▶ encode ──▶ swap
 *                                       │
 *                                       ├─▶ edgeColor   the page's background
 *                                       └─▶ lumaGrid    the text scrim
 *
 * One decode per frame. The luminance grid comes from resizing straight to the
 * grid — the resampler averages each cell better and faster than doing it by
 * hand — and the edge color is read from a second small raw buffer. Measuring
 * with two dozen separate crop-and-stat calls per frame, as an earlier draft
 * did, costs roughly 29 operations per frame and makes the measurement
 * unreachable from a unit test.
 *
 * Output goes to `frames.partial/` and is renamed into place at the very end,
 * so a run that dies halfway leaves a working sequence untouched.
 */

import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";

import { edgeColor, lumaGrid, LUMA_COLS, LUMA_ROWS } from "../lib/measure.mjs";
import { naturalCompare, decimate, timestampsFor } from "../lib/sequence-plan.mjs";
import { regionLuma, maxEdgeDelta, REGIONS } from "../lib/report.mjs";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".avif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"]);

const DEFAULTS = { frames: 50, maxWidth: 1280, quality: 82 };
const PREVIEW_FRAMES = 5;

/** Aspect differences under this are a rounding artifact; over it, a mistake. */
const ASPECT_TOLERANCE = 0.02;

/** Warn above this; the page waits on every byte before it can scrub. */
const HEAVY_SEQUENCE_BYTES = 6 * 1024 * 1024;

/** How many columns the luminance table has. Six reads without wrapping. */
const REPORT_BUCKETS = 6;

/** Above this, interpolating the background between frames is visibly a pulse. */
const PULSING_BACKGROUND_DELTA = 40;

/**
 * The shape of the portrait sequence.
 *
 * 9:16 rather than a specific handset ratio: it is close enough to every tall
 * phone that `computeScale` fills the screen instead of letterboxing, without
 * cropping so hard that the subject disappears on the roomier ones.
 */
const PORTRAIT_ASPECT = 9 / 16;

class PipelineError extends Error {}

/* ------------------------------------------------------------------ deps -- */

/**
 * Both native dependencies live in this package rather than in the generated
 * project, so nothing else installs them on the user's behalf. When they are
 * missing the user needs a command, not a module-resolution stack trace.
 */
async function loadDependencies() {
  let sharp;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch (err) {
    throw new PipelineError(
      "sharp could not be loaded — it ships prebuilt binaries and has none for this platform.\n" +
        "  Try: npm install --include=optional sharp\n" +
        `  Original error: ${err.message}`,
    );
  }

  let ffmpegPath;
  try {
    ({ default: ffmpegPath } = await import("ffmpeg-static"));
  } catch (err) {
    ffmpegPath = null;
    void err;
  }

  return { sharp, ffmpegPath };
}

function requireFfmpeg(ffmpegPath) {
  if (ffmpegPath && existsSync(ffmpegPath)) return ffmpegPath;
  throw new PipelineError(
    "the bundled ffmpeg binary is missing — it downloads at install time, which a proxy or\n" +
      "an offline install can block.\n" +
      "  Try: npm rebuild ffmpeg-static",
  );
}

/* ------------------------------------------------------------------ input -- */

function classifyInput(inputPath) {
  if (!existsSync(inputPath)) {
    throw new PipelineError(`no such file or directory: ${inputPath}`);
  }

  if (statSync(inputPath).isDirectory()) {
    const files = readdirSync(inputPath)
      .filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase()))
      .sort(naturalCompare)
      .map((f) => join(inputPath, f));

    if (files.length === 0) {
      throw new PipelineError(
        `${inputPath} contains no images.\n` +
          `  Accepted extensions: ${[...IMAGE_EXTENSIONS].join(", ")}`,
      );
    }
    return { kind: "stills", files };
  }

  const ext = extname(inputPath).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return { kind: "stills", files: [inputPath] };
  if (!VIDEO_EXTENSIONS.has(ext)) {
    throw new PipelineError(
      `${inputPath} is not a recognized video or image.\n` +
        `  Videos: ${[...VIDEO_EXTENSIONS].join(", ")}`,
    );
  }
  return { kind: "video", file: inputPath };
}

/* ----------------------------------------------------------------- ffmpeg -- */

/**
 * Always an argument array, never a shell string. A path is user input, and a
 * filename containing shell metacharacters must be handled like any other.
 */
function ffmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

/** Duration in seconds, or null when the container does not report one. */
async function probeDuration(ffmpegPath, file) {
  const { stderr } = await ffmpeg(ffmpegPath, ["-i", file]);
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Extracts frames at evenly spaced timestamps.
 *
 * `-ss` before `-i` seeks first and decodes from there, so cost tracks the
 * number of frames wanted rather than the length of the clip. It has been
 * frame-accurate since ffmpeg 2.1.
 */
async function extractFromVideo(ffmpegPath, file, count, workDir) {
  const duration = await probeDuration(ffmpegPath, file);
  const files = [];
  const warnings = [];

  if (duration === null) {
    // Fragmented MP4 and variable-frame-rate sources often report no duration.
    // One decode pass is slower than seeking but always works.
    warnings.push("the source reports no duration; falling back to one decode pass");
    const pattern = join(workDir, "src_%05d.png");
    const { code, stderr } = await ffmpeg(ffmpegPath, [
      "-i",
      file,
      "-vsync",
      "0",
      "-y",
      pattern,
    ]);
    if (code !== 0) throw new PipelineError(`ffmpeg failed:\n${stderr.trim()}`);

    const produced = readdirSync(workDir).filter((f) => f.startsWith("src_")).sort(naturalCompare);
    if (produced.length === 0) throw new PipelineError("ffmpeg produced no frames from the source");
    return { files: decimate(produced, count).map((f) => join(workDir, f)), warnings };
  }

  const marks = timestampsFor(duration, count);
  for (const [i, at] of marks.entries()) {
    const out = join(workDir, `src_${String(i).padStart(5, "0")}.png`);
    const { code, stderr } = await ffmpeg(ffmpegPath, [
      "-ss",
      String(at),
      "-i",
      file,
      "-frames:v",
      "1",
      "-y",
      out,
    ]);
    if (code !== 0) throw new PipelineError(`ffmpeg failed at ${at}s:\n${stderr.trim()}`);
    if (!existsSync(out)) {
      warnings.push(`no frame at ${at.toFixed(2)}s; skipped`);
      continue;
    }
    files.push(out);
  }

  if (files.length === 0) throw new PipelineError("ffmpeg produced no frames from the source");
  return { files, warnings };
}

/* ------------------------------------------------------------- measuring -- */

/** Decodes one frame once, measures it, and writes the encoded webp. */
async function processFrame(sharp, sourcePath, targetPath, { width, height, quality, crop }) {
  const source = sharp(sourcePath);
  const pipeline = (crop ? source.extract(crop) : source).resize(width, height, { fit: "fill" });

  const [gridRaw, edgeRaw] = await Promise.all([
    pipeline.clone().resize(LUMA_COLS, LUMA_ROWS, { fit: "fill" }).removeAlpha().raw().toBuffer(),
    // Small enough to read cheaply, large enough for a meaningful border band.
    pipeline.clone().resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer(),
  ]);

  await pipeline.clone().webp({ quality }).toFile(targetPath);

  return {
    edge: edgeColor(edgeRaw, 64, 64),
    luma: lumaGrid(gridRaw, LUMA_COLS, LUMA_ROWS),
  };
}

/**
 * The dimensions every frame is resized to.
 *
 * Small aspect differences are normalized: a render that came out a pixel short
 * should not cost someone an entire run. A large one is a genuine mistake and
 * is named.
 */
async function resolveGeometry(sharp, files, maxWidth) {
  const first = await sharp(files[0]).metadata();
  const aspect = first.width / first.height;

  for (const f of files.slice(1)) {
    const meta = await sharp(f).metadata();
    const theirs = meta.width / meta.height;
    if (Math.abs(theirs - aspect) / aspect > ASPECT_TOLERANCE) {
      throw new PipelineError(
        `${basename(f)} has aspect ratio ${theirs.toFixed(3)}, but the sequence is ` +
          `${aspect.toFixed(3)}.\n  Every frame must share one shape.`,
      );
    }
  }

  const width = Math.min(maxWidth, first.width);
  return { width, height: Math.max(1, Math.round(width / aspect)) };
}

/**
 * Which sequences to build from this source.
 *
 * Landscape is always the source as shot. Portrait is a tall crop of it, so a
 * phone gets a composition framed for a phone rather than a widescreen frame
 * shrunk into the middle of the screen. `focus` aims that crop horizontally,
 * because the centre is not always where the subject is.
 *
 *   source 1280x720, focus 0.5        source 1280x720, focus 0.2
 *   +--------[====]--------+          +--[====]--------------+
 *            crop                        crop
 */
function planSequences({ width, height, maxWidth, focus, skipPortrait }) {
  const landscapeWidth = Math.min(maxWidth, width);
  const plans = [
    {
      id: "landscape",
      crop: null,
      width: landscapeWidth,
      height: Math.max(1, Math.round(landscapeWidth / (width / height))),
    },
  ];

  if (skipPortrait) return plans;

  const cropWidth = Math.round(height * PORTRAIT_ASPECT);
  if (cropWidth >= width) {
    // Already at least as tall as the portrait target. Cropping it to portrait
    // would shave the sides off for no benefit.
    return plans;
  }

  const centre = focus * width;
  const left = Math.round(Math.min(Math.max(centre - cropWidth / 2, 0), width - cropWidth));
  const portraitWidth = Math.min(maxWidth, cropWidth);

  plans.push({
    id: "portrait",
    crop: { left, top: 0, width: cropWidth, height },
    width: portraitWidth,
    height: Math.max(1, Math.round(portraitWidth / PORTRAIT_ASPECT)),
  });

  return plans;
}

/* -------------------------------------------------------------- contract -- */

function renderContract(sequences) {
  const json = JSON.stringify(
    sequences.map((s) => ({
      id: s.id,
      width: s.width,
      height: s.height,
      totalFrames: s.totalFrames,
      edgeColors: s.edgeColors,
      lumaGrid: s.lumaGrid,
    })),
    null,
    2,
  );

  return `// GENERATED by \`open-scrolltelling frames\` — do not edit.
// Re-run the command instead; editing this file makes it disagree with the
// images in public/frames/, and the page will hold one frame forever without
// reporting anything.

export type Sequence = {
  id: string;
  width: number;
  height: number;
  totalFrames: number;
  /** That frame's own border color. The page paints it behind the canvas. */
  edgeColors: readonly (readonly [number, number, number])[];
  /** ${LUMA_COLS} columns x ${LUMA_ROWS} rows, row-major, 0..1. */
  lumaGrid: readonly (readonly number[])[];
};

export const LUMA_COLS = ${LUMA_COLS};
export const LUMA_ROWS = ${LUMA_ROWS};

/**
 * Ordered by preference. The page picks whichever sequence best matches the
 * viewport; a single entry is the normal case until a portrait crop is added.
 */
export const SEQUENCES = ${json} as const satisfies readonly Sequence[];

export function framePath(sequenceId: string, index: number): string {
  return \`/frames/\${sequenceId}_\${index}.webp\`;
}
`;
}

/* ------------------------------------------------------------------- run -- */

export async function run(positionals, flags = {}) {
  try {
    return await frames(positionals, flags);
  } catch (err) {
    if (err instanceof PipelineError) {
      process.stderr.write(`open-scrolltelling: ${err.message}\n`);
      return 1;
    }
    process.stderr.write(`open-scrolltelling: ${err.message}\n`);
    return 1;
  }
}

async function frames(positionals, flags) {
  const { sharp, ffmpegPath } = await loadDependencies();

  if (flags.preview) return previewMode(positionals, flags, { sharp, ffmpegPath });

  const [inputPath, projectDir] = positionals;
  if (!inputPath || !projectDir) {
    throw new PipelineError(
      "frames needs an input and a project directory.\n" +
        "  Try: frames ./clip.mp4 ./my-site\n" +
        "  Or:  frames --preview ./clip.mp4",
    );
  }

  const requested = Number(flags.frames ?? DEFAULTS.frames);
  const maxWidth = Number(flags["max-width"] ?? flags.maxWidth ?? DEFAULTS.maxWidth);
  const quality = Number(flags.quality ?? DEFAULTS.quality);
  const focus = Number(flags.focus ?? 0.5);
  const skipPortrait = Boolean(flags["skip-portrait"]);

  if (!Number.isFinite(focus) || focus < 0 || focus > 1) {
    throw new PipelineError(
      `--focus must be between 0 and 1 (left edge to right edge); got ${flags.focus}.`,
    );
  }

  const input = classifyInput(inputPath);
  const workDir = mkdtempSync(join(tmpdir(), "ost-work-"));
  const partial = join(projectDir, "public", "frames.partial");
  const final = join(projectDir, "public", "frames");

  try {
    const { sources, warnings } = await gatherSources(input, requested, workDir, ffmpegPath);

    if (sources.length < requested) {
      warnings.push(`only ${sources.length} frames available; using all of them`);
    }

    const source = await resolveGeometry(sharp, sources, maxWidth);
    const plans = planSequences({ ...source, maxWidth, focus, skipPortrait });

    if (!skipPortrait && plans.length === 1) {
      warnings.push("the source is already tall, so no separate portrait sequence was needed");
    }

    rmSync(partial, { recursive: true, force: true });
    mkdirSync(partial, { recursive: true });

    const sequences = [];
    let bytes = 0;

    for (const plan of plans) {
      const edgeColors = [];
      const lumaGridRows = [];

      for (const [i, sourceFrame] of sources.entries()) {
        const target = join(partial, `${plan.id}_${i}.webp`);
        const { edge, luma } = await processFrame(sharp, sourceFrame, target, {
          width: plan.width,
          height: plan.height,
          crop: plan.crop,
          quality,
        });
        edgeColors.push(edge);
        lumaGridRows.push(luma);
        bytes += statSync(target).size;
      }

      sequences.push({
        id: plan.id,
        width: plan.width,
        height: plan.height,
        totalFrames: sources.length,
        edgeColors,
        lumaGrid: lumaGridRows,
      });
    }

    // Everything succeeded: swap the new sequences in and write the contract.
    // Until this point a failure leaves the previous ones untouched.
    rmSync(final, { recursive: true, force: true });
    renameSync(partial, final);

    mkdirSync(join(projectDir, "components"), { recursive: true });
    writeFileSync(join(projectDir, "components", "frames.ts"), renderContract(sequences));

    report({ sequences, bytes, warnings });
    return 0;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(partial, { recursive: true, force: true });
  }
}

async function gatherSources(input, requested, workDir, ffmpegPath) {
  if (input.kind === "stills") {
    return { sources: decimate(input.files, requested), warnings: [] };
  }
  const { files, warnings } = await extractFromVideo(
    requireFfmpeg(ffmpegPath),
    input.file,
    requested,
    workDir,
  );
  return { sources: files, warnings };
}

async function previewMode(positionals, flags, { sharp, ffmpegPath }) {
  const [inputPath] = positionals;
  if (!inputPath) throw new PipelineError("preview needs a video or a directory of stills");

  const input = classifyInput(inputPath);
  const outDir = mkdtempSync(join(tmpdir(), "ost-preview-"));
  const workDir = mkdtempSync(join(tmpdir(), "ost-work-"));

  try {
    const { sources } = await gatherSources(input, PREVIEW_FRAMES, workDir, ffmpegPath);
    for (const [i, source] of sources.entries()) {
      await sharp(source)
        .resize(640, null, { withoutEnlargement: true })
        .png()
        .toFile(join(outDir, `preview_${i}.png`));
    }

    process.stdout.write(
      `Wrote ${sources.length} preview frames to ${outDir}\n\n` +
        "Look at them, then write your copy against what the footage is doing.\n",
    );
    return 0;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function report({ sequences, bytes, warnings }) {
  const mb = (bytes / 1024 / 1024).toFixed(2);
  const total = sequences.reduce((n, s) => n + s.totalFrames, 0);
  const shapes = sequences.map((s) => `${s.id} ${s.width}x${s.height}`).join(", ");
  const lines = [`Wrote ${total} frames across ${shapes} (${mb} MB)`];

  if (bytes > HEAVY_SEQUENCE_BYTES) {
    lines.push(
      "  This is heavy. Consider fewer frames or a smaller --max-width.",
    );
  }

  for (const w of warnings) lines.push(`  note: ${w}`);

  // No beat attribution here: beats do not exist yet at this point in the
  // workflow. This is the raw picture the copy gets written against.
  for (const sequence of sequences) {
    lines.push("", ...describeSequence(sequence));
  }

  lines.push(
    "",
    "Write your copy against that, then check it:",
    "  open-scrolltelling frames --check <project_dir>",
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}

/** "left", "left and centre", "left, centre and right". */
function listOf(items) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** The luminance table and background behaviour for one sequence. */
function describeSequence(sequence) {
  const table = regionLuma(sequence, REPORT_BUCKETS);
  const headers = Array.from({ length: REPORT_BUCKETS }, (_, b) =>
    `${Math.round((b / REPORT_BUCKETS) * 100)}%`.padStart(5),
  );

  const lines = [
    `${sequence.id} — how bright the footage is, by region and scroll position`,
    `        ${headers.join("")}`,
  ];

  for (const region of REGIONS) {
    const cells = table[region].map((v) => v.toFixed(2).padStart(5)).join("");
    lines.push(`  ${region.padEnd(6)}${cells}`);
  }

  const bright = REGIONS.filter((r) => Math.max(...table[r]) > 0.6);
  const where =
    bright.length === REGIONS.length ? "anywhere" : `over ${listOf(bright)}`;
  lines.push(
    bright.length
      ? `  Copy ${where} will need a heavy scrim somewhere in the scroll.`
      : "  Dark throughout; copy will sit on the footage with almost no scrim.",
  );

  const { delta, from, to } = maxEdgeDelta(sequence);
  if (delta > PULSING_BACKGROUND_DELTA) {
    lines.push(
      `  Background jumps ${delta}/255 between frames ${from} and ${to} — that will`,
      "  pulse as the page scrubs. More frames would smooth it out.",
    );
  }

  return lines;
}
