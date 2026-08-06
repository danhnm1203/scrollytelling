"use client";

/**
 * The scrubbing canvas.
 *
 *   viewport ──▶ canvasSize ──▶ backing store + transform
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
import { mount, type EngineState } from "@/lib/scroll-engine";
import {
  computeScale,
  fadeOpacity,
  frameIndex,
  scrimOpacity,
  scrollHeightVh,
  visibleRect,
} from "@/lib/scroll-math";

/** Once someone has scrolled this far, they know the page scrolls. */
const HINT_FADES_AT = 0.02;

export function ScrollSequence() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<EngineState>({
    phase: "loading",
    done: 0,
    total: SEQUENCES[0]?.totalFrames ?? 0,
  });

  // Everything imperative — canvas, worker, decode window, animation frame,
  // listeners, reduced motion — belongs to the engine. This effect is the whole
  // of the React side: hand it the container, hand back the disposer.
  //
  // The container is deliberately not emptied first. The poster below is
  // server-rendered, and the engine adopts it rather than replacing it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    return mount(container, {
      sequences: SEQUENCES,
      story,
      framePath,
      onState: setState,
    });
  }, []);

  const reduced = state.phase === "reduced";
  const ready = state.phase === "ready";
  const sequence = SEQUENCES[0];

  if (!sequence) return <NoFrames reason="empty" />;
  if (state.phase === "failed" && state.reason !== "context") {
    return <NoFrames reason="failed" />;
  }

  // Under reduced motion the page is as long as its content: no runway, no
  // sticky hero, just the still. The story is already prose in the outline,
  // which globals.css promotes to the page in this mode.
  const height = reduced ? undefined : `${scrollHeightVh(sequence.totalFrames)}vh`;

  return (
    <div aria-hidden style={{ height }}>
      <div
        ref={containerRef}
        className={reduced ? "block w-full" : "sticky top-0 h-screen w-full"}
      >
        {/*
          The opening frame as a plain image, rendered on the server. It is what
          the page paints first, what a link preview shows, and what a visitor
          with scripting disabled gets — none of which the engine could produce,
          because it does not run in any of those cases.

          The data attribute is the handshake: the engine looks for it and
          adopts this element instead of creating a second one. Do not remove it.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          data-scrollytelling-poster=""
          src={framePath(sequence.id, 0)}
          alt=""
          className={
            reduced ? "block h-auto w-full" : "absolute inset-0 h-full w-full object-cover"
          }
        />
      </div>

      {!reduced && !ready && state.phase === "loading" && (
        <div className="pointer-events-none fixed inset-0 grid place-items-center">
          <p className="rounded bg-black/40 px-3 py-1 text-sm text-white/70 tabular-nums">
            {state.total ? Math.round((state.done / state.total) * 100) : 0}%
          </p>
        </div>
      )}

      {ready &&
        story.sections.map((beat, i) => (
          <BeatOverlay
            key={beat.at}
            beat={beat}
            opacity={fadeOpacity(story.sections, i, state.progress)}
            sequence={sequence}
            frame={frameIndex(state.progress, sequence.totalFrames)}
          />
        ))}

      {ready && <ScrollAffordance progress={state.progress} />}
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

