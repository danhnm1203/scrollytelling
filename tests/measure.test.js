/**
 * Measurement math, over raw pixel buffers.
 *
 * These are pure functions on a buffer, so a test can hand them an image whose
 * correct answer is known by construction rather than round-tripping through an
 * encoder and asserting on values nobody can verify by eye.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { edgeColor, lumaOf, lumaGrid, LUMA_COLS, LUMA_ROWS } from "../lib/measure.mjs";

/** A width x height RGB buffer, filled by a per-pixel function. */
function image(width, height, at) {
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = at(x, y);
      const i = (y * width + x) * 3;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
    }
  }
  return buf;
}

describe("lumaOf", () => {
  it("uses Rec. 709 coefficients", () => {
    // Compared with a tolerance, not for exact equality: the coefficients sum
    // to 1 in decimal but to 0.9999999999999999 in binary floating point, and a
    // 1e-16 shortfall on a value that picks a scrim opacity means nothing.
    assert.ok(Math.abs(lumaOf(255, 255, 255) - 1) < 1e-9);
    assert.equal(lumaOf(0, 0, 0), 0);

    // The actual coefficients, not just their ordering. Asserting only that
    // green beats red beats blue passes for any number of wrong weightings —
    // a deliberate 0.2126/0.7152 -> 0.2526/0.6752 shift survived it, and
    // nothing else in the suite noticed either.
    assert.ok(Math.abs(lumaOf(255, 0, 0) - 0.2126) < 1e-6, `red ${lumaOf(255, 0, 0)}`);
    assert.ok(Math.abs(lumaOf(0, 255, 0) - 0.7152) < 1e-6, `green ${lumaOf(0, 255, 0)}`);
    assert.ok(Math.abs(lumaOf(0, 0, 255) - 0.0722) < 1e-6, `blue ${lumaOf(0, 0, 255)}`);
  });

  it("returns a value in 0..1", () => {
    for (const [r, g, b] of [
      [0, 0, 0],
      [255, 255, 255],
      [128, 64, 200],
    ]) {
      const l = lumaOf(r, g, b);
      assert.ok(l >= 0, `${l} below 0`);
      assert.ok(l <= 1, `${l} above 1`);
    }
  });
});

describe("edgeColor", () => {
  it("reports the border color of an image whose border is one flat color", () => {
    // Red border, blue middle. The middle must not influence the answer.
    const w = 100;
    const h = 100;
    const buf = image(w, h, (x, y) => {
      const nearEdge = x < 10 || y < 10 || x >= w - 10 || y >= h - 10;
      return nearEdge ? [200, 30, 30] : [0, 0, 255];
    });

    const [r, g, b] = edgeColor(buf, w, h);

    assert.ok(Math.abs(r - 200) <= 2, `r was ${r}`);
    assert.ok(Math.abs(g - 30) <= 2, `g was ${g}`);
    assert.ok(Math.abs(b - 30) <= 2, `b was ${b}`);
  });

  it("returns whole numbers in 0..255", () => {
    const buf = image(40, 40, () => [17, 99, 233]);
    for (const c of edgeColor(buf, 40, 40)) {
      assert.ok(Number.isInteger(c), `${c} is not an integer`);
      assert.ok(c >= 0, `${c} below 0`);
      assert.ok(c <= 255, `${c} above 255`);
    }
  });

  it("weights all four sides, not just one", () => {
    // Black everywhere except a white bottom edge. A reader that only sampled
    // the top would report pure black and miss the seam entirely.
    const w = 60;
    const h = 60;
    const buf = image(w, h, (_x, y) => (y >= h - 3 ? [255, 255, 255] : [0, 0, 0]));

    const [r] = edgeColor(buf, w, h);
    assert.ok(r > 0, "bottom edge must contribute");
  });

  it("samples a narrow band, not a wide one", () => {
    // A thin dark rim around a white field. The reported color must come from
    // the rim; a band several times wider would pull the white in and lighten
    // it. The whole-pipeline test cannot see this — its fixture has a thick
    // stripe and a flat body, so band width makes almost no difference there.
    const size = 200;
    const rim = Math.round(size * 0.02);
    const buf = image(size, size, (x, y) => {
      const onRim = x < rim || y < rim || x >= size - rim || y >= size - rim;
      return onRim ? [0, 0, 0] : [255, 255, 255];
    });

    const [r] = edgeColor(buf, size, size);
    assert.ok(r < 40, `expected the rim color, got ${r} — the band is reaching too far in`);
  });

  it("handles an image smaller than the sampling band", () => {
    const buf = image(2, 2, () => [10, 20, 30]);
    assert.deepEqual(edgeColor(buf, 2, 2), [10, 20, 30]);
  });
});

describe("lumaGrid", () => {
  it("returns one value per cell, row-major", () => {
    const buf = image(LUMA_COLS, LUMA_ROWS, () => [128, 128, 128]);
    const grid = lumaGrid(buf, LUMA_COLS, LUMA_ROWS);

    assert.equal(grid.length, LUMA_COLS * LUMA_ROWS);
    assert.equal(grid.length, 24);
  });

  it("increases left to right across a horizontal gradient", () => {
    const buf = image(LUMA_COLS, LUMA_ROWS, (x) => {
      const v = Math.round((x / (LUMA_COLS - 1)) * 255);
      return [v, v, v];
    });

    const grid = lumaGrid(buf, LUMA_COLS, LUMA_ROWS);

    // Row-major: first row is cells 0..5.
    for (let x = 1; x < LUMA_COLS; x++) {
      assert.ok(grid[x] > grid[x - 1], `cell ${x} should be brighter than ${x - 1}`);
    }
  });

  it("distinguishes rows, so a bright band at the bottom is visible", () => {
    const buf = image(LUMA_COLS, LUMA_ROWS, (_x, y) =>
      y === LUMA_ROWS - 1 ? [255, 255, 255] : [0, 0, 0],
    );

    const grid = lumaGrid(buf, LUMA_COLS, LUMA_ROWS);
    const firstRow = grid.slice(0, LUMA_COLS);
    const lastRow = grid.slice((LUMA_ROWS - 1) * LUMA_COLS);

    assert.ok(Math.max(...firstRow) < 0.01);
    assert.ok(Math.min(...lastRow) > 0.99);
  });

  it("returns values in 0..1", () => {
    const buf = image(LUMA_COLS, LUMA_ROWS, (x, y) => [x * 40, y * 60, 255 - x * 30]);
    for (const v of lumaGrid(buf, LUMA_COLS, LUMA_ROWS)) {
      assert.ok(v >= 0, `${v} below 0`);
      assert.ok(v <= 1, `${v} above 1`);
    }
  });
});
