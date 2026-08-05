/**
 * Which decode path the engine uses, and what happens when it dies.
 *
 * This is the arithmetic behind not hanging the page. A worker that fails to
 * load still constructs successfully — a 404 returns a perfectly valid Worker —
 * so nothing throws and nothing falls back on its own. Every frame posted to it
 * is a frame that never comes back, and a page waiting on frames that never
 * come back waits forever.
 *
 * The decision of what to do about that is arithmetic over two sets, which is
 * why it lives here with tests rather than inside an event handler where the
 * only way to find out is to ship it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeStrategy, framesToRetry } from "../lib/scroll-engine-state.mjs";

describe("decodeStrategy", () => {
  it("uses the worker when one is available and healthy", () => {
    assert.equal(decodeStrategy({ canUseWorker: true, workerFailed: false }), "worker");
  });

  it("uses the main thread when the browser cannot give us a worker", () => {
    assert.equal(decodeStrategy({ canUseWorker: false, workerFailed: false }), "main");
  });

  it("uses the main thread once the worker has failed", () => {
    // The whole point. Before this existed the answer was still "worker", and
    // the page posted into a dead one until the visitor gave up and left.
    assert.equal(decodeStrategy({ canUseWorker: true, workerFailed: true }), "main");
  });

  it("stays on the main thread — a failed worker is never retried", () => {
    // A worker that 404s will 404 again. Retrying it turns one dead request
    // into an unbounded number of them.
    assert.equal(decodeStrategy({ canUseWorker: false, workerFailed: true }), "main");
  });
});

describe("framesToRetry", () => {
  it("returns the frames that were in flight when the worker died", () => {
    // These are the abandoned ones. Nothing else will ever ask for them again,
    // so if this list is wrong the page stalls on exactly those indices.
    assert.deepEqual(framesToRetry({ pending: [3, 4, 5], held: [], failed: [] }), [3, 4, 5]);
  });

  it("does not retry frames that already arrived", () => {
    assert.deepEqual(framesToRetry({ pending: [3, 4, 5], held: [4], failed: [] }), [3, 5]);
  });

  it("does not retry frames already known to be broken", () => {
    // A frame that failed to decode failed for its own reasons; the worker
    // dying does not make it worth another round trip.
    assert.deepEqual(framesToRetry({ pending: [3, 4, 5], held: [], failed: [5] }), [3, 4]);
  });

  it("returns nothing when the worker dies with no work outstanding", () => {
    // The common case for a worker that 404s on a page the visitor has not
    // scrolled yet. Nothing to recover, and nothing to warn twice about.
    assert.deepEqual(framesToRetry({ pending: [], held: [0, 1], failed: [] }), []);
  });

  it("returns the frames in ascending order", () => {
    // The visitor is somewhere in the sequence and the window was filled
    // outward from there, so the pending set arrives unordered. Decoding in
    // index order means the frames nearest the start of the window land first.
    assert.deepEqual(framesToRetry({ pending: [9, 2, 7], held: [], failed: [] }), [2, 7, 9]);
  });

  it("never returns the same index twice", () => {
    assert.deepEqual(framesToRetry({ pending: [4, 4, 2], held: [], failed: [] }), [2, 4]);
  });
});
