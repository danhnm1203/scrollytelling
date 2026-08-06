/**
 * Pulling one version's notes out of the changelog.
 *
 * Written because three tags shipped to npm without a GitHub release, so the
 * releases page said 0.2.0 while npm said 0.4.0. Automating it moves the
 * failure: instead of nobody remembering, the risk becomes a release published
 * with empty or wrong notes. Both of those are silent, so both throw here.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { notesFor } from "../ci/changelog-notes.mjs";

const CHANGELOG = `# Changelog

Preamble that is not part of any release.

## 0.4.0

### Added

- A Nuxt template.

## 0.3.0

Three templates instead of one.

### Fixed

- A thing.

## 0.2.0

The first recorded release.
`;

describe("notesFor", () => {
  it("returns just that version's section", () => {
    assert.equal(notesFor(CHANGELOG, "0.4.0"), "### Added\n\n- A Nuxt template.");
  });

  it("stops at the next version rather than running to the end", () => {
    const notes = notesFor(CHANGELOG, "0.3.0");
    assert.match(notes, /Three templates instead of one/);
    assert.ok(!notes.includes("0.2.0"), "must not absorb the release below it");
    assert.ok(!notes.includes("A Nuxt template"), "must not absorb the release above it");
  });

  it("reads the last section, which has no following heading to stop at", () => {
    assert.equal(notesFor(CHANGELOG, "0.2.0"), "The first recorded release.");
  });

  it("does not mistake a longer version for the one asked for", () => {
    // "0.4.0" must not match the "0.4.0-rc1" heading, nor "10.4.0".
    const tricky = "## 0.4.0-rc1\n\nA prerelease.\n\n## 0.4.0\n\nThe real one.\n";
    assert.equal(notesFor(tricky, "0.4.0"), "The real one.");
  });

  it("refuses a version the changelog does not mention", () => {
    // A tag with no entry would otherwise publish a release with an empty body,
    // which reads as "nothing changed" rather than "nobody wrote it down".
    assert.throws(() => notesFor(CHANGELOG, "9.9.9"), /9\.9\.9/);
  });

  it("refuses a section that is present but empty", () => {
    assert.throws(() => notesFor("## 1.0.0\n\n## 0.9.0\n\nOld.\n", "1.0.0"), /empty/i);
  });

  it("finds every released version in the real changelog", () => {
    // The guard that matters: this is the file the workflow will actually read.
    const real = readFileSync(
      fileURLToPath(new URL("../CHANGELOG.md", import.meta.url)),
      "utf8",
    );
    for (const version of ["0.2.0", "0.3.0", "0.4.0"]) {
      assert.ok(notesFor(real, version).length > 20, `${version} needs real notes`);
    }
  });
});
