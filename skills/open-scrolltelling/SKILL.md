---
name: open-scrolltelling
description: Turn a video (or an ordered image folder) into a scroll-scrubbed Next.js landing page — the clip advances frame by frame as the visitor scrolls, with copy beats fading in over it. Use for a scrollytelling hero, a scroll-linked product reveal, an "Apple-style" scroll animation, a scroll-linked image sequence, or to turn footage into a landing page.
argument-hint: "[video-or-image-dir] [project-dir]"
license: MIT
metadata:
  version: "0.1.0"
  repository: "https://github.com/danhnm1203/open-scrolltelling"
---

# open-scrolltelling

Everything runs through the `open-scrolltelling` CLI.

## Installing on a new machine

Two things to install: the CLI, and this skill file.

**The CLI.** Not on npm yet, so both forms point at GitHub.

Run it without installing anything:

```bash
npx github:danhnm1203/open-scrolltelling <command>
```

The first run fetches and builds the dependencies, which takes a minute or two
because `ffmpeg-static` downloads a binary. Every run after that is cached and
starts in a couple of seconds. Good for trying it, or for a machine you touch once.

Install it if you are going to use it repeatedly:

```bash
npm i -g github:danhnm1203/open-scrolltelling
open-scrolltelling --version
```

Once the package is published, drop the `github:` prefix from either form.

Node 20 or newer. `sharp` and `ffmpeg-static` come with it and bring their own
binaries, so nothing needs installing system-wide.

**The skill.** Three ways, depending on your agent.

Claude Code, as a plugin:

```
/plugin marketplace add danhnm1203/open-scrolltelling
/plugin install open-scrolltelling@open-scrolltelling
```

Codex and other agents, via the skills CLI:

```bash
npx skills add danhnm1203/open-scrolltelling
npx skills add danhnm1203/open-scrolltelling -a codex
```

Or by hand:

```bash
git clone https://github.com/danhnm1203/open-scrolltelling.git
cp -R open-scrolltelling/skills/open-scrolltelling ~/.claude/skills/
```

`./install-skill.sh` in the clone does the same thing and checks the one detail
that is easy to get wrong: the slash command resolves against the *directory*
name, which must match the `name:` in this file. A mismatch fails silently — the
skill simply never appears.

Start a new session and it is available as **`/open-scrolltelling`**.

## Workflow

1. `open-scrolltelling frames --preview <video>` — 5 frames into a temp dir.
2. **Read those frames** and propose copy beats from what is actually on screen.
   Place beats against the footage, not on round numbers — `0.30 / 0.60 / 0.90` are
   placeholders.
3. `open-scrolltelling scaffold <project_dir>`
4. `cd <project_dir> && npm install` — only next/react/react-dom, so it is fast.
5. `open-scrolltelling frames <video> <project_dir> --frames 50 [--focus 0.5]`
   — read the luminance table it prints. `--focus` is where the portrait crop sits
   horizontally, 0 to 1; the subject is not always centred.
6. Edit `components/story.ts`.
7. `open-scrolltelling frames --check <project_dir>` — per-beat readability warnings.
8. `npm run build && npm run start -- -p 3737`
9. **Measurement checkpoint** (below).
10. Verify, then report.

Two sequences are built from one clip: the source as shot, and a portrait crop, so
a phone gets a composition framed for a phone. `--skip-portrait` opts out of the
extra weight.

## Keeping a generated project current

`open-scrolltelling scaffold <project_dir> --diff` reports what has changed in the
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

Use the `/browse` skill (never Chrome MCP tools). Check at 1440×900 and 375×812:

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
