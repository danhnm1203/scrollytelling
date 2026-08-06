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
 * The body of `## <version>`, up to the next `## ` heading.
 *
 * @param {string} changelog contents of CHANGELOG.md
 * @param {string} version   without a leading "v"
 * @returns {string} the section, trimmed
 */
export function notesFor(changelog, version) {
  const lines = changelog.split("\n");
  // Matched line by line rather than with one regex over the whole file: an
  // anchored equality cannot confuse "0.4.0" with "0.4.0-rc1" or "10.4.0", and
  // does not need the version escaped before it is interpolated.
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) {
    throw new Error(`CHANGELOG.md has no "## ${version}" section — write one before tagging`);
  }

  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();

  if (!body) {
    throw new Error(`the "## ${version}" section in CHANGELOG.md is empty`);
  }
  return body;
}

// Only when run directly, so the tests can import the function above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const version = (process.argv[2] ?? "").replace(/^v/, "");
  if (!version) {
    process.stderr.write("usage: node ci/changelog-notes.mjs <version>\n");
    process.exit(1);
  }
  try {
    const changelog = readFileSync(
      fileURLToPath(new URL("../CHANGELOG.md", import.meta.url)),
      "utf8",
    );
    process.stdout.write(`${notesFor(changelog, version)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
