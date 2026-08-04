# CEO Review — open-scrolltelling (Phase A)

2026-08-04 · Branch: `main` · Commit: `9849055`
Reviewed: [`docs/superpowers/specs/2026-08-04-open-scrolltelling-design.md`](../superpowers/specs/2026-08-04-open-scrolltelling-design.md)
Mode: **SELECTIVE EXPANSION** · Approach: **B** (spec + pure-function core + tests)
Outside voice: Claude subagent (Codex not installed)

---

## Executive summary

The spec is right about the core idea and wrong in exactly one formula — the formula that
decides how the page looks on every device. Two independent reviewers found the same defect.

Three things worth remembering from this round:

1. **The fit formula does the opposite of what the spec says.** `min(cover, contain × 1.7)`
   returns cover on every realistic desktop, which makes `EDGE_COLORS` — the thing that
   distinguishes this project from the original prompt — dead code on desktop, while on phones it
   crops 41% of the width and still leaves 56% of the screen as background, violating the spec's
   own done criterion.
2. **The tooling is in the wrong place.** Putting `sharp` and `ffmpeg-static` inside the
   generated project forces every clone, CI run, and deploy of a static site to install 100MB+ of
   video tooling, in exchange for a convenience that is rarely used.
3. **The spec is already stale relative to this review.** Without a rewrite, whoever implements
   will follow the file rather than the conversation.

Reversibility: **5/5**. Static output, no migrations, no one-way doors. Strategic risk is low;
the main risk is finishing something that looks like the tool that already exists and is better
in no respect except how it installs.

---

## Verification (run, not assumed)

| Check | Result |
| --- | --- |
| System `ffmpeg` on this machine | **ABSENT** — the current `scrollytelling` skill would fail right now. This is the empirical case for the Node choice. |
| `next@latest` | **16.3.0** — the spec pins Next 14, two majors behind |
| `react@latest` | 19.2.8 |
| `ffmpeg-static@5.3.0` | 48KB package with an `install: node install.js` hook → **downloads ~80MB from GitHub releases at postinstall** |
| `sharp@0.35.3` | per-platform prebuilt binaries, a common failure point on musl and ARM |
| `framer-motion` | 12.43.0 (now published as `motion`) |
| `ffprobe-static` | exists (3.1.0); the spec deliberately avoids it by parsing stderr — reasonable |

---

## Landscape (Search Before Building)

- **[Layer 1]** Image sequences on canvas are the tried-and-true approach. Current consensus:
  video is more compact but scrubbing smoothly in both directions is hard and inconsistent across
  devices; image sequences remain the most reliable choice for scroll-driven playback. **The
  spec's core mechanism is correct.**
- **[Layer 2]** `canvas-scroll-clip` (zero-dependency micro-library), `@bsmnt/scrollytelling`
  (React + GSAP, ships an `ImageSequenceCanvas` helper), `scrollama` all exist. The 2026 stack is
  GSAP ScrollTrigger or Motion.dev plus Lenis. **None of them do the video→frames→measured-metadata
  half** — that is where this project's value sits.
- **[Layer 3]** WebCodecs is now broadly shipped (Chrome 94+, Firefox 130+, Safari 26+, Chrome
  Android 147) and could in principle remove the 2MB preload entirely. Not recommended for v1, but
  it is the thing that could make the frame-extraction pipeline obsolete within a year. `frames.ts`
  is the contract that lets that backend be swapped without touching the page.

---

## Decisions taken during the review

