/**
 * The per-template build gate: scaffold a template, run the real pipeline over
 * a synthesised clip, build it, and check the build emitted what the page needs.
 *
 *   node ci/build-template.mjs <template>
 *
 * Not part of the offline suite, and deliberately so. This installs from the
 * network and runs a bundler, which is minutes and a connection; `npm test`
 * runs in about a second and has to stay that way. Continuous integration is
 * where the slow, honest check lives.
 *
 * The clip is synthesised rather than committed, the same way the golden-master
 * test does it — a repository that carries video fixtures grows by megabytes
 * per format change.
 *
 * What this catches that nothing else does: three templates share one engine
 * now, so a mistake in lib/ breaks all of them, and it breaks them by emitting
 * nothing rather than by failing. See ci/template-build.mjs for the artifacts
 * and why each one is on the list.
 */

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

import { ARTIFACTS, GATE_SITE_URL, BUILD_PLANS, missingArtifacts } from "./template-build.mjs";

const run = promisify(execFile);

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));


const REPO = fileURLToPath(new URL("..", import.meta.url));

const FRAME_COUNT = 12;
const SAMPLED = 6;
const WIDTH = 320;
const HEIGHT = 180;

/** Extensions worth reading as text. Everything else is matched by path alone. */
const TEXTUAL = new Set([".js", ".mjs", ".cjs", ".css", ".html", ".json", ".map", ".ts"]);

function log(message) {
  process.stdout.write(`${message}\n`);
}

/**
 * A short clip whose frames differ from each other.
 *
 * Identical frames would let a broken measurement pass: the readability check
 * exists to notice brightness changing under the copy, and it cannot fail on
 * footage that never changes.
 */
async function makeClip(dir) {
  const src = join(dir, "src");
  await mkdir(src, { recursive: true });

  for (let i = 0; i < FRAME_COUNT; i += 1) {
    const shade = Math.round((i / (FRAME_COUNT - 1)) * 255);
    await sharp({
      create: {
        width: WIDTH,
        height: HEIGHT,
        channels: 3,
        background: { r: shade, g: 40, b: 255 - shade },
      },
    })
      .png()
      .toFile(join(src, `f_${String(i).padStart(2, "0")}.png`));
  }

  const clip = join(dir, "clip.mp4");
  await run(ffmpegPath, [
    "-framerate", "25",
    "-i", join(src, "f_%02d.png"),
    "-pix_fmt", "yuv420p",
    "-y", clip,
  ]);
  return clip;
}

/** Every file under `dir`, as {path, text}. Binary files carry an empty text. */
async function collect(dir, root = dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return out;
    throw error;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);

    // node_modules is an install, not a build output. Walking it would take
    // minutes and would happily satisfy every artifact from the source copies
    // of the very files we are checking got emitted.
    if (entry.name === "node_modules" || entry.name === ".git") continue;

    if (entry.isDirectory()) {
      await collect(full, root, out);
    } else {
      const text = TEXTUAL.has(extname(entry.name)) ? await readFile(full, "utf8") : "";
      out.push({ path: relative(root, full), text });
    }
  }
  return out;
}

async function main() {
  const template = process.argv[2];
  const plan = BUILD_PLANS[template];

  if (!plan) {
    const known = Object.keys(BUILD_PLANS).join(", ");
    throw new Error(`unknown template "${template ?? ""}" — expected one of: ${known}`);
  }

  const dir = await mkdtemp(join(tmpdir(), "scrollytelling-gate-"));
  const project = join(dir, "site");

  try {
    log(`[${template}] synthesising a clip`);
    const clip = await makeClip(dir);

    log(`[${template}] scaffolding`);
    await run(process.execPath, [CLI, "scaffold", project, "--template", template], {
      cwd: REPO,
    });

    log(`[${template}] measuring and encoding frames`);
    await run(
      process.execPath,
      // A site url, so the build has a card to emit. Without one the card tags
      // are empty by design, and a gate that only ever sees the empty case
      // cannot tell a template that fills them from one that does not.
      [
        CLI,
        "frames",
        clip,
        project,
        "--frames",
        String(SAMPLED),
        "--skip-portrait",
        "--site-url",
        GATE_SITE_URL,
      ],
      { cwd: REPO },
    );

    if (plan.install) {
      log(`[${template}] ${plan.install.join(" ")}`);
      await run(plan.install[0], plan.install.slice(1), { cwd: project });
    }

    if (plan.build) {
      log(`[${template}] ${plan.build.join(" ")}`);
      const { stdout, stderr } = await run(plan.build[0], plan.build.slice(1), {
        cwd: project,
        // Bundler output is verbose and Next in particular is chatty. The
        // default 1MB buffer is not enough, and overflowing it fails the build
        // for a reason that has nothing to do with the build.
        maxBuffer: 32 * 1024 * 1024,
      });
      log(stdout || stderr);
    } else {
      log(`[${template}] no build step — that is the point of this template`);
    }

    const searched = [plan.outDir, ...plan.alsoSearch];
    const files = [];
    for (const sub of searched) {
      files.push(...(await collect(join(project, sub))));
    }
    log(`[${template}] checking ${files.length} emitted files in ${searched.join(", ")}`);

    const missing = missingArtifacts(files);
    if (missing.length > 0) {
      throw new Error(
        `the ${template} build emitted no ${missing.join(", and no ")}.\n` +
          "The build exiting 0 does not mean the page works — see ci/template-build.mjs.",
      );
    }

    const how = plan.build ? "built output" : "scaffolded tree (this template has no build)";
    // Named from ARTIFACTS rather than written out, so adding one cannot leave
    // this line quietly claiming less than the gate checked.
    log(`[${template}] OK — ${ARTIFACTS.map((a) => a.name).join(", ")} all in the ${how}`);
  } finally {
    // Best effort: a gate that fails because it could not delete a temp
    // directory reports the wrong problem. Said out loud all the same — a
    // cleanup that quietly stops working fills a CI runner's disk over weeks,
    // and this repository does not have silent failures.
    await rm(dir, { recursive: true, force: true }).catch((error) => {
      log(`[${template}] warning: could not remove ${dir} — ${error.message}`);
    });
  }
}

main().catch((error) => {
  process.stderr.write(`\n${error.message}\n`);
  if (error.stderr) process.stderr.write(`${error.stderr}\n`);
  process.exitCode = 1;
});
