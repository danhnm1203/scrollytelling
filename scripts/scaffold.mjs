/**
 * Copies `templates/` into a new project directory.
 *
 * Depends only on `node:fs` — no sharp, no ffmpeg. That is deliberate: this is
 * the one command that must work before anything else is installed.
 *
 * The rule that matters: an existing file is never replaced unless the caller
 * asks for it. Once a project is generated it belongs to whoever generated it,
 * and silently rewriting their edits would make re-running this something to be
 * afraid of.
 *
 *   templates/                <project_dir>/
 *     package.json        ──▶   package.json
 *     app/…               ──▶   app/…
 *     gitignore.template  ──▶   .gitignore     (renamed; see RENAMES)
 */

import { readdirSync, statSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));

/**
 * Template files whose name differs from their name in the project.
 * `.gitignore` cannot ship inside an npm package under that name — npm rewrites
 * it during packing — so it travels as `gitignore.template`.
 */
const RENAMES = new Map([["gitignore.template", ".gitignore"]]);

/**
 * Files copied from outside `templates/`, as [source, path in the project].
 *
 * The display math is deliberately NOT duplicated under templates/. One copy
 * in this repo means it cannot drift from the version the tests cover — a
 * checked-in duplicate would be a fork the moment someone edited one of them.
 */
const EXTRA_FILES = [
  ["../lib/scroll-math.mjs", "lib/scroll-math.mjs"],
  ["../lib/scroll-math.d.ts", "lib/scroll-math.d.ts"],
];

class ScaffoldError extends Error {}

/**
 * Deterministic across platforms, unlike the default sort, which is
 * locale-sensitive. The report has to read the same everywhere.
 */
function byCodePoint(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Every file under `templates/`, as paths relative to it. */
function templateFiles(dir = TEMPLATES, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...templateFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort(byCodePoint);
}

/** Where a template file lands inside the generated project. */
function targetName(relPath) {
  const parts = relPath.split("/");
  const renamed = RENAMES.get(parts[parts.length - 1]);
  if (renamed) parts[parts.length - 1] = renamed;
  return parts.join("/");
}

export async function run(positionals, flags = {}) {
  try {
    return scaffold(positionals, flags);
  } catch (err) {
    if (err instanceof ScaffoldError) {
      process.stderr.write(`open-scrolltelling: ${err.message}\n`);
      return 1;
    }
    // Anything else is still ours to explain. A permission error should read as
    // a sentence, not as a stack trace the user has to decode.
    process.stderr.write(`open-scrolltelling: could not scaffold — ${err.message}\n`);
    return 1;
  }
}

function scaffold(positionals, flags) {
  const [projectDir] = positionals;
  if (!projectDir) {
    throw new ScaffoldError("scaffold needs a project directory. Try: scaffold ./my-site");
  }

  if (existsSync(projectDir) && !statSync(projectDir).isDirectory()) {
    throw new ScaffoldError(`${projectDir} exists and is not a directory.`);
  }

  const written = [];
  const skipped = [];
  const overwrote = [];

  const sources = [
    ...templateFiles().map((rel) => [join(TEMPLATES, rel), targetName(rel)]),
    ...EXTRA_FILES.map(([from, to]) => [fileURLToPath(new URL(from, import.meta.url)), to]),
  ];

  for (const [sourcePath, name] of sources) {
    const target = join(projectDir, name);

    if (existsSync(target)) {
      if (!flags.force) {
        skipped.push(name);
        continue;
      }
      overwrote.push(name);
    } else {
      written.push(name);
    }

    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(sourcePath, target);
  }

  report({ projectDir, written, skipped, overwrote, forced: Boolean(flags.force) });
  return 0;
}

function report({ projectDir, written, skipped, overwrote, forced }) {
  const plural = (n) => (n === 1 ? "" : "s");
  const lines = [];

  if (written.length) {
    lines.push(`Created ${written.length} file${plural(written.length)} in ${projectDir}`);
  }
  if (overwrote.length) {
    lines.push(`Overwrote ${overwrote.length} existing file${plural(overwrote.length)}:`);
    for (const f of overwrote) lines.push(`  ${f}`);
  }
  if (skipped.length) {
    lines.push(`Skipped ${skipped.length} existing file${plural(skipped.length)}:`);
    for (const f of skipped) lines.push(`  ${f}`);
    if (!forced) lines.push("Re-run with --force to replace them.");
  }

  if (written.length) {
    // Echo the path the caller typed. Computing a relative one goes wrong on
    // macOS, where /tmp is a symlink and cwd resolves to /private/tmp.
    lines.push(
      "",
      "Next:",
      `  cd ${projectDir}`,
      "  npm install",
      "  open-scrolltelling frames <video> .",
    );
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}