| # | Issue | Decision |
| --- | --- | --- |
| 1 | The fit formula returns cover on desktop; crops 41% and letterboxes 56% on phones | **1B** — separate the cases: contain on landscape screens, contain plus a modest zoom (~1.25×) anchored high on portrait, copy placed below |
| 2 | `scrollYProgress` is not clamped; iOS rubber-band plus Lenis momentum overflow the arrays | **2A** — `i = clamp(p,0,1) × (TOTAL_FRAMES−1)`, tested at −0.2 / 0 / 1 / 1.3 |
| 3 | `frames.ts` and `public/frames/` can drift with no detection | **3A** — runtime guard naming the failing indices, with a dev warning carrying the fix command |
| T1 | Heavy tooling lives inside the generated project | **Move it to the skill repo** — the project keeps only next/react/tailwind |
| T2 | Next.js 14 is two majors behind | **Next 16 + React 19** |
| T3 | `BAND_LUMA` is measured in the wrong coordinate space | **A finer luma grid (6×4) sampled against the visible region at runtime** |
| T4 | Lenis is unproven and has known `position: sticky` interactions | **Keep it, but it must be proven** — a side-by-side comparison on real scrolling; disabled under `prefers-reduced-motion` |
| T5 | No upgrade path for already-scaffolded projects | **`TEMPLATE_VERSION` + `scaffold.mjs --diff`** — report changes, never overwrite |
| T6 | The workflow reads frames before frames exist | **Add `frames.mjs --preview`** — extract 5 frames to a temp directory, no project required |
| T7 | Pure functions in `templates/` as TypeScript cannot be imported by the root `node:test` | **Write `scroll-math.mjs` as plain JS plus a `.d.ts`** |
| T8 | Loader behavior undefined; `400vh` hardcoded; aspect mismatch is a hard exit | **Fix all three** — hold the nearest decoded frame; derive scroll height from `TOTAL_FRAMES`; normalize small mismatches and only fail beyond a threshold |
| S2 | Four error-handling gaps | **Close all four**, each with its own message; no silent failures |
| S3 | Command injection through a user-supplied path | **`execFile` with an argument array**, no `shell: true`, plus a regression test |
| S6 | Nothing proves the pipeline works end to end | **A golden-master test** over a synthesized `testsrc` clip |

---

## The central finding: the fit formula

`scale = min(coverScale, containScale × 1.7)` returns **cover** whenever the viewport-to-frame
aspect mismatch is at or below 1.7×. On desktop that is essentially always:

```
  VIEWPORT      ASPECT   MISMATCH   FORMULA RETURNS   RESULT
  1440× 900     1.60     1.11×      cover  (1.25)     crops 11% of width, NO letterbox
  1920×1080     1.78     1.00×      either (1.50)     exact fit
  3440×1440     2.39     1.34×      cover  (2.69)     crops 26% of HEIGHT
   375× 812     0.46     3.85×      capped (0.498)    crops 41% of width AND letterboxes 56%
```

Two consequences:

1. **On desktop the background-matching feature never fires.** Cover leaves no letterbox, so
   `EDGE_COLORS` has nothing to paint. It only activates on phones. The spec's stated rationale
   describes behavior the formula does not produce.
2. **On a phone you get the worst of both.** 41% of the width cropped *and* 56% of the viewport
   as background with hard horizontal edges — a direct violation of the criterion *"no canvas edge
   visible at any scroll position"* at one of the two mandated test viewports.

`1.7` is a magic number with no derivation in the spec, and it is the number that decides how the
product looks on every device.

**Consequence for E2 (deferred):** because phones are the only place the background feature
fires, and because portrait fit has no clean answer without a dedicated sequence, **E2 is a
precondition for a stated done criterion**, not a nice-to-have. Recorded in TODOS at P1.

---

## Architecture (after these decisions)

```
  SKILL REPO (open-scrolltelling)          GENERATED PROJECT
  ─────────────────────────────            ─────────────────
  SKILL.md                                 app/{page,layout}.tsx
  LICENSE · README · .github/ci            app/globals.css
                                           components/ScrollSequence.tsx
  scripts/scaffold.mjs ──── copy ─────────▶ components/story.ts       ◀── editing surface
    (node:fs, zero deps)                   components/frames.ts       ◀── GENERATED, do not edit
    --diff  → compares TEMPLATE_VERSION    lib/scroll-math.mjs (+ .d.ts)
                                           public/frames/frame_N.webp
  scripts/frames.mjs ────── writes ───────▶ ▲                         (committed to git)
    (sharp + ffmpeg-static — HERE,          │
     NOT in the project)                    │  project deps reduce to:
    --preview → 5 frames to /tmp            │  next 16 · react 19 · tailwind
                                            │
  lib/scroll-math.mjs ◀── shared source ────┘
    computeScale · frameIndex
    fadeOpacity · scrimOpacity · lerpColor
         ▲
         │ imported directly, no build step
  tests/  node:test
```

