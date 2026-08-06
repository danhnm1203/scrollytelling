/**
 * What to draw, where, and in what colour.
 *
 * The last of the engine's decisions that still lived inside the animation
 * frame. Every one of these is wrong in a way that looks like "the page is
 * slightly off" rather than like an error: the image lands a few pixels out,
 * the background does not match the frame edge so the canvas shows as a
 * rectangle, the loop never stops and drains the battery, or a gap in the
 * decoded window paints nothing at all.
 *
 * None of that throws, which is exactly why it is arithmetic with tests.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  backgroundColor,
  canvasSize,
  drawRect,
  nearestDecoded,
  nextEased,
} from "../lib/scroll-engine-state.mjs";

const SEQUENCE = {
  id: "landscape",
  width: 1280,
  height: 720,
  totalFrames: 4,
  edgeColors: [
    [0, 0, 0],
    [100, 100, 100],
    [200, 200, 200],
    [255, 255, 255],
  ],
};

describe("nextEased", () => {
  it("snaps to the target on the first paint of a run", () => {
    // Easing from wherever the previous run stopped would sweep the whole
    // sequence on a mid-page reload, and on a rotation would fight the scroll
    // restore that just ran.
    const { eased } = nextEased({
      previous: 0.9,
      target: 0.2,
      primed: false,
      seconds: 0.35,
      deltaMs: 16,
      totalFrames: 50,
    });
    assert.equal(eased, 0.2);
  });

  it("trails the target once primed", () => {
    const { eased } = nextEased({
      previous: 0,
      target: 1,
      primed: true,
      seconds: 0.35,
      deltaMs: 16,
      totalFrames: 50,
    });
    assert.ok(eased > 0, `expected to have moved off the start, got ${eased}`);
    assert.ok(eased < 1, `expected not to have arrived yet, got ${eased}`);
  });

  it("keeps animating while it is still catching up", () => {
    const { animating } = nextEased({
      previous: 0,
      target: 1,
      primed: true,
      seconds: 0.35,
      deltaMs: 16,
      totalFrames: 50,
    });
    assert.equal(animating, true);
  });

  it("stops once the gap is too small to see", () => {
    // Exponential easing approaches without arriving, so something has to call
    // it. Without this the animation frame loop stays alive for the life of
    // the page, redrawing a frame that is not changing.
    const { eased, animating } = nextEased({
      previous: 0.4999999,
      target: 0.5,
      primed: true,
      seconds: 0.35,
      deltaMs: 16,
      totalFrames: 50,
    });
    assert.equal(eased, 0.5, "should land exactly on the target, not near it");
    assert.equal(animating, false);
  });

  it("does not animate when it is already there", () => {
    const { eased, animating } = nextEased({
      previous: 0.5,
      target: 0.5,
      primed: true,
      seconds: 0.35,
      deltaMs: 16,
      totalFrames: 50,
    });
    assert.equal(eased, 0.5);
    assert.equal(animating, false);
  });

  it("snapping on the first paint does not leave the loop running", () => {
    const { animating } = nextEased({
      previous: 0.9,
      target: 0.2,
      primed: false,
      seconds: 0.35,
      deltaMs: 0,
      totalFrames: 50,
    });
    assert.equal(animating, false);
  });
});

describe("backgroundColor", () => {
  it("uses the frame's own edge colour on an exact frame", () => {
    assert.deepEqual(backgroundColor({ sequence: SEQUENCE, exact: 1 }), [100, 100, 100]);
  });

  it("interpolates between the two frames it sits between", () => {
    assert.deepEqual(backgroundColor({ sequence: SEQUENCE, exact: 1.5 }), [150, 150, 150]);
  });

  it("holds the last colour at the end of the sequence", () => {
    assert.deepEqual(backgroundColor({ sequence: SEQUENCE, exact: 3 }), [255, 255, 255]);
  });

  it("holds the last colour rather than indexing past the end", () => {
    // Callers clamp today, so nothing reaches this — which is exactly why it
    // needs a test rather than an assumption. Unclamped, ceil(3.7) is 4,
    // edgeColors[4] is undefined, and interpolating towards it throws. If it
    // did not throw it would paint "rgb(NaN NaN NaN)", turning the canvas into
    // the visible rectangle this whole mechanism exists to prevent.
    assert.deepEqual(backgroundColor({ sequence: SEQUENCE, exact: 3.7 }), [255, 255, 255]);
  });

  it("holds the first colour at the start", () => {
    assert.deepEqual(backgroundColor({ sequence: SEQUENCE, exact: 0 }), [0, 0, 0]);
  });
});

describe("drawRect", () => {
  it("fills the viewport when the aspect ratios match", () => {
    const rect = drawRect({ viewportWidth: 1280, viewportHeight: 720, sequence: SEQUENCE });
    assert.deepEqual(rect, { x: 0, y: 0, width: 1280, height: 720 });
  });

  it("centres horizontally", () => {
    const rect = drawRect({ viewportWidth: 1000, viewportHeight: 1000, sequence: SEQUENCE });
    assert.equal(rect.x, (1000 - rect.width) / 2);
  });

  it("shows more of the top when the image is cropped vertically", () => {
    // Subjects usually sit above centre, so splitting the overflow evenly
    // crops foreheads. Nudging the image down keeps the subject in frame.
    //
    // 1800x900 against a 16:9 source is a 1.125 aspect mismatch, inside the
    // 1.25 that computeScale will crop for — so the width fits and the height
    // overflows, which is the case this constant exists for.
    const rect = drawRect({ viewportWidth: 1800, viewportHeight: 900, sequence: SEQUENCE });
    assert.ok(rect.height > 900, "expected a vertical crop for this viewport");

    const centred = (900 - rect.height) / 2;
    assert.ok(rect.y > centred, "a cropped image should sit lower than dead centre");
  });

  it("sits a little high when the image is letterboxed instead", () => {
    // The same constant, the other side of the sign. 1000x1000 is a 1.78
    // mismatch, past the crop budget, so it letterboxes — and 45% of the slack
    // above means the image sits slightly high rather than centred.
    const rect = drawRect({ viewportWidth: 1000, viewportHeight: 1000, sequence: SEQUENCE });
    assert.ok(rect.height < 1000, "expected a letterbox for this viewport");

    const centred = (1000 - rect.height) / 2;
    assert.ok(rect.y < centred, "a letterboxed image should sit above dead centre");
  });

  it("keeps the source aspect ratio", () => {
    const rect = drawRect({ viewportWidth: 900, viewportHeight: 1600, sequence: SEQUENCE });
    const sourceAspect = SEQUENCE.width / SEQUENCE.height;
    assert.ok(Math.abs(rect.width / rect.height - sourceAspect) < 1e-9);
  });
});

describe("nearestDecoded", () => {
  it("uses the exact frame when it is held", () => {
    assert.equal(nearestDecoded({ exact: 2, held: [1, 2, 3], totalFrames: 10 }), 2);
  });

  it("rounds to the nearest frame index", () => {
    assert.equal(nearestDecoded({ exact: 2.4, held: [0, 1, 2, 3], totalFrames: 10 }), 2);
    assert.equal(nearestDecoded({ exact: 2.6, held: [0, 1, 2, 3], totalFrames: 10 }), 3);
  });

  it("falls back outward when the exact frame is not decoded yet", () => {
    // The normal case, not an edge case: frames beyond the window are
    // deliberately not held, so a gap must never paint a blank canvas.
    assert.equal(nearestDecoded({ exact: 5, held: [3], totalFrames: 10 }), 3);
  });

  it("prefers the earlier frame when both neighbours are equally close", () => {
    // Arbitrary but fixed. Without a rule the drawn frame flickers between two
    // on alternating paints.
    assert.equal(nearestDecoded({ exact: 5, held: [4, 6], totalFrames: 10 }), 4);
  });

  it("returns null when nothing is decoded at all", () => {
    // The caller has to skip the draw entirely. Returning 0 here would paint
    // whatever happened to be at index 0, which is not held either.
    assert.equal(nearestDecoded({ exact: 5, held: [], totalFrames: 10 }), null);
  });

  it("never searches outside the sequence", () => {
    assert.equal(nearestDecoded({ exact: 0, held: [9], totalFrames: 10 }), 9);
    assert.equal(nearestDecoded({ exact: 9, held: [0], totalFrames: 10 }), 0);
  });

  it("accepts a Map's keys, which is what the caller holds", () => {
    const held = new Map([
      [4, "bitmap"],
      [7, "bitmap"],
    ]);
    assert.equal(nearestDecoded({ exact: 6, held: held.keys(), totalFrames: 10 }), 7);
  });
});

describe("canvasSize", () => {
  it("scales the backing store by the device pixel ratio", () => {
    assert.deepEqual(canvasSize({ viewportWidth: 800, viewportHeight: 600, devicePixelRatio: 2 }), {
      width: 1600,
      height: 1200,
      ratio: 2,
    });
  });

  it("caps the ratio, because past a point more pixels only cost", () => {
    assert.deepEqual(canvasSize({ viewportWidth: 800, viewportHeight: 600, devicePixelRatio: 3 }), {
      width: 1600,
      height: 1200,
      ratio: 2,
    });
  });

  it("falls back to 1 when the browser does not report a ratio", () => {
    // devicePixelRatio is 0 or undefined in some embedded webviews. Multiplying
    // by it gives a zero-sized canvas, which draws nothing and reports no error.
    assert.deepEqual(canvasSize({ viewportWidth: 800, viewportHeight: 600, devicePixelRatio: 0 }), {
      width: 800,
      height: 600,
      ratio: 1,
    });
    assert.deepEqual(canvasSize({ viewportWidth: 800, viewportHeight: 600 }), {
      width: 800,
      height: 600,
      ratio: 1,
    });
  });

  it("returns the ratio it used, for the drawing transform", () => {
    // Re-deriving it from width/viewportWidth would pick up the rounding and
    // put the transform slightly out of step with the buffer it draws into.
    assert.equal(
      canvasSize({ viewportWidth: 801, viewportHeight: 601, devicePixelRatio: 1.5 }).ratio,
      1.5,
    );
  });

  it("rounds to whole pixels", () => {
    // A fractional backing store is silently rounded by the browser, and the
    // mismatch shows up as a blurry canvas rather than an error.
    const size = canvasSize({ viewportWidth: 801, viewportHeight: 601, devicePixelRatio: 1.5 });
    assert.equal(size.width, Math.round(801 * 1.5));
    assert.equal(size.height, Math.round(601 * 1.5));
  });
});
