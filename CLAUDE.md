# scrollytelling

An npm CLI + skill that turns a video into a scroll-scrubbed hero page — Next, Nuxt,
Astro or plain HTML.

- **Design (source of truth):** [docs/superpowers/specs/2026-08-04-scrollytelling-design.md](docs/superpowers/specs/2026-08-04-scrollytelling-design.md)
- **Task order:** the [CEO review](docs/reviews/2026-08-04-ceo-review-scrollytelling.md) (T1–T23)
  and [Eng review](docs/reviews/2026-08-04-eng-review-scrollytelling.md) (E1–E17)
- **Deliberately deferred:** [TODOS.md](TODOS.md)

## Layout

```
bin/cli.mjs          argument dispatch only; commands live in scripts/
lib/cli-args.mjs     pure arg parsing (no fs, no exit, no console)
lib/scroll-math.mjs  the primitives — scale, easing, fade, scrim. pure, fully tested
lib/scroll-engine-state.mjs
                     what the runtime decides, composed from those primitives:
                     load state, decode window, draw parameters. pure, no DOM
lib/template-manifest.mjs
                     where each template keeps its things — one list, read by
                     the scaffolder and the frame pipeline
scripts/frames.mjs   extract, measure, encode  (sharp + ffmpeg-static live HERE)
scripts/scaffold.mjs copy templates/<name>/    (node:fs only)
templates/<name>/    one directory per template; templates/next/ is the default
tests/               node:test, no build step
ci/                  the per-template build gate — installs, bundles, and checks
                     the emitted files. Needs a network, so it runs in CI, not
                     in `npm test`. Not in package.json `files`.
```

## Invariants

- Heavy tooling stays in this repo. A generated project depends on **next/react/tailwind
  only** — no sharp, no ffmpeg, no framer-motion.
- `components/frames.ts` is the single interface between build time and runtime. Runtime
  never reads `public/` or guesses a frame count.
- `lib/scroll-math.mjs` is plain `.mjs` (+ `.d.ts`) so `node:test` imports it directly. Its
  copy in `templates/` must stay byte-identical — a parity test enforces this.
- `sharp` and `ffmpeg-static` are pinned exactly. Golden-master pixel values move on a
  minor bump.
- Every child process uses `execFile`/`spawn` with an **argument array**. Never
  `shell: true`, never string concatenation — user paths reach these commands.
- The story outline in `app/page.tsx` is load-bearing twice: it is what assistive
  technology reads, and it is the whole page under `prefers-reduced-motion`. Its
  `story-outline` class is the hook `globals.css` uses — do not drop it.
- No error is allowed to be silent.

## Conventions

- Test first, at the seams: pure functions in `lib/` get unit tests; the CLI gets
  subprocess tests.
- Docs in this repo are written in Vietnamese; code, comments and user-facing CLI output
  are in English.
- Browser verification goes through the `/browse` skill, never Chrome MCP tools.
