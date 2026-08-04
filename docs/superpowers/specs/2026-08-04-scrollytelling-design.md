# scrollytelling — Design (Phase A)

2026-08-04 · Revision 3, after the [CEO review](../../reviews/2026-08-04-ceo-review-scrollytelling.md)
and the [eng review](../../reviews/2026-08-04-eng-review-scrollytelling.md)

The implementation task list lives in those two review documents. This file is the source of
truth for the *design*; the reviews are the source of truth for the *order of work*.

## Goal

An open-source skill that turns **one video file** into a **Next.js scrollytelling landing
page**: the clip plays frame by frame as the visitor scrolls, with copy fading in over it.

Phase A scope: `video → frames → website`.

## Scope

**In scope**

- Input is a video file **or** a directory of ordered stills.
- Extract and decimate frames, measure edge color and luminance, encode to webp.
- **Two sequences, landscape and portrait.** Phone-shaped screens get a composition framed for
  a phone, not a cropped 16:9 frame. (Formerly E2, pulled into v1 — see *Why portrait is v1*.)
- Scaffold a complete, buildable Next.js 16 project.
- Scroll-scrubbed canvas, page background tracking the frames, adaptive text scrim.
- Build-time readability report, static poster, scroll affordance, accessibility pass.
- Distribution: publish an npm CLI.

**Out of scope (Phase B, separate spec)**

Generating start/end frames with AI; generating video from a motion prompt; any paid API call.
The join between the phases is a video file path.

**Permanently out of scope (YAGNI)**

Multiple template stacks (Astro, Vue, static); a template plugin system. See
[TODOS.md](../../../TODOS.md).

## Context

`~/.claude/skills/scrollytelling` already does something similar in Python + Pillow. We are
building our own for two stated reasons: **to own the code and open-source it**, and **to
control the template and stack**.

Verified: the current development machine has **no `ffmpeg` on PATH**, so the existing Python
version fails immediately here. The trade-off has to be stated plainly: `ffmpeg-static` is a
48KB package that **downloads ~80MB from GitHub releases at postinstall**, and `sharp` ships
per-platform prebuilt binaries. We are not eliminating install risk; we are trading it for one
network fetch during `npm install`. That is precisely why the tooling does **not** ship inside
the generated project.

### Why portrait is v1, not a nice-to-have

A 16:9 frame cannot fill a 9:19.5 screen without cropping roughly 74% of its width. A background
that matches the frame's edge color makes the leftover area *blend*, not disappear. On the
devices that carry most landing-page traffic, "adaptive background" is compensating for the fact
that most of the screen is background. The honest differentiator for v1 is
**scrollytelling with a real portrait composition**, and that belongs at the center of the
design rather than as a promoted backlog item.

Direct consequence: `computeScale` and `frames.ts` are designed for **multiple sources from the
start** (below). Designing for one source and patching later is exactly the refactor these
module boundaries exist to prevent.

## Architecture

The heavy tooling lives in the **skill repo**. The generated project carries only what a static
site needs to build.

```
  SKILL REPO (scrollytelling)              GENERATED PROJECT
  ─────────────────────────────            ─────────────────
  SKILL.md · LICENSE · README.md           app/{page,layout}.tsx
  .github/workflows/{test,release}.yml     app/globals.css
  package.json                             components/ScrollSequence.tsx
    deps: sharp, ffmpeg-static (PINNED)    components/story.ts      ◀── the editing surface
    bin:  scrollytelling  (npm CLI)        components/frames.ts     ◀── GENERATED, do not edit
                                           components/decoder.worker.js
  scripts/scaffold.mjs ──── copies ───────▶ lib/scroll-math.mjs (+ .d.ts)
    (node:fs only)                         public/frames/…          (COMMITTED to git)
    --diff → compares .scrollytelling-version .scrollytelling-version ◀── scaffold writes, SOLE writer
                                           ▲
  scripts/frames.mjs ────── writes ────────┘  deps: next 16 · react 19 · tailwind
    (sharp + ffmpeg-static — HERE)              NO framer-motion, NO sharp/ffmpeg
    --preview  → 5 frames to a temp dir
    --check    → reads story.ts, warns per beat

  lib/scroll-math.mjs ◀── shared source, copied into the project at scaffold time
    scrollProgress · frameIndex · selectSequence · computeScale
    fadeOpacity · scrimOpacity · lerpColor · scrollHeightVh
    + SCROLL_MATH_VERSION embedded in the file
         ▲
         │ imported directly, no build step
  tests/  node:test  (+ a test asserting the templates/ copy matches the lib/ source)
```

