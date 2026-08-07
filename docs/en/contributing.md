# Development and contributing

## Running the tests

```bash
npm install
npm test          # node:test, no build step
```

`lib/scroll-math.mjs` is plain JavaScript rather than TypeScript so `node:test`
can import it with no compile step. It is copied into generated projects at
scaffold time, so there is only one copy of it in this repository and no way for
the tested version to drift from the shipped one.

`sharp` and `ffmpeg-static` are pinned to exact versions: tests assert measured
pixel values, and resampling and encoding behaviour shifts on a minor bump.
Upgrading is deliberate work that includes refreshing the expected values.

## Before opening a PR

Issues and pull requests are welcome.

1. `npm test` passes on Node 20 and 22 — CI runs both.
2. Changes to `lib/scroll-math.mjs` keep its copy in `templates/` byte-identical;
   a parity test enforces this.
3. Deliberately deferred work is listed in [TODOS.md](../../TODOS.md) — check
   there before proposing something large.

The design document is
[docs/superpowers/specs/2026-08-04-scrollytelling-design.md](../superpowers/specs/2026-08-04-scrollytelling-design.md).
