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

import { notesFor, titleFor } from "../ci/changelog-notes.mjs";

const CHANGELOG = `# Changelog

Preamble that is not part of any release.

## 0.4.0 — the Nuxt template

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

  it("reads a heading that carries a summary as well as a version", () => {
    // The summary is what the release is titled with, so the heading has to
    // hold both — and the notes must not swallow the summary line.
    assert.equal(notesFor(CHANGELOG, "0.4.0"), "### Added\n\n- A Nuxt template.");
  });
});

/**
 * The release title, which is the one line the repository sidebar shows.
 *
 * The first automated release was titled "v0.4.2" — the bare tag — while every
 * release before it read "v0.4.1 — pages with more than a hero". The sidebar
 * renders that name, so the automated one arrived saying nothing.
 */
describe("titleFor", () => {
  it("joins the tag to the summary on the heading", () => {
    assert.equal(titleFor(CHANGELOG, "0.4.0"), "v0.4.0 — the Nuxt template");
  });

  it("falls back to the bare tag when the heading has no summary", () => {
    // Worse than a summary, better than failing the release over a missing one.
    assert.equal(titleFor(CHANGELOG, "0.3.0"), "v0.3.0");
  });

  it("does not mistake a longer version for the one asked for", () => {
    const tricky = "## 0.4.0-rc1 — a prerelease\n\nNo.\n\n## 0.4.0 — the real one\n\nYes.\n";
    assert.equal(titleFor(tricky, "0.4.0"), "v0.4.0 — the real one");
  });

  it("accepts a hyphen as the separator, not only an em dash", () => {
    assert.equal(titleFor("## 1.0.0 - plain ascii\n\nNotes.\n", "1.0.0"), "v1.0.0 — plain ascii");
  });

  it("refuses a version the changelog does not mention", () => {
    assert.throws(() => titleFor(CHANGELOG, "9.9.9"), /9\.9\.9/);
  });
});