### Module boundaries

| Module | Does | Depends on | Who edits |
| --- | --- | --- | --- |
| `scripts/scaffold.mjs` | copies the template; `--force`; `--diff`; writes `.scrollytelling-version` | `node:fs` only | nobody |
| `scripts/frames.mjs` | extracts, measures, encodes, reports; `--preview`; `--check` | sharp, ffmpeg-static | nobody |
| `lib/scroll-math.mjs` | **all the math that decides how the page looks**, pure functions | nothing | rarely; well tested |
| `components/frames.ts` | **the data contract** between build time and runtime | — | generated; never by hand |
| `components/decoder.worker.js` | fetches and decodes frames off-thread, returns `ImageBitmap` | — | rarely |
| `components/ScrollSequence.tsx` | builds the DOM and canvas, calls `scroll-math` | `frames.ts` · `story.ts` · `scroll-math` · worker | rarely |
| `components/story.ts` | brand and copy beats | — | **the only editing surface** |

Three invariants:

**`frames.ts` is the sole interface between build time and runtime.** `ScrollSequence` never
reads `public/` and never infers a frame count. This is what allows the extraction half to be
swapped for a WebCodecs backend later.

**`scroll-math.mjs` is plain JavaScript, not TypeScript**, with a companion `.d.ts`. The reason:
`node:test` at the repo root must import it directly, with no compile step.

**`scroll-math.mjs` is copied into the project, and the copy must be provably identical to the
source.** The file embeds `SCROLL_MATH_VERSION`; `--diff` names it when it drifts; and the root
test suite has a case asserting `templates/lib/scroll-math.mjs` is byte-identical to
`lib/scroll-math.mjs`. Without that guard, the root tests guarantee nothing about the code the
real page runs — the copy is a fork.

### Distribution

The skill publishes as an **npm CLI**: `npx scrollytelling <video> <project_dir>`. It works
without Claude, and npm handles versioning and updates. `SKILL.md` calls that same CLI.
`.github/workflows/release.yml` publishes on tag. Without this step the only way to install is
copying files into `~/.claude/skills` by hand, with no update path.

### Upgrading a generated project

`scaffold.mjs` writes `TEMPLATE_VERSION` into **`.scrollytelling-version`** — a non-generated
file that `frames.mjs` never touches. `scaffold.mjs --diff <project>` lists the template files
that changed since that version. It **never overwrites automatically.**

The version is deliberately *not* in `frames.ts`: that file is regenerated on every
`frames.mjs` run, so putting the version there creates two writers and makes `--diff` compare
against the wrong baseline.

## `frames.mjs`

```
scrollytelling frames <video|directory> <project_dir> [--frames 50] [--max-width 1280] [--quality 82]
scrollytelling frames --preview <video>          # 5 frames to a temp dir, no project needed
scrollytelling frames --check <project_dir>      # reads story.ts, warns per beat
```

`--preview` exists because the workflow needs to look at frames in order to propose copy
**before** a project has been scaffolded.

**Step 0 — dependency self-check.** Before doing anything, verify `sharp` and `ffmpeg-static`
load. If either is missing, exit non-zero with the exact command to fix it. This covers `sharp`
prebuilt failures on musl and ARM, not only the missing-ffmpeg case. The reason this step
exists: the tooling lives in the skill repo, so the project's `npm install` no longer installs
it as a side effect.

### Extraction

**Image directory:** sort **naturally** (`frame_2` before `frame_10`). Decimate evenly to
exactly `--frames`, always keeping the first and last file.

**Video:** read `Duration` from `ffmpeg -i` stderr. Compute `N` evenly spaced timestamps and
seek-extract each one with `-ss` **before** `-i` (frame-accurate since ffmpeg 2.1), at most 4
processes in parallel. The final timestamp uses `duration − ε` — seeking to exactly `duration`
usually yields no output. Cost scales with **the number of frames wanted**, not the length of
the source.

**Two sequences.** Run the pipeline twice: once on the original landscape framing, once on the
`--focus` region cropped to a portrait aspect. Both land in the same `SEQUENCES` structure.

**Security:** every subprocess call uses `execFile`/`spawn` with an **argument array**. Never
`shell: true`, never string concatenation. A regression test passes a filename containing shell
metacharacters.

### Measurement and encoding — one decode, one buffer

Per frame:

