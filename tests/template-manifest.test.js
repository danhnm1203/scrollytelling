/**
 * Where each template keeps its things.
 *
 * One data structure, two consumers: the scaffolder places files by it and the
 * frame pipeline resolves its output paths by it. The same shape
 * `installableFiles()` already has, for the same reason — readers of one list
 * cannot disagree about what a template is.
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

  it("keeps every path inside the project", () => {
    // The manifest supplies directories that get joined to a project root. A
    // value that climbs out of it writes wherever it likes.
    for (const name of templateNames()) {
      const t = TEMPLATES[name];
      for (const key of ["dir", "libDir", "publicDir", "framesPath", "storyPath"]) {
        assert.equal(typeof t[key], "string", `${name}.${key} must be a string`);
        assert.ok(!t[key].split("/").includes(".."), `${name}.${key} must not climb out`);
        assert.ok(!t[key].startsWith("/"), `${name}.${key} must be relative`);
      }
    }
  });

  it("puts the frames contract and the story in the same place the runtime reads", () => {
    // A template whose data paths disagree with where its adapter imports from
    // produces a project that builds and renders nothing. Nothing checks that
    // correspondence automatically — the per-template build gate is what does —
    // so at minimum they must be plausible siblings rather than unrelated.
    for (const name of templateNames()) {
      const t = TEMPLATES[name];
      assert.equal(
        t.framesPath.split("/").slice(0, -1).join("/"),
        t.storyPath.split("/").slice(0, -1).join("/"),
        `${name}: the generated contract and the hand-written story live together`,
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
