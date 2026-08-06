"use client";

/**
 * The scrubbing canvas.
 *
 *   scroll ──▶ target ──▶ nextEased ──▶ eased ──┬─▶ frameIndex ──▶ nearestDecoded
 *                                               │                       │
 *                                               │                       ▼
 *                                               │                   drawRect ──▶ draw
 *                                               ├─▶ backgroundColor ──▶ page bg
 *                                               ├─▶ windowDiff ──▶ fetch / release
 *                                               └─▶ fadeOpacity ──▶ beats
 *
 * All the arithmetic lives in lib/scroll-math and lib/scroll-engine-state, both
 * testable without a browser. This file is the part that cannot be: it owns the
 * canvas, the worker, the listeners and the animation frame, and nothing else.
 * Every decision above is made elsewhere and merely applied here.
 *
 * The background is the point. Painting the page with each frame's own border
 * color, interpolated between frames, is what stops the canvas showing as a
 * rectangle against the page — the defect a single hardcoded color guarantees
 * on any footage with a gradient or changing exposure.
 *
 * Accessibility note: everything in here is aria-hidden. The story is carried
 * for assistive technology by the static outline in app/page.tsx. Beats fade in
 * and out as decoration over footage; read linearly they are four disconnected
 * fragments, which is worse than one coherent description.
 *
 * That outline is also what makes `prefers-reduced-motion` cheap to honour.
 * Scrubbing a sequence is motion triggered by interaction, so a visitor who has
 * asked for less of it should not get it — and because the whole story already
 * exists as prose, the answer is not a degraded animation but a different page:
 * one still, and the outline promoted from screen-reader-only to the page
 * itself (see globals.css). Nothing here runs in that mode — no worker, no
 * decode, no scroll listener, no 500vh of runway to scroll past.
 */

import { useEffect, useRef, useState } from "react";

import { SEQUENCES, framePath, type Sequence } from "@/components/frames";
import { story, type Beat } from "@/components/story";
import {
  backgroundColor,
  decodeStrategy,
  drawRect,
  framesToRetry,
  loadStateAfter,
  nearestDecoded,
  nextEased,
  windowDiff,
  type LoadState,
} from "@/lib/scroll-engine-state";
import {
  computeScale,
  fadeOpacity,
  framesInBudget,
  frameIndex,
  scrimOpacity,
  scrollHeightVh,
  scrollProgress,
  selectSequence,
  visibleRect,
} from "@/lib/scroll-math";

/** Beyond this, more pixels cost more than they show. */
const MAX_DPR = 2;

/** Once someone has scrolled this far, they know the page scrolls. */
const HINT_FADES_AT = 0.02;

/**
 * How long the sequence takes to catch up with the scroll position, in seconds.
 *
 * Locking the drawn frame 1:1 to scroll position is the obvious design, and it
 * is what makes a sequence look mechanical. At 50 frames over 500vh one frame
 * covers roughly 10vh, so a single trackpad flick crosses several frames
 * between two paints and the jump is visible. Easing spreads that over a few
 * frames instead.
 *
 * Under about 0.2 the smoothing stops being perceptible and you may as well not
 * have it. Past about 0.6 the image starts feeling detached from the hand doing
 * the scrolling, which reads as lag rather than as polish. Set it to 0 for a
 * hard 1:1 lock — nothing else has to change.
 */
const SCRUB_SECONDS = 0.35;

/**
 * How much decoded imagery may stay resident.
 *
 * Chosen to sit well under what a mid-range phone tolerates. A decoded frame is
 * pinned until closed, so this is a hard ceiling rather than a hint, and the
 * frame count it buys depends entirely on the sequence's resolution.
 */
const DECODE_BUDGET_BYTES = 96 * 1024 * 1024;

