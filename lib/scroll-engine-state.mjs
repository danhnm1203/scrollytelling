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
