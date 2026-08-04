# open-scrolltelling

Turn a video into a scroll-scrubbed landing page. The clip advances frame by
frame as the visitor scrolls, with copy fading in over it.

No accounts, no API keys, nothing to install system-wide.

## Install

Not on npm yet, so both forms point at GitHub. Drop the `github:` prefix once it
is published.

```bash
# Run it without installing — first run takes a minute, then it is cached
npx github:danhnm1203/open-scrolltelling <command>

# Or install it, if you will use it more than once
npm i -g github:danhnm1203/open-scrolltelling
```

Node 20 or newer. Nothing else to install: `sharp` and `ffmpeg-static` come with
it and bring their own binaries.

## Quickstart

```bash
# 1. Look at the footage before deciding what the page says
open-scrolltelling frames --preview ./clip.mp4

# 2. Create the project
open-scrolltelling scaffold ./my-site
cd my-site && npm install

# 3. Turn the clip into a measured frame sequence
open-scrolltelling frames ../clip.mp4 . --frames 50

# 4. Write your beats in components/story.ts, then check them
open-scrolltelling frames --check .

# 5. Run it
npm run dev
```

Step 1 exists because the footage should decide the story rather than the other
way round. Step 3 prints how bright the clip is by region and scroll position;
write your beats against that table, and step 4 names any that will be hard to
read and where to move them.

## Why it looks right

Two measurements are taken while each frame is encoded, and the page uses both.

**The page background matches each frame's own border color**, interpolated as
you scroll, so the canvas has no visible edge against the page. Pin the page to a
single hex instead and that edge shows on every frame whose border does not
happen to match — which is every frame, on any footage with a gradient or
changing exposure.

**Each block of copy gets a backdrop sized to the luminance behind it.** White
text at a fixed opacity stops being readable the moment a frame brightens under
it. Over dark footage the backdrop is nearly invisible and the image stays clean.

It also builds **two sequences**, landscape and a portrait crop, and the page
picks whichever suits the screen. A 16:9 frame cannot fill a 9:19.5 phone without
cropping most of its width, so without this a phone shows a strip surrounded by
background.

## Commands

```
open-scrolltelling scaffold <project_dir> [--force] [--diff]
open-scrolltelling frames <video|image-dir> <project_dir> [options]
open-scrolltelling frames --preview <video>
open-scrolltelling frames --check <project_dir>
```

| Option | Default | |
| --- | --- | --- |
| `--frames <n>` | 50 | frames in the sequence |
| `--max-width <px>` | 1280 | longest edge of the encoded webp |
| `--quality <n>` | 82 | webp quality |
| `--focus <0-1>` | 0.5 | where the portrait crop sits horizontally |
| `--skip-portrait` | off | build only the landscape sequence |

Input can be a video or a directory of ordered stills.

## What you get

A normal Next.js 16 project depending on `next`, `react` and `react-dom` and
nothing else. The video and image tooling stays in this package, so cloning,
building and deploying your page never installs it. The trade-off is that
installing *this* package fetches an ffmpeg binary (~80MB) once.

```
my-site/
  app/                     page, layout, styles
  components/
    story.ts               brand and copy beats — the only file you edit
    frames.ts              generated; do not hand-edit
    ScrollSequence.tsx     the mechanism
    decoder.worker.js      off-thread frame decoding
  lib/scroll-math.mjs      copied from this package at scaffold time
  public/frames/           generated, committed
```

Once generated, the project is yours. `scaffold` never overwrites a file you have
edited unless you pass `--force`.

### Keeping up with template fixes

Scaffolding records what the template looked like at the time in
`.scrolltelling-version`. Later, `scaffold <project_dir> --diff` reports what has
moved since:

```
Changed in the template, untouched in your project:
  components/ScrollSequence.tsx
  Safe to take: copy them from a fresh scaffold in a temporary directory.

Changed in the template AND edited by you:
  app/globals.css
  Your call. Adopting these would discard your edits.
```

It only reports. Adopting a change is your decision — the code is yours once it
is generated, and a tool that rewrote it on your behalf would make re-running
this something to be afraid of.

## Frames are committed to git

`public/frames/` is deliberately **not** gitignored: a deploy builds from a fresh
clone, and without the frames there is nothing to show.

The cost is that each `frames` run replaces the whole directory, so a project
that iterates on footage accumulates every previous sequence in its history. If
that gets heavy, squash before publishing:

```bash
git reset --soft <commit-before-the-frame-churn> && git commit -m "frames: final sequence"
```

## Requirements

Node 20 or newer. `sharp` and `ffmpeg-static` come with this package and bring
their own binaries.

## Development

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

## License

MIT