/**
 * Whether the visitor has asked their system for reduced motion.
 *
 * Starts false so the server's HTML and the first client render agree. A
 * visitor who has asked for it gets the static page a frame later, which is
 * cheaper than a hydration mismatch on every render for everyone else. It
 * listens for changes because the setting can be toggled while the page is
 * open, and a page that only checks once ignores that.
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}

export function ScrollSequence() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Decoded frames currently held. Every value here is pinned until closed. */
  const framesRef = useRef<Map<number, ImageBitmap | HTMLImageElement>>(new Map());
  /** Bumped per sequence, so in-flight decodes from the previous one are dropped. */
  const tokenRef = useRef(0);
  const ensureWindowRef = useRef<((centre: number) => void) | null>(null);
  const scheduleDrawRef = useRef<(() => void) | null>(null);
  const frameRef = useRef(0);
  const rafRef = useRef(0);
  /** Latest story position, kept in a ref so a resize can read it without staleness. */
  const progressRef = useRef(0);
  /** The position actually being drawn, which trails the scroll position. */
  const easedRef = useRef(0);
  /** Timestamp of the previous paint, for a frame-rate independent step. */
  const lastPaintRef = useRef(0);
  /** False until the first paint of a run, which snaps instead of easing. */
  const primedRef = useRef(false);

  // Seeded with the first sequence rather than null so the server renders the
  // real page. Starting empty meant the pre-JavaScript HTML said "no frames
  // yet" even when frames existed, which is what a crawler and a visitor with
  // scripting disabled would see.
  const [sequence, setSequence] = useState<Sequence | null>(SEQUENCES[0] ?? null);
  const [load, setLoad] = useState<LoadState>({
    phase: "loading",
    done: 0,
    total: SEQUENCES[0]?.totalFrames ?? 0,
  });
  const [progress, setProgress] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  // Pick the sequence that suits this viewport, and hold the visitor's place
  // across any resize.
  //
  // Page height is expressed in vh, so changing the viewport changes how far
  // the page scrolls — and the two sequences can differ in frame count on top
  // of that. Left alone, rotating a phone moves the scroll position under the
  // visitor and drops them somewhere else in the story. Nothing errors, so the
  // page simply reads as broken.
  useEffect(() => {
    setSequence(selectSequence(innerWidth, innerHeight, SEQUENCES));

    const onResize = () => {
      // Read the position first: the moment layout changes, it is gone.
      const target = progressRef.current;
      setSequence(selectSequence(innerWidth, innerHeight, SEQUENCES));

      // Restore after layout has settled. One frame is not always enough —
      // the height depends on vh units the browser recomputes during resize.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const range = Math.max(1, document.body.scrollHeight - innerHeight);
          scrollTo({ top: target * range });
        });
      });
    };

    addEventListener("resize", onResize);
    return () => removeEventListener("resize", onResize);
  }, []);

  // Decode progressively, holding only a window of frames around wherever the
  // visitor is. Everything here exists because a decoded frame stays pinned
  // until it is closed: preloading a whole sequence is a few hundred megabytes,
  // and with two sequences it is enough to have a phone kill the tab.
  useEffect(() => {
    // Nothing to decode when there is nothing to scrub. This is the expensive
    // half of the component — a worker, a network request per frame, and up to
    // 96MB of pinned bitmaps — and reduced motion skips all of it.
    if (!sequence || reducedMotion) return;

    const token = ++tokenRef.current;
    const frames = framesRef.current;
    const pending = new Set<number>();
    const failed = new Set<number>();

    // One sequence resident at a time. Anything held for the previous one is
    // now unreachable and would never be closed otherwise.
    releaseAll(frames);

    const capacity = framesInBudget(DECODE_BUDGET_BYTES, sequence.width, sequence.height);
    const initial = Math.min(sequence.totalFrames, Math.max(1, Math.ceil(capacity / 2)));
    setLoad({ phase: "loading", done: 0, total: initial });

    const worker = makeWorker();
    let settledInitial = 0;
    // A worker can die after it was successfully constructed — see makeWorker.
    // Once it has, every later request goes to the main thread instead.
    let workerFailed = false;

    const arrived = (index: number, bitmap: ImageBitmap | HTMLImageElement | null) => {
      if (token !== tokenRef.current) {
        // A later sequence took over while this was in flight.
        if (bitmap && "close" in bitmap) bitmap.close();
        return;
      }
      pending.delete(index);
      if (bitmap) frames.set(index, bitmap);
      else failed.add(index);

      if (index < initial) settledInitial++;

      // Hand it every failure and let it narrow to the opening window. Keeping
      // a second set here and picking between them is the version of this that
      // goes quietly wrong.
      const next = loadStateAfter({ index, initial, settled: settledInitial, failed });
      if (next) {
        // Warn about every frame that has failed, not only the opening ones —
        // the visitor sees the gap wherever it is.
        if (next.phase === "ready" && failed.size > 0) warnFailed(failed);
        setLoad(next);
      }

      scheduleDrawRef.current?.();
    };

    // Decode here rather than in the worker. img.decode() still keeps the work
    // off the paint path, it just cannot be moved off the thread entirely.
    //
    // Separate from requestFrame because the worker-failure path calls it for
    // frames that are already pending, which would otherwise be double-counted.
    const decodeOnMainThread = (index: number) => {
      const img = new Image();
      img.decoding = "async";
      img.src = framePath(sequence.id, index);
      img
        .decode()
        .then(() => arrived(index, img))
        .catch(() => arrived(index, null));
    };

    // Unconditional: windowDiff has already excluded anything held, in flight,
    // or known broken. Filtering again here would put that rule in two places
    // and let them disagree.
    const requestFrame = (index: number) => {
      pending.add(index);

      if (decodeStrategy({ canUseWorker: Boolean(worker), workerFailed }) === "worker") {
        worker!.postMessage({ index, url: framePath(sequence.id, index), token });
        return;
      }
      decodeOnMainThread(index);
    };

    if (worker) {
      worker.onmessage = (event: MessageEvent) => {
        const { index, token: t, bitmap } = event.data ?? {};
        if (t !== token) {
          if (bitmap) bitmap.close();
          return;
        }
        arrived(index, bitmap ?? null);
      };

      // A worker that fails to load still constructs. The browser hands back a
      // valid Worker and reports the failure here, asynchronously, so the
      // try/catch in makeWorker never sees it.
      //
      // Without this the page does not degrade — it stops. Every frame already
      // posted is waiting on a worker that will not answer, nothing clears them
      // from `pending`, `arrived` never runs, and the load state stays at a
      // percentage for as long as the visitor is willing to look at it.
      worker.onerror = (event) => {
        if (workerFailed || token !== tokenRef.current) return;
        workerFailed = true;

        // Naming the URL is the whole point of this warning: it turns "the page
        // just sits there" into a one-line fix. The usual cause is the bundler
        // not emitting the worker as its own chunk, and the URL is what shows
        // that. `event.message` is routinely empty for a failed load, so it is
        // the extra detail here rather than the message itself.
        const url = (event instanceof ErrorEvent && event.filename) || String(WORKER_URL);
        const reason = event instanceof ErrorEvent && event.message ? ` (${event.message})` : "";
        console.warn(
          `[scrollytelling] the decode worker at ${url} failed to load${reason}.\n` +
            `Sequence "${sequence.id}" will decode on the main thread instead — ` +
            "scrubbing may stutter.\n" +
            "Usually this means the bundler did not emit the worker chunk.",
        );

        worker.terminate();
        for (const index of framesToRetry({ pending, held: frames.keys(), failed })) {
          decodeOnMainThread(index);
        }
      };
    }

    // Called from the draw loop: keep the window populated, release the rest.
    ensureWindowRef.current = (centre: number) => {
      const { request, release } = windowDiff({
        centre,
        totalFrames: sequence.totalFrames,
        capacity,
        held: frames.keys(),
        pending,
        failed,
      });

      for (const index of request) requestFrame(index);

      for (const index of release) {
        const bitmap = frames.get(index);
        if (bitmap && "close" in bitmap) bitmap.close();
        frames.delete(index);
      }
    };

    // Load-bearing that this runs synchronously, here, before the effect
    // returns. `onerror` above can only fire on a later tick, so by the time it
    // does, `pending` already holds the opening window — which is what gives it
    // something to hand to the main thread, and what stops the load state
    // sitting at "loading" with no decode in flight.
    //
    // Make this first request lazy and that guarantee goes with it, silently:
    // the worker dies with nothing pending, nothing is retried, and the page is
    // back to waiting forever. If this has to move, the retry needs to cover
    // the opening window explicitly instead of inferring it from `pending`.
    ensureWindowRef.current(0);

    return () => {
      ensureWindowRef.current = null;
      worker?.terminate();
      releaseAll(frames);
    };
  }, [sequence, reducedMotion]);

  // Draw. One draw per animation frame at most: scrolling fires far more often
  // than the screen refreshes, and drawing per event just queues work.
  useEffect(() => {
    if (!sequence || reducedMotion || load.phase !== "ready") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = (now: number) => {
      rafRef.current = 0;

      const dpr = Math.min(MAX_DPR, devicePixelRatio || 1);
      const vw = innerWidth;
      const vh = innerHeight;

      if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) {
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
      }

      // Where the visitor is, which is not the same as what gets drawn.
      // progressRef stays on the true position: a resize restores the scroll
      // offset from it, and restoring a position that is mid-catch-up would
      // move the visitor slightly every time the viewport changed.
      const target = scrollProgress(scrollY, document.body.scrollHeight, vh);
      progressRef.current = target;

      // The first paint of a run snaps. Easing from wherever the last run
      // stopped would sweep the whole sequence on a mid-page reload, and on a
      // rotation would fight the scroll restore that just ran.
      const step = lastPaintRef.current ? now - lastPaintRef.current : 0;
      lastPaintRef.current = now;

      const { eased, animating } = nextEased({
        previous: easedRef.current,
        target,
        primed: primedRef.current,
        seconds: SCRUB_SECONDS,
        deltaMs: step,
        totalFrames: sequence.totalFrames,
      });
      primedRef.current = true;
      easedRef.current = eased;

      // Scheduled here rather than at the end: the draw below returns early
      // when no frame is decoded yet, and stopping the loop there would leave
      // the sequence parked wherever it had eased to.
      if (animating) schedule();

      // Everything the page renders comes off the eased position, so the
      // frame, the background, the beats and the progress bar stay in step
      // with each other rather than the text arriving ahead of the image.
      const exact = frameIndex(eased, sequence.totalFrames);
      frameRef.current = exact;
      setProgress(eased);

      const bg = backgroundColor({ sequence, exact });
      const css = `rgb(${bg[0]} ${bg[1]} ${bg[2]})`;
      document.documentElement.style.setProperty("--page-bg", css);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, vw, vh);

      // Keep the decode window centred on where the visitor is.
      ensureWindowRef.current?.(exact);

      // Nearest decoded frame, so a gap never shows as a blank canvas. This is
      // the normal case now, not an edge case: frames beyond the window are
      // deliberately not held.
      const held = framesRef.current;
      const index = nearestDecoded({ exact, held: held.keys(), totalFrames: sequence.totalFrames });
      if (index === null) return;

      const img = held.get(index);
      if (!img) return;

      const rect = drawRect({ viewportWidth: vw, viewportHeight: vh, sequence });
      ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
    };

    function schedule() {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(draw);
    }
    // The decoder calls this when a frame arrives, so a newly decoded frame is
    // painted rather than waiting for the next scroll event.
    scheduleDrawRef.current = schedule;

    // Snap on the first paint of this run, and measure the step from it.
    primedRef.current = false;
    lastPaintRef.current = 0;
    schedule();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      scheduleDrawRef.current = null;
    };
  }, [sequence, reducedMotion, load.phase]);

  if (!sequence) return <NoFrames reason="empty" />;
  if (reducedMotion) return <StillHero sequence={sequence} />;
  if (load.phase === "failed") return <NoFrames reason="failed" />;

  const ready = load.phase === "ready";

  return (
    <div aria-hidden style={{ height: `${scrollHeightVh(sequence.totalFrames)}vh` }}>
      <div className="sticky top-0 h-screen w-full">
        {/*
          The opening frame as a plain image. It is what the page paints first,
          what a link preview shows, and what a visitor with scripting disabled
          gets. The canvas covers it once the sequence is decoded.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={framePath(sequence.id, 0)}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          style={{ opacity: ready ? 1 : 0 }}
        />
      </div>

      {!ready && (
        <div className="pointer-events-none fixed inset-0 grid place-items-center">
          <p className="rounded bg-black/40 px-3 py-1 text-sm text-white/70 tabular-nums">
            {load.total ? Math.round((load.done / load.total) * 100) : 0}%
          </p>
        </div>
      )}

      {ready &&
        story.sections.map((beat, i) => (
          <BeatOverlay
            key={beat.at}
            beat={beat}
            opacity={fadeOpacity(story.sections, i, progress)}
            sequence={sequence}
            frame={frameRef.current}
          />
        ))}

      {ready && <ScrollAffordance progress={progress} />}
    </div>
  );
}

/**
 * The hero for a visitor who has asked for reduced motion.
 *
 * One frame, at its own size, in normal document flow — so the page is as long
 * as its content instead of the several screens of runway the scrub needs. The
 * copy is not repeated over it: the outline in app/page.tsx is visible in this
 * mode and already says all of it, in order, as prose.
 *
 * Frame 0 rather than a frame chosen from the middle. It is the same still the
 * page paints before the sequence decodes and the same one a link preview
 * shows, so a reader sees one representative image of this page wherever they
 * meet it.
 */
function StillHero({ sequence }: Readonly<{ sequence: Sequence }>) {
  return (
    <div aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={framePath(sequence.id, 0)} alt="" className="block h-auto w-full" />
    </div>
  );
}

/**
 * A progress line and a hint that the page responds to scrolling.
 *
 * The most common way one of these pages fails is a visitor looking at a static
 * hero and leaving, never learning there was anything else. The hint retires as
 * soon as they scroll, because by then it has done its job.
 */
function ScrollAffordance({ progress }: Readonly<{ progress: number }>) {
  return (
    <>
      {/*
        Both of these carry their own dark backing rather than relying on the
        footage behind them. They sit outside the measured scrim, so over bright
        frames a plain white-on-transparent treatment disappears — and a scroll
        cue nobody can see is the same as no cue at all.
      */}
      <div className="pointer-events-none fixed inset-x-0 top-0 h-0.5 bg-black/30">
        <div
          className="h-full bg-white/70 transition-[width] duration-75"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <div
        className="pointer-events-none fixed inset-x-0 bottom-8 flex justify-center transition-opacity duration-500"
        style={{ opacity: progress > HINT_FADES_AT ? 0 : 1 }}
      >
        <p className="rounded-full bg-black/45 px-4 py-2 text-xs uppercase tracking-[0.35em] text-white/80">
          Scroll
        </p>
      </div>
    </>
  );
}

/** Where a beat sits, given its alignment and anchor. */
const PLACEMENT: Record<string, string> = {
  left: "items-center justify-start text-left",
  center: "items-center justify-center text-center",
  right: "items-center justify-end text-right",
};

/**
 * One copy beat, with a backdrop sized to how bright the footage behind it is.
 *
 * The scrim is the whole point: white text at a fixed opacity stops being
 * readable the moment a frame brightens under it. Over dark footage this is
 * almost invisible and the image stays clean.
 */
function BeatOverlay({
  beat,
  opacity,
  sequence,
  frame,
}: Readonly<{
  beat: Beat;
  opacity: number;
  sequence: Sequence;
  frame: number;
}>) {
  const hidden = opacity <= 0.001;

  const rect =
    typeof window === "undefined"
      ? { x0: 0, y0: 0, x1: 1, y1: 1 }
      : visibleRect(
          innerWidth,
          innerHeight,
          sequence,
          computeScale(innerWidth, innerHeight, sequence),
        );

  const scrim = scrimOpacity(sequence, frame, beat, rect);
  const bottom = beat.anchor === "bottom";

  return (
    <div
      className={`pointer-events-none fixed inset-0 flex px-8 ${
        bottom ? "items-end justify-center pb-24 text-center" : PLACEMENT[beat.align]
      }`}
      style={{ opacity, visibility: hidden ? "hidden" : "visible" }}
    >
      <div className="relative max-w-xl">
        {/*
          A radial gradient rather than a blurred box. A blur spreads the
          computed opacity over a wide halo, so almost none of it lands behind
          the glyphs — the scrim measures correctly and then fails to deliver.
          This holds full strength across the text and falls off past it.
        */}
        <div
          className="absolute -inset-x-12 -inset-y-10"
          style={{
            background: `radial-gradient(ellipse at center, rgb(0 0 0 / ${scrim}) 0%, rgb(0 0 0 / ${scrim * 0.85}) 45%, rgb(0 0 0 / 0) 75%)`,
          }}
        />
        <div className="relative space-y-3">
          <h2 className="text-3xl font-medium text-white/90 sm:text-5xl">{beat.heading}</h2>
          <p className="text-base text-white/60 sm:text-lg">{beat.body}</p>
        </div>
      </div>
    </div>
  );
}

function NoFrames({ reason }: Readonly<{ reason: "empty" | "failed" }>) {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div className="space-y-4">
        <p className="text-white/90">
          {reason === "failed" ? "NO FRAMES FOUND" : "No frames yet."}
        </p>
        <p className="text-sm text-white/50">
          {reason === "failed"
            ? "public/frames/ is missing or empty. Generate a sequence:"
            : "Generate a sequence to make this page scroll:"}
        </p>
        <code className="inline-block rounded bg-white/5 px-3 py-2 text-sm text-white/70">
          scrollytelling frames &lt;video&gt; .
        </code>
      </div>
    </main>
  );
}

/**
 * Creates the decode worker, or null when the browser cannot run one.
 *
 * The `new URL(..., import.meta.url)` form is required, not stylistic: it is
 * what lets the bundler find the worker and emit it as its own chunk. A plain
 * string path silently ships nothing.
 */
const WORKER_URL = new URL("./decoder.worker.js", import.meta.url);

function makeWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") return null;
  try {
    return new Worker(WORKER_URL, { type: "module" });
  } catch {
    return null;
  }
}

/** Releases every held frame. A bitmap nobody closes is pinned for the page's life. */
function releaseAll(frames: Map<number, ImageBitmap | HTMLImageElement>) {
  for (const bitmap of frames.values()) {
    if ("close" in bitmap) bitmap.close();
  }
  frames.clear();
}

function warnFailed(failed: Set<number>) {
  // Naming the indices turns "the animation sticks somewhere" into a
  // thirty-second fix instead of a hunt through the wrong file.
  console.warn(
    `[scrollytelling] ${failed.size} frame(s) failed to load: ${[...failed].join(", ")}.\n` +
      "Re-run: scrollytelling frames <video> .",
  );
}
