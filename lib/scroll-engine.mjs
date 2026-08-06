/**
 * The scrubbing engine: the part that cannot be tested without a browser.
 *
 *   mount(container, opts) ──▶ canvas, worker, decode window, animation frame
 *                         ◀── onState(...)                 ──▶ dispose()
 *
 * Every decision this makes lives in scroll-engine-state and scroll-math, both
 * pure and unit-tested. What is left here is the wiring: creating the canvas,
 * talking to the worker, holding the listeners, and releasing all of it again.
 * If you find yourself writing arithmetic in this file, it belongs next door.
 *
 * Framework-free on purpose. A React component, an Astro island and a plain
 * <script> tag all call the same three lines, so a fix to the scrubbing lands
 * once rather than once per template.
 *
 * Two rules here are less obvious than they look, and both fail silently:
 *
 * 1. The container is NOT assumed to be empty. Adapters server-render a poster
 *    image, and that image is what the page paints first, what a link preview
 *    shows, and what a visitor with scripting disabled gets. An engine that
 *    cleared the container and built its own would lose all three, on the
 *    server, where nothing would report it.
 *
 * 2. Mounting twice on a live container disposes the first mount. Frameworks
 *    guarantee a cleanup between mounts; a <script> tag, a hot reload or a
 *    copy-pasted snippet does not. Two live mounts is two workers, two loops
 *    and twice the pinned decode budget — which is already sized to sit just
 *    under what a phone tolerates.
 */

import {
  backgroundColor,
  canvasSize,
  decodeStrategy,
  drawRect,
  framesToRetry,
  loadStateAfter,
  nearestDecoded,
  nextEased,
  windowDiff,
} from "./scroll-engine-state.mjs";
import {
  computeScale,
  fadeOpacity,
  frameIndex,
  framesInBudget,
  runwayProgress,
  runwayScrollTop,
  scrimOpacity,
  selectSequence,
  visibleRect,
} from "./scroll-math.mjs";

/** Marks the image an adapter server-rendered, so mount adopts it. */
const POSTER_ATTR = "data-scrollytelling-poster";

/** Marks the tall element the hero sticks inside. */
const RUNWAY_ATTR = "data-scrollytelling-runway";

/**
 * How long the sequence takes to catch up with the scroll position, in seconds.
 *
 * Locking the drawn frame 1:1 to scroll position is what makes a sequence look
 * mechanical. Under about 0.2 the smoothing stops being perceptible; past about
 * 0.6 the image feels detached from the hand doing the scrolling. 0 is a hard
 * 1:1 lock and nothing else has to change.
 */
const SCRUB_SECONDS = 0.35;

/**
 * How much decoded imagery may stay resident.
 *
 * A decoded frame is pinned until closed, so this is a hard ceiling rather than
 * a hint, and the frame count it buys depends on the sequence's resolution.
 */
const DECODE_BUDGET_BYTES = 96 * 1024 * 1024;

/** Once someone has scrolled this far, they know the page scrolls. */
const HINT_FADES_AT = 0.02;

/** Containers with a live mount, so a second one can dispose the first. */
const live = new WeakMap();

/**
 * Starts scrubbing inside `container`, and returns the function that stops it.
 *
 * @param {Element} container element the engine draws into; may already hold a
 *   server-rendered poster, which is adopted rather than replaced
 * @param {{
 *   sequences: readonly any[],
 *   story: any,
 *   framePath: (sequenceId: string, index: number) => string,
 *   onState?: (state: any) => void,
 *   debug?: boolean,
 *   env?: any,
 * }} options
 * @returns {() => void} dispose, safe to call more than once
 */
