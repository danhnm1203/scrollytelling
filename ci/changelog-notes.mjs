/**
 * One version's notes, lifted out of CHANGELOG.md.
 *
 *   node ci/changelog-notes.mjs 0.4.0
 *
 * Exists because the release workflow published three versions to npm without
 * ever creating a GitHub release, so the releases page read 0.2.0 while npm
 * read 0.4.0. The tags were all there; nothing turned them into releases.
 *
 * Automating that moves the failure rather than removing it: the new risk is a
 * release published with empty or wrong notes, which reads as "nothing changed"
 * instead of "nobody wrote it down". So a missing or empty section throws, and
 * the workflow step fails, rather than quietly shipping a blank release body.
 *
 * Not shipped — ci/ is outside package.json `files`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Where `## <version>` sits, and what the rest of that heading says.
 *
 * A heading is either `## 0.4.2` or `## 0.4.2 — the skill asks which template`.
 * Split on the first run of whitespace and compare the first word: an anchored
 * equality cannot confuse "0.4.0" with "0.4.0-rc1" or "10.4.0", and does not
 * need the version escaped before it is interpolated. Matched line by line
 * rather than with one regex over the whole file, for the same reason.
 *
 * @param {string} changelog contents of CHANGELOG.md
 * @param {string} version   without a leading "v"
 * @returns {{ index: number, summary: string }} `summary` is "" when the
 *   heading is only a version
 */
function headingFor(changelog, version) {
  const lines = changelog.split("\n");
  for (const [index, line] of lines.entries()) {
    const heading = line.trim();
    if (!heading.startsWith("## ")) continue;

    const rest = heading.slice(3).trim();
    const [word, ...tail] = rest.split(/\s+/);
    if (word !== version) continue;

    // Either separator, because a changelog written by hand gets both: an em
    // dash when something typed one, a hyphen when it did not.
    const summary = tail.join(" ").replace(/^[—-]\s*/, "");
    return { index, summary };
  }
  throw new Error(`CHANGELOG.md has no "## ${version}" section — write one before tagging`);
}

/**
 * The body of `## <version>`, up to the next `## ` heading.
 *
 * @param {string} changelog contents of CHANGELOG.md
 * @param {string} version   without a leading "v"
 * @returns {string} the section, trimmed
 */
export function notesFor(changelog, version) {
  const lines = changelog.split("\n");
  const { index: start } = headingFor(changelog, version);

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();

  if (!body) {
    throw new Error(`the "## ${version}" section in CHANGELOG.md is empty`);
  }
  return body;
}

/**
 * What to call the release — the one line the repository sidebar renders.
 *
 * The sidebar shows a release's *name*, not its tag, so a release named after
 * its tag says nothing there. Every release up to 0.4.1 was titled by hand as
 * "v0.4.1 — pages with more than a hero"; the first automated one came out as
 * "v0.4.2". The summary comes off the changelog heading so there is one place
 * to write it and no second file to keep in step.
 *
 * A missing summary is not fatal, unlike missing notes: a bare tag is a worse
 * title, but an untitled release still describes a version that shipped. An
 * empty body would instead claim nothing changed.
 *
 * @param {string} changelog contents of CHANGELOG.md
 * @param {string} version   with or without a leading "v"
 * @returns {string} e.g. "v0.4.2 — the skill asks which template"
 */
export function titleFor(changelog, version) {
  const bare = version.replace(/^v/, "");
  const { summary } = headingFor(changelog, bare);
  return summary ? `v${bare} — ${summary}` : `v${bare}`;
}

// Only when run directly, so the tests can import the functions above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const wantsTitle = args.includes("--title");
  const version = (args.find((arg) => !arg.startsWith("--")) ?? "").replace(/^v/, "");
  if (!version) {
    process.stderr.write("usage: node ci/changelog-notes.mjs [--title] <version>\n");
    process.exit(1);
  }
  try {
    const changelog = readFileSync(
      fileURLToPath(new URL("../CHANGELOG.md", import.meta.url)),
      "utf8",
    );
    const out = wantsTitle ? titleFor(changelog, version) : notesFor(changelog, version);
    process.stdout.write(`${out}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