Every dependency points one way and crosses a generated contract. `frames.mjs` never imports
React; `ScrollSequence` never touches `public/`. That is what makes a WebCodecs backend swappable
later.

---

## Data flow and shadow paths

```
  VIDEO ──▶ READ DURATION ──▶ SEEK N MARKS ──▶ SHARP ──▶ WRITE .partial ──▶ SWAP
    │            │                 │             │            │             │
    ▼            ▼                 ▼             ▼            ▼             ▼
 [missing?]  [N/A on          [mark == dur   [corrupt    [disk full?]  [swap fails
 [0 bytes?]   fragmented       → 0 output?]   frame?]     → clean       midway?]
 [not a       MP4 / VFR?]     [ffmpeg binary [OOM on      .partial       → .partial
  video?]     → fall back      missing via    huge         and exit      remains,
              to one decode    proxy?]        images?]                   old frames/
              pass                                                       intact
```

```
  frames.ts ──▶ PRELOAD ──▶ SCRUB ──▶ DRAW ──▶ BACKGROUND + SCRIM
      │            │           │        │            │
      ▼            ▼           ▼        ▼            ▼
  [missing?]  [image 404?] [progress [canvas    [index overflow?]
  [TOTAL       → count and  outside   context   → clamp before
   wrong?]     name the     [0,1]?]   null?]      indexing
               bad index    → clamp
               (guard 3A)
              [frame not
               yet decoded?]
               → hold the
                 nearest one
```

## Runtime state machine

```
        ┌──────────┐  frames.ts missing / TOTAL=0
        │  INIT    │──────────────────────────▶┌──────────────┐
        └────┬─────┘                            │ NO FRAMES    │ (clear message,
             │ start preload                    │  FOUND       │  not a spinner forever)
             ▼                                  └──────────────┘
        ┌──────────┐  first batch ready
        │ LOADING  │───────────────────┐
        │ (poster  │                   ▼
        │  shown)  │            ┌─────────────┐  scrolled to an undecoded frame
        └────┬─────┘            │   READY     │◀──────────┐
             │ every frame 404s │  (scrub)    │───────────┘ hold the nearest frame
             ▼                  └──────┬──────┘             (NEVER back to LOADING)
        ┌──────────┐                   │ some images failed
        │ NO FRAMES│                   ▼
        └──────────┘            ┌─────────────┐
                                │  DEGRADED   │ scrubbing works, dev warning
                                │             │ names the failing indices
                                └─────────────┘

  Forbidden transition: READY ──▶ LOADING (a spinner flashing mid-scroll).
  What prevents it: once the first batch is ready, the loader never takes the screen back.
```

---

## Error & Rescue Registry

| Codepath | What can go wrong | Error class |
| --- | --- | --- |
| `frames.mjs` reads input | path does not exist | `ENOENT` |
| | directory has no images | `NoImagesError` |
| | images differ in aspect ratio | `AspectMismatchError` |
| `frames.mjs` reads duration | `Duration: N/A` (fragmented MP4, VFR) | `DurationUnknownError` |
| `frames.mjs` calls ffmpeg | binary missing (postinstall blocked by a proxy) | `ENOENT` on the binary |
| | ffmpeg exits non-zero | `FfmpegExitError` |
| | seek mark == duration → no output | `EmptyFrameError` |
| `frames.mjs` sharp stage | corrupt frame | `SharpDecodeError` |
| `frames.mjs` writes | disk full during `.partial` | `ENOSPC` |
| Runtime preload | image 404 | `img.onerror` |
| Runtime scrub | `progress` outside `[0,1]` | (prevented by clamping) |
| Runtime draw | `getContext('2d')` returns null | `CanvasUnavailable` |

