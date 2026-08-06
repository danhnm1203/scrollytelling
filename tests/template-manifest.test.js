/**
 * Where each template keeps its things.
 *
 * One data structure, three consumers: the scaffolder places files by it, the
 * frame pipeline resolves its output paths by it, and argument parsing names
 * the templates from it. The same shape `installableFiles()` already has, for
 * the same reason — three readers of one list cannot disagree about what a
 * template is.
 *
 * The rules worth testing are the ones whose failure is quiet. A template whose
 * runtime files land in two directories produces a worker that 404s. A template
 * name that reaches a path join produces a traversal. Neither throws.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TEMPLATES, templateNames, resolveTemplate } from "../lib/template-manifest.mjs";

describe("the manifest", () => {
  it("knows about at least the default template", () => {
    assert.ok(templateNames().includes("next"));
  });

  it("gives every template the five paths the pipeline needs", () => {
    for (const name of templateNames()) {
      const t = TEMPLATES[name];
      for (const key of ["dir", "libDir", "publicDir", "framesPath", "storyPath"]) {
        assert.ok(t[key], `${name} is missing ${key}`);
      }
      assert.ok(t.description, `${name} needs a one-line description for --template`);
    }
  });

  it("keeps every runtime file in ONE directory per template", () => {
    // Not a style rule. The engine finds its worker with
    // `new URL("./decoder.worker.js", import.meta.url)`, which resolves
    // relative to the module holding the literal — so the engine and the worker
    // must be siblings. A manifest with independent per-file paths could put
    // them apart, and the failure is a worker that 404s, which before the
    // fallback existed meant a page that hung.
    for (const name of templateNames()) {
      assert.equal(typeof TEMPLATES[name].libDir, "string");
      assert.ok(!TEMPLATES[name].libDir.includes(".."), "libDir must not escape the project");
    }
  });

  it("puts the staging directory on the same filesystem as its destination", () => {
    // `frames` writes to <public>/frames.partial and renames it into place at
    // the very end. A rename is atomic only within one filesystem; split these
    // across roots and a failure leaves a half-written frame directory that the
    // page will happily read.
    for (const name of templateNames()) {
      const t = TEMPLATES[name];
      assert.ok(
        t.publicDir !== undefined,
        `${name} needs a publicDir so staging and destination share a root`,
      );
    }
  });
});

describe("resolveTemplate", () => {
  it("returns the template for a known name", () => {
    assert.equal(resolveTemplate("next").dir, TEMPLATES.next.dir);
  });

  it("refuses an unknown name and says which are valid", () => {
    // Better than a sanitiser: a typo gets told what it should have been,
    // rather than a filesystem error.
    assert.throws(
      () => resolveTemplate("nextjs"),
      (err) => err.message.includes("nextjs") && err.message.includes("next"),
    );
  });

  it("refuses a name that tries to escape the templates directory", () => {
    // The flag selects a key; the manifest supplies the directory. User input
    // never reaches a path join, so traversal is not a thing that can be
    // sanitised wrongly — it is a thing that cannot be expressed.
    for (const attempt of ["../../etc", "..", "next/../..", "./next"]) {
      assert.throws(() => resolveTemplate(attempt), undefined, `${attempt} must be refused`);
    }
  });

  it("refuses nothing at all rather than guessing", () => {
    assert.throws(() => resolveTemplate(""));
    assert.throws(() => resolveTemplate(undefined));
  });
});