1. decode once
2. `resize(6, 4).raw()` → 24 luminance values, computed in JS
3. edge strips read from the same raw buffer at a larger size → `[r, g, b]`
4. resize to `--max-width`, encode webp

This replaces 4 `extract()+stats()` calls for the edges plus 24 for the grid plus the encode —
29 operations per frame, roughly 1,450 for a 50-frame run. Beyond being about 7x faster, it has
a more important property: **the measurement functions become pure functions over a raw
buffer**, so they get unit tests like everything in `scroll-math` instead of being reachable
only through the golden master.

The 6×4 grid replaces three vertical bands because **the visible region is not the source
frame** — after cropping, the outer columns of the source describe pixels that are not on screen.

### Safe writes

Build into `public/frames.partial/`, rename to `public/frames/` as the final step. A run that
fails partway leaves a working sequence untouched.

`public/frames/*.webp` is **committed to git** — deploys need it. `gitignore.template` must not
contain `public/frames/`. Note for the README: every re-run replaces the whole directory, so a
project's git history grows with each iteration; document how to squash before publishing.

### Readability report — two modes

A normal run prints a **raw luminance table**: by region and by scroll range, with no beat
attribution. That is enough to write `story.ts`. It also prints total weight, frame count, and
the largest edge-color delta between adjacent frames (a large delta means the background will
visibly pulse).

`--check <project_dir>` runs **after** `story.ts` exists, reads it, and prints specific warnings:
`beat align:"left" at 0.30 sits on luma 0.71 — consider anchor:"bottom"`.

The modes are separate because a report cannot name beats that do not exist yet: the workflow
writes `story.ts` *after* generating frames.

### Data contract

`components/frames.ts`, generated:

```ts
// GENERATED by frames.mjs — do not edit
export type Sequence = {
  id: "landscape" | "portrait";
  width: number;
  height: number;
  totalFrames: number;
  framePath: (i: number) => string;
  edgeColors: readonly (readonly [number, number, number])[];
  lumaGrid: readonly (readonly number[])[];   // 6 cols x 4 rows, row-major
};

export const SEQUENCES: readonly Sequence[];
export const LUMA_COLS = 6;
export const LUMA_ROWS = 4;
```

One array rather than parallel `FRAMES` and `PORTRAIT_FRAMES` constants: there is a single
branch at selection time and none downstream. The parallel shape would duplicate everything and
grow an `if` in every consumer.

Frame indices **start at 0**, with no zero-padding. Within a `Sequence`, `totalFrames` and the
array lengths are generated together so they cannot disagree.

### Frame count

50 frames at 1280px is roughly 2 MB per sequence. Warn when the total exceeds a weight threshold.

### Errors

| Situation | Behavior |
| --- | --- |
| `sharp` / `ffmpeg-static` missing (including musl/ARM prebuild failure) | exit non-zero with the exact command to run |
| input does not exist | exit non-zero, print the path tried |
| directory contains no images | exit non-zero, list accepted extensions |
| images differ in aspect ratio | small difference → normalize and warn; beyond threshold → exit non-zero naming the file |
| `Duration: N/A` (fragmented MP4, VFR) | fall back to counting frames in one decode pass, warn, continue |
| ffmpeg exits non-zero | print its stderr verbatim |
| a seek timestamp yields no output | retry at `duration − ε` |
| a frame is corrupt mid-run | skip it and name it; abort only if more than 10% fail |
| disk fills while writing `.partial` | clean up `.partial` and exit non-zero; the old `frames/` survives |
| `--check` finds no `story.ts` | exit non-zero, explain that a normal generation run comes first |
| `--frames` exceeds the number of images | use them all, warn, do not fail |

No failure is allowed to be silent.

## `lib/scroll-math.mjs`

Every piece of math that decides how the page looks, as pure functions that never touch the
DOM. This is the module with full unit coverage, because this is what determines whether the
page is right or wrong.

### `scrollProgress(scrollY, scrollHeight, innerHeight)`

```
progress = scrollY / max(1, scrollHeight − innerHeight)
```

Computed directly rather than through Framer Motion's `useScroll`. One division does not justify
a 40KB dependency, the generated project genuinely reduces to `next`/`react`/`tailwind` as the
architecture claims, and it removes the conflict between Lenis (which virtualizes scroll) and
`useScroll` (which reads native scroll). Being pure, it is testable without a DOM.

### `frameIndex(progress, totalFrames)`

```
i = clamp(progress, 0, 1) × (totalFrames − 1)
```

