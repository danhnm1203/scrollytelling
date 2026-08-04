# open-scrolltelling

An npm CLI + skill that turns a video into a scroll-scrubbed Next.js landing page.

- **Design (source of truth):** [docs/superpowers/specs/2026-08-04-open-scrolltelling-design.md](docs/superpowers/specs/2026-08-04-open-scrolltelling-design.md)
- **Task order:** the [CEO review](docs/reviews/2026-08-04-ceo-review-open-scrolltelling.md) (T1–T23)
  and [Eng review](docs/reviews/2026-08-04-eng-review-open-scrolltelling.md) (E1–E17)
- **Deliberately deferred:** [TODOS.md](TODOS.md)

## Layout

```
bin/cli.mjs          argument dispatch only; commands live in scripts/
lib/cli-args.mjs     pure arg parsing (no fs, no exit, no console)
lib/scroll-math.mjs  all maths that decides what is drawn — pure, fully tested
scripts/frames.mjs   extract, measure, encode  (sharp + ffmpeg-static live HERE)
scripts/scaffold.mjs copy templates/          (node:fs only)
templates/           the generated Next.js project
tests/               node:test, no build step
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
- No error is allowed to be silent.

## Conventions

- Test first, at the seams: pure functions in `lib/` get unit tests; the CLI gets
  subprocess tests.
- Docs in this repo are written in Vietnamese; code, comments and user-facing CLI output
  are in English.
- Browser verification goes through the `/browse` skill, never Chrome MCP tools.
