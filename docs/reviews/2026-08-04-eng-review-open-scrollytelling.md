# Eng Review — open-scrollytelling (Phase A)

2026-08-04 · Branch: `main` · Commit: `13d82bc`
Reviewed: [design, revision 2](../superpowers/specs/2026-08-04-open-scrollytelling-design.md)
Mode: FULL_REVIEW · Outside voice: Claude subagent (Codex not installed)

---

## Executive summary

13 findings across 4 sections, plus 17 from the outside voice. None of them says the design is
pointed the wrong way — the architecture holds. They are all the same species of problem:
**recent decisions had not yet propagated to everything that depends on them**, which is the
most expensive kind of defect to discover while writing code.

The three worth remembering:

1. **Pulling E2 into v1 invalidated T2.** `computeScale`, its rationale table, and its test were
   all written for a single-sequence world. With a portrait sequence, portrait viewports should
   use cover against a 9:16 source. T2 would have been built against a spec that E2 contradicts
   immediately.
2. **The readability report — the feature I called the 10x leverage point in the CEO review —
   cannot run as written.** Step 5 prints warnings naming beats; beats do not exist until step 6.
3. **`ImageBitmap` stays pinned until `.close()`.** The worker decision I recommended an hour
   earlier creates a ceiling of ~176MB for one sequence and ~350MB for two. iOS Safari kills tabs
   below that. The LRU window is not an optimization; it is the condition for not crashing.

Nothing here says the project should stop. Reversibility remains 5/5.

---

## Verification

| Claim | Verdict |
| --- | --- |
| `next@latest` | 16.3.0 — the spec was already correct after the CEO review |
| `ImageBitmap` 50×1280×720×4 | 176 MB, pinned until `.close()` — the outside voice's arithmetic checks out |
| `img.decode()` decodes off the main thread | ✅ correct, that is the API's purpose |
| The project dependency list omits framer-motion | ✅ correct — architecture says next/react/tailwind, runtime uses `useScroll` |
| The report names beats before `story.ts` exists | ✅ correct |
| `TEMPLATE_VERSION` has two writers | ✅ correct |
| "one pass through sharp" is actually 29 operations | ✅ correct (4 edge strips + 24 grid cells + encode) |
| `opacity: 0` elements remain in the accessibility tree | ✅ correct |
| Outside voice: "the 23-task list exists nowhere" | ❌ **wrong** — it is in the CEO review, which the spec links. It only read 2 files. |
| Outside voice: `-ss` before `-i` is only keyframe-accurate | ❌ **wrong** (already refuted in the CEO review; frame-accurate since ffmpeg 2.1) |

## Step 0 — Scope Challenge

**Complexity check: TRIGGERED** (~25 files). Most of that is unavoidable Next boilerplate; the
skill-side surface is 2 scripts plus 1 library, which is lean. **No scope cut.** The developer
chose to run straight through P1→P2→P3 with no milestones.

**Search check — one [Layer 1] built-in was being bypassed:** the loader used `new Image()`,
decoding on the main thread, while the platform provides `createImageBitmap` usable inside a
Worker. Fixed (B1), with LRU and measurement as conditions.

**TODOS cross-reference — a contradiction:** E2 was simultaneously P1 and out of scope, while a
done criterion depended on it. Resolved by pulling E2 into v1.

**Distribution check — a gap:** nothing answered "how does anyone install this skill." Resolved
with an npm CLI.

## Decisions taken during the review

