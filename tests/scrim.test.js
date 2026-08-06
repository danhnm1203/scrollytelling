/**
 * Beat fading and the adaptive scrim.
 *
 * Both are pure, so "is this copy readable" becomes a question with an answer
 * rather than a matter of opinion held in front of a browser.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fadeOpacity, visibleRect, scrimOpacity } from "../lib/scroll-math.mjs";

const BEATS = [
  { at: 0.0, align: "center" },
  { at: 0.3, align: "left" },
  { at: 0.6, align: "right" },
  { at: 0.92, align: "center", anchor: "bottom" },
];

/** 6x4 grid, every cell the same luminance. */
const flat = (v) => Array.from({ length: 24 }, () => v);

/** 6x4 grid where only the given column indices are bright. */
const brightColumns = (cols) =>
  Array.from({ length: 24 }, (_, i) => (cols.includes(i % 6) ? 1 : 0));

/** 6x4 grid where only the given row indices are bright. */
const brightRows = (rows) => Array.from({ length: 24 }, (_, i) => (rows.includes(Math.floor(i / 6)) ? 1 : 0));

const sequenceWith = (grid) => ({
  id: "landscape",
  width: 1280,
  height: 720,
  totalFrames: 1,
  lumaGrid: [grid],
});

describe("fadeOpacity", () => {
  it("shows a beat fully at its declared position", () => {
    BEATS.forEach((_, i) => {
      assert.equal(fadeOpacity(BEATS, i, BEATS[i].at), 1, `beat ${i} not full at its own position`);
    });
  });

  it("holds the first beat from the very top", () => {
    assert.equal(fadeOpacity(BEATS, 0, 0), 1);
  });

  it("holds the last beat to the very bottom", () => {
    assert.equal(fadeOpacity(BEATS, BEATS.length - 1, 1), 1);
  });

  it("hides a beat once its neighbour is fully shown", () => {
    // Beat 1 is gone by the time beat 2 is at full, and vice versa. Note this
    // is the neighbour's position, NOT the midpoint: windows that stop at the
    // midpoint leave a stretch where both beats are near zero and the page
    // shows footage with no copy on it.
    assert.equal(fadeOpacity(BEATS, 1, BEATS[2].at), 0);
    assert.equal(fadeOpacity(BEATS, 2, BEATS[1].at), 0);
  });

  it("crossfades, so two adjacent beats sum to full", () => {
    for (const p of [0.35, 0.45, 0.55]) {
      const sum = fadeOpacity(BEATS, 1, p) + fadeOpacity(BEATS, 2, p);
      assert.ok(Math.abs(sum - 1) < 1e-9, `at ${p} the pair summed to ${sum}`);
    }
  });

  it("fades rather than jumping", () => {
    const mid = (0.3 + 0.6) / 2;
    const partial = fadeOpacity(BEATS, 1, mid);
    assert.ok(partial > 0 && partial < 1, `expected a partial fade, got ${partial}`);
  });

  it("holds a beat at full opacity for a stretch either side of its position", () => {
    // The complaint this answers: a linear ramp all the way to the neighbour
    // means a beat is at full strength for one instant and dimmed everywhere
    // else, so the copy reads as permanently washed out.
    assert.equal(fadeOpacity(BEATS, 1, 0.32), 1, "just after its own position");
    assert.equal(fadeOpacity(BEATS, 1, 0.28), 1, "just before its own position");
    assert.equal(fadeOpacity(BEATS, 2, 0.32), 0, "the next beat has not started");
  });

  it("spends only a short stretch with neither beat clearly winning", () => {
    // Both beats half-lit is the state that reads as broken. It cannot be
    // removed — two opacities summing to 1 must cross at 0.5 — so what matters
    // is how much of the scroll is spent there.
    let muddy = 0;
    let samples = 0;
    for (let p = 0.3; p <= 0.6001; p += 0.002) {
      const a = fadeOpacity(BEATS, 1, p);
      const b = fadeOpacity(BEATS, 2, p);
      if (a > 0.15 && a < 0.85 && b > 0.15 && b < 0.85) muddy++;
      samples++;
    }
    const fraction = muddy / samples;
    assert.ok(fraction < 0.3, `${(fraction * 100).toFixed(0)}% of the gap had both beats dim`);
  });

  it("never steps: the fade is continuous across the whole handoff", () => {
    // A hold band bounded by an abrupt edge would trade a wash for a flicker.
    let previous = fadeOpacity(BEATS, 1, 0.3);
    for (let p = 0.3; p <= 0.6001; p += 0.002) {
      const here = fadeOpacity(BEATS, 1, p);
      assert.ok(Math.abs(here - previous) < 0.05, `jumped from ${previous} to ${here} at ${p}`);
      previous = here;
    }
  });

  it("never leaves the page with nothing visible", () => {
    // Every scroll position must have at least one beat carrying the story.
    for (let p = 0; p <= 1.0001; p += 0.02) {
      const total = BEATS.reduce((sum, _, i) => sum + fadeOpacity(BEATS, i, p), 0);
      assert.ok(total > 0.4, `at ${p.toFixed(2)} the copy nearly vanished (total ${total})`);
    }
  });

  it("stays in 0..1 everywhere, including out of range", () => {
    for (const p of [-1, -0.01, 0, 0.5, 1, 1.01, 5]) {
      BEATS.forEach((_, i) => {
        const o = fadeOpacity(BEATS, i, p);
        assert.ok(o >= 0, `beat ${i} at ${p} gave ${o}`);
        assert.ok(o <= 1, `beat ${i} at ${p} gave ${o}`);
      });
    }
  });

  it("leaves one beat lit and the rest dark once the page has settled", () => {
    // Stopping between two beats leaves both part-lit, which is the state that
    // reads as broken however short it is. Nothing is being handed over on a
    // page nobody is scrolling, so the copy resolves onto whichever beat was
    // already winning.
    const mid = (0.3 + 0.6) / 2;
    const lit = BEATS.map((_, i) => fadeOpacity(BEATS, i, mid, 1));
    assert.deepEqual(lit, [0, 1, 0, 0]);
  });

  it("resolves onto the beat that was already dominant, not the nearest by index", () => {
    const justPast = 0.58;
    assert.equal(fadeOpacity(BEATS, 2, justPast, 1), 1);
    assert.equal(fadeOpacity(BEATS, 1, justPast, 1), 0);
  });

  it("breaks an exact tie toward the earlier beat", () => {
    // Arbitrary but fixed. Without a rule the copy flickers between two beats
    // on a position that lands exactly between them.
    const tie = [{ at: 0.4 }, { at: 0.6 }];
    assert.equal(fadeOpacity(tie, 0, 0.5, 1), 1);
    assert.equal(fadeOpacity(tie, 1, 0.5, 1), 0);
  });

  it("still sums to one part way through resolving", () => {
    // The reason no scroll position is ever left with no copy on it. It has to
    // hold during the resolve too, not only at either end of it.
    for (const focus of [0, 0.25, 0.5, 0.75, 1]) {
      for (const p of [0.35, 0.45, 0.55, 0.7, 0.85]) {
        const total = BEATS.reduce((sum, _, i) => sum + fadeOpacity(BEATS, i, p, focus), 0);
        assert.ok(Math.abs(total - 1) < 1e-9, `focus ${focus} at ${p} summed to ${total}`);
      }
    }
  });

  it("is the plain crossfade when nothing has settled", () => {
    for (const p of [0.35, 0.45, 0.55]) {
      BEATS.forEach((_, i) => {
        assert.equal(fadeOpacity(BEATS, i, p, 0), fadeOpacity(BEATS, i, p));
      });
    }
  });

  it("handles a single beat", () => {
    const one = [{ at: 0.5, align: "center" }];
    assert.equal(fadeOpacity(one, 0, 0), 1);
    assert.equal(fadeOpacity(one, 0, 1), 1);
  });

  it("survives beats declared out of order", () => {
    const messy = [{ at: 0.8, align: "center" }, { at: 0.2, align: "left" }];
    for (const p of [0, 0.5, 1]) {
      messy.forEach((_, i) => {
        const o = fadeOpacity(messy, i, p);
        assert.ok(Number.isFinite(o), `beat ${i} at ${p} gave ${o}`);
      });
    }
  });
});

