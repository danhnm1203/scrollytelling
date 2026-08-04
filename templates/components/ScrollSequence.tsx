"use client";

/**
 * The scrubbing canvas.
 *
 *   scroll ──▶ progress ──▶ frame index ──┬─▶ draw that frame
 *                                         └─▶ interpolate the page background
 *
 * All the arithmetic lives in lib/scroll-math, which is testable without a
 * browser. This file is the part that cannot be: it owns the canvas, the
 * listener and the animation frame, and nothing else.
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
 */

import { useEffect, useRef, useState } from "react";

import { SEQUENCES, framePath, type Sequence } from "@/components/frames";
import { story, type Beat } from "@/components/story";
import {
  computeScale,
  fadeOpacity,
  frameIndex,
  lerpColor,
  scrimOpacity,
  scrollHeightVh,
  scrollProgress,
  selectSequence,
  visibleRect,
} from "@/lib/scroll-math";

/** Beyond this, more pixels cost more than they show. */
const MAX_DPR = 2;

/** Subjects usually sit a little above centre. */
const VERTICAL_ANCHOR = 0.45;

/** Once someone has scrolled this far, they know the page scrolls. */
const HINT_FADES_AT = 0.02;

type LoadState =
  | { status: "loading"; done: number; total: number }
  | { status: "ready"; failed: number[] }
  | { status: "failed" };

export function ScrollSequence() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const frameRef = useRef(0);
  const rafRef = useRef(0);

  // Seeded with the first sequence rather than null so the server renders the
  // real page. Starting empty meant the pre-JavaScript HTML said "no frames
  // yet" even when frames existed, which is what a crawler and a visitor with
  // scripting disabled would see.
  const [sequence, setSequence] = useState<Sequence | null>(SEQUENCES[0] ?? null);
  const [load, setLoad] = useState<LoadState>({
    status: "loading",
    done: 0,
    total: SEQUENCES[0]?.totalFrames ?? 0,
  });
  const [progress, setProgress] = useState(0);

  // Re-pick once the real viewport is known, and again if it changes shape.
  useEffect(() => {
    const pick = () => setSequence(selectSequence(innerWidth, innerHeight, SEQUENCES));
    pick();
    addEventListener("resize", pick);
    return () => removeEventListener("resize", pick);
  }, []);

  // Load the sequence. A frame that 404s is counted and named rather than
  // silently leaving a hole nobody can explain later.
  useEffect(() => {
    if (!sequence) return;

    let cancelled = false;
    const images: (HTMLImageElement | null)[] = new Array(sequence.totalFrames).fill(null);
    const failed: number[] = [];
    let done = 0;

    setLoad({ status: "loading", done: 0, total: sequence.totalFrames });

    const settle = () => {
      done++;
      if (cancelled) return;
      if (done < sequence.totalFrames) {
        setLoad({ status: "loading", done, total: sequence.totalFrames });
        return;
      }

      imagesRef.current = images;
      if (failed.length === sequence.totalFrames) {
        setLoad({ status: "failed" });
        return;
      }
      if (failed.length > 0) {
        // Naming the indices turns "the animation sticks somewhere" into a
        // thirty-second fix instead of a hunt through the wrong file.
        console.warn(
          `[scrollytelling] ${failed.length} frame(s) failed to load: ${failed.join(", ")}.\n` +
            "Re-run: open-scrolltelling frames <video> .",
        );
      }
      setLoad({ status: "ready", failed });
    };

    sequence.edgeColors.forEach((_, i) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        images[i] = img;
        settle();
      };
      img.onerror = () => {
        failed.push(i);
        settle();
      };
      img.src = framePath(sequence.id, i);
    });

    return () => {
      cancelled = true;
    };
  }, [sequence]);

  // Draw. One draw per animation frame at most: scrolling fires far more often
  // than the screen refreshes, and drawing per event just queues work.
  useEffect(() => {
    if (!sequence || load.status !== "ready") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      rafRef.current = 0;

      const dpr = Math.min(MAX_DPR, devicePixelRatio || 1);
      const vw = innerWidth;
      const vh = innerHeight;

      if (canvas.width !== Math.round(vw * dpr) || canvas.height !== Math.round(vh * dpr)) {
        canvas.width = Math.round(vw * dpr);
        canvas.height = Math.round(vh * dpr);
      }

      const p = scrollProgress(scrollY, document.body.scrollHeight, vh);
      const exact = frameIndex(p, sequence.totalFrames);
      frameRef.current = exact;
      setProgress(p);

      const lo = Math.floor(exact);
      const hi = Math.min(sequence.totalFrames - 1, Math.ceil(exact));

      const bg = lerpColor(sequence.edgeColors[lo], sequence.edgeColors[hi], exact - lo);
      const css = `rgb(${bg[0]} ${bg[1]} ${bg[2]})`;
      document.documentElement.style.setProperty("--page-bg", css);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, vw, vh);

      // Nearest decoded frame, so a gap never shows as a blank canvas.
      let img = imagesRef.current[Math.round(exact)];
      if (!img) {
        for (let d = 1; d < sequence.totalFrames && !img; d++) {
          img = imagesRef.current[Math.round(exact) - d] ?? imagesRef.current[Math.round(exact) + d];
        }
      }
      if (!img) return;

      const scale = computeScale(vw, vh, sequence);
      const w = sequence.width * scale;
      const h = sequence.height * scale;
      ctx.drawImage(img, (vw - w) / 2, (vh - h) * VERTICAL_ANCHOR, w, h);
    };

    const schedule = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(draw);
    };

    schedule();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [sequence, load.status]);

  if (!sequence) return <NoFrames reason="empty" />;
  if (load.status === "failed") return <NoFrames reason="failed" />;

  const ready = load.status === "ready";

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
          open-scrolltelling frames &lt;video&gt; .
        </code>
      </div>
    </main>
  );
}