| Error class | Caught? | Action | User sees |
| --- | --- | --- | --- |
| `ENOENT` (input) | Y | exit non-zero | the path that was tried |
| `NoImagesError` | Y | exit non-zero | the accepted file extensions |
| `AspectMismatchError` | Y | **small → normalize and warn; beyond threshold → exit** | the offending filename |
| `DurationUnknownError` | Y | **fall back to counting frames in one decode pass** | a warning, then it continues |
| `ENOENT` (binary) | Y | **exit non-zero with the exact reinstall command** | how to restore `ffmpeg-static` |
| `FfmpegExitError` | Y | print ffmpeg's stderr verbatim | ffmpeg's real error |
| `EmptyFrameError` | Y | **re-seek at `duration − ε`** | nothing (transparent) |
| `SharpDecodeError` | Y | **skip and name it; abort only past 10%** | which frame was skipped |
| `ENOSPC` | Y | **clean up `.partial` and exit non-zero** | disk full, old `frames/` intact |
| `img.onerror` | Y | **count, name the index, warn in dev** | dev sees the index and the fix |
| progress outside `[0,1]` | Y | clamp inside `frameIndex()` | nothing (transparent) |
| `CanvasUnavailable` | Y | **keep the static poster (E3)** | a still image instead of a blank page |

**No remaining gaps.** There were 6 before this review; all now have an action and a message.

---

## Failure Modes Registry

| Codepath | Failure mode | Caught? | Test? | User sees | Logged? |
| --- | --- | --- | --- | --- | --- |
| video extraction | duration N/A | Y | Y | warning, continues | Y |
| video extraction | binary missing | Y | N¹ | reinstall command | Y |
| video extraction | seek == duration | Y | Y | transparent | N |
| measurement | corrupt frame | Y | Y | which frame was skipped | Y |
| writing | disk full | Y | N¹ | clean exit, old data safe | Y |
| writing | swap fails midway | Y | Y | old `frames/` intact | Y |
| runtime preload | every image 404s | Y | Y | `NO FRAMES FOUND` | Y |
| runtime preload | some images 404 | Y | Y | dev warning + indices | Y |
| runtime scrub | progress overflow | Y | Y | transparent | N |
| runtime scrub | frame not yet decoded | Y | Y | holds the nearest frame | N |
| runtime draw | canvas null | Y | N¹ | static poster | Y |
| security | shell characters in a filename | Y | Y | handled normally | N |

¹ hard to stage in an automated test; accepted deliberately and recorded. **0 CRITICAL GAPS**
(no row is Caught=N + Test=N + silent).

---

## Deployment sequence and rollback

```
  DEPLOY                                   ROLLBACK
  ──────                                   ────────
  1. frames.mjs --preview <video>          page broken after deploy?
     (no project needed)                          │
  2. read frames → write beats                    ▼
  3. scaffold.mjs <dir>                    ┌──────────────┐
  4. npm install (next/react/tw only)      │ git revert   │
  5. frames.mjs <video> <dir>              │ + redeploy   │  < 2 minutes
     → public/frames/ + frames.ts          └──────┬───────┘
     → print the readability report (E1)          │
  6. edit story.ts against the report             ▼
  7. npm run build                         no migrations, no state,
  8. verify with /browse                   no one-way doors → 5/5
  9. commit public/frames/ too
```

---

## NOT in scope

| Item | Why deferred |
| --- | --- |
| Phase B (prompt → images → AI video) | Costs money, async API calls, does not block A. Its own spec. |
| E2 — a dedicated portrait sequence | Effort M and it needs the user to nominate a focus region. **But it is a precondition for a stated done criterion** → TODOS at P1, not P3. |
| Publishing an npm CLI | Needs release infrastructure; the core has to be right first. |
| Additional template stacks (Astro, Vue, static) | Maintaining multiple copies of the scrubbing mechanism. |
| WebCodecs backend | `frames.ts` keeps the option open; not needed now. |
| Multiple clips or chapters per page | Scope creep, low v1 value. |

## What already exists

| Exists | Does this project reuse it? |
| --- | --- |
| `~/.claude/skills/scrollytelling` (Python) | **Port the measurement constants rather than re-deriving them.** Edge-strip thickness, luma coefficients, and the keep-first-and-last rule are already tuned; rediscovering them costs a QA cycle. |
| Its `frames.ts` / `story.ts` split | Yes — the spec inherits it correctly; it is the best part of the original design. |
| `canvas-scroll-clip`, `@bsmnt/scrollytelling` | No — they only cover the runtime half, not video→metadata. |
| `ffmpeg-static`, `sharp`, `lenis` | Yes, as dependencies. |

## Dream state delta

