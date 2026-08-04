/**
 * Which frames are allowed to stay decoded.
 *
 * This is the arithmetic behind not crashing a phone tab. A decoded frame is
 * pinned until it is explicitly released — unlike an <img>, the browser cannot
 * reclaim it under pressure — so a full sequence at typical dimensions runs to
 * a few hundred megabytes and the tab dies. Getting this wrong is a crash, not
 * a slowdown, which is why it is arithmetic with tests rather than a guess.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { framesInBudget, decodeWindow } from "../lib/scroll-math.mjs";

describe("framesInBudget", () => {
  it("counts how many decoded frames fit in a byte budget", () => {
    // Derived, not hand-computed: a literal here just encodes whoever wrote it
    // confusing MB with MiB, which is exactly what happened the first time.
    const budget = 128 * 1024 * 1024;
    const perFrame = 1280 * 720 * 4;
    assert.equal(framesInBudget(budget, 1280, 720), Math.floor(budget / perFrame));
  });

  it("never promises more frames than the budget holds", () => {
    const budget = 64 * 1024 * 1024;
    const n = framesInBudget(budget, 1280, 720);
    assert.ok(n * 1280 * 720 * 4 <= budget, `${n} frames overruns the budget`);
  });

  it("scales with frame size, not frame count", () => {
    const big = framesInBudget(128 * 1024 * 1024, 1920, 1080);
    const small = framesInBudget(128 * 1024 * 1024, 640, 360);
    assert.ok(small > big, `smaller frames should fit more: ${small} vs ${big}`);
  });

  it("always allows at least one frame", () => {
    // Otherwise a huge frame on a tight budget would leave nothing to draw.
    assert.ok(framesInBudget(1, 4000, 4000) >= 1);
    assert.ok(framesInBudget(0, 1280, 720) >= 1);
  });

  it("returns whole frames", () => {
    for (const budget of [1e6, 5e7, 2e8]) {
      const n = framesInBudget(budget, 1280, 720);
      assert.ok(Number.isInteger(n), `${n} is not an integer`);
    }
  });
});

describe("decodeWindow", () => {
  const size = (w) => w.to - w.from + 1;

  it("centres on the current frame", () => {
    const w = decodeWindow(50, 100, 11);
    assert.equal(w.from, 45);
    assert.equal(w.to, 55);
  });

  it("is symmetric, because scrubbing backwards is as common as forwards", () => {
    const w = decodeWindow(50, 100, 21);
    assert.equal(50 - w.from, w.to - 50);
  });

  it("never exceeds its capacity", () => {
    for (const centre of [0, 7, 50, 93, 99]) {
      for (const capacity of [1, 2, 5, 34, 99]) {
        const w = decodeWindow(centre, 100, capacity);
        assert.ok(size(w) <= capacity, `centre ${centre} cap ${capacity} gave ${size(w)}`);
      }
    }
  });

  it("uses its whole capacity near the start, rather than wasting half of it", () => {
    // A window clipped at the edge should extend forwards instead of shrinking:
    // the visitor at the top of the page is about to scroll down.
    const w = decodeWindow(0, 100, 11);
    assert.equal(w.from, 0);
    assert.equal(size(w), 11);
  });

  it("uses its whole capacity near the end", () => {
    const w = decodeWindow(99, 100, 11);
    assert.equal(w.to, 99);
    assert.equal(size(w), 11);
  });

  it("stays inside the sequence", () => {
    for (const centre of [-5, 0, 50, 99, 200]) {
      const w = decodeWindow(centre, 100, 15);
      assert.ok(w.from >= 0, `from ${w.from}`);
      assert.ok(w.to <= 99, `to ${w.to}`);
      assert.ok(w.from <= w.to, `empty window ${w.from}..${w.to}`);
    }
  });

  it("covers everything when capacity allows", () => {
    const w = decodeWindow(50, 100, 500);
    assert.equal(w.from, 0);
    assert.equal(w.to, 99);
  });

  it("always contains the current frame", () => {
    // If it did not, the page would be holding frames it cannot draw.
    for (const centre of [0, 1, 50, 98, 99]) {
      for (const capacity of [1, 3, 40]) {
        const w = decodeWindow(centre, 100, capacity);
        assert.ok(centre >= w.from, `centre ${centre} below window ${w.from}`);
        assert.ok(centre <= w.to, `centre ${centre} above window ${w.to}`);
      }
    }
  });

  it("handles a one-frame sequence", () => {
    const w = decodeWindow(0, 1, 10);
    assert.equal(w.from, 0);
    assert.equal(w.to, 0);
  });

  it("moves with the current frame", () => {
    const early = decodeWindow(20, 100, 11);
    const later = decodeWindow(60, 100, 11);
    assert.ok(later.from > early.to, "windows far apart should not overlap");
  });
});
