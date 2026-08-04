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

import {
  readdirSync,
  statSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { planUpgrade } from "../lib/upgrade.mjs";

const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));

/**
 * Where a project records what the template looked like when it was generated.
 *
 * Deliberately not inside components/frames.ts: that file is regenerated on
 * every frames run, so keeping the baseline there would give it two writers and
 * make --diff compare against a baseline that silently reset itself.
 */
const VERSION_FILE = ".scrolltelling-version";

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

const hashOf = (path) => createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);

/** Package version, for the human-readable half of the record. */
function packageVersion() {
  const pkg = fileURLToPath(new URL("../package.json", import.meta.url));
  return JSON.parse(readFileSync(pkg, "utf8")).version;
}

/** Every file this package would install, as project path -> content hash. */
function currentTemplateHashes() {
  const hashes = {};
  for (const [sourcePath, name] of installableFiles()) hashes[name] = hashOf(sourcePath);
  return hashes;
}

/** What the project recorded at generation time, or an empty baseline. */
function readRecord(projectDir) {
  const path = join(projectDir, VERSION_FILE);
  if (!existsSync(path)) return { version: null, files: {} };
  try {
    const record = JSON.parse(readFileSync(path, "utf8"));
    return { version: record.version ?? null, files: record.files ?? {} };
  } catch {
    // A corrupt record is the same situation as no record: the baseline is
    // unknown. Failing here would block a command that only reports.
    return { version: null, files: {} };
  }
}

/** The project's own files, for the paths the template knows about. */
function projectHashes(projectDir, paths) {
  const hashes = {};
  for (const name of paths) {
    const path = join(projectDir, name);
    if (existsSync(path)) hashes[name] = hashOf(path);
  }
  return hashes;
}

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

/**
 * Every file this package installs, as [source path, path in the project].
 *
 * One list, used by both scaffolding and the diff, so the two can never
 * disagree about what belongs to the template.
 */
function installableFiles() {
  return [
    ...templateFiles().map((rel) => [join(TEMPLATES, rel), targetName(rel)]),
    ...EXTRA_FILES.map(([from, to]) => [fileURLToPath(new URL(from, import.meta.url)), to]),
  ];
}

export async function run(positionals, flags = {}) {
  try {
    // Inside the try: a diff of a missing directory should read as a sentence,
    // like every other failure here, not escape as a stack trace.
    if (flags.diff) return diff(positionals);
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

  for (const [sourcePath, name] of installableFiles()) {
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

  // Record what the template looked like, so a later --diff has a baseline.
  // Written unconditionally: a re-run that skipped everything still moves the
  // project onto this version of the files it already has.
  writeFileSync(
    join(projectDir, VERSION_FILE),
    `${JSON.stringify({ version: packageVersion(), files: currentTemplateHashes() }, null, 2)}\n`,
  );

  report({ projectDir, written, skipped, overwrote, forced: Boolean(flags.force) });
  return 0;
}

/**
 * Reports what has changed in the template since this project was generated.
 *
 * Reports only. Adopting a change is the project owner's decision — once
 * generated, the code is theirs, and a tool that rewrote it on their behalf
 * would make re-running this something to be afraid of.
 */
function diff(positionals) {
  const [projectDir] = positionals;
  if (!projectDir) {
    throw new ScaffoldError("diff needs a project directory. Try: scaffold ./my-site --diff");
  }
  if (!existsSync(projectDir)) {
    throw new ScaffoldError(`${projectDir} does not exist.`);
  }

  const record = readRecord(projectDir);
  const current = currentTemplateHashes();
  const project = projectHashes(projectDir, [
    ...new Set([...Object.keys(record.files), ...Object.keys(current)]),
  ]);

  const plan = planUpgrade({ recorded: record.files, current, project });
  process.stdout.write(`${formatDiff(plan, record).join("\n")}\n`);
  return 0;
}

function formatDiff(plan, record) {
  if (!plan.knowsBaseline) {
    return [
      `No ${VERSION_FILE} in this project, so there is no baseline to compare against.`,
      "It was generated before this package recorded one.",
      "",
      `Running scaffold again writes ${VERSION_FILE} without touching your files,`,
      "and comparisons will work from then on.",
    ];
  }

  const lines = [
    `Generated from template ${record.version ?? "unknown"}; this package is ${packageVersion()}.`,
    "",
  ];

  if (!plan.hasChanges) {
    lines.push("Nothing in the template has changed since. Nothing to do.");
    return lines;
  }

  const section = (title, files, note) => {
    if (files.length === 0) return;
    lines.push(title);
    for (const f of files) lines.push(`  ${f}`);
    if (note) lines.push(`  ${note}`);
    lines.push("");
  };

  section(
    "Changed in the template, untouched in your project:",
    plan.adoptable,
    "Safe to take: copy them from a fresh scaffold in a temporary directory.",
  );
  section(
    "Changed in the template AND edited by you:",
    plan.conflicted,
    "Your call. Adopting these would discard your edits.",
  );
  section("New template files you do not have:", plan.added);
  section("No longer part of the template:", plan.removed);
  section("Changed in the template, but missing from your project:", plan.missing);

  lines.push("Nothing above has been modified. This command only reports.");
  return lines;
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
