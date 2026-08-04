---
name: scrollytelling
description: Turn a video (or an ordered image folder) into a scroll-scrubbed Next.js landing page — the clip advances frame by frame as the visitor scrolls, with copy beats fading in over it. Use for a scrollytelling hero, a scroll-linked product reveal, an "Apple-style" scroll animation, a scroll-linked image sequence, or to turn footage into a landing page.
argument-hint: "[video-or-image-dir] [project-dir]"
license: MIT
metadata:
  version: "0.1.0"
  repository: "https://github.com/danhnm1203/scrollytelling"
---

# scrollytelling

Everything runs through the `scrollytelling` CLI.

## Installing on a new machine

Two things to install: the CLI, and this skill file.

**The CLI.** Not on npm yet, so both forms point at GitHub.

Run it without installing anything:

```bash
npx github:danhnm1203/scrollytelling <command>
```

The first run fetches and builds the dependencies, which takes a minute or two
because `ffmpeg-static` downloads a binary. Every run after that is cached and
starts in a couple of seconds. Good for trying it, or for a machine you touch once.

Install it if you are going to use it repeatedly:

```bash
npm i -g github:danhnm1203/scrollytelling
scrollytelling --version
```

Once the package is published, drop the `github:` prefix from either form.

Node 20 or newer. `sharp` and `ffmpeg-static` come with it and bring their own
binaries, so nothing needs installing system-wide.

**The skill.** Three ways, depending on your agent.

Claude Code, as a plugin:

```
/plugin marketplace add danhnm1203/scrollytelling
/plugin install scrollytelling@scrollytelling
```

Codex and other agents, via the skills CLI:

```bash
npx skills add danhnm1203/scrollytelling
npx skills add danhnm1203/scrollytelling -a codex
```

Or by hand:

```bash
git clone https://github.com/danhnm1203/scrollytelling.git
cp -R scrollytelling/skills/scrollytelling ~/.claude/skills/
```

`./install-skill.sh` in the clone does the same thing and checks the one detail
that is easy to get wrong: the slash command resolves against the *directory*
name, which must match the `name:` in this file. A mismatch fails silently — the
skill simply never appears.

Start a new session and it is available as **`/scrollytelling`**.

## Workflow

1. `scrollytelling frames --preview <video>` — 5 frames into a temp dir.
2. **Read those frames** and propose copy beats from what is actually on screen.
   Place beats against the footage, not on round numbers — `0.30 / 0.60 / 0.90` are
   placeholders.
3. **Agree the page before building it.** One short design doc: the page flow, the
   visual language, and what each beat says. The scrubber is a hero, not a whole
   page — see "The page below the hero".
4. `scrollytelling scaffold <project_dir>`
5. `cd <project_dir> && npm install` — only next/react/react-dom, so it is fast.
6. `scrollytelling frames <video> <project_dir> --frames 50 [--focus 0.5]`
   — read the luminance table it prints. `--focus` is where the portrait crop sits
   horizontally, 0 to 1; the subject is not always centred.
7. Edit `components/story.ts`.
8. `scrollytelling frames --check <project_dir>` — per-beat readability warnings.
9. Build the rest of the page.
10. `npm run build && npm run start -- -p 3737`
11. **Measurement checkpoint** (below).
12. Verify, then report.

Two sequences are built from one clip: the source as shot, and a portrait crop, so
a phone gets a composition framed for a phone. `--skip-portrait` opts out of the
extra weight.

## Why a frame sequence and not a `<video>`

Scrubbing a `<video>` by writing `currentTime` looks like the simpler design. Do
not switch to it. A normal H.264 delivery encode is built for linear playback and
carries very few keyframes — one hand-built page tried this with a clip holding 5
keyframes across 240 frames, and every seek past the first sparse GOP threw
`PIPELINE_ERROR_DECODE`. The file was not corrupt; it was simply not seekable.

Making it seekable means re-encoding all-intra (`-g 1 -keyint_min 1
-sc_threshold 0`), which nearly tripled that clip's size — and then you still own
a decode-error retry path, a metadata-readiness race against hydration, and
per-browser seek behaviour. Encoding to webp frames up front costs a build step
and removes all four problems: every frame is independently decodable by
definition, and scrubbing backwards is the same cost as forwards.