export function mount(container, options) {
  const {
    sequences = [],
    story,
    framePath,
    onState = () => {},
    debug = false,
    env = globalThis,
  } = options ?? {};

  if (!container) throw new TypeError("mount needs a container element");
  if (typeof framePath !== "function") throw new TypeError("mount needs a framePath function");

  const log = env.console ?? globalThis.console;

  // Rule 2. Warn rather than throw: a hot reload or a second <script> is a
  // mistake worth naming, but refusing to run leaves a dead page behind.
  const previous = live.get(container);
  if (previous) {
    log.warn(
      "[scrollytelling] mount() was called on a container that is already " +
        "running. Disposing the previous one — two live mounts means two " +
        "workers and twice the decode budget. Call dispose() before " +
        "re-mounting.",
    );
    previous();
  }

  const reducedQuery = env.matchMedia?.("(prefers-reduced-motion: reduce)");

  // Shared so a restart can put the visitor back where they were. Page height
  // is expressed in vh, so any viewport change moves the scroll offset under
  // them — and the two sequences can differ in frame count on top of that.
  const position = { progress: 0 };
  let createdPoster = null;
  let stopRun = () => {};
  let currentId = null;

  const start = () => {
    const sequence = selectSequence(env.innerWidth, env.innerHeight, sequences);
    if (!sequence) {
      currentId = null;
      onState({ phase: "failed", reason: "empty" });
      return;
    }

    // Rule 1. Adopt before creating.
    const adopted = adoptPoster(container, sequence, framePath, env);
    if (adopted.created) createdPoster = adopted.element;

    if (reducedQuery?.matches) {
      // Not a slower animation — a different page. No worker, no decode, no
      // listener, no runway to scroll past. The poster is the page, and the
      // story is already prose in the adapter's outline.
      currentId = sequence.id;
      onState({ phase: "reduced", sequenceId: sequence.id });
      return;
    }

    currentId = sequence.id;
    stopRun = startScrubbing({
      container,
      sequence,
      story,
      framePath,
      onState,
      debug,
      env,
      log,
      position,
    });
  };

  const restart = () => {
    stopRun();
    stopRun = () => {};
    start();
  };

  // Rotating a phone changes which sequence suits the viewport AND how far the
  // page scrolls. Left alone the visitor is silently dropped somewhere else in
  // the story: nothing errors, the page just reads as broken.
  const onResize = () => {
    // Read the position first — the moment layout changes, it is gone.
    const target = position.progress;

    const next = selectSequence(env.innerWidth, env.innerHeight, sequences);
    if (next && next.id !== currentId) restart();

    // Only while the reader is inside the story. Progress is measured against
    // the runway, so it is negative above the hero and past 1 below it — and
    // restoring either would teleport someone reading a section further down
    // the page back into a hero they had already left.
    if (target < 0 || target > 1) return;

    // Restore after layout has settled. One frame is not always enough: the
    // height depends on vh units the browser recomputes during a resize.
    env.requestAnimationFrame(() => {
      env.requestAnimationFrame(() => {
        env.scrollTo({ top: scrollTopFor(target, container, env) });
      });
    });
  };

  // The setting can be toggled while the page is open, and a page that only
  // checks once ignores that.
  const onReducedChange = () => restart();

  start();
  env.addEventListener("resize", onResize);
  reducedQuery?.addEventListener?.("change", onReducedChange);

  const dispose = disposer(container, () => {
    env.removeEventListener("resize", onResize);
    reducedQuery?.removeEventListener?.("change", onReducedChange);
    stopRun();
    // Only a poster this engine created. One the adapter server-rendered
    // belongs to the adapter, and removing it would blank the page.
    if (createdPoster) container.removeChild?.(createdPoster);
    env.document.documentElement?.style?.removeProperty?.("--page-bg");
  });

  live.set(container, dispose);
  return dispose;
}

/** Wraps teardown so calling it twice is safe and does not free a later mount. */
function disposer(container, stop) {
  let done = false;
  const dispose = () => {
    if (done) return;
    done = true;
    stop();
    if (live.get(container) === dispose) live.delete(container);
  };
  return dispose;
}

/**
 * Where the runway starts and how tall it is, in document coordinates.
 *
 * The runway is the tall element the hero sticks inside, and it — not the
 * document — is what the sequence is scrubbed against. They agree only on a
 * page that is nothing but the hero; put anything below it and the document
 * runs on after the runway has ended, so the tail of the footage becomes
 * unreachable. That failure is silent: the page scrubs, it just never arrives.
 *
 * Measured per paint rather than cached. A cached box is wrong after anything
 * that changes layout without firing an event this engine listens to — a font
 * loading, an image above the hero arriving, a section expanding — and the
 * symptom is the same silent drift this exists to fix.
 *
 * With no runway marked, the whole document stands in for one. That is the old
 * behaviour, it is correct for a page that is only the hero, and it is wrong
 * the moment anything sits below it — which is why mount() says so out loud.
 *
 * @returns {{top: number, height: number}} document coordinates
 */
