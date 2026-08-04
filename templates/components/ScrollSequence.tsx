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
 */

import { useEffect, useRef, useState } from "react";

import { SEQUENCES, framePath, type Sequence } from "@/components/frames";
import {
  computeScale,
  frameIndex,
  lerpColor,
  scrollHeightVh,
  scrollProgress,
  selectSequence,
} from "@/lib/scroll-math";

/** Beyond this, more pixels cost more than they show. */
const MAX_DPR = 2;

/** Subjects usually sit a little above centre. */
const VERTICAL_ANCHOR = 0.45;

type LoadState =
  | { status: "empty" }
  | { status: "loading"; done: number; total: number }
  | { status: "ready"; failed: number[] }
  | { status: "failed" };

export function ScrollSequence() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const frameRef = useRef(0);
  const rafRef = useRef(0);

  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: "empty" });

  // Pick the sequence that suits this viewport, and re-pick if it changes
  // shape. Preserving story position across that switch is a separate concern
  // and is not handled here yet.
  useEffect(() => {
    const pick = () => setSequence(selectSequence(innerWidth, innerHeight, SEQUENCES));
    pick();
    addEventListener("resize", pick);
    return () => removeEventListener("resize", pick);
  }, []);

  // Load the sequence. A frame that 404s is counted and named rather than
  // silently leaving a hole nobody can explain later.
  useEffect(() => {
    if (!sequence) {
      setLoad({ status: "empty" });
      return;
    }

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

      const progress = scrollProgress(scrollY, document.body.scrollHeight, vh);
      const exact = frameIndex(progress, sequence.totalFrames);
      frameRef.current = exact;

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

  return (
    <div style={{ height: `${scrollHeightVh(sequence.totalFrames)}vh` }}>
      <canvas ref={canvasRef} className="sticky top-0 h-screen w-full" aria-hidden />
      {load.status === "loading" && (
        <div className="pointer-events-none fixed inset-0 grid place-items-center">
          <p className="text-sm text-white/50 tabular-nums">
            {Math.round((load.done / load.total) * 100)}%
          </p>
        </div>
      )}
    </div>
  );
}

function NoFrames({ reason }: { reason: "empty" | "failed" }) {
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
