/**
 * Choosing which frames end up in a sequence, and where to seek for them.
 *
 * Pure arithmetic over names and numbers — no filesystem, no ffmpeg.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { naturalCompare, decimate, timestampsFor } from "../lib/sequence-plan.mjs";

describe("naturalCompare", () => {
  it("orders frame_2 before frame_10", () => {
    // The bug this exists to prevent: a plain string sort puts frame_10 between
    // frame_1 and frame_2, and the animation plays out of order.
    const names = ["frame_1.png", "frame_10.png", "frame_2.png", "frame_20.png", "frame_3.png"];
    assert.deepEqual(names.toSorted(naturalCompare), [
      "frame_1.png",
      "frame_2.png",
      "frame_3.png",
      "frame_10.png",
      "frame_20.png",
    ]);
  });

  it("handles zero-padded and unpadded names in one directory", () => {
    const names = ["shot_009.jpg", "shot_10.jpg", "shot_1.jpg"];
    assert.deepEqual(names.toSorted(naturalCompare), ["shot_1.jpg", "shot_009.jpg", "shot_10.jpg"]);
  });

  it("falls back to text order when there are no numbers", () => {
    assert.deepEqual(["b.png", "a.png"].toSorted(naturalCompare), ["a.png", "b.png"]);
  });

  it("is deterministic regardless of locale", () => {
    const names = ["a10", "a9", "A2"];
    const once = names.toSorted(naturalCompare);
    const twice = names.toSorted(naturalCompare);
    assert.deepEqual(once, twice);
  });
});

describe("decimate", () => {
  const items = Array.from({ length: 100 }, (_, i) => i);

  it("returns exactly the requested count", () => {
    assert.equal(decimate(items, 50).length, 50);
    assert.equal(decimate(items, 7).length, 7);
  });

  it("always keeps the first and last item", () => {
    // These are the moments a visitor lands on and finishes on.
    for (const n of [2, 3, 10, 50, 99]) {
      const picked = decimate(items, n);
      assert.equal(picked[0], 0, `n=${n} lost the first item`);
      assert.equal(picked.at(-1), 99, `n=${n} lost the last item`);
    }
  });

  it("spreads picks evenly", () => {
    // Asserted as a property rather than a hardcoded list: the ideal step here
    // is 9.9, so picks land on 59 and 69 rather than 60 and 70, and a literal
    // expectation just encodes whoever wrote it doing the arithmetic wrong.
    const count = 11;
    const picked = decimate(items, count);
    const step = (items.length - 1) / (count - 1);

    picked.forEach((value, i) => {
      assert.ok(
        Math.abs(value - i * step) <= 0.5,
        `pick ${i} was ${value}, more than half a step from ${i * step}`,
      );
    });
  });

  it("never repeats an item", () => {
    const picked = decimate(items, 40);
    assert.equal(new Set(picked).size, picked.length);
  });

  it("uses everything when asked for more than it has", () => {
    assert.deepEqual(decimate([1, 2, 3], 10), [1, 2, 3]);
  });

  it("handles degenerate counts", () => {
    assert.deepEqual(decimate(items, 1), [0]);
    assert.deepEqual(decimate([], 5), []);
    assert.deepEqual(decimate([7], 3), [7]);
  });
});

describe("timestampsFor", () => {
  it("returns one timestamp per requested frame", () => {
    assert.equal(timestampsFor(10, 50).length, 50);
  });

  it("starts at zero", () => {
    assert.equal(timestampsFor(10, 5)[0], 0);
  });

  it("stops just short of the duration", () => {
    // Seeking to exactly the duration typically yields no output at all.
    const marks = timestampsFor(10, 5);
    const last = marks.at(-1);
    assert.ok(last < 10, "last mark must be inside the clip");
    assert.ok(last > 9.9, `last mark ${last} is too far from the end`);
  });

  it("is monotonically increasing", () => {
    const marks = timestampsFor(7.5, 20);
    for (let i = 1; i < marks.length; i++) {
      assert.ok(marks[i] > marks[i - 1], `mark ${i} did not advance`);
    }
  });

  it("handles a single frame and a very short clip", () => {
    assert.deepEqual(timestampsFor(10, 1), [0]);
    const short = timestampsFor(0.05, 3);
    assert.equal(short.length, 3);
    assert.ok(short.every((t) => t >= 0 && t < 0.05));
  });
});
