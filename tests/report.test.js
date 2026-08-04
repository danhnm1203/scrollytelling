/**
 * The numbers behind the readability report.
 *
 * The pipeline already measures all of this in order to build the contract;
 * these functions are what turn it into something a person can act on before
 * they have written a word of copy.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { regionLuma, maxEdgeDelta, REGIONS } from "../lib/report.mjs";

/** A 6x4 grid where every cell has the same value. */
const flat = (v) => Array.from({ length: 24 }, () => v);

/** A 6x4 grid where only the named columns are lit. */
const columns = (lit) => Array.from({ length: 24 }, (_, i) => (lit.includes(i % 6) ? 1 : 0));

const sequenceOf = (grids, edges) => ({
  id: "landscape",
  width: 1280,
  height: 720,
  totalFrames: grids.length,
  lumaGrid: grids,
  edgeColors: edges ?? grids.map(() => [0, 0, 0]),
});

describe("regionLuma", () => {
  it("reports one row per region and one column per bucket", () => {
    const seq = sequenceOf(Array.from({ length: 20 }, () => flat(0.5)));
    const table = regionLuma(seq, 5);

    assert.deepEqual(Object.keys(table), REGIONS);
    for (const region of REGIONS) {
      assert.equal(table[region].length, 5, `${region} bucket count`);
    }
  });

  it("separates left from right", () => {
    // Only the two leftmost columns are lit.
    const seq = sequenceOf(Array.from({ length: 10 }, () => columns([0, 1])));
    const table = regionLuma(seq, 4);

    assert.ok(table.left[0] > table.right[0], `left ${table.left[0]} vs right ${table.right[0]}`);
    assert.ok(table.right[0] < 0.05, `right should be dark, got ${table.right[0]}`);
  });

  it("follows brightness changing over the scroll", () => {
    // Dark at the start, bright at the end.
    const grids = Array.from({ length: 20 }, (_, i) => flat(i / 19));
    const table = regionLuma(sequenceOf(grids), 4);

    assert.ok(table.centre[0] < table.centre[3], "should brighten across the scroll");
    assert.ok(table.centre[0] < 0.2, `starts dark, got ${table.centre[0]}`);
    assert.ok(table.centre[3] > 0.8, `ends bright, got ${table.centre[3]}`);
  });

  it("keeps every value in 0..1", () => {
    const grids = Array.from({ length: 12 }, (_, i) => flat((i % 5) / 4));
    const table = regionLuma(sequenceOf(grids), 6);
    for (const region of REGIONS) {
      for (const v of table[region]) {
        assert.ok(v >= 0, `${region} ${v} below 0`);
        assert.ok(v <= 1, `${region} ${v} above 1`);
      }
    }
  });

  it("handles fewer frames than buckets", () => {
    const table = regionLuma(sequenceOf([flat(0.3), flat(0.7)]), 6);
    for (const region of REGIONS) {
      assert.equal(table[region].length, 6);
      for (const v of table[region]) assert.ok(Number.isFinite(v), `${v} is not finite`);
    }
  });

  it("handles a single frame", () => {
    const table = regionLuma(sequenceOf([flat(0.4)]), 5);
    for (const v of table.centre) assert.ok(Math.abs(v - 0.4) < 1e-9, `got ${v}`);
  });
});

describe("maxEdgeDelta", () => {
  it("is zero when the background never changes", () => {
    const seq = sequenceOf([flat(0), flat(0), flat(0)], [
      [10, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
    ]);
    assert.equal(maxEdgeDelta(seq).delta, 0);
  });

  it("finds the largest jump between adjacent frames, and says where", () => {
    const seq = sequenceOf([flat(0), flat(0), flat(0), flat(0)], [
      [0, 0, 0],
      [5, 0, 0],
      [60, 0, 0], // the jump: 55
      [62, 0, 0],
    ]);
    const { delta, from, to } = maxEdgeDelta(seq);

    assert.equal(delta, 55);
    assert.equal(from, 1);
    assert.equal(to, 2);
  });

  it("measures across all three channels, not just one", () => {
    const seq = sequenceOf([flat(0), flat(0)], [
      [0, 0, 0],
      [0, 0, 90],
    ]);
    assert.equal(maxEdgeDelta(seq).delta, 90);
  });

  it("handles a single frame", () => {
    const seq = sequenceOf([flat(0)], [[7, 7, 7]]);
    assert.equal(maxEdgeDelta(seq).delta, 0);
  });
});