```
  TODAY                         AFTER PHASE A                12-MONTH IDEAL
  Manual frame export      ──▶  video in, site out      ──▶  prompt in, site out.
  + a prompt that               zero system deps             Phase B generates the video.
  hardcodes colors              measured seams               A is unchanged.
  → visible canvas edges        current stack (Next 16)      frames.ts could be backed
                                                             by WebCodecs instead.
```

The plan moves toward that state. The condition for keeping it: the runtime consumes only
measured metadata and never reaches into `public/`. The spec gets this right.

---

## Implementation Tasks

Synthesized from the findings above. Each task derives from a specific finding.

- [ ] **T1 (P1, human: ~3h / CC: ~20min)** — spec — Rewrite the spec to match every review decision
  - Surfaced by: Outside voice #2 — the spec still specifies a blocking preload, and the 50-frame default is *derived from* that blocking preload; Lenis, the pure functions, the poster, and the report appear nowhere
  - Files: `docs/superpowers/specs/2026-08-04-open-scrolltelling-design.md`
  - Verify: re-read the spec; every row of the decision table above is present
- [ ] **T2 (P1, human: ~2h / CC: ~10min)** — scroll-math — Split contain (desktop) from capped zoom (mobile) in `computeScale`
  - Surfaced by: Section 1 finding 1.1 + outside voice #1 (both models agree)
  - Files: `lib/scroll-math.mjs`, `tests/scroll-math.test.js`
  - Verify: tests assert 1440×900 → contain; 375×812 → crop ≤ 25%
- [ ] **T3 (P1, human: ~30min / CC: ~3min)** — scroll-math — Clamp progress; fix the index to `clamp(p,0,1) × (TOTAL−1)`
  - Surfaced by: Section 1 finding 1.2 — iOS rubber-band plus Lenis momentum overflow the arrays and throw inside the rAF loop
  - Files: `lib/scroll-math.mjs`, `tests/scroll-math.test.js`
  - Verify: progress = −0.2, 0, 1, 1.3 do not throw and return valid indices
- [ ] **T4 (P1, human: ~3h / CC: ~15min)** — architecture — Move `frames.mjs` + sharp + ffmpeg-static into the skill repo
  - Surfaced by: Outside voice #3 — every clone, CI run, and deploy installs 100MB+ of video tooling
  - Files: `scripts/frames.mjs`, `templates/package.json`, `SKILL.md`
  - Verify: `templates/package.json` is next/react/tailwind only; scaffold and build still work
- [ ] **T5 (P1, human: ~2h / CC: ~10min)** — template — Upgrade to Next 16 + React 19
  - Surfaced by: verification — `next@latest` is 16.3.0, the spec pins 14
  - Files: `templates/package.json`, `templates/next.config.mjs`, `templates/tsconfig.json`
  - Verify: `npm run build` is clean on a freshly scaffolded project
- [ ] **T6 (P1, human: ~1h / CC: ~8min)** — scroll-math — Write it as plain `.mjs` + `.d.ts` so the root `node:test` imports it directly
  - Surfaced by: Outside voice #7 — `templates/` is TypeScript, outside the root module graph
  - Files: `lib/scroll-math.mjs`, `lib/scroll-math.d.ts`, `package.json`
  - Verify: `node --test` at the repo root runs with no build step
- [ ] **T7 (P1, human: ~1h / CC: ~5min)** — security — `execFile` with an argument array; forbid `shell: true`
  - Surfaced by: Section 3 — a user-supplied path is handed to a subprocess
  - Files: `scripts/frames.mjs`, `tests/frames.test.js`
  - Verify: a test passes a filename containing `;` `$(` `&&` and asserts normal handling
- [ ] **T8 (P1, human: ~4h / CC: ~20min)** — frames.mjs — Close the four error gaps
  - Surfaced by: Section 2 — duration N/A, missing binary, corrupt frame, disk full
  - Files: `scripts/frames.mjs`
  - Verify: each has a test or a checkable message; no failure is silent
- [ ] **T9 (P1, human: ~2h / CC: ~10min)** — runtime — Define the progressive loader: hold the nearest decoded frame
  - Surfaced by: Outside voice #2 — the core behavior of a newly accepted feature is undefined
  - Files: `templates/components/ScrollSequence.tsx`
  - Verify: fast scrolling on a cold load shows no blank frame and no loader flicker