describe("visibleRect", () => {
  const seq = { width: 1280, height: 720 };

  it("is the whole frame when nothing is cropped", () => {
    // Contain: the entire source is on screen.
    const r = visibleRect(375, 812, seq, Math.min(375 / 1280, 812 / 720));
    assert.ok(r.x0 <= 0.001, `x0 was ${r.x0}`);
    assert.ok(r.x1 >= 0.999, `x1 was ${r.x1}`);
  });

  it("narrows horizontally when the sides are cropped away", () => {
    // Cover on a 16:10 screen crops the left and right edges.
    const scale = Math.max(1440 / 1280, 900 / 720);
    const r = visibleRect(1440, 900, seq, scale);
    assert.ok(r.x0 > 0, `expected the left edge cropped, x0 was ${r.x0}`);
    assert.ok(r.x1 < 1, `expected the right edge cropped, x1 was ${r.x1}`);
    assert.ok(r.y0 <= 0.001, `y0 was ${r.y0}`);
    assert.ok(r.y1 >= 0.999, `y1 was ${r.y1}`);
  });

  it("is symmetric horizontally, because the frame is centred", () => {
    const scale = Math.max(1440 / 1280, 900 / 720);
    const r = visibleRect(1440, 900, seq, scale);
    assert.ok(Math.abs(r.x0 - (1 - r.x1)) < 1e-9, "crop should be even on both sides");
  });

  it("always returns a rectangle inside the source", () => {
    for (const [vw, vh, s] of [
      [1440, 900, 1.25],
      [375, 812, 0.29],
      [3440, 1440, 2.0],
      [100, 100, 5],
    ]) {
      const r = visibleRect(vw, vh, seq, s);
      assert.ok(r.x0 >= 0, `x0 below 0: ${r.x0}`);
      assert.ok(r.x1 <= 1, `x1 above 1: ${r.x1}`);
      assert.ok(r.y0 >= 0, `y0 below 0: ${r.y0}`);
      assert.ok(r.y1 <= 1, `y1 above 1: ${r.y1}`);
      assert.ok(r.x1 > r.x0, "width must be positive");
      assert.ok(r.y1 > r.y0, "height must be positive");
    }
  });
});