The clamp is mandatory. Rubber-band scrolling on iOS already pushes progress outside `[0,1]`,
and Lenis momentum makes it routine. Without the clamp an array lookup returns `undefined`,
destructuring `[r,g,b]` throws **inside the rAF loop**, and scrubbing dies for the rest of the
session with a console error most visitors never see. Tests: `progress` = −0.2, 0, 1, 1.3.

### `selectSequence(vw, vh, sequences)`

Picks the sequence whose aspect ratio is closest to the viewport's. A pure numeric comparison
rather than a media-query string: it generalises past two sequences, needs no query parsing, and
is directly testable. This is the single place in the system that knows more than one source
exists.

### `computeScale(vw, vh, sequence)`

```
contain  = min(vw/sw, vh/sh)
cover    = max(vw/sw, vh/sh)
mismatch = max(r, 1/r),  where r = (vw/vh) / (sw/sh)

mismatch ≤ 1.15  →  cover     (source suits the viewport: fill it, crop is negligible)
otherwise        →  contain   (source does not suit it: keep the whole frame, background covers the rest)
```

Anchored center horizontally, 45% vertically.

The function takes a `sequence` rather than assuming a single source. For a well-matched source
(portrait on a phone, landscape on a desktop) the cover branch fills the screen. For a poor match
(rotated before the sequence switches, or an ultrawide monitor) the contain branch keeps the
composition intact and the edge-matched background covers the remainder.

The first revision of this spec used `min(cover, contain × 1.7)`. Because `cover/contain` **is**
the aspect mismatch, that formula returns cover for every common desktop aspect — making the
edge-matched background dead code — while phones got cropped 41% *and* left 56% of the screen as
background.

### `scrimOpacity(sequence, frame, region, visibleRect)`

Averages the grid cells that fall **inside `visibleRect` and behind the text block**, then:

```
opacity = clamp((luma − 0.15) / 0.5, 0, 0.75)
```

`visibleRect` is a required argument: after cropping, grid cells outside the visible region
describe pixels that are not on screen.

### `scrollHeightVh(totalFrames)` · `fadeOpacity(...)` · `lerpColor(a, b, t)`

`scrollHeightVh` is `totalFrames × 8`, floored at 300. **No upper clamp** — clamping would
reintroduce exactly the problem the formula exists to prevent, namely scroll sensitivity per
frame changing when the count crosses a threshold. Warn above 900vh rather than silently clamping.

`fadeOpacity` derives each beat's fade window from its neighbours: in from the midpoint with the
previous beat, out to the midpoint with the next. `lerpColor` interpolates
`edgeColors[floor(i)] → edgeColors[ceil(i)]`.

## Runtime

### Scrubbing

The outer container is `scrollHeightVh(totalFrames)` tall. Inside it, a `<canvas>` is
`sticky top-0 h-screen w-full`. Progress comes from `scrollProgress()` inside a rAF listener.
Draw at most one frame per animation frame, DPR capped at 2.

### Decoding and the memory budget

`decoder.worker.js` fetches and decodes frames with `createImageBitmap`, transferring them to
the main thread to draw. Initialisation must use the form the Next 16 bundler recognizes so it
emits the worker chunk:

```js
new Worker(new URL("./decoder.worker.js", import.meta.url), { type: "module" })
```

The worker resolves `/frames/…` paths itself. Browsers without support fall back to
`img.decode()` on the main thread.

**The LRU window is mandatory, not an optimization.** `ImageBitmap` stays pinned until `.close()`
— unlike `<img>`, the browser cannot reclaim it. 50 frames at 1280×720 RGBA is ~176MB; two
sequences is ~350MB; iOS Safari kills tabs below that.

```
  SYMMETRIC window of ±N around the current frame   (symmetric because backward scrub must be smooth)
  N derived from an MB budget / (w × h × 4)         (adapts to resolution instead of a fixed count)
  only ONE sequence resident at a time
  every bitmap leaving the window must be .close()d
```

The budget number is fixed at the measurement checkpoint below.

When the scroll position lands on a frame that has not decoded, **hold the nearest decoded
frame** — never return to a loading state, never show a blank canvas. If **every** frame 404s,
show `NO FRAMES FOUND`. If only some fail, scrubbing continues and the dev console **names the
failing indices along with the command that fixes them**.

### Switching sequences on rotate

The two sequences can have different frame counts, and page height derives from frame count. A
naive switch changes the height, `scrollYProgress` shifts under the visitor, and they land
somewhere else in the story — with nothing erroring, so the page simply reads as "janky."