| # | Issue | Decision |
| --- | --- | --- |
| A1 | `scroll-math.mjs` lives in two places; tests guard only one | `SCROLL_MATH_VERSION` + a parity test, `templates/` vs `lib/` |
| A2 | No distribution architecture for the skill itself | **Publish an npm CLI** |
| A3 | The workflow never installs the skill's dependencies | frames.mjs self-checks and prints the exact fix; covers `sharp` on musl/ARM |
| A4 | Web Workers in Next 16 unaddressed | Pin the `new Worker(new URL(...))` form + `img.decode()` fallback |
| B1 | The worker creates a pinned-memory ceiling | Keep the worker, **mandate an LRU window and a before/after measurement** |
| B2 | E2 in v1 invalidates T2 | **Respec `computeScale` for multiple sources up front** |
| B3 | Two measure-then-decide gates with nowhere to measure | **One checkpoint after the scrubbing loop first renders** |
| B4 | Wrong project dependency list; `useScroll` unnecessary | **Drop framer-motion, compute `scrollProgress` directly** |
| C1 | The readability report is circular | Two modes: raw table, then `--check` |
| C2 | `TEMPLATE_VERSION` has two writers | `.scrollytelling-version`, not generated |
| C3 | A parallel `PORTRAIT_FRAMES` is the wrong shape | **`SEQUENCES: Sequence[]`** |
| C4 | `opacity: 0` beats are still read by screen readers | Static block + `aria-hidden` animated layer |
| D1 | The golden master is version-flaky | Pin `sharp` and `ffmpeg-static` exactly |
| D2 | 8 new codepaths untested; 2 existing tests now wrong | Cover everything, including 6 E2E flows |
| D3 | Rotating jumps the visitor in the story, silently | Preserve progress across the sequence switch |
| E1 | 29 sharp operations per frame | One decode into one raw buffer; measurement becomes pure functions |
| E2 | The LRU window has no size | Symmetric ±N, N derived from an MB budget, one sequence resident |

---

## Section 1 — Architecture

```
  SKILL REPO                                   GENERATED PROJECT
  package.json (sharp, ffmpeg-static, bin)     package.json (next, react, tailwind)
      │                                             │
  scripts/frames.mjs ────────── writes ────────────▶ public/frames/*.webp
  scripts/scaffold.mjs ──────── copies ────────────▶ components/frames.ts (SEQUENCES[])
      │                                             │ components/decoder.worker.js
      │                                             │ .scrollytelling-version ◀── one writer
  lib/scroll-math.mjs ───────── copies ────────────▶ lib/scroll-math.mjs
      ▲                                             ▲
      │ imports                                     │ imports
  tests/ (node:test)                            ScrollSequence.tsx
      └──── parity test asserts the two copies match ────┘
```

Four findings, all closed. Coupling runs one way, through a generated contract; the single leak
was the copied `scroll-math`, which the parity test now guards.

Rollback: static site, `git revert` plus redeploy, under 2 minutes. No migrations, no one-way doors.

## Section 2 — Code Quality

Four findings, all closed. Two of them — C1's circular report and C2's duplicate version writer
— are the kind of defect a compiler never catches and that only surfaces when someone uses the
tool for real.

## Section 3 — Tests

```
COVERAGE BEFORE: 12/40 (30%) | Code 12/28 (43%) | User flows 0/12 (0%)
COVERAGE AFTER:  40/40 (100%) — 8 new functions, 2 respecced, 6 E2E flows, parity, version
QUALITY: mostly ★★★ | CRITICAL GAPS: 1 (D3, closed)
```

**CRITICAL GAP closed — D3:** rotating mid-scroll switches sequence → changes frame count →
changes page height → drops the visitor somewhere else in the story. No test, no handling, and
nothing visible goes wrong. This is the worst failure shape: the page reports nothing and simply
reads as "janky."

Test plan for `/qa`: `~/.gstack/projects/open-scrollytelling/danhnguyen-main-eng-review-test-plan-*.md`

## Section 4 — Performance

No database, so N+1 and index checks do not apply. Two findings, both on the project's only
genuinely hot paths: the build-time measurement loop and the scroll-time draw loop. Both closed.

---

## NOT in scope

| Item | Why deferred |
| --- | --- |
| Phase B (prompt → images → AI video) | Costs money, async APIs, does not block A |
| WebCodecs backend replacing frame extraction | `frames.ts` keeps the option open; not needed yet |
| Additional template stacks (Astro, Vue, static) | Maintaining multiple copies of the scrubbing mechanism |
| Multiple clips or chapters per page | Scope creep, low v1 value |
| Staged implementation milestones | Developer chose to run straight through; replaced by one measurement checkpoint |

