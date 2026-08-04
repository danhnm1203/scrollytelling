---
name: open-scrolltelling
description: Turn a video (or an ordered image folder) into a scroll-scrubbed Next.js landing page — the clip advances frame by frame as the visitor scrolls, with copy beats fading in over it. Use for a scrollytelling hero, a scroll-linked product reveal, an "Apple-style" scroll animation, or to turn footage into a landing page.
---

# open-scrolltelling

Everything runs through the `open-scrolltelling` CLI. Install once:

```bash
npm i -g open-scrolltelling
```

> **Status: in development.** `frames` and `scaffold` are not implemented yet.

## Workflow

1. `open-scrolltelling frames --preview <video>` — 5 frames into a temp dir.
2. **Read those frames** and propose copy beats from what is actually on screen.
   Place beats against the footage, not on round numbers — `0.30 / 0.60 / 0.90` are
   placeholders.
3. `open-scrolltelling scaffold <project_dir>`
4. `cd <project_dir> && npm install` — only next/react/tailwind, so it is fast.
5. `open-scrolltelling frames <video> <project_dir> --frames 50 --focus <portrait region>`
   — read the raw luma table it prints.
6. Edit `components/story.ts`.
7. `open-scrolltelling frames --check <project_dir>` — per-beat readability warnings.
8. `npm run build && npm run start -- -p 3737`
9. **Measurement checkpoint** (below).
10. Verify, then report.

## Measurement checkpoint

The first time the scrub loop renders, stop and measure three things. Three commitments in
the design depend on numbers that only exist at this moment:

| Measure | Decides |
| --- | --- |
| real letterbox % at 375×812 | whether `--focus` is tight enough |
| real scrolling with and without Lenis | keep Lenis or cut it |
| peak memory scrubbing back and forth | the MB budget for the LRU window |

## Verification

Use the `/browse` skill (never Chrome MCP tools). Check at 1440×900 and 375×812:

1. The sequence loaded; no corrupt-index warnings in the dev console.
2. The centre canvas pixel changes between scroll positions — **and when scrolling back up**:
   ```
   $B js "(()=>{const c=document.querySelector('canvas');const d=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;return [d[0],d[1],d[2]].join(',')})()"
   ```
3. Screenshot each beat and `Read` it back — judge the contrast yourself.
4. Rotate mid-scroll: the story position must hold.
5. `$B console --errors` is clean.
6. No canvas edge is visible at any scroll position, at either viewport.
