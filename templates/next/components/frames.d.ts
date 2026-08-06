/**
 * Types for frames.js.
 *
 * The data itself is plain JavaScript so a page with no build step can import
 * it; this file exists so editors and `tsc` still understand it. Same split as
 * lib/scroll-math.mjs and its .d.ts, for the same reason.
 *
 * Static, not generated. Only the values change when you run `frames` — their
 * shape does not — so regenerating this would be one more thing that can drift.
 */

export type Sequence = {
  id: string;
  width: number;
  height: number;
  totalFrames: number;
  /** That frame's own border color. The page paints it behind the canvas. */
  edgeColors: readonly (readonly [number, number, number])[];
  /** 6 columns x 4 rows, row-major, 0..1. */
  lumaGrid: readonly (readonly number[])[];
};

export declare const LUMA_COLS: number;
export declare const LUMA_ROWS: number;

/** Ordered by preference; empty until footage has been processed. */
export declare const SEQUENCES: readonly Sequence[];

/** Where a given frame of a given sequence is served from. */
export declare function framePath(sequenceId: string, index: number): string;