## What already exists

| Exists | Reused? |
| --- | --- |
| `~/.claude/skills/scrollytelling` (Python) | Port the tuned measurement constants rather than re-deriving them |
| Its `frames.ts` / `story.ts` split | Yes — the best piece of design in the original |
| `createImageBitmap`, `img.decode()`, Workers | Yes — platform built-ins, not hand-rolled |
| `canvas-scroll-clip`, `@bsmnt/scrollytelling` | No — they only cover the runtime half |
| `framer-motion` | **No longer** — `scrollProgress` is computed directly, dependency dropped |

## Failure modes

| Codepath | Failure mode | Caught? | Test? | User sees | Logged? |
| --- | --- | --- | --- | --- | --- |
| step 0 self-check | missing sharp/ffmpeg (incl. musl/ARM) | Y | Y | the command to run | Y |
| video extraction | duration N/A | Y | Y | warning, continues | Y |
| video extraction | seek == duration | Y | Y | transparent | N |
| measurement | corrupt frame | Y | Y | which frame was skipped | Y |
| writing | disk full / failed swap | Y | Y | old data safe | Y |
| `--check` | missing story.ts | Y | Y | run normal generation first | Y |
| version | frames.mjs overwrites the version | Y | Y | transparent | N |
| runtime preload | every image 404s | Y | Y | `NO FRAMES FOUND` | Y |
| runtime preload | some images 404 | Y | Y | dev warning naming indices | Y |
| runtime decode | memory ceiling exceeded | Y | Y | LRU closes old bitmaps | Y |
| runtime decode | worker unsupported | Y | Y | `img.decode()` fallback | Y |
| runtime scrub | progress out of range | Y | Y | transparent | N |
| runtime scrub | frame not yet decoded | Y | Y | holds nearest frame | N |
| **runtime rotate** | **sequence switch jumps position** | **Y** | **Y** | **stays in place** | **N** |
| accessibility | screen reader hears a wall of text | Y | Y | one coherent block | N |
| security | shell characters in a filename | Y | Y | handled normally | N |
| scroll-math | the copy drifts from the source | Y | Y | CI fails | Y |

**0 CRITICAL GAPS** (no row is Caught=N + Test=N + silent). There was 1 before the review (D3).

## Worktree parallelization

| Lane | Modules | Depends on |
| --- | --- | --- |
| A | `lib/scroll-math.mjs`, `tests/` | — |
| B | `scripts/frames.mjs` | — |
| C | `scripts/scaffold.mjs`, `templates/` (config, app, package.json) | — |
| D | `templates/components/` (ScrollSequence, worker) | A (imports scroll-math), C (project shell) |
| E | `LICENSE`, `README`, `.github/`, npm CLI bin | C |

```
  Launch A + B + C in parallel (3 worktrees, no shared modules)
    → merge all three
  Then D + E in parallel
    → merge
  Then the measurement checkpoint, then the rest of verification
```

**Conflict flag:** Lanes A and D both touch `templates/lib/` when `scroll-math` is copied. Give
Lane A ownership of both copies (source plus the one under `templates/`) and let Lane D only
import. The parity test catches anyone who breaks that convention.

---

## Implementation Tasks

Continuing from T1–T23 in the CEO review. 17 new tasks from this round.

- [ ] **E1 (P1, human: ~2h / CC: ~10min)** — scroll-math — `SCROLL_MATH_VERSION` + parity test, `templates/` vs `lib/`
  - Surfaced by: Architecture A1 — the root tests guard a different copy than the page runs
  - Files: `lib/scroll-math.mjs`, `tests/parity.test.js`, `scripts/scaffold.mjs`
  - Verify: change one character in the `templates/` copy → `node --test` fails
