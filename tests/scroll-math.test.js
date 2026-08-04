/**
 * The math that decides how the page looks.
 *
 * Pure functions, no DOM. This is the seam the whole approach rests on: if
 * these are only checkable in a browser, then whether the page is right is a
 * matter of opinion rather than a matter of fact.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  scrollProgress,
  frameIndex,
  selectSequence,
  computeScale,
  lerpColor,
  scrollHeightVh,
} from "../lib/scroll-math.mjs";

const LANDSCAPE = { id: "landscape", width: 1280, height: 720, totalFrames: 50 };
const PORTRAIT = { id: "portrait", width: 810, height: 1440, totalFrames: 50 };

describe("scrollProgress", () => {
  it("is 0 at the top and 1 at the bottom", () => {
    assert.equal(scrollProgress(0, 4000, 1000), 0);
    assert.equal(scrollProgress(3000, 4000, 1000), 1);
  });

  it("is linear in between", () => {
    assert.equal(scrollProgress(1500, 4000, 1000), 0.5);
  });

  it("survives a page shorter than the viewport", () => {
    // Division by zero here would make every frame index NaN.
    assert.equal(scrollProgress(0, 500, 1000), 0);
    assert.ok(Number.isFinite(scrollProgress(10, 500, 1000)));
  });

  it("keeps story position across a page-height change", () => {
    // What rotating a phone does: the sequence swaps, the document gets
    // taller or shorter, and the visitor must not be moved in the story.
    const before = scrollProgress(1500, 4000, 1000);
    const scrollYAfter = before * (7000 - 1000);
    assert.equal(scrollProgress(scrollYAfter, 7000, 1000), before);
  });
});

describe("frameIndex", () => {
  it("spans 0 to the last frame", () => {
    assert.equal(frameIndex(0, 50), 0);
    assert.equal(frameIndex(1, 50), 49);
  });

  it("clamps out-of-range progress instead of throwing", () => {
    // iOS rubber-band scrolling produces these on its own; an unclamped lookup
    // returns undefined and destructuring it throws inside the draw loop,
    // killing scrubbing for the rest of the session.
    assert.equal(frameIndex(-0.2, 50), 0);
    assert.equal(frameIndex(1.3, 50), 49);
  });

  it("never returns an index outside the array", () => {
    for (const p of [-5, -0.001, 0, 0.5, 0.999, 1, 1.001, 99]) {
      const i = frameIndex(p, 50);
      assert.ok(i >= 0, `${p} produced ${i}`);
      assert.ok(i <= 49, `${p} produced ${i}`);
    }
  });

  it("handles a single-frame sequence", () => {
    assert.equal(frameIndex(0, 1), 0);
    assert.equal(frameIndex(1, 1), 0);
  });

  it("returns a fractional index so the background can interpolate", () => {
    const i = frameIndex(0.5, 50);
    assert.ok(i > 24 && i < 25, `expected a value between frames, got ${i}`);
  });
});

describe("selectSequence", () => {
  const both = [LANDSCAPE, PORTRAIT];

  it("picks the landscape source on a desktop viewport", () => {
    assert.equal(selectSequence(1440, 900, both).id, "landscape");
  });

  it("picks the portrait source on a phone viewport", () => {
    assert.equal(selectSequence(375, 812, both).id, "portrait");
  });

  it("picks the only sequence when there is one", () => {
    assert.equal(selectSequence(375, 812, [LANDSCAPE]).id, "landscape");
  });

  it("returns null for an empty collection rather than throwing", () => {
    // A freshly scaffolded project has no frames yet.
    assert.equal(selectSequence(1440, 900, []), null);
  });

  it("is stable across repeated calls", () => {
    assert.equal(selectSequence(1024, 768, both).id, selectSequence(1024, 768, both).id);
  });
});

describe("computeScale", () => {
  const drawn = (vw, vh, seq) => {
    const s = computeScale(vw, vh, seq);
    return { w: seq.width * s, h: seq.height * s };
  };

  it("fills the viewport when the source suits it", () => {
    // Portrait source on a phone: this is the case the portrait sequence exists
    // for, and leaving bars around it would defeat the point.
    const { w, h } = drawn(375, 812, PORTRAIT);
    assert.ok(w >= 375 - 0.5, `width ${w} should cover 375`);
    assert.ok(h >= 812 - 0.5, `height ${h} should cover 812`);
  });

  it("keeps the whole frame when the source does not suit the viewport", () => {
    // Landscape source on a phone, before the sequence switches. Cropping to
    // fill here would cut most of the subject away.
    const { w, h } = drawn(375, 812, LANDSCAPE);
    assert.ok(w <= 375 + 0.5, `width ${w} should fit inside 375`);
    assert.ok(h <= 812 + 0.5, `height ${h} should fit inside 812`);
  });

  it("keeps the whole frame on an ultrawide monitor", () => {
    const { w, h } = drawn(3440, 1440, LANDSCAPE);
    assert.ok(w <= 3440 + 0.5);
    assert.ok(h <= 1440 + 0.5);
  });

  it("fills exactly when the aspect ratios match", () => {
    const { w, h } = drawn(1920, 1080, LANDSCAPE);
    assert.ok(Math.abs(w - 1920) < 0.5);
    assert.ok(Math.abs(h - 1080) < 0.5);
  });

  it("never crops more than a quarter of either dimension", () => {
    // A crop past this point starts eating the subject, whatever the viewport.
    for (const [vw, vh] of [
      [1440, 900],
      [1920, 1080],
      [1366, 768],
      [375, 812],
      [3440, 1440],
    ]) {
      for (const seq of [LANDSCAPE, PORTRAIT]) {
        const { w, h } = drawn(vw, vh, seq);
        const croppedX = Math.max(0, (w - vw) / w);
        const croppedY = Math.max(0, (h - vh) / h);
        assert.ok(croppedX <= 0.25, `${seq.id} at ${vw}x${vh} cropped ${croppedX} of width`);
        assert.ok(croppedY <= 0.25, `${seq.id} at ${vw}x${vh} cropped ${croppedY} of height`);
      }
    }
  });

  it("returns a positive, finite scale for every viewport", () => {
    for (const [vw, vh] of [
      [320, 480],
      [1, 1],
      [5000, 200],
    ]) {
      const s = computeScale(vw, vh, LANDSCAPE);
      assert.ok(Number.isFinite(s), `${vw}x${vh} gave ${s}`);
      assert.ok(s > 0, `${vw}x${vh} gave ${s}`);
    }
  });
});

describe("lerpColor", () => {
  it("returns the endpoints exactly", () => {
    assert.deepEqual(lerpColor([0, 0, 0], [255, 255, 255], 0), [0, 0, 0]);
    assert.deepEqual(lerpColor([0, 0, 0], [255, 255, 255], 1), [255, 255, 255]);
  });

  it("meets in the middle", () => {
    assert.deepEqual(lerpColor([0, 100, 200], [100, 200, 0], 0.5), [50, 150, 100]);
  });

  it("clamps out-of-range mixes", () => {
    assert.deepEqual(lerpColor([10, 10, 10], [20, 20, 20], -1), [10, 10, 10]);
    assert.deepEqual(lerpColor([10, 10, 10], [20, 20, 20], 2), [20, 20, 20]);
  });

  it("returns whole numbers, because it becomes a CSS color", () => {
    for (const c of lerpColor([0, 1, 2], [253, 254, 255], 0.37)) {
      assert.ok(Number.isInteger(c), `${c} is not an integer`);
    }
  });
});

describe("scrollHeightVh", () => {
  it("grows with the frame count so scroll per frame stays constant", () => {
    const fifty = scrollHeightVh(50);
    const hundred = scrollHeightVh(100);
    assert.ok(Math.abs(hundred / fifty - 2) < 0.01, `${fifty} then ${hundred} is not proportional`);
  });

  it("keeps a floor so a very short sequence is still scrollable", () => {
    assert.ok(scrollHeightVh(1) >= 300);
    assert.ok(scrollHeightVh(5) >= 300);
  });

  it("has no upper clamp", () => {
    // A ceiling would reintroduce the exact problem this formula exists to
    // avoid: scroll-per-frame silently changing past some frame count.
    const a = scrollHeightVh(150);
    const b = scrollHeightVh(300);
    assert.ok(b > a, `${a} then ${b} — the ceiling is back`);
    assert.ok(Math.abs(b / a - 2) < 0.01);
  });
});
