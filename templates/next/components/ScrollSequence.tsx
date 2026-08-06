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

import { SEQUENCES, framePath } from "@/components/frames";
import { story } from "@/components/story";
import { mount, type EngineState } from "@/lib/scroll-engine";
import { scrollHeightVh } from "@/lib/scroll-math";

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
    // The runway. The attribute is the handshake: the engine scrubs against
    // this element's height rather than the document's, which is what lets the
    // page have anything below the hero without the sequence running out early.
    <div data-scrollytelling-runway aria-hidden style={{ height }}>
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