- [ ] **E2 (P1, human: ~1d / CC: ~30min)** — distribution — Publish the `open-scrollytelling` npm CLI
  - Surfaced by: Architecture A2 — no install or update path for the skill
  - Files: `package.json` (bin), `.github/workflows/release.yml`, `README.md`, `SKILL.md`
  - Verify: `npx open-scrollytelling --help` works from a clean machine
- [ ] **E3 (P1, human: ~1h / CC: ~8min)** — frames.mjs — Step 0 dependency self-check
  - Surfaced by: Architecture A3 — the workflow's first command fails on a fresh clone
  - Files: `scripts/frames.mjs`
  - Verify: remove `sharp` → the message names the exact recovery command, no stack trace
- [ ] **E4 (P2, human: ~1h / CC: ~5min)** — spec — Pin the Next 16 worker init form and fallback
  - Surfaced by: Architecture A4 — the bundler needs `new Worker(new URL(...))` to emit the chunk
  - Files: spec, `templates/components/decoder.worker.js`
  - Verify: `npm run build` emits a worker chunk
- [ ] **E5 (P1, human: ~3h / CC: ~15min)** — scroll-math — Respec `computeScale` + `selectSequence` for multiple sources
  - Surfaced by: Cross-model B2 — E2-in-v1 invalidates T2's formula and its test
  - Files: `lib/scroll-math.mjs`, `tests/scroll-math.test.js`
  - Verify: tests for both sequences; matched source → cover, mismatched → contain
- [ ] **E6 (P1, human: ~4h / CC: ~20min)** — frames.ts — Switch the contract to `SEQUENCES: Sequence[]`
  - Surfaced by: Quality C3 — parallel arrays duplicate everything
  - Files: `scripts/frames.mjs`, `templates/components/ScrollSequence.tsx`
  - Verify: only `selectSequence` knows multiple sources exist; no branches downstream
- [ ] **E7 (P1, human: ~2h / CC: ~10min)** — runtime — Drop framer-motion, compute `scrollProgress` directly
  - Surfaced by: Cross-model B4 — wrong dependency list, and it removes the Lenis conflict
  - Files: `lib/scroll-math.mjs`, `templates/package.json`, `templates/components/ScrollSequence.tsx`
  - Verify: `templates/package.json` is next/react/tailwind only; `scrollProgress` has tests
- [ ] **E8 (P1, human: ~4h / CC: ~20min)** — runtime — Symmetric LRU window on an MB budget
  - Surfaced by: Performance E2 — `ImageBitmap` is pinned until `.close()`; 2 sequences ~350MB
  - Files: `templates/components/ScrollSequence.tsx`, `templates/components/decoder.worker.js`
  - Verify: scrub back and forth for 5 minutes, peak memory stays under budget
- [ ] **E9 (P1, human: ~1h / CC: ~5min)** — process — Measurement checkpoint after the first scrub render
  - Surfaced by: Cross-model B3 — two measure-then-decide gates with nowhere to measure
  - Files: spec, `SKILL.md`
  - Verify: all three numbers (letterbox %, Lenis, memory) recorded before work continues
- [ ] **E10 (P1, human: ~3h / CC: ~15min)** — frames.mjs — Two-mode report: raw table, then `--check`
  - Surfaced by: Quality C1 — the report names beats that do not exist yet
  - Files: `scripts/frames.mjs`
  - Verify: a normal run prints the luma table; `--check` after story.ts prints per-beat warnings
- [ ] **E11 (P2, human: ~1h / CC: ~5min)** — scaffold — `.scrollytelling-version` with a single writer
  - Surfaced by: Quality C2 — `frames.mjs` overwrites what `scaffold.mjs` stamped
  - Files: `scripts/scaffold.mjs`, `scripts/frames.mjs`
  - Verify: re-running `frames.mjs` leaves the version unchanged; `--diff` still compares correctly