- [ ] **T10 (P2, human: ~4h / CC: ~20min)** — measurement — 6×4 luma grid plus runtime sampling of the visible region
  - Surfaced by: Outside voice #10 — `BAND_LUMA` measures source space and describes offscreen pixels after cropping
  - Files: `scripts/frames.mjs`, `lib/scroll-math.mjs`, `templates/components/ScrollSequence.tsx`
  - Verify: a test asserts the selected cells change with the fit mode
- [ ] **T11 (P2, human: ~1h / CC: ~8min)** — runtime — Desync guard naming the failing indices
  - Surfaced by: Section 1 finding 1.3 — discipline is not a mechanism
  - Files: `templates/components/ScrollSequence.tsx`
  - Verify: delete one frame by hand → the dev warning names that index and the fix command
- [ ] **T12 (P2, human: ~1h / CC: ~5min)** — runtime — Derive scroll height from `TOTAL_FRAMES` instead of a fixed `400vh`
  - Surfaced by: Outside voice #11 — scroll sensitivity changes silently when `--frames` changes
  - Files: `templates/components/ScrollSequence.tsx`
  - Verify: 50 and 100 frames feel equivalent to scroll
- [ ] **T13 (P2, human: ~1h / CC: ~5min)** — frames.mjs — Normalize small aspect mismatches; fail only past a threshold
  - Surfaced by: Outside voice #11 — a 1919×1080 render kills the run over one pixel
  - Files: `scripts/frames.mjs`, `tests/frames.test.js`
  - Verify: a directory with a 1px-off image runs with a warning
- [ ] **T14 (P2, human: ~2h / CC: ~10min)** — frames.mjs — `--preview` mode extracting 5 frames without a project
  - Surfaced by: Outside voice #5 — the workflow reads frames before they exist
  - Files: `scripts/frames.mjs`, `SKILL.md`
  - Verify: run `--preview` against an empty directory and get 5 images in a temp dir
- [ ] **T15 (P2, human: ~3h / CC: ~15min)** — scaffold — `TEMPLATE_VERSION` + `scaffold.mjs --diff`
  - Surfaced by: Outside voice #6 — a mechanism fix orphans every generated project
  - Files: `scripts/scaffold.mjs`, `templates/`
  - Verify: `--diff` on an old project lists exactly the changed template files
- [ ] **T16 (P2, human: ~3h / CC: ~10min)** — frames.mjs — Build-time readability report (E1)
  - Surfaced by: Step 0D 10x check — the measured data is computed and then thrown away
  - Files: `scripts/frames.mjs`
  - Verify: the report states the largest edge-color delta and the per-region luma range
- [ ] **T17 (P2, human: ~2h / CC: ~8min)** — runtime — Poster frame and static fallback (E3)
  - Surfaced by: Step 0D cherry-pick E3
  - Files: `templates/components/ScrollSequence.tsx`, `templates/app/page.tsx`
  - Verify: with JS disabled frame 0 is visible; the social preview works
- [ ] **T18 (P2, human: ~4h / CC: ~20min)** — tests — Whole-pipeline golden master
  - Surfaced by: Section 6 — nothing proves the pipeline works end to end
  - Files: `tests/pipeline.test.js`
  - Verify: `testsrc` → frames.mjs → assert file count, `TOTAL_FRAMES`, and measured values within tolerance
- [ ] **T19 (P2, human: ~2h / CC: ~10min)** — runtime — Lenis verification gate + disable under `prefers-reduced-motion`
  - Surfaced by: Outside voice #8 + decision T4 — keep it, but it must be proven
  - Files: `templates/components/ScrollSequence.tsx`
  - Verify: compare real scrolling with and without Lenis; cut it if it is not clearly better
- [ ] **T20 (P2, human: ~3h / CC: ~12min)** — repo — Real open-source packaging: LICENSE, README, CI, issue template (E4)
  - Surfaced by: Step 0D cherry-pick E4 + outside voice #4
  - Files: `LICENSE`, `README.md`, `.github/workflows/test.yml`, `.github/ISSUE_TEMPLATE/`
  - Verify: CI runs `node --test` green on push
