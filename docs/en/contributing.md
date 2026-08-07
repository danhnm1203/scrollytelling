# Development and contributing

## Running the tests

```bash
npm install
npm test          # node:test, no build step
```

## Looking at a change

Tests say whether the numbers are right. They do not say whether the page feels
right, and that is half of what this tool is for:

```bash
npm run sample                          # the next template, 50 frames
npm run sample -- --template astro      # or nuxt, or html
npm run sample -- --clip ./my-clip.mp4  # your own footage
```

It scaffolds a real project into `.sample-<template>/` — `.sample-next`,
`.sample-astro` and so on, one per template so switching between them never
scaffolds over the wrong project — runs the actual pipeline over it, installs,
and starts the dev server.

The clip is synthesised: a light sweeping across a dark field, so that the
per-frame border colour and the copy backdrop have something to react to. A
still image would encode fine and demonstrate nothing. Footage is synthesised
rather than committed because a repository that carries video fixtures grows by
megabytes per format change.

Everything it writes is gitignored and outside `files` in `package.json`, so a
sample build cannot be committed or published by accident. That is enforced
rather than arranged: `--out` only accepts a `.sample…` directory, which is
exactly what `.gitignore` covers, and a test asserts the two agree.

## Why the tests import plain JavaScript

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
