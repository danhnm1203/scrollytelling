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

/**
 * Where this page is served from, once `frames --site-url <url>` has
 * recorded one. `undefined` until then, which is why a template reads it
 * through a namespace import rather than a named one: the value is written
 * into frames.js only when it is known, and a named import of an export
 * that is not there fails at build time.
 *
 * Declared here rather than in the .js stub on purpose. This file is static
 * and `frames` never rewrites it, so changing it cannot make a project's
 * GENERATED contract look edited to `scaffold --diff`.
 */
export declare const SITE_URL: string | undefined;

/** Ordered by preference; empty until footage has been processed. */
export declare const SEQUENCES: readonly Sequence[];

/** Where a given frame of a given sequence is served from. */
export declare function framePath(sequenceId: string, index: number): string;