## The page below the hero

`scaffold` gives you the scrubbing hero and an `sr-only` story outline. That is
the mechanism, not the deliverable. A landing page needs sections under it, and
they are yours to write. A flow that works:

1. **Hero** — the scroll sequence, beats fading over it
2. **Feature sections** — one idea each, alternating text and visual
3. **A number row** — two or three stats that matter
4. **A real table** — specs, pricing, or whatever the concrete detail is
5. **Footer CTA**

Constraints that hold while you build it:

- **No new runtime dependencies.** next, react, react-dom and tailwind only. A
  reveal-on-scroll wrapper is ~40 lines of `IntersectionObserver`; reach for an
  animation library and the generated project stops being cheap to deploy.
- **Reuse the frames you already encoded** for static section imagery. They are
  in `public/frames/`, already sized and optimised. Pulling fresh stills with
  ffmpeg means shipping another copy of the same pixels.
- **Keep `app/page.tsx`'s outline as the only `<h1>`.** Section headings are
  `<h2>`. The canvas is `aria-hidden` decoration; the outline is what a screen
  reader and a crawler actually read.
- **Honour `prefers-reduced-motion`** in anything you add. The scrub itself is
  driven by the reader's own scrolling, but reveals and count-ups are not.
- Server components by default. Only what listens to scroll is `"use client"`.

Do not give beats explicit fade windows. A beat declares only `at`; the crossfade
is derived from where its neighbours sit, so the opacities always sum to 1 and no
scroll position is ever left with no copy on it. The hand-built page mentioned
above wrote its own four-point windows and shipped a dead zone at ~75% scroll
that had to be patched. Move `at`, add a beat, delete one — nothing else changes.

## Keeping a generated project current

`scrollytelling scaffold <project_dir> --diff` reports what has changed in the
template since that project was generated, split into changes safe to take and
changes that would collide with edits made since. It only reports; adopting a
change is the project owner's call.

## Measurement checkpoint

The first time the scrub loop renders, stop and measure three things. Three
commitments in the design depend on numbers that only exist at this moment:

| Measure | Decides |
| --- | --- |
| real letterbox % at 375×812 | whether `--focus` is tight enough |
| real scrolling with and without smooth scrolling | whether to add it at all |
| peak memory scrubbing back and forth | the MB budget for the decode window |

Smooth scrolling is deliberately **not** installed. It was specified, then gated on
evidence that it helps, and that evidence has never been collected — the page
scrolls natively today and works. Do not add it without running the comparison.

## Verification

`npm run build` must finish with no type or lint errors before you verify
anything — a page that does not build is not a page.

Then use the `/browse` skill (never Chrome MCP tools). Check at 1440×900, 768×1024
and 375×812. The middle width is worth the extra pass: it is where a two-column
layout collapses, and it is already being served the portrait crop rather than the
landscape sequence — the choice flips at a square viewport, not at a phone width:

1. The sequence loaded; no corrupt-index warnings in the dev console.
2. The canvas changes between scroll positions — **and when scrolling back up**.
   Sample a whole-canvas checksum rather than one pixel: a fixed point can sit in a
   static region of the footage and show no change while scrubbing works fine.
   ```
   $B js "(()=>{const c=document.querySelector('canvas');const x=c.getContext('2d',{willReadFrequently:true});const d=x.getImageData(0,0,c.width,c.height).data;let h=0;for(let i=0;i<d.length;i+=997){h=(h*31+d[i])>>>0}return String(h)})()"
   ```
   Distinct values at every position mean it is scrubbing. Identical values mean it
   is not — and an empty or `NULL` reading means the probe itself failed, which is
   not the same as a pass.
3. Screenshot each beat and `Read` it back — judge the contrast yourself.
4. Rotate mid-scroll: the story position must hold.
5. `$B console --errors` is clean.
6. No canvas edge is visible at any scroll position, at either viewport.
