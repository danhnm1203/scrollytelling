/**
 * Reading the project's copy back, and judging it against the footage.
 *
 * Two pure pieces: pulling the beats out of the file the builder edits, and
 * working out how bright the frame behind each one is.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBeats, beatLuma } from "../lib/report.mjs";

const STORY = `
export type Align = "left" | "center" | "right";

export type Story = { brand: string; sections: Beat[] };

export const story: Story = {
  brand: "ORBIT",
  title: "Orbit — every part accounted for",
  description: "A scroll-driven look at how it comes apart.",
  sections: [
    { at: 0.0, align: "center", heading: "Orbit", body: "Scroll to take it apart." },
    // A comment, because people write them.
    { at: 0.3, align: "left", heading: "Nothing wasted", body: "Every component earns it." },
    {
      at: 0.92,
      align: "center",
      anchor: "bottom",
      heading: "Back together",
      body: "Assembled to a tolerance you can feel.",
    },
  ],
};
`;

/** 6x4 grid, uniform. */
const flat = (v) => Array.from({ length: 24 }, () => v);
/** 6x4 grid where only the named columns are lit. */
const columns = (lit) => Array.from({ length: 24 }, (_, i) => (lit.includes(i % 6) ? 1 : 0));
/** 6x4 grid where only the named rows are lit. */
const rows = (lit) => Array.from({ length: 24 }, (_, i) => (lit.includes(Math.floor(i / 6)) ? 1 : 0));

const sequenceOf = (grids) => ({
  id: "landscape",
  width: 1280,
  height: 720,
  totalFrames: grids.length,
  lumaGrid: grids,
  edgeColors: grids.map(() => [0, 0, 0]),
});

describe("parseBeats", () => {
  it("finds every beat the builder wrote", () => {
    const beats = parseBeats(STORY);
    assert.equal(beats.length, 3);
  });

  it("keeps the fields that decide readability", () => {
    const [first, second, third] = parseBeats(STORY);
    assert.equal(first.at, 0);
    assert.equal(second.at, 0.3);
    assert.equal(second.align, "left");
    assert.equal(second.heading, "Nothing wasted");
    assert.equal(third.anchor, "bottom");
  });

  it("copes with comments, trailing commas and multi-line objects", () => {
    // All three appear in the file people actually edit.
    const beats = parseBeats(STORY);
    assert.equal(beats[2].heading, "Back together");
  });

  it("survives an em dash and other punctuation in the copy", () => {
    const source = `export const story = { sections: [
      { at: 0.5, align: "left", heading: "Half — and counting", body: "It's 100% fine." },
    ] };`;
    const [beat] = parseBeats(source);
    assert.equal(beat.heading, "Half — and counting");
    assert.equal(beat.body, "It's 100% fine.");
  });

  it("throws something explanatory when there are no sections", () => {
    assert.throws(() => parseBeats("export const story = { brand: 'x' };"), /section/i);
  });

  it("throws when the file is not a story file at all", () => {
    assert.throws(() => parseBeats("console.log('hello')"), /section/i);
  });
});

describe("beatLuma", () => {
  it("reads the frame at the beat's scroll position", () => {
    // Dark at the start, bright at the end.
    const seq = sequenceOf([flat(0), flat(0), flat(1), flat(1)]);
    const start = beatLuma(seq, { at: 0, align: "center" });
    const end = beatLuma(seq, { at: 1, align: "center" });

    assert.ok(start < 0.1, `start should be dark, got ${start}`);
    assert.ok(end > 0.9, `end should be bright, got ${end}`);
  });

  it("reads the region the copy actually sits over", () => {
    const seq = sequenceOf([columns([0, 1])]);
    const left = beatLuma(seq, { at: 0, align: "left" });
    const right = beatLuma(seq, { at: 0, align: "right" });

    assert.ok(left > 0.9, `left should be bright, got ${left}`);
    assert.ok(right < 0.1, `right should be dark, got ${right}`);
  });

  it("reads the bottom of the frame for a bottom-anchored beat", () => {
    const bottomLit = sequenceOf([rows([3])]);
    const topLit = sequenceOf([rows([0])]);

    const overBottom = beatLuma(bottomLit, { at: 0, align: "center", anchor: "bottom" });
    const overTop = beatLuma(topLit, { at: 0, align: "center", anchor: "bottom" });

    assert.ok(overBottom > overTop, `${overBottom} should exceed ${overTop}`);
  });

  it("reads the aligned side for a bottom-anchored beat", () => {
    // The check has to mirror where the page puts the copy, and `anchor` and
    // `align` are independent there. A check that averaged the full width
    // would report the wrong luma for either of two bottom-anchored beats sat
    // on opposite sides of the frame — and reporting is the whole job.
    const seq = sequenceOf([columns([0, 1])]);
    const left = beatLuma(seq, { at: 0, align: "left", anchor: "bottom" });
    const right = beatLuma(seq, { at: 0, align: "right", anchor: "bottom" });

    assert.ok(left > 0.9, `left should be bright, got ${left}`);
    assert.ok(right < 0.1, `right should be dark, got ${right}`);
  });

  it("clamps a beat declared outside the scroll range", () => {
    const seq = sequenceOf([flat(0.2), flat(0.8)]);
    for (const at of [-1, 0, 1, 2]) {
      const v = beatLuma(seq, { at, align: "center" });
      assert.ok(v >= 0, `${at} gave ${v}`);
      assert.ok(v <= 1, `${at} gave ${v}`);
    }
  });

  it("returns a usable number when the sequence has no grid", () => {
    const bare = { id: "x", width: 1, height: 1, totalFrames: 0, lumaGrid: [], edgeColors: [] };
    const v = beatLuma(bare, { at: 0.5, align: "center" });
    assert.ok(Number.isFinite(v), `got ${v}`);
  });
});