function runwayBox(container, env) {
  const rect = container.closest?.(`[${RUNWAY_ATTR}]`)?.getBoundingClientRect?.();
  return rect
    ? { top: rect.top + env.scrollY, height: rect.height }
    : { top: 0, height: env.document.body.scrollHeight };
}

/**
 * How far through the sequence this scroll position is.
 *
 * The travel is the runway's height less one viewport, which assumes the hero
 * sticks at the top and is a viewport tall. Every template makes it exactly
 * that; a hand-written page with a sticky offset would scrub slightly ahead of
 * itself.
 */
function progressNow(container, env, viewportHeight) {
  const box = runwayBox(container, env);
  return runwayProgress(env.scrollY, box.top, box.height, viewportHeight);
}

/** Where to scroll to land at `progress` — the inverse of progressNow. */
function scrollTopFor(progress, container, env) {
  const box = runwayBox(container, env);
  return runwayScrollTop(progress, box.top, box.height, env.innerHeight);
}

/**
 * Finds the poster an adapter rendered, or makes one.
 *
 * Adopting matters twice over: replacing it costs a second network request for
 * an image the browser already has, and it flashes between the two.
 */
function adoptPoster(container, sequence, framePath, env) {
  const existing = container.querySelector?.(`[${POSTER_ATTR}]`);
  if (existing) return { element: existing, created: false };

  const img = env.document.createElement("img");
  img.setAttribute(POSTER_ATTR, "");
  img.setAttribute("src", framePath(sequence.id, 0));
  img.setAttribute("alt", "");
  img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
  container.appendChild(img);
  return { element: img, created: true };
}

/**
 * The expensive half: worker, decode window, animation frame, listeners.
 *
 * Returns the function that unwinds all of it.
 */
