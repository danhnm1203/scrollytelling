/**
 * Working out what changed in the template since a project was generated.
 *
 * Three sets of hashes go in: what the template looked like at generation time
 * (recorded in the project), what it looks like now, and what the project's own
 * files look like today. That last one is what separates "a fix you can take"
 * from "a fix that collides with your edits" — without it the tool would tell
 * people to adopt changes that would overwrite their own work.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planUpgrade } from "../lib/upgrade.mjs";

/** Shorthand: every file identical across all three sets. */
const settled = {
  recorded: { "app/page.tsx": "a", "components/story.ts": "b" },
  current: { "app/page.tsx": "a", "components/story.ts": "b" },
  project: { "app/page.tsx": "a", "components/story.ts": "b" },
};

describe("planUpgrade", () => {
  it("reports nothing when the template has not moved", () => {
    const plan = planUpgrade(settled);
    assert.deepEqual(plan.adoptable, []);
    assert.deepEqual(plan.conflicted, []);
    assert.deepEqual(plan.added, []);
    assert.deepEqual(plan.removed, []);
  });

  it("stays quiet about a file the user edited when the template did not change", () => {
    // Their edit is not the tool's business. Only template movement is.
    const plan = planUpgrade({
      ...settled,
      project: { ...settled.project, "components/story.ts": "edited" },
    });
    assert.deepEqual(plan.adoptable, []);
    assert.deepEqual(plan.conflicted, []);
  });

  it("offers a template change on a file the user left alone", () => {
    const plan = planUpgrade({
      recorded: { "components/ScrollSequence.tsx": "v1" },
      current: { "components/ScrollSequence.tsx": "v2" },
      project: { "components/ScrollSequence.tsx": "v1" },
    });
    assert.deepEqual(plan.adoptable, ["components/ScrollSequence.tsx"]);
    assert.deepEqual(plan.conflicted, []);
  });

  it("flags a template change on a file the user also edited", () => {
    // Both moved. Adopting would discard their work, so it needs a decision.
    const plan = planUpgrade({
      recorded: { "components/story.ts": "v1" },
      current: { "components/story.ts": "v2" },
      project: { "components/story.ts": "mine" },
    });
    assert.deepEqual(plan.conflicted, ["components/story.ts"]);
    assert.deepEqual(plan.adoptable, []);
  });

  it("reports a template file that did not exist at generation time", () => {
    const plan = planUpgrade({
      recorded: { "app/page.tsx": "a" },
      current: { "app/page.tsx": "a", "components/decoder.worker.js": "new" },
      project: { "app/page.tsx": "a" },
    });
    assert.deepEqual(plan.added, ["components/decoder.worker.js"]);
  });

  it("reports a template file that has since been dropped", () => {
    const plan = planUpgrade({
      recorded: { "app/page.tsx": "a", "old/thing.ts": "x" },
      current: { "app/page.tsx": "a" },
      project: { "app/page.tsx": "a", "old/thing.ts": "x" },
    });
    assert.deepEqual(plan.removed, ["old/thing.ts"]);
  });

  it("notices a file the user deleted, without treating it as adoptable", () => {
    const plan = planUpgrade({
      recorded: { "components/ScrollSequence.tsx": "v1" },
      current: { "components/ScrollSequence.tsx": "v2" },
      project: {},
    });
    assert.deepEqual(plan.adoptable, []);
    assert.deepEqual(plan.missing, ["components/ScrollSequence.tsx"]);
  });

  it("sorts every list, so the report reads the same every run", () => {
    const plan = planUpgrade({
      recorded: { "z.ts": "1", "a.ts": "1", "m.ts": "1" },
      current: { "z.ts": "2", "a.ts": "2", "m.ts": "2" },
      project: { "z.ts": "1", "a.ts": "1", "m.ts": "1" },
    });
    assert.deepEqual(plan.adoptable, ["a.ts", "m.ts", "z.ts"]);
  });

  it("reports whether there is anything at all to do", () => {
    assert.equal(planUpgrade(settled).hasChanges, false);
    assert.equal(
      planUpgrade({
        recorded: { "a.ts": "1" },
        current: { "a.ts": "2" },
        project: { "a.ts": "1" },
      }).hasChanges,
      true,
    );
  });

  it("treats an empty recording as nothing known rather than everything new", () => {
    // A project generated before versions were recorded. Claiming every file
    // is new would be worse than saying the baseline is unknown.
    const plan = planUpgrade({
      recorded: {},
      current: { "a.ts": "1", "b.ts": "2" },
      project: { "a.ts": "1", "b.ts": "2" },
    });
    assert.equal(plan.hasChanges, false);
    assert.deepEqual(plan.added, []);
  });
});