Required: read `progress` **before** the switch, recompute `scrollY` once the new height applies,
and restore the same point in the story. `scrollProgress` has a test covering a height change.

### Poster and static fallback

Frame 0 of the sequence matching the viewport renders as an `<img>` beneath the canvas. First
paint shows a real image instead of a spinner, the social preview works, and the page still has
content with JavaScript disabled.

### Lenis — conditional

In scope but **must be proven at the checkpoint**: compare real scrolling with and without it.
It has known interactions with `position: sticky` — which is the entire mechanism here — and is
commonly disabled on iOS. If it is not clearly better, cut it. Always disabled under
`prefers-reduced-motion`.

### `story.ts`

```ts
export const story = {
  brand: "ORBIT",
  title: "…",
  description: "…",
  sections: [
    { at: 0.00, align: "center", heading: "…", body: "…" },
    { at: 0.30, align: "left",   heading: "…", body: "…" },
    { at: 0.60, align: "right",  heading: "…", body: "…" },
    { at: 0.92, align: "center", anchor: "bottom", heading: "…", body: "…" },
  ],
};
```

### Type, color, affordance

Dark mode. `Inter` via `next/font` (self-hosted). Headings `text-white/90`, body
`text-white/60`. Headings one line, body at most two. A hairline progress indicator and a fading
"scroll" hint on the hero — the number one failure of a scrollytelling page is a visitor who
does not realise they should scroll.

### Accessibility

**One static semantic block** containing every beat in order, always present for screen readers
and crawlers. The canvas and the animated beats are marked `aria-hidden`.

The naive approach — leaving beats mounted at `opacity: 0` — does not work: elements at zero
opacity remain in the accessibility tree, so a screen reader reads all four beats consecutively
as a wall of text with no scroll context, which is worse than one coherent description. Syncing
`aria-hidden` to opacity fixes the audio but leaves crawlers seeing a single beat. The static
block solves both.

`prefers-reduced-motion` disables smoothing.

## Workflow

```
0. npm i -g scrollytelling      (or npx; frames self-checks its dependencies)
1. scrollytelling frames --preview <video>     → 5 frames to a temp dir
2. Read those frames, propose beats from what the footage is actually doing
3. scrollytelling scaffold <project_dir>
4. cd <project_dir> && npm install                 (next/react/tailwind only — fast)
5. scrollytelling frames <video> <project_dir> --frames 50 --focus <portrait region>
   → read the raw luminance table
6. Edit components/story.ts
7. scrollytelling frames --check <project_dir> → per-beat warnings
8. npm run build && npm run start -- -p 3737
9. ◀── MEASUREMENT CHECKPOINT (below)
10. Full verification, then report
```

**Place beats against the footage, not round numbers.** `0.30 / 0.60 / 0.90` are placeholders.

### Measurement checkpoint

The first time the scrubbing loop renders, **stop and measure three things**:

| Measure | Decides |
| --- | --- |
| Real letterbox percentage at 375×812 | whether `--focus` is tight enough or needs recropping |
| Real scrolling with and without Lenis | keep Lenis or cut it |
| Peak memory while scrubbing back and forth | the MB budget for the LRU window |

Three commitments in this document depend on numbers that only exist at that moment. Without the
checkpoint they get evaluated at the last task, or quietly skipped.

## Verification

Use the **`/browse`** skill (per CLAUDE.md: never the Chrome MCP tools). Check at 1440×900 and
375×812:

1. The sequence loaded; the dev console names no failing indices.
2. **The canvas center pixel changes between scroll positions — and changes on the way back up.**

   ```
   $B js "(()=>{const c=document.querySelector('canvas');const d=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;return [d[0],d[1],d[2]].join(',')})()"
   ```

3. **Screenshot each beat and `Read` the screenshots.** Judge contrast with your own eyes.
4. Rotate mid-scroll — still at the same point in the story.
5. `$B console --errors` is clean.
6. At 1440×900, no canvas edge is visible at any scroll position.

## Tests

`node:test` at the repo root. `scroll-math.mjs` is plain JS, so tests import it directly.

**`sharp` and `ffmpeg-static` are pinned exactly in `package.json` (no `^`).** The golden master
asserts measured pixel values that depend on libvips resampling and the webp encoder; both shift
across minor versions. Upgrading them is a deliberate act that includes refreshing the expected
values.

