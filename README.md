<div align="center">

# scrollytelling

**Turn a video into a scroll-scrubbed landing page.**

The clip advances frame by frame as the visitor scrolls, with copy fading in over
it. Every frame is measured while it is encoded, so the page has no visible seams
on any footage.

[![test](https://github.com/danhnm1203/scrollytelling/actions/workflows/test.yml/badge.svg)](https://github.com/danhnm1203/scrollytelling/actions/workflows/test.yml)
[![node](https://img.shields.io/badge/node-%E2%89%A520-3c873a)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

No accounts, no API keys, nothing to install system-wide.

</div>

---

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quickstart with a coding agent](#quickstart-with-a-coding-agent)
- [Quickstart with the CLI](#quickstart-with-the-cli)
- [Why it looks right](#why-it-looks-right)
- [Reduced motion](#reduced-motion)
- [CLI reference](#cli-reference)
- [What you get](#what-you-get)
- [Frames are committed to git](#frames-are-committed-to-git)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Requirements

Node 20 or newer. Nothing else: `sharp` and `ffmpeg-static` come with this
package and bring their own binaries.

## Installation

```bash
# Run it without installing — first run takes a minute, then it is cached
npx @danhnm1203/scrollytelling <command>

# Or install it, if you will use it more than once
npm i -g @danhnm1203/scrollytelling
```

Either form gives you a `scrollytelling` command.

### Using it from a coding agent

Claude Code, as a plugin:

```
/plugin marketplace add danhnm1203/scrollytelling
/plugin install scrollytelling@scrollytelling
```

Codex and other agents:

```bash
npx skills add danhnm1203/scrollytelling
```

Or clone and copy `skills/scrollytelling` into `~/.claude/skills/`. Either way,
start a new session and call it as `/scrollytelling`.

## Quickstart with a coding agent

Once the skill is installed, hand it the footage and say what the page is for:

```
/scrollytelling <video-or-image-dir> [project-dir] [what the page is about]
```

The path is the only part that has to be there. Everything else is a prompt —
say as much or as little as you want about the story:

```
/scrollytelling ./watch-teardown.mp4 ./watch-site
```

```
/scrollytelling turn ./drone-flyover.mp4 into a landing page for a vineyard
tour. Three beats, calm and unhurried, and keep the copy off the horizon.
```

```
/scrollytelling ./renders/ is an ordered image sequence of our headphones
rotating. Build it into ./hp-page — two beats only, and the subject sits
left of centre rather than middle.
```

The agent runs the same pipeline described below, and does the two parts that
need judgement rather than a flag:

- **It looks at the footage.** It extracts preview frames, reads them, and writes
  your beats against what is actually on screen instead of dropping them on
  `0.3 / 0.6 / 0.9`.
- **It checks its own work in a browser.** It builds the page, scrubs it at
  1440×900 and 375×812, screenshots each beat and judges the contrast, and
  confirms the canvas really changes when scrolling back up.

It will tell you what it chose and why. The project it leaves behind is a normal
Next.js project — see [What you get](#what-you-get).

## Quickstart with the CLI

Five steps, start to finish. The order matters: the footage decides the story,
not the other way round, so you look at the clip before writing a word of copy.

### 1. Look at the footage

```bash
scrollytelling frames --preview ./clip.mp4
```

Writes five stills, evenly spaced across the clip, to a temporary directory and
prints the path. Open them. You are looking for where the frame is busy, where it
is dark enough to carry white text, and what the clip is about at each point in
its run.

Nothing is created in your project yet — this step is free, and you can repeat it
on different clips until one is right.

### 2. Create the project

```bash
scrollytelling scaffold ./my-site
cd my-site
npm install
```

You now have a normal Next.js project. `scaffold` never overwrites a file you
have edited, so it is safe to re-run later — see
[Keeping up with template fixes](#keeping-up-with-template-fixes).

#### Other templates

Next is the default. There are three others, and `--template` with no name
lists them:

```bash
scrollytelling scaffold ./my-site --template nuxt
scrollytelling scaffold ./my-site --template astro
scrollytelling scaffold ./my-site --template html
```

| Template | What you get |
| --- | --- |
| `next` | Next.js App Router with Tailwind. The default. |
| `nuxt` | Nuxt 4 with Vue single-file components. |
| `astro` | Astro. Ships no framework JavaScript, only the engine. |
| `html` | Plain HTML and JavaScript. No build step, no dependencies, nothing to install. |

All four run the **same engine**, copied into `lib/` at scaffold time — so a
fix to the scrubbing is one change, not four. What differs is the fifty-odd
lines that hand it a container, and where each framework expects files to live.

Two things worth knowing about `html`: there is no `npm install` and no build,
but the page does need a real HTTP server. Module scripts and web workers are
same-origin only, so opening `index.html` from the filesystem will not work. And
its story outline is regenerated from `components/story.js` by `frames` — edit
the story, not the markup.

The project remembers which template it came from, so later `frames` and
`--diff` runs need no flag. Scaffolding a different template over an existing
project is refused rather than leaving a tree that is neither.

### 3. Turn the clip into a measured frame sequence

```bash
scrollytelling frames ../clip.mp4 . --frames 50
```

This extracts, measures and encodes. It writes the images to `public/frames/` and
the contract they are described by to `components/frames.js`, and prints a table
like this:

```
Wrote 100 frames across landscape 1280x720, portrait 720x1280 (4.31 MB)

landscape — how bright the footage is, by region and scroll position
           0%  17%  33%  50%  67%  83%
  left   0.12 0.18 0.44 0.71 0.68 0.55
  centre 0.31 0.29 0.35 0.52 0.49 0.44
  right  0.09 0.11 0.14 0.22 0.61 0.58
  Copy over left and right will need a heavy scrim somewhere in the scroll.
```

Read it as: how bright each third of the frame is, at each point in the scroll.
`0.0` is black, `1.0` is white. Above about `0.55` — the threshold `--check` uses
in the next step — is a bad place to put white text.

Start with 50 frames. Raise it if the scrub feels choppy or the report warns that
the background pulses between frames; lower it if `public/frames/` gets heavy.

### 4. Write your beats, then check them

Open `components/story.js` — the only file you need to edit. Each beat declares
`at`, the scroll position from 0 to 1 where it should be clearest:

```js
sections: [
  { at: 0.0,  align: "center", heading: "Orbit", body: "Scroll to take it apart." },
  { at: 0.3,  align: "left",   heading: "Nothing wasted", body: "…" },
  { at: 0.6,  align: "right",  heading: "Built to be understood", body: "…" },
]
```

Place them against the table from step 3. The `left` beat above sits at `0.3`,
where the left third reads `0.44` — comfortable. Move it to `0.6` and it lands on
`0.71`, which is too bright to read against. Then check your work:

```bash
scrollytelling frames --check .
```

It reads the beats you wrote, compares each against the frames that will actually
be behind it, and names the ones that will be hard to read and where to move
them. Adjust `at` or `align` and run it again — it re-reads the generated
contract, so it costs nothing.

### 5. Run it

```bash
npm run dev
```

Scroll the page. Check it at phone width too — the portrait sequence built in
step 3 is what you will see there.

### Putting the rest of your page under it

The hero is not the whole page unless you want it to be. Add sections below the
runway — the element marked `data-scrollytelling-runway` — and the sequence still
runs from the first frame to the last inside it: progress is measured against
that element, not against the document. The copy overlays and the progress bar
belong to the hero too, so they end where it ends rather than floating over
whatever comes next.

Two things follow from that. The runway is what decides how much scrolling the
sequence gets, so lengthen or shorten it there rather than anywhere else. And if
you write your own markup, keep the attribute and keep the hero inside it a
viewport tall, stuck to the top — that is the travel the scrub is derived from.
Without the attribute the page falls back to measuring the document, which is
only the same thing when the hero is all there is; the engine says so in the
console when it happens.

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

**The sequence eases toward the scroll position rather than snapping to it.**
Locking the drawn frame 1:1 to scroll is the obvious design and it is what makes
a sequence look mechanical: at 50 frames over 500vh a single frame covers about
10vh, so one trackpad flick crosses several frames between two paints and the
jump is visible. The page spends about a third of a second catching up instead,
which spreads that jump over enough frames to read as motion.

This is not smooth scrolling. The scroll position stays exactly the browser's —
no wheel events are intercepted, no scrolling is virtualised, and anchor links,
scrollbars and Find-in-page all behave normally. Only what is drawn is eased.
The knob is `SCRUB_SECONDS` in `components/ScrollSequence.tsx`; set it to `0`
for a hard 1:1 lock.

## Reduced motion

Scrubbing a sequence is motion driven by interaction, so a visitor whose system
asks for less of it does not get a slower version — they get a different page:
one still, and the story as prose. No worker starts, nothing is decoded, and
there is no runway to scroll past.

That page costs nothing to produce because it already exists. The generated
project carries the whole story as an ordinary document for screen readers and
crawlers, since four beats fading in and out of a canvas read as disconnected
fragments to anything that cannot see them. Under reduced motion that document
stops being screen-reader-only and becomes the page itself — the same copy, in
the same order, that everyone else scrolls through.

The practical consequence: what you write in `components/story.js` is the page
twice over. It is worth reading once as flat prose before you ship.

## CLI reference

```
scrollytelling scaffold <project_dir> [--force] [--diff]
scrollytelling frames <video|image-dir> <project_dir> [options]
scrollytelling frames --preview <video>
scrollytelling frames --check <project_dir>
```

### `frames --preview`

```bash
scrollytelling frames --preview <video>
```

Samples up to five evenly spaced frames from the input and writes resized PNG
previews to a temporary directory. It prints the directory path so you can
inspect the frames before creating a project. It does not modify or write
anything inside a project directory.

### `frames --check`

```bash
scrollytelling frames --check <project_dir>
```

Reads the generated frame contract and story file from an existing project and
reports readability issues. It checks generated output rather than reprocessing
the source footage, so you can run it repeatedly without regenerating frames.

### `frames` options

| Option | Default | Description |
| --- | --- | --- |
| `--frames <n>` | `50` | Frames in the sequence |
| `--max-width <px>` | `1280` | Longest edge of the encoded webp |
| `--quality <n>` | `82` | webp quality |
| `--focus <0-1>` | `0.5` | Where the portrait crop sits horizontally |
| `--skip-portrait` | off | Build only the landscape sequence |

Input can be a video or a directory of ordered stills.

### `scaffold` options

| Option | Description |
| --- | --- |
| `--force` | Overwrite files you have edited |
| `--diff` | Report template changes since you scaffolded — see below |

## What you get

A normal Next.js 16 project depending on `next`, `react` and `react-dom` and
nothing else. The video and image tooling stays in this package, so cloning,
building and deploying your page never installs it. The trade-off is that
installing *this* package fetches an ffmpeg binary (~80MB) once.

```
my-site/
  app/                     page, layout, styles
  components/
    story.js               brand and copy beats — the only file you edit
    story.d.ts             its types, so your editor still checks it
    frames.js              generated; do not hand-edit
    frames.d.ts            its types
    ScrollSequence.tsx     the adapter — about sixty lines
  lib/                     copied from this package at scaffold time
    scroll-engine.mjs      the scrubbing engine, shared by every template
    scroll-engine.css      its styles, themeable via custom properties
    scroll-engine-state.mjs  the decisions it makes, pure and unit-tested
    scroll-math.mjs        the primitives underneath
    decoder.worker.js      off-thread frame decoding
  public/frames/           generated, committed
```

Once generated, the project is yours. `scaffold` never overwrites a file you have
edited unless you pass `--force`.

### Keeping up with template fixes

Scaffolding records what the template looked like at the time in
`.scrollytelling-version`. Later, `scaffold <project_dir> --diff` reports what has
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

Commit `.scrollytelling-version` along with the rest of the project. It is the
only record of which template your project came from; without it `--diff` has no
baseline to compare against and can only tell you to re-scaffold.

## Frames are committed to git

`public/frames/` is deliberately **not** gitignored: a deploy builds from a fresh
clone, and without the frames there is nothing to show.

The cost is that each `frames` run replaces the whole directory, so a project
that iterates on footage accumulates every previous sequence in its history. If
that gets heavy, squash before publishing:

```bash
git reset --soft <commit-before-the-frame-churn> && git commit -m "frames: final sequence"
```

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

## Contributing

Issues and pull requests are welcome. Before opening a PR:

1. `npm test` passes on Node 20 and 22 — CI runs both.
2. Changes to `lib/scroll-math.mjs` keep its copy in `templates/` byte-identical;
   a parity test enforces this.
3. Deliberately deferred work is listed in [TODOS.md](TODOS.md) — check there
   before proposing something large.

The design document is
[docs/superpowers/specs/2026-08-04-scrollytelling-design.md](docs/superpowers/specs/2026-08-04-scrollytelling-design.md).

## License

[MIT](LICENSE)
