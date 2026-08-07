/**
 * Build a sample site in this repository, to look at.
 *
 *   npm run sample
 *   npm run sample -- --template astro
 *   npm run sample -- --clip ./my-footage.mp4 --frames 80
 *   npm run sample -- --story ./tools/demo-story.js
 *
 * Scaffolds a project into `.sample-<template>/`, runs the real pipeline over
 * it, installs, and starts the dev server. Everything it writes is gitignored
 * and outside `files` in package.json, so a sample build can never reach anyone
 * else — not in a clone, not in a publish.
 *
 * The published demo page is this, run by .github/workflows/pages.yml with the
 * html template and --story.
 *
 * Not shipped, and not part of `npm test`: this installs from the network and
 * spawns a server. The decisions it makes before any of that are pure and live
 * in `sample-plan.mjs`, which is where the tests are.
 *
 * With no `--clip`, the footage is synthesised rather than committed, for the
 * reason `ci/build-template.mjs` gives: a repository that carries video fixtures
 * grows by megabytes per format change. Its generator is deliberately NOT reused
 * here — that one is sized for a build gate and looks like a colour ramp,
 * because nobody watches it. This one is looked at, so it has motion worth
 * measuring: a light sweeps across a dark field, which is what makes the
 * per-frame border colour and the copy backdrop visibly do something.
 *
 * The published page passes `--clip tools/demo-clip.mp4`, real footage committed
 * as a deliberate exception — see the note in .github/workflows/pages.yml.
 */

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

import { withSections } from "./demo-page.mjs";
import { planSample } from "./sample-plan.mjs";

const run = promisify(execFile);

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const REPO = fileURLToPath(new URL("..", import.meta.url));

const CLIP_WIDTH = 960;
const CLIP_HEIGHT = 540;
const CLIP_FRAMES = 60;

const log = (message) => process.stdout.write(`${message}\n`);

/**
 * A clip worth scrubbing: a warm light sweeping across a deep blue field.
 *
 * The sweep is the point. A still gradient would encode fine and prove nothing,
 * because the two measurements this tool takes — each frame's border colour and
 * the brightness under each block of copy — only show themselves when what is
 * behind the copy changes as you scroll.
 */
async function makeClip(dir) {
  const src = join(dir, "src");
  await mkdir(src, { recursive: true });

  const pixels = Buffer.alloc(CLIP_WIDTH * CLIP_HEIGHT * 3);
  const light = new Float64Array(CLIP_WIDTH);

  for (let f = 0; f < CLIP_FRAMES; f += 1) {
    const centre = (f / (CLIP_FRAMES - 1)) * CLIP_WIDTH;
    const sigma = CLIP_WIDTH / 5;

    // The sweep depends only on x, so it is computed once per frame rather
    // than once per pixel — half a million exponentials a frame otherwise.
    for (let x = 0; x < CLIP_WIDTH; x += 1) {
      const d = (x - centre) / sigma;
      light[x] = Math.exp(-d * d) * 190;
    }

    for (let y = 0; y < CLIP_HEIGHT; y += 1) {
      // A vertical fall-off, so the top of the frame is darker than the bottom
      // and copy aligned to the top has somewhere safe to sit.
      const depth = 1 - y / CLIP_HEIGHT;
      for (let x = 0; x < CLIP_WIDTH; x += 1) {
        const i = (y * CLIP_WIDTH + x) * 3;
        pixels[i] = clamp(18 * depth + light[x]);
        pixels[i + 1] = clamp(32 * depth + light[x] * 0.92);
        pixels[i + 2] = clamp(78 * depth + light[x] * 0.72);
      }
    }

    await sharp(pixels, { raw: { width: CLIP_WIDTH, height: CLIP_HEIGHT, channels: 3 } })
      .png()
      .toFile(join(src, `f_${String(f).padStart(3, "0")}.png`));
  }

  const clip = join(dir, "clip.mp4");
  await run(ffmpegPath, [
    "-framerate",
    "25",
    "-i",
    join(src, "f_%03d.png"),
    "-pix_fmt",
    "yuv420p",
    "-y",
    clip,
  ]);
  return clip;
}

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

/** Run a command with its output attached to this terminal, and fail loudly. */
function passthrough(argv, cwd) {
  return new Promise((ok, fail) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: "inherit" });
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`${argv.join(" ")} exited ${code}`)),
    );
  });
}

async function main() {
  const plan = planSample(process.argv.slice(2));
  const project = resolve(REPO, plan.out);

  let scratch = null;
  let clip = plan.clip ? resolve(process.cwd(), plan.clip) : null;

  if (clip && !existsSync(clip)) throw new Error(`no such clip: ${plan.clip}`);

  try {
    if (!clip) {
      log(`synthesising a clip — pass --clip <file> to use your own footage`);
      scratch = await mkdtemp(join(tmpdir(), "scrollytelling-sample-"));
      clip = await makeClip(scratch);
    }

    log(`scaffolding the ${plan.template} template into ${plan.out}/`);
    await run(process.execPath, [CLI, "scaffold", project, "--template", plan.template], {
      cwd: REPO,
    });

    if (plan.story) {
      // Before frames rather than after: the html template has no render step,
      // so `frames` is what writes the story outline into the page. Copying the
      // story afterwards would leave the outline describing the old copy — and
      // that outline is what a screen reader and a crawler read.
      const story = resolve(process.cwd(), plan.story);
      if (!existsSync(story)) throw new Error(`no such story: ${plan.story}`);
      log(`writing the copy from ${plan.story}`);
      await copyFile(story, join(project, "components", "story.js"));
    }

    if (plan.sections) {
      // Under the runway, so it is what a visitor reaches after the scroll
      // rather than something competing with it. The template's own page ends
      // at the hero; the README has always said the rest of the page goes here,
      // and this is the demo showing it.
      const sections = resolve(process.cwd(), plan.sections);
      if (!existsSync(sections)) throw new Error(`no such sections file: ${plan.sections}`);
      log(`putting ${plan.sections} under the scroll`);
      const pagePath = join(project, "index.html");
      const page = await readFile(pagePath, "utf8");
      await writeFile(pagePath, withSections(page, await readFile(sections, "utf8")));
    }

    log(`measuring and encoding ${plan.frames} frames — this is the slow part`);
    await run(process.execPath, [CLI, "frames", clip, project, "--frames", String(plan.frames)], {
      cwd: REPO,
      maxBuffer: 32 * 1024 * 1024,
    });

    if (plan.install) {
      log(`installing: ${plan.install.join(" ")}`);
      await passthrough(plan.install, project);
    }

    if (plan.note) log(`\n${plan.note}`);

    if (!plan.dev) {
      log(`\nBuilt in ${plan.out}/. Serve that directory with any static server.`);
      return 0;
    }

    log(`\nStarting ${plan.dev.join(" ")} in ${plan.out}/ — Ctrl-C to stop.\n`);
    await passthrough(plan.dev, project);
    return 0;
  } finally {
    // Reported rather than thrown: this runs while an earlier failure may be on
    // its way up, and a cleanup error that replaced it would hide the reason
    // the build actually stopped. This repository does not have silent
    // failures, so it is said out loud instead.
    if (scratch) {
      await rm(scratch, { recursive: true, force: true }).catch((err) =>
        log(`warning: could not remove the scratch directory ${scratch}: ${err.message}`),
      );
    }
  }
}

try {
  process.exit((await main()) ?? 0);
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
}