| Test | Catches |
| --- | --- |
| natural sort | `frame_10` before `frame_2` → the animation plays out of order |
| decimation | exactly N frames; first and last preserved |
| edge color / luma grid | synthesized raw buffer → small error (pure functions) |
| `frames.ts` generation | every `Sequence` has array lengths matching `totalFrames` |
| safe writes | a failed run leaves the previous `public/frames/` intact |
| scaffold | no overwrite without `--force`; `--diff` lists exactly the changed files |
| **scroll-math parity** | `templates/lib/scroll-math.mjs` is byte-identical to `lib/scroll-math.mjs` |
| video decode | a synthesized `testsrc` clip → exactly N frames |
| `scrollProgress` | story position is preserved across a page-height change |
| `frameIndex` | progress = −0.2, 0, 1, 1.3 → valid index, no throw |
| `selectSequence` | portrait viewport picks portrait, landscape picks landscape, no match → first |
| `computeScale` | matched source → cover; mismatched → contain; for both sequences |
| `scrimOpacity` | selects the right grid cells for a given `visibleRect` |
| `fadeOpacity` | adding or removing a beat leaves no gap |
| `lerpColor` · `scrollHeightVh` | boundaries and midpoints |
| `--check` | no `story.ts` → clear error; with one → correct per-beat warnings |
| `.scrollytelling-version` | re-running `frames.mjs` does not change the version |
| security | a filename containing `;` `$(` `&&` is handled normally |
| golden master | `testsrc` clip → whole pipeline → file count, `totalFrames`, measured values within tolerance |

Six user flows are exercised through `/browse` during verification: first visit; all four beats;
rotate mid-scroll; fast scroll before loading finishes; JavaScript disabled; screen reader.

## Done criteria

- `npm run build` succeeds.
- Scrubbing is smooth on desktop and mobile, **including backwards**.
- **No canvas edge is visible at any scroll position, at both 1440×900 and 375×812.** With two
  sequences this applies to both — there is no longer an exemption for portrait screens.
- Rotating mid-scroll preserves the position in the story.
- Copy is readable at all four beats, confirmed against screenshots that were actually looked at.
- A screen reader receives one coherent semantic block, not four beats read back to back.
- Peak memory stays under the budget fixed at the checkpoint.
- No console errors.
- The full test suite passes, including the golden master and the scroll-math parity check.

## Settled decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Decomposition | Phase A first, B in its own spec | B costs money, calls async APIs, and does not block A |
| Template | Next.js **16** + React 19 | `next@latest` is 16.3.0 |
| Script runtime | Node + sharp + ffmpeg-static, **pinned** | no system ffmpeg on this machine; the golden master is version-sensitive |
| Tooling location | skill repo, not the project | clones, CI runs, and deploys of a static site should not install 100MB+ |
| **Distribution** | **npm CLI** | otherwise the only install path is copying files by hand, with no update path |
| **Portrait** | **in v1, as a second sequence** | 16:9 cannot fill a 9:19.5 screen; this is the real differentiator |
| **Data shape** | **`SEQUENCES: Sequence[]`** | parallel arrays duplicate everything and branch in every consumer |
| Fit | matched source → cover; mismatched → contain | `min(cover, contain×1.7)` returns cover on every desktop |
| Scrim | 6×4 luma grid + `visibleRect` | three vertical bands measure source space, wrong after cropping |
| Measurement | one decode into one raw buffer | 29 ops per frame; and it makes the measurement functions testable |
| **Progress** | **computed directly, drop framer-motion** | one division is not worth 40KB, and it removes the Lenis conflict |
| Decoding | worker + `createImageBitmap` + **symmetric LRU window** | `ImageBitmap` is pinned until `.close()`; two sequences reach ~350MB |
| Rotate | preserve progress across the switch | different frame counts → different height → the visitor is silently moved |
| Lenis | keep, but prove it at the checkpoint | known `position: sticky` interactions, commonly disabled on iOS |
| `scroll-math` | plain `.mjs` + `.d.ts` + parity test | `node:test` must import it; the copy must not become a fork |
| Template version | `.scrollytelling-version`, not generated | inside `frames.ts` there would be two writers and `--diff` would compare wrongly |
| Readability report | two modes: raw table, then `--check` | it cannot name beats that do not exist yet |
| Accessibility | static block + `aria-hidden` animated layer | `opacity: 0` elements stay in the accessibility tree |
| `public/frames/` | committed to git | gitignored means a fresh clone cannot build |
| Subprocesses | `execFile` with an argument array | a user-supplied path in a shell string is command injection |