- [ ] **E12 (P2, human: ~3h / CC: ~10min)** — accessibility — Static semantic block + `aria-hidden` animated layer
  - Surfaced by: Quality C4 — `opacity: 0` elements stay in the accessibility tree
  - Files: `templates/components/ScrollSequence.tsx`
  - Verify: a screen reader gets one coherent block; crawlers still see all the copy
- [ ] **E13 (P1, human: ~3h / CC: ~15min)** — runtime — Preserve scroll progress across a sequence switch
  - Surfaced by: Test D3 — CRITICAL GAP, fails silently on rotate
  - Files: `templates/components/ScrollSequence.tsx`, `lib/scroll-math.mjs`
  - Verify: rotate at 50% scroll → still at 50% of the story
- [ ] **E14 (P1, human: ~30min / CC: ~3min)** — tests — Pin `sharp` and `ffmpeg-static` exactly
  - Surfaced by: Test D1 — the golden master asserts encoder-dependent pixel values
  - Files: `package.json`, spec
  - Verify: no `^` on those two dependencies; the reason is documented in the spec
- [ ] **E15 (P1, human: ~1d / CC: ~40min)** — tests — Cover 8 new codepaths, respec 2, add 6 E2E flows
  - Surfaced by: Test D2 — coverage at 30%, user flows at 0%
  - Files: `tests/`, the `/browse` workflow
  - Verify: no `[GAP]` cells remain in the coverage diagram
- [ ] **E16 (P2, human: ~4h / CC: ~20min)** — frames.mjs — Single decode into one raw buffer
  - Surfaced by: Performance E1 — 29 sharp ops per frame, and measurement is not unit-testable
  - Files: `scripts/frames.mjs`, `lib/measure.mjs`, `tests/measure.test.js`
  - Verify: measurement functions have their own unit tests, not only the golden master
- [ ] **E17 (P3, human: ~30min / CC: ~3min)** — spec — Remove the `scrollHeightVh` upper clamp; document frame churn
  - Surfaced by: Outside voice #16 and #13 — the clamp breaks the invariant it exists to hold
  - Files: spec, `README.md`
  - Verify: 150 frames give the same per-frame scroll sensitivity as 50; README explains squashing

## Completion Summary

```
  Step 0: Scope Challenge   — scope accepted as-is (complexity gate triggered, no cut)
  Architecture Review       — 4 issues found, 4 resolved
  Code Quality Review       — 4 issues found, 4 resolved
  Test Review               — diagram produced, 28 gaps → 0, 1 CRITICAL GAP closed
  Performance Review        — 2 issues found, 2 resolved
  NOT in scope              — written (5 items)
  What already exists       — written
  TODOS.md updates          — 1 item promoted out of TODOS into v1 scope
  Failure modes             — 17 mapped, 0 critical gaps
  Outside voice             — ran (claude subagent), 17 findings, 15 confirmed / 2 refuted
  Cross-model tension       — 4 surfaced, all decided by the developer
  Parallelization           — 5 lanes: 3 parallel → 2 parallel → checkpoint
  Lake Score                — 13/13 recommendations chose the complete option
  Unresolved decisions      — 0
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAN | 6 proposals, 5 accepted, 1 deferred |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN | 13 issues, 0 critical gaps |
| Outside Voice | Claude subagent | Independent 2nd opinion | 2 | ISSUES_FOUND | 28 findings across both rounds |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**CROSS-MODEL:** the outside voice beat the main review on 4 points this round (the
`ImageBitmap` memory ceiling, E2 invalidating T2, the wrong dependency list, the circular
report) and was refuted on 2 (the task list does exist; `-ss` before `-i` is frame-accurate).
All 4 tension points went to the developer to decide rather than being applied automatically.

**VERDICT:** CEO + ENG CLEARED — ready to implement. 40 tasks total (23 from the CEO round, 17
from this one), 0 unresolved, 0 critical gaps. Worth running `/plan-design-review` before
writing code, since UI scope is confirmed and no design round has happened.

NO UNRESOLVED DECISIONS