- [ ] **T21 (P2, human: ~2h / CC: ~8min)** — runtime — Scroll affordance (E5)
  - Surfaced by: Step 0D cherry-pick E5
  - Files: `templates/components/ScrollSequence.tsx`
  - Verify: the hero shows a scroll hint that fades after first interaction
- [ ] **T22 (P2, human: ~3h / CC: ~10min)** — runtime — Accessibility pass (E6)
  - Surfaced by: Step 0D cherry-pick E6 + outside voice #11
  - Files: `templates/components/ScrollSequence.tsx`
  - Verify: beat copy is in the DOM at every scroll position (opacity, not conditional mounting); the canvas has an `aria-label`
- [ ] **T23 (P3, human: ~30min / CC: ~3min)** — repo — Decide and document that `public/frames/` is committed
  - Surfaced by: Step 0E + outside voice #6 — gitignored means a fresh clone cannot build
  - Files: `templates/gitignore.template`, `README.md`
  - Verify: `gitignore.template` does NOT contain `public/frames/`

Task detail: `~/.gstack/projects/open-scrolltelling/tasks-ceo-review-*.jsonl` (23 lines, for
`/autoplan` to aggregate).

---

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                          |
  | System Audit         | greenfield, 1 commit; NO system ffmpeg       |
  |                      | → confirms the Node choice                   |
  | Step 0               | Approach B; premise holds; Next 14 is stale  |
  | Section 1  (Arch)    | 3 issues (1 CRITICAL: the fit formula)      |
  | Section 2  (Errors)  | 12 error paths mapped, 6 GAPS → 0 GAPS      |
  | Section 3  (Security)| 1 issue, 0 High severity                    |
  | Section 4  (Data/UX) | 14 edge cases mapped, 0 unhandled           |
  | Section 5  (Quality) | 0 issues                                    |
  | Section 6  (Tests)   | Diagram produced, 1 gap (golden master)     |
  | Section 7  (Perf)    | 0 issues (10x = 20MB, progressive loader)   |
  | Section 8  (Observ)  | 0 gaps (E1 report is build-time observability)|
  | Section 9  (Deploy)  | 0 risks (static, revert < 2 min)            |
  | Section 10 (Future)  | Reversibility: 5/5, debt items: 1 (E2)      |
  | Section 11 (Design)  | UI scope CONFIRMED → run a design review    |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (6 items)                            |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 12 codepaths, 0 CRITICAL GAPS               |
  | Failure modes        | 12 total, 0 CRITICAL GAPS                   |
  | TODOS.md updates     | 2 items proposed                            |
  | Scope proposals      | 6 proposed, 5 accepted, 1 deferred          |
  | CEO plan             | written                                     |
  | Outside voice        | ran (claude subagent) — 11 findings          |
  | Lake Score           | 14/14 recommendations chose complete option |
  | Diagrams produced    | 6 (arch, data flow, state machine, error,   |
  |                      | deploy sequence, rollback)                  |
  | Stale diagrams found | 0 (none existed)                            |
  | Unresolved decisions | 0                                           |
  +====================================================================+
```

**Cross-model:** two independent reviewers found the same fit-formula defect using the same
arithmetic — the strongest signal in this round. The outside voice beat me on 3 points (tooling
location, scaffold upgrade path, luma coordinate space); I beat it on 1 (it claimed `-ss` before
`-i` is only keyframe-accurate, which is wrong).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAN | 6 proposals, 5 accepted, 1 deferred; 0 critical gaps |
| Outside Voice | Claude subagent | Independent 2nd opinion | 1 | ISSUES_FOUND | 11 findings, 10 confirmed, 1 refuted |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CROSS-MODEL:** two independent reviewers reached the same fit-formula defect by the same
arithmetic — the strongest signal of the round. The outside voice won 3 points (tooling location,
scaffold upgrade path, luma coordinate space); the main review won 1 (`-ss` before `-i` is
frame-accurate as of ffmpeg 2.1). All 3 tension points went to the developer to decide rather
than being applied automatically.

**VERDICT:** CEO CLEARED — 23 tasks, 9 P1, 0 unresolved, 0 critical gaps. Eng review required
before implementation. The only blocker inside this round is T1 — rewriting the spec; without it,
whoever implements will follow a stale document.

NO UNRESOLVED DECISIONS
