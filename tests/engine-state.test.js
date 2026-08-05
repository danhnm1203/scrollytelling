/**
 * The decisions the scrubbing engine makes while frames arrive and the
 * visitor moves.
 *
 * Same seam as scroll-math, and for the same reason: these are the two places
 * the engine can be wrong in ways nobody notices. Get the load state wrong and
 * the page sits at a percentage that never reaches ready. Get the window diff
 * wrong and it either releases the frame it is about to draw, or holds every
 * frame it has ever seen until the tab dies.
 *
 * Neither is observable from the outside until it has already happened, which
 * is why they are arithmetic here rather than logic inside an effect.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadStateAfter, windowDiff } from "../lib/scroll-engine-state.mjs";

describe("loadStateAfter", () => {
  it("stays loading while the opening frames are still arriving", () => {
    assert.deepEqual(loadStateAfter({ index: 0, initial: 4, settled: 1, failed: 0 }), {
      phase: "loading",
      done: 1,
      total: 4,
    });
  });

  it("reports ready once every opening frame has settled", () => {
    assert.deepEqual(loadStateAfter({ index: 3, initial: 4, settled: 4, failed: 0 }), {
      phase: "ready",
      failed: 0,
    });
  });

  it("is ready, not failed, when only some of the opening frames are broken", () => {
    // A gap is survivable — the draw loop falls back to the nearest decoded
    // frame. Refusing to start because one file 404d would be worse than the
    // slightly stuttery page the visitor would otherwise get.
    assert.deepEqual(loadStateAfter({ index: 3, initial: 4, settled: 4, failed: 1 }), {
      phase: "ready",
      failed: 1,
    });
  });

  it("fails only when every opening frame failed", () => {
    // Nothing to draw at all. This is the state that earns an error message
    // rather than a blank canvas.
    assert.deepEqual(loadStateAfter({ index: 3, initial: 4, settled: 4, failed: 4 }), {
      phase: "failed",
    });
  });

  it("ignores frames beyond the opening window", () => {
    // Those arrive because the visitor scrolled, long after the page went
    // ready. Letting them touch the load state would drag a live page back to
    // a loading percentage.
    assert.equal(loadStateAfter({ index: 9, initial: 4, settled: 4, failed: 0 }), null);
  });

  it("handles a single-frame sequence", () => {
    assert.deepEqual(loadStateAfter({ index: 0, initial: 1, settled: 1, failed: 0 }), {
      phase: "ready",
      failed: 0,
    });
  });

  it("handles a single-frame sequence whose only frame failed", () => {
    assert.deepEqual(loadStateAfter({ index: 0, initial: 1, settled: 1, failed: 1 }), {
      phase: "failed",
    });
  });
});

describe("windowDiff", () => {
  const base = { totalFrames: 20, capacity: 5, held: [], pending: [], failed: [] };

  it("asks for the whole window when nothing is held yet", () => {
    assert.deepEqual(windowDiff({ ...base, centre: 0 }), {
      request: [0, 1, 2, 3, 4],
      release: [],
    });
  });

  it("does not ask again for frames it already holds", () => {
    assert.deepEqual(windowDiff({ ...base, centre: 0, held: [0, 1] }), {
      request: [2, 3, 4],
      release: [],
    });
  });

  it("does not ask again for frames already in flight", () => {
    assert.deepEqual(windowDiff({ ...base, centre: 0, pending: [2, 3] }), {
      request: [0, 1, 4],
      release: [],
    });
  });

  it("does not retry frames known to be broken", () => {
    assert.deepEqual(windowDiff({ ...base, centre: 0, failed: [1] }), {
      request: [0, 2, 3, 4],
      release: [],
    });
  });

  it("releases what the window has moved past", () => {
    // The visitor scrolled forward. Everything behind the window is now dead
    // weight, and a decoded frame nobody closes is pinned for the life of the
    // page.
    const diff = windowDiff({ ...base, centre: 10, held: [0, 1, 2, 8, 9, 10] });
    assert.deepEqual(diff.release, [0, 1, 2]);
  });

  it("holds what is still inside the window", () => {
    const diff = windowDiff({ ...base, centre: 10, held: [8, 9, 10, 11, 12] });
    assert.deepEqual(diff.release, []);
  });

  it("never asks for a frame outside the sequence", () => {
    // At either end the window is clamped, not wrapped. Asking for frame -1 is
    // a 404 and a permanently failed index.
    const atStart = windowDiff({ ...base, centre: 0 });
    const atEnd = windowDiff({ ...base, centre: 19 });
    assert.ok(Math.min(...atStart.request) >= 0);
    assert.ok(Math.max(...atEnd.request) <= 19);
  });

  it("returns both lists in ascending order", () => {
    const diff = windowDiff({ ...base, centre: 10, held: [9, 0, 2, 1] });
    assert.deepEqual(diff.release, [0, 1, 2]);
    assert.deepEqual([...diff.request].sort((a, b) => a - b), diff.request);
  });

  it("asks for nothing when the window is already fully held", () => {
    const diff = windowDiff({ ...base, centre: 0, held: [0, 1, 2, 3, 4] });
    assert.deepEqual(diff, { request: [], release: [] });
  });

  it("copes with a sequence shorter than the capacity", () => {
    const diff = windowDiff({ ...base, totalFrames: 3, capacity: 10, centre: 1 });
    assert.deepEqual(diff.request, [0, 1, 2]);
  });
});
