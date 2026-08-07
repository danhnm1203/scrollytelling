/**
 * What a sample build decides, before anything is written.
 *
 * Not shipped: `tools/` is outside `files` in package.json, because a generated
 * project has no use for it. Same reason `ci/` is outside it.
 *
 * Split from the runner for the same reason `ci/template-build.mjs` is split
 * from `ci/build-template.mjs`: the decisions are worth testing and the
 * installing, spawning and writing are not worth testing cheaply. Everything
 * here is pure — no fs, no spawn, no process.exit.
 */

import { BUILD_PLANS } from "../ci/template-build.mjs";

/**
 * Where a sample build may go: a dot-prefixed `.sample-…` directory, and
 * nothing else. `.gitignore` covers exactly this shape, so the promise that a
 * sample build cannot be committed holds for every path this accepts rather
 * than only for the default. An unconstrained `--out` would write an untracked
 * project into the repository root, and a generated project's `public/frames/`
 * is the one thing this repository forbids ignoring.
 */
const OUT_SHAPE = /^\.sample[\w.-]*$/;

/** Enough frames to feel like the real thing rather than a flipbook. */
const DEFAULT_FRAMES = 50;

/**
 * How each template is started once it is built. The three with a package.json
 * agree on `npm run dev`; `html` deliberately has neither an install nor a dev
 * server, so it carries a note instead of a command.
 */
const DEV = {
  next: ["npm", "run", "dev"],
  nuxt: ["npm", "run", "dev"],
  astro: ["npm", "run", "dev"],
  html: null,
};

const NOTES = {
  html:
    "The html template has nothing to install and no dev server — that is its " +
    "whole claim. It does need a real HTTP server, though: module scripts and " +
    "workers are same-origin only, so opening index.html from the filesystem " +
    "will not work.",
};

/**
 * @typedef {object} SamplePlan
 * @property {string} template      which template to scaffold
 * @property {string} out           where the project goes, relative to the repo
 * @property {string | null} clip   footage to use, or null to synthesise one
 * @property {string | null} story  copy to write over the template's own, or null
 * @property {string | null} sections  page markup to put under the scroll, or null
 * @property {number} frames        how many frames in the sequence
 * @property {string[] | null} install argv to install dependencies, or null
 * @property {string[] | null} dev     argv to start it, or null
 * @property {string | null} siteUrl  where the built page will be served from, or null
 * @property {string} note          anything the runner should say afterwards
 */

/**
 * Read the arguments of a sample build.
 *
 * Throws on anything it does not understand rather than ignoring it: a
 * misspelled flag that is silently dropped builds the wrong thing and reports
 * success, which is the one outcome nobody can debug.
 *
 * @param {string[]} argv
 * @returns {SamplePlan}
 */
export function planSample(argv) {
  const given = new Map();

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];

    if (!flag.startsWith("--")) throw new Error(`unexpected argument "${flag}"`);
    if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value`);
    if (value === "") throw new Error(`${flag} was given an empty value`);
    // Taking the last of a repeated flag would build something other than what
    // was asked for and say nothing about it.
    if (given.has(flag)) throw new Error(`${flag} was given twice`);
    if (
      !["--template", "--out", "--clip", "--frames", "--story", "--sections", "--site-url"].includes(
        flag,
      )
    ) {
      throw new Error(`unknown option "${flag}"`);
    }

    given.set(flag, value);
    i += 1;
  }

  const template = given.get("--template") ?? "next";
  const build = BUILD_PLANS[template];
  if (!build) {
    throw new Error(
      `unknown template "${template}" — expected one of: ${Object.keys(BUILD_PLANS).join(", ")}`,
    );
  }
  if (!(template in DEV)) {
    throw new Error(`template "${template}" has no recorded way to be started`);
  }

  // One directory per template, so switching templates does not scaffold over a
  // project generated from a different one — which the scaffolder refuses.
  const out = given.get("--out") ?? `.sample-${template}`;
  if (!OUT_SHAPE.test(out)) {
    throw new Error(`--out must be a .sample… directory in this repository, got "${out}"`);
  }

  return {
    template,
    out,
    clip: given.get("--clip") ?? null,
    story: given.get("--story") ?? null,
    sections: given.get("--sections") ?? null,
    // Passed through unvalidated on purpose: `frames` already refuses a
    // relative url, a scheme no crawler will fetch, and a base carrying a
    // query, and it normalises the trailing slash. A second validator here
    // would be a second thing to keep in step.
    siteUrl: given.get("--site-url") ?? null,
    frames: given.has("--frames") ? readCount(given.get("--frames")) : DEFAULT_FRAMES,
    install: build.install,
    dev: DEV[template],
    note: NOTES[template] ?? "",
  };
}

/** A frame count, or an error naming what was actually passed. */
function readCount(value) {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`--frames needs a positive whole number, got "${value}"`);
  }
  return Number(value);
}