function startScrubbing({ container, sequence, story, framePath, onState, debug, env, log, position }) {
  const frames = new Map();
  const pending = new Set();
  const failed = new Set();

  // Degrading quietly here is how the tail of a sequence goes missing without
  // anyone knowing to look: the page scrubs, it simply never arrives.
  if (!container.closest?.(`[${RUNWAY_ATTR}]`)) {
    log.warn(
      `[scrollytelling] no [${RUNWAY_ATTR}] ancestor — scrubbing against the ` +
        "whole document instead.\n" +
        "That is the same thing only while the page is nothing but the hero. " +
        "Put anything below it and the sequence stops short of its own end.\n" +
        "Mark the tall element the hero sticks inside with the attribute.",
    );
  }

  const capacity = framesInBudget(DECODE_BUDGET_BYTES, sequence.width, sequence.height);
  const initial = Math.min(sequence.totalFrames, Math.max(1, Math.ceil(capacity / 2)));

  if (debug) {
    log.info(
      `[scrollytelling] ${sequence.id} ${sequence.width}x${sequence.height} · ` +
        `${sequence.totalFrames} frames · budget ${Math.round(DECODE_BUDGET_BYTES / 1e6)}MB ` +
        `→ ${capacity} resident · scrub ${SCRUB_SECONDS}s`,
    );
  }

  const canvas = env.document.createElement("canvas");
  // Styled here rather than by a stylesheet: the engine owns this element, and
  // an unstyled canvas lays out inline at its backing-store size instead of
  // covering the poster. Held at zero opacity until the first frame is decoded
  // so the poster shows through rather than a blank rectangle.
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;opacity:0;transition:opacity 150ms";
  container.appendChild(canvas);
  const overlays = buildOverlays(container, story, env, log);
  const ctx = canvas.getContext?.("2d");
  if (!ctx) {
    // Rare, but not impossible: a context already claimed as another type, or
    // memory pressure. The poster stays, so the page shows one frame rather
    // than nothing — but say so, because a still page that should scrub is
    // otherwise indistinguishable from a slow one.
    log.warn("[scrollytelling] could not get a 2D context; leaving the poster in place.");
    onState({ phase: "failed", reason: "context" });
    return () => {
      overlays.remove();
      container.removeChild?.(canvas);
    };
  }

  const worker = makeWorker(env);
  let workerFailed = false;
  let settledInitial = 0;
  let raf = 0;
  let eased = 0;
  let lastPaint = 0;
  let primed = false;
  let stopped = false;
  let ready = false;

  const arrived = (index, bitmap) => {
    if (stopped) {
      bitmap?.close?.();
      return;
    }
    pending.delete(index);
    if (bitmap) frames.set(index, bitmap);
    else failed.add(index);

    if (index < initial) settledInitial++;

    const next = loadStateAfter({ index, initial, settled: settledInitial, failed });
    if (next) {
      if (next.phase === "ready") {
        if (failed.size > 0) warnFailed(failed, log);
        ready = true;
        canvas.style.opacity = "1";
        overlays.reveal();
        onState({ ...next, sequenceId: sequence.id, progress: eased });
      } else {
        if (next.phase === "loading" && next.total) {
          overlays.loadingPill.textContent = `${Math.round((next.done / next.total) * 100)}%`;
        }
        onState(next);
      }
    }
    schedule();
  };

  const decodeOnMainThread = (index) => {
    const img = new env.Image();
    img.decoding = "async";
    img.src = framePath(sequence.id, index);
    img.decode().then(
      () => arrived(index, img),
      () => arrived(index, null),
    );
  };

  // Unconditional: windowDiff has already excluded what is held, in flight or
  // broken. Filtering again here would put that rule in two places.
  const requestFrame = (index) => {
    pending.add(index);
    if (decodeStrategy({ canUseWorker: Boolean(worker), workerFailed }) === "worker") {
      worker.postMessage({ index, url: framePath(sequence.id, index) });
      return;
    }
    decodeOnMainThread(index);
  };

  if (worker) {
    worker.onmessage = (event) => arrived(event.data?.index, event.data?.bitmap ?? null);

    // A worker that fails to load still constructs — the browser hands back a
    // valid Worker and reports the failure here, asynchronously. Without this
    // the page does not degrade, it stops: every frame posted waits on a worker
    // that will not answer, and nothing clears them.
    worker.onerror = (event) => {
      if (workerFailed || stopped) return;
      workerFailed = true;

      const url = event?.filename || String(workerUrl());
      const reason = event?.message ? ` (${event.message})` : "";
      log.warn(
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

  const ensureWindow = (centre) => {
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
      frames.get(index)?.close?.();
      frames.delete(index);
    }
  };

  const draw = (now) => {
    raf = 0;
    if (stopped) return;

    const vw = env.innerWidth;
    const vh = env.innerHeight;

    const backing = canvasSize({
      viewportWidth: vw,
      viewportHeight: vh,
      devicePixelRatio: env.devicePixelRatio,
    });
    // Assigning either dimension clears the canvas, so only touch it on change.
    if (canvas.width !== backing.width || canvas.height !== backing.height) {
      canvas.width = backing.width;
      canvas.height = backing.height;
    }

    const target = progressNow(container, env, vh);
    const step = lastPaint ? now - lastPaint : 0;
    lastPaint = now;

    const stepped = nextEased({
      previous: eased,
      target,
      primed,
      seconds: SCRUB_SECONDS,
      deltaMs: step,
      totalFrames: sequence.totalFrames,
    });
    primed = true;
    eased = stepped.eased;

    // Scheduled before the early return below: stopping there would park the
    // sequence wherever it had eased to.
    if (stepped.animating) schedule();

    const exact = frameIndex(eased, sequence.totalFrames);
    position.progress = eased;

    // Only once the opening window has settled. Emitting ready from the first
    // paint would overwrite the loading percentage the adapter renders, and
    // would bury a failed state under the next animation frame.
    if (ready) {
      onState({ phase: "ready", failed: [...failed], progress: eased, sequenceId: sequence.id });
    }

    const bg = backgroundColor({ sequence, exact });
    const css = `rgb(${bg[0]} ${bg[1]} ${bg[2]})`;
    env.document.documentElement.style.setProperty("--page-bg", css);

    ctx.setTransform(backing.ratio, 0, 0, backing.ratio, 0, 0);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, vw, vh);

    ensureWindow(exact);

    // Before the early returns below. The copy has to keep tracking the scroll
    // even on a frame where nothing is decoded yet, or it freezes mid-scrub
    // while the footage behind it keeps moving.
    paintOverlays({ overlays, story, sequence, exact, eased, vw, vh, ready });

    const index = nearestDecoded({ exact, held: frames.keys(), totalFrames: sequence.totalFrames });
    if (index === null) return;

    const img = frames.get(index);
    if (!img) return;

    const rect = drawRect({ viewportWidth: vw, viewportHeight: vh, sequence });
    ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
  };

  function schedule() {
    if (raf || stopped) return;
    raf = env.requestAnimationFrame(draw);
  }

  onState({ phase: "loading", done: 0, total: initial });

  // Load-bearing that this runs synchronously, before mount returns. onerror
  // above can only fire on a later tick, so by then `pending` already holds the
  // opening window — which is what gives the fallback something to recover and
  // stops the load state sitting at "loading" with no decode in flight.
  ensureWindow(0);
  schedule();

  env.addEventListener("scroll", schedule, { passive: true });
  env.addEventListener("resize", schedule);

  return () => {
    stopped = true;
    env.removeEventListener("scroll", schedule);
    env.removeEventListener("resize", schedule);
    if (raf) env.cancelAnimationFrame(raf);
    worker?.terminate();
    for (const bitmap of frames.values()) bitmap?.close?.();
    frames.clear();
    overlays.remove();
    container.removeChild?.(canvas);
  };
}

/**
 * Builds the copy overlays and the page chrome, once.
 *
 * Built once and mutated per frame rather than re-rendered: a scroll-driven
 * page repaints on every animation frame, and rebuilding this markup sixty
 * times a second is how a scrub starts dropping frames.
 *
 * Everything about how these LOOK lives in scroll-engine.css, keyed off data
 * attributes. That is what lets a template restyle a beat without re-rendering
 * anything, and what stops each new template needing its own copy of the scrim.
 */
function buildOverlays(container, story, env, log) {
  if (!story?.sections?.length) {
    // Every other missing input is named; a page with no copy on it should not
    // be the one thing that happens quietly.
    log.warn(
      "[scrollytelling] no story sections — the page will scrub with no copy " +
        "over it. Pass `story` to mount(), or add beats to components/story.",
    );
  }

  const make = (tag, className) => {
    const node = env.document.createElement(tag);
    node.className = className;
    return node;
  };

  const beats = (story?.sections ?? []).map((beat) => {
    const root = make("div", "st-beat");
    root.dataset.align = beat.align ?? "center";
    if (beat.anchor) root.dataset.anchor = beat.anchor;

    const inner = make("div", "st-beat__inner");
    const scrim = make("div", "st-beat__scrim");
    const text = make("div", "st-beat__text");

    const heading = make("h2", "st-beat__heading");
    heading.textContent = beat.heading ?? "";
    const body = make("p", "st-beat__body");
    body.textContent = beat.body ?? "";

    text.appendChild(heading);
    text.appendChild(body);
    inner.appendChild(scrim);
    inner.appendChild(text);
    root.appendChild(inner);
    container.appendChild(root);

    return { beat, root, scrim };
  });

  // Chrome starts hidden. It is appended at mount but nothing is drawn yet, so
  // showing it would put a progress bar and a scroll cue over a poster that
  // cannot yet be scrolled through.
  const progress = make("div", "st-progress");
  progress.style.opacity = "0";
  const progressFill = make("div", "st-progress__fill");
  progress.appendChild(progressFill);
  container.appendChild(progress);

  const hint = make("div", "st-hint");
  hint.style.opacity = "0";
  const hintPill = make("p", "st-hint__pill");
  hintPill.textContent = "Scroll";
  hint.appendChild(hintPill);
  container.appendChild(hint);

  // Something has to say the page is working during the opening decode. On a
  // slow connection the alternative is a still image and no reason to wait.
  const loading = make("div", "st-loading");
  const loadingPill = make("p", "st-loading__pill");
  loadingPill.textContent = "0%";
  loading.appendChild(loadingPill);
  container.appendChild(loading);

  return {
    beats,
    progress,
    progressFill,
    hint,
    loading,
    loadingPill,
    /** Swaps the loading pill for the scrubbing chrome. */
    reveal() {
      loading.style.display = "none";
      progress.style.opacity = "1";
    },
    remove() {
      for (const { root } of beats) container.removeChild?.(root);
      container.removeChild?.(progress);
      container.removeChild?.(hint);
      container.removeChild?.(loading);
    },
  };
}

/** Where the decode worker lives, kept here so a failure can name it. */
function workerUrl() {
  return new URL("./decoder.worker.js", import.meta.url);
}

/**
 * Creates the decode worker, or null when the browser cannot run one.
 *
 * The shape of the line below is load-bearing and must not be tidied.
 *
 * Bundlers find workers by matching the LITERAL pattern
 * `new Worker(new URL("...", import.meta.url))`. Any indirection defeats that:
 * a variable holding the URL, or a property access for the constructor, and the
 * worker is never emitted as a chunk. It then 404s at runtime and the page
 * falls back to decoding on the main thread — which works, and is slower, and
 * says so only in the console.
 *
 * This was found by building the Astro template. Turbopack happens to trace
 * `new URL(..., import.meta.url)` on its own, so Next survived the indirect
 * form; Vite only traces it inside the recognised Worker pattern, so Astro did
 * not. Capability is still checked through `env` so tests can withhold it, but
 * the construction itself has to be exactly this.
 */
function makeWorker(env) {
  if (typeof env.Worker === "undefined" || typeof env.createImageBitmap === "undefined") {
    return null;
  }
  try {
    return new Worker(new URL("./decoder.worker.js", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

/**
 * Moves the overlays to where this frame puts them.
 *
 * The scrim strength is the only interesting value here, and it is the product
 * in miniature: measured per frame at encode time, intersected at runtime with
 * the part of the frame this viewport actually shows. White text at a fixed
 * opacity stops being readable the moment a frame brightens under it.
 */
function paintOverlays({ overlays, story, sequence, exact, eased, vw, vh, ready }) {
  const rect = visibleRect(vw, vh, sequence, computeScale(vw, vh, sequence));
  const sections = story?.sections ?? [];

  overlays.beats.forEach(({ beat, root, scrim }, i) => {
    const opacity = fadeOpacity(sections, i, eased);
    root.style.opacity = String(opacity);
    // Hidden rather than merely transparent: a transparent overlay still sits
    // in the accessibility tree and still costs a compositor layer.
    root.dataset.hidden = opacity <= 0.001 ? "true" : "false";
    scrim.style.setProperty("--st-scrim-opacity", String(scrimOpacity(sequence, exact, beat, rect)));
  });

  // Clamped because progress is measured against the runway: it is negative
  // above the hero and past 1 below it. `width: -14%` is not an error, it is a
  // declaration the browser drops — so the bar would silently freeze at
  // whatever it last showed instead of reading empty or full.
  overlays.progressFill.style.width = `${Math.round(Math.min(1, Math.max(0, eased)) * 100)}%`;
  // The hint retires as soon as they scroll, because by then it has done its
  // job — but it never appears at all before there is something to scroll to.
  overlays.hint.style.opacity = ready && eased <= HINT_FADES_AT ? "1" : "0";
}

function warnFailed(failed, log) {
  // Naming the indices turns "the animation sticks somewhere" into a
  // thirty-second fix instead of a hunt through the wrong file.
  log.warn(
    `[scrollytelling] ${failed.size} frame(s) failed to load: ${[...failed].join(", ")}.\n` +
      "Re-run: scrollytelling frames <video> .",
  );
}
