/**
 * Decisions the scrubbing engine makes, with no DOM.
 *
 * Same seam as scroll-math: if these are only checkable in a browser, then
 * whether the page recovers is a matter of opinion rather than a matter of
 * fact. The engine keeps the canvas, the worker and the listeners; everything
 * it has to *decide* lives here.
 *
 *   worker alive ──▶ post to worker ──▶ bitmap arrives
 *        │
 *        ▼ onerror
 *   worker dead  ──▶ framesToRetry ──▶ decode on the main thread
 *
 * The failure this exists for is specific and silent. A worker whose URL 404s
 * still constructs — the browser hands back a perfectly valid Worker object and
 * reports the failure asynchronously — so a try/catch around construction never
 * fires. Every frame posted to it is a frame that never comes back. Without a
 * fallback the page sits at a loading percentage forever, with nothing in the
 * console and no timeout to rescue it.
 */

import { decodeWindow } from "./scroll-math.mjs";

/** @typedef {"worker" | "main"} DecodeStrategy */

/**
 * Where the next decode should happen.
 *
 * A failed worker is never retried. A worker URL that 404s will 404 again, and
 * retrying turns one dead request into an unbounded number of them.
 *
 * @param {{ canUseWorker: boolean, workerFailed: boolean }} capability
 * @returns {DecodeStrategy}
 */
export function decodeStrategy({ canUseWorker, workerFailed }) {
  return canUseWorker && !workerFailed ? "worker" : "main";
}

/**
 * The frames that were in flight when the worker died, and so need asking for
 * again somewhere else.
 *
 * This list is the difference between recovering and hanging. Nothing else will
 * ever ask for these indices: they are already marked pending, so the request
 * path skips them, and the arrival path that would clear them is attached to a
 * worker that is not going to answer.
 *
 * Held frames are excluded because they arrived before the worker died. Failed
 * frames are excluded because they failed on their own merits, and the worker
 * dying does not make them worth another round trip.
 *
 * Sorted ascending: the window is filled outward from wherever the visitor is,
 * so the pending set arrives unordered, and decoding in index order lands the
 * frames nearest the start of the window first.
 *
 * @param {{ pending: Iterable<number>, held: Iterable<number>, failed: Iterable<number> }} state
 * @returns {number[]}
 */
export function framesToRetry({ pending, held, failed }) {
  const settled = new Set([...held, ...failed]);
  const retry = new Set();
  for (const index of pending) {
    if (!settled.has(index)) retry.add(index);
  }
  return [...retry].sort((a, b) => a - b);
}

/**
 * @typedef {{ phase: "loading", done: number, total: number }
 *   | { phase: "ready", failed: number[] }
 *   | { phase: "failed" }} LoadState
 */

/**
 * What the page should be showing, now that one more opening frame has settled.
 *
 * "Settled" means resolved either way — decoded or failed. Only the opening
 * window counts: frames beyond it arrive because the visitor scrolled, long
 * after the page went ready, and letting those touch the load state would drag
 * a live page back to a loading percentage.
 *
 *   settled < initial ──▶ loading
 *   settled = initial ──┬─ every one failed ──▶ failed
 *                       └─ at least one decoded ──▶ ready
 *
 * A partial failure is deliberately `ready`. The draw loop falls back to the
 * nearest decoded frame, so a gap is a stutter rather than a stop, and refusing
 * to start over one missing file would be the worse page.
 *
 * Pass every failure so far; this narrows to the opening window itself, and
 * that narrowing is load-bearing. The opening request covers `capacity`
 * frames while only about half of them are opening frames, so frames past the
 * window can fail first. Counting those made a page whose opening frames had
 * all decoded report "no frames found" and refuse to render.
 *
 * Narrowed here rather than by the caller deliberately. A caller holding two
 * sets and picking the wrong one is a one-word regression that no test of this
 * function can catch; a caller holding one set has nothing to get wrong.
 *
 * Returned as indices rather than a count so a caller can say which frames are
 * missing without keeping a second copy of the set.
 *
 * @param {{ index: number, initial: number, settled: number,
 *   failed: Iterable<number> }} arrival every failed index so far
 * @returns {LoadState | null} null when this frame does not affect the load state
 */
export function loadStateAfter({ index, initial, settled, failed }) {
  if (index >= initial) return null;
  if (settled < initial) return { phase: "loading", done: settled, total: initial };

  const opening = [...failed].filter((i) => i < initial).sort((a, b) => a - b);
  if (opening.length >= initial) return { phase: "failed" };
  return { phase: "ready", failed: opening };
}

/**
 * Which frames to fetch and which to let go, for wherever the visitor now is.
 *
 * The window itself comes from decodeWindow, which owns the clamping and the
 * slide-rather-than-shrink behaviour at the ends. This adds the part that
 * depends on what is already in hand:
 *
 *   inside the window, not held/pending/failed ──▶ request
 *   held, outside the window                   ──▶ release
 *
 * Release is the half that matters for staying alive. A decoded frame is pinned
 * until it is explicitly closed, so anything held and never released is held
 * for the life of the page.
 *
 * Failed indices are not retried. The window sweeps back and forth across them
 * as the visitor scrolls, and re-requesting a 404 on every pass turns one bad
 * file into a request storm.
 *
 * @param {{ centre: number, totalFrames: number, capacity: number,
 *   held: Iterable<number>, pending: Iterable<number>, failed: Iterable<number> }} state
 * @returns {{ request: number[], release: number[] }}
 */
export function windowDiff({ centre, totalFrames, capacity, held, pending, failed }) {
  const window = decodeWindow(centre, totalFrames, capacity);
  const heldSet = new Set(held);
  const busy = new Set([...heldSet, ...pending, ...failed]);

  const request = [];
  for (let i = window.from; i <= window.to; i++) {
    if (!busy.has(i)) request.push(i);
  }

  const release = [];
  for (const index of heldSet) {
    if (index < window.from || index > window.to) release.push(index);
  }
  release.sort((a, b) => a - b);

  return { request, release };
}