describe("scrimOpacity", () => {
  const whole = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const beat = (align, anchor) => ({ align, anchor });

  it("is near zero over dark footage", () => {
    const s = scrimOpacity(sequenceWith(flat(0)), 0, beat("center"), whole);
    assert.ok(s < 0.05, `dark footage should need almost no scrim, got ${s}`);
  });

  it("is strong over bright footage", () => {
    const s = scrimOpacity(sequenceWith(flat(1)), 0, beat("center"), whole);
    assert.ok(s > 0.6, `bright footage should need a strong scrim, got ${s}`);
  });

  it("rises as the footage brightens", () => {
    const dim = scrimOpacity(sequenceWith(flat(0.3)), 0, beat("center"), whole);
    const mid = scrimOpacity(sequenceWith(flat(0.5)), 0, beat("center"), whole);
    const hot = scrimOpacity(sequenceWith(flat(0.8)), 0, beat("center"), whole);
    assert.ok(dim < mid, `${dim} !< ${mid}`);
    assert.ok(mid < hot, `${mid} !< ${hot}`);
  });

  it("reads only the region behind that block", () => {
    // Left two columns bright, everything else black. A left-aligned beat must
    // see the bright part; a right-aligned one must not.
    const seq = sequenceWith(brightColumns([0, 1]));
    const left = scrimOpacity(seq, 0, beat("left"), whole);
    const right = scrimOpacity(seq, 0, beat("right"), whole);
    assert.ok(left > right, `left ${left} should exceed right ${right}`);
  });

  it("reads the bottom of the frame for a bottom-anchored beat", () => {
    const bottomLit = sequenceWith(brightRows([3]));
    const topLit = sequenceWith(brightRows([0]));
    const overBottomLit = scrimOpacity(bottomLit, 0, beat("center", "bottom"), whole);
    const overTopLit = scrimOpacity(topLit, 0, beat("center", "bottom"), whole);
    assert.ok(overBottomLit > overTopLit, `${overBottomLit} should exceed ${overTopLit}`);
  });

  it("reads the aligned side of the frame for a bottom-anchored beat", () => {
    // Two bottom-anchored beats no longer share one box: `align` moves them
    // apart horizontally, so the scrim has to follow them there. Reading full
    // width would average in footage the copy does not sit on — which is how a
    // beat over a dark corner gets the scrim of the bright one beside it.
    const seq = sequenceWith(brightColumns([0, 1]));
    const left = scrimOpacity(seq, 0, beat("left", "bottom"), whole);
    const right = scrimOpacity(seq, 0, beat("right", "bottom"), whole);
    assert.ok(left > right, `left ${left} should exceed right ${right}`);
  });

  it("still reads the lower half whatever the alignment", () => {
    const bottomLit = sequenceWith(brightRows([3]));
    const topLit = sequenceWith(brightRows([0]));
    for (const align of ["left", "center", "right"]) {
      const low = scrimOpacity(bottomLit, 0, beat(align, "bottom"), whole);
      const high = scrimOpacity(topLit, 0, beat(align, "bottom"), whole);
      assert.ok(low > high, `${align}: ${low} should exceed ${high}`);
    }
  });

  it("ignores cells that are cropped off screen", () => {
    // Only the outermost columns are bright. When the sides are cropped away
    // those pixels are not on screen, so a centred beat must not react to them.
    const seq = sequenceWith(brightColumns([0, 5]));
    const full = scrimOpacity(seq, 0, beat("center"), whole);
    const cropped = scrimOpacity(seq, 0, beat("center"), { x0: 0.25, y0: 0, x1: 0.75, y1: 1 });
    assert.ok(cropped <= full, `cropping should not increase the scrim: ${cropped} vs ${full}`);
  });

  it("never exceeds the cap, so the footage is never fully hidden", () => {
    const s = scrimOpacity(sequenceWith(flat(1)), 0, beat("center"), whole);
    assert.ok(s <= 0.75, `got ${s}`);
  });

  it("stays in range for every alignment and anchor", () => {
    for (const align of ["left", "center", "right"]) {
      for (const anchor of [undefined, "middle", "bottom"]) {
        for (const v of [0, 0.5, 1]) {
          const s = scrimOpacity(sequenceWith(flat(v)), 0, beat(align, anchor), whole);
          assert.ok(s >= 0, `${align}/${anchor}/${v} gave ${s}`);
          assert.ok(s <= 0.75, `${align}/${anchor}/${v} gave ${s}`);
        }
      }
    }
  });

  it("returns a usable value when the sequence has no grid", () => {
    // A hand-edited or older contract must not crash the page.
    const bare = { id: "x", width: 1, height: 1, totalFrames: 1, lumaGrid: [] };
    const s = scrimOpacity(bare, 0, beat("center"), whole);
    assert.ok(Number.isFinite(s), `got ${s}`);
    assert.ok(s >= 0, `${s} below 0`);
    assert.ok(s <= 0.75, `${s} above the cap`);
  });
});
