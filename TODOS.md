# TODOS

Work considered and deliberately deferred. Sources:
[CEO review](docs/reviews/2026-08-04-ceo-review-open-scrolltelling.md) and
[eng review](docs/reviews/2026-08-04-eng-review-open-scrolltelling.md), 2026-08-04.

---

## Promoted out of TODOS

**E2 — a dedicated portrait sequence for phones → moved into v1 scope (2026-08-04).**

Reason: it blocked a stated done criterion. The spec requires *"no canvas edge visible at any
scroll position"* and mandates verification at 375×812, but a 16:9 frame cannot fill a 9:19.5
screen without cropping roughly 74% of its width. A P1 item that a done criterion depends on is
not deferred work — it is either in scope, or the criterion is overstated.

The technical consequence was handled during the eng review: `computeScale` and `frames.ts` are
designed for multiple sources from the start (`SEQUENCES: Sequence[]`, `selectSequence`) rather
than growing a parallel branch afterwards. See E5, E6, and E13 in the eng review.

---

## Considered, not yet in the backlog

| Item | Why not yet |
| --- | --- |
| Phase B — prompt → images → AI video | Its own spec. Costs money, calls async APIs. Does not block A. The join is a video file path. |
| WebCodecs backend replacing frame extraction | Broadly shipped now (Safari 26+, Chrome Android 147) but heavier to build, and backwards scrubbing is still the hard part. The `frames.ts` contract keeps this option open, so no decision is needed today. |
| Additional template stacks (Astro, Vue, static) | Each one means maintaining another copy of the scrubbing mechanism. Get one Next template right first. |
| Multiple clips or chapters on a single page | Scope creep with low v1 value. Distinct from the landscape/portrait pair of a single clip, which is in scope. |
| Staged implementation milestones | Considered during the eng review; the developer chose to run straight through all 40 tasks. Replaced by a single measurement checkpoint once the scrubbing loop first renders. |
