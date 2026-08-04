# open-scrolltelling

Turn **one video file** into a **scroll-scrubbed Next.js landing page**. The clip advances
frame by frame as the visitor scrolls; copy beats fade in over it.

> **Status: in development.** The CLI skeleton and argument parsing are in place;
> `frames` and `scaffold` are not implemented yet. See
> [the design doc](docs/superpowers/specs/2026-08-04-open-scrolltelling-design.md).

## Install

```bash
npm i -g open-scrolltelling      # or use npx
```

The tooling (`sharp`, `ffmpeg-static`) lives here, in this package — **not** in the
generated project. A generated site installs only `next`, `react` and `tailwind`, so its
clone, CI and deploy never pull 100MB+ of image tooling. The trade-off is that installing
*this* package downloads an ffmpeg binary (~80MB) once.

## Workflow

```bash
open-scrolltelling frames --preview clip.mp4        # 5 frames to a temp dir, to write copy against
open-scrolltelling scaffold ./site
cd site && npm install
open-scrolltelling frames ../clip.mp4 . --frames 50 --focus 720x1280+280+0
# edit components/story.ts
open-scrolltelling frames --check .                 # per-beat readability warnings
npm run build && npm run start -- -p 3737
```

Two sequences are generated from the same clip: landscape, and a real portrait crop for
phones — a 16:9 frame cannot fill a 9:19.5 screen without cropping ~74% of its width.

## What you edit

| File | Role |
| --- | --- |
| `components/story.ts` | brand + copy beats — **the only editing surface** |
| `components/frames.ts` | generated data contract; do not hand-edit |
| `lib/scroll-math.mjs` | copied from this repo; kept identical by a parity test |
| `.scrolltelling-version` | written by `scaffold`; `scaffold --diff` compares against it |

## Frames in git

`public/frames/*.webp` **is committed** — a fresh clone must be able to build and deploy.
Each `frames` run replaces the whole directory, so re-running it many times inflates the
project's git history. Squash those commits before publishing:

```bash
git reset --soft <commit-before-the-frame-churn> && git commit -m "frames: final sequence"
```

## Development

```bash
npm install
npm test          # node:test, no build step
```

`lib/scroll-math.mjs` is plain JavaScript rather than TypeScript so `node:test` can import
it directly. Its copy under `templates/` is asserted identical by a parity test — without
that guard, the tests here would prove nothing about the code a real site runs.

`sharp` and `ffmpeg-static` are pinned to exact versions: the golden-master test asserts
pixel values produced by libvips resampling and the webp encoder, and both shift on a minor
bump. Upgrading is deliberate work that includes updating the golden values.

## License

MIT
