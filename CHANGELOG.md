# Changelog

Notable changes to `@danhnm1203/scrollytelling`.

This file starts at 0.2.0. Earlier releases predate it and are not reconstructed
here — inventing history is worse than admitting it was not kept.

## Unreleased

### Fixed

- **A page from the `html` template 404'd every frame when deployed under a base
  path.** The generated `framePath` returned `/frames/…`, which resolves to the
  site root — so a GitHub Pages project site at `/<repo>/`, or any static host
  serving the directory from a subfolder, loaded the page and then found no
  images. It now resolves against the page itself and returns an absolute url.

  Absolute rather than relative on purpose: the engine hands these urls to a
  worker, and a worker resolves a relative url against its own script in `lib/`
  rather than against the page, so a relative path would 404 there while the
  poster image worked.

  Only the `html` template changes. The other three serve frames from `public/`
  at the site root, where `/frames/…` is correct — and their generated contract
  still says, as it always did, that a deploy under a subdirectory needs that
  function edited.

## 0.5.0 — the scrub stops looking like a slideshow

Four defects in how the sequence is drawn, all found by building a real page on
real footage rather than by reading the code. Three of them only appear on a
moving camera; the fourth only appears once you stop scrolling and look.

### Fixed

- **The footage advanced a whole frame at a time.** The draw loop painted the
  single nearest decoded frame, so fifty frames over four hundred vh stepped
  every eight vh. Easing the position never helped: it moved smoothly between
  the same discrete images. The frame below and the frame above are now
  composited, the second at the fraction between them. Sampled across one
  frame's worth of scroll: one distinct image before, eleven after.

  It costs one `drawImage` per paint and no extra memory — the two frames are
  adjacent, so the decode window already holds both. When the upper one is
  still in flight the base holds instead: half of a missing frame is not half a
  transition, it is a flash of the wrong picture.

- **A stopped page sat between two frames and showed both.** Blending is right
  while the picture is moving and wrong the moment it is not. On a camera
  walking through a room the mean difference between adjacent frames is 20.8 of
  255 at sixty frames, and at that distance a half mix reads as a double
  exposure rather than as motion blur — invisible while scrolling, the first
  thing you see when you stop. The drawn position now resolves onto a whole
  frame once the scrub settles, and reports when it has arrived so the loop
  still parks.

- **A stopped page showed two headings at once.** Same argument, applied to the
  words. The crossfade holds each beat at full strength for most of its stretch
  and hands over quickly in the middle, which is right while a reader is moving
  through the story and wrong wherever they come to rest inside a handoff. The
  copy now resolves onto whichever beat the crossfade already had winning.
  Measured on a real page: beat opacities `[0, 0, 0.70, 0.30, 0]` mid-scrub,
  `[0, 0, 1, 0, 0]` once settled.

  The pair still sums to 1 the whole way through, so no scroll position is left
  with no copy on it.

- **Two beats were dim through most of every handoff.** The crossfade ramped
  linearly all the way to the neighbour, so each beat was at full opacity for a
  single instant and washed out everywhere else. On the page used to measure it,
  62% of the scroll had two beats both part-lit and only 18% had any beat fully
  lit. It now holds each beat either side of its position and does the swap with
  a smoothstep across the middle of the gap: 20% and 70% on the same page.

`SCROLL_MATH_VERSION` is `1.3.0`.

### Added

- **The page comes to rest on a beat.** An anchor per beat plus
  `scroll-snap-type: y mandatory`, so a reader always lands where the copy is
  clearest. The browser owns the gesture — nothing writes to `scrollY` — so it
  does not fight native scroll, scroll anchoring or the keyboard.

  Beats are pulled onto whole frames first, which is what makes the landing
  worth anything: `at` is authored against what the footage is doing and lands
  mid-frame, so an unaligned anchor would drop the reader somewhere the picture
  then has to correct itself. The move is at most half a frame, well inside the
  stretch each beat holds.

  **This imposes one rule on your layout: put your sections after the runway,
  as its siblings.** Every template does, and `[data-scrollytelling-runway] ~ *`
  is a snap point for that reason. Mandatory snapping means the page must always
  rest on one, so a section the selector cannot reach has nowhere legal to stop
  and the browser drags the reader back to the last beat — everything below the
  hero becomes unreachable, with nothing in the console to say so.

  Opt out with `data-scrollytelling-snap="off"` on the `html` element. Reduced
  motion opts out on its own.

**Existing projects:** all of this is in the engine your project carries a copy
of, so re-run `scrollytelling scaffold .` to take it —
`scrollytelling scaffold . --diff` reports what moved and neither overwrites a
file you have edited. If you have edited your page, check that your sections are
siblings of the runway before you upgrade, or turn snapping off.

## 0.4.2 — the skill asks which template

### Fixed

- **The skill never asked which template to use.** Three templates besides
  `next` have shipped since 0.3.0, and the skill documented all four — but only
  as an optional `--template` flag on `scaffold`, with `next` as the stated
  default and nothing telling the agent to raise the choice at all. Its
  description named Next.js and nothing else. Both together meant every run
  scaffolded `next` silently, whatever the surrounding project was.

  Choosing the template is its own step now, ahead of agreeing the page, with
  the trade-off spelled out per template — because the choice decides which
  files every later step touches, and is expensive to change afterwards.
  `scaffold` is documented as taking `--template` explicitly, even for `next`.

  Skill file only. The CLI already accepted all four names and still does.

- **Three version numbers disagreed about which release this is.** The plugin
  manifest still said 0.3.0 and the skill's own metadata still said 0.1.0, both
  left behind while `package.json` moved. All three read 0.4.2 now, and a
  release bumps all three from here.

  The `package.json` inside each template stays at 0.1.0 on purpose: that is the
  version of the site somebody scaffolds, not of the tool that scaffolded it.

## 0.4.1 — pages with more than a hero

### Fixed

Four defects, all of which only appear once the page is more than the hero.
Found by building a real landing page on the Astro template.

- **The end of the sequence was unreachable.** Progress came from the document's
  height, which is the runway's height only on a page that is nothing but the
  hero. With sections below it the hero unstuck at around 63% of the document,
  so the last third of the frames never drew and the final beat never appeared.
  The engine now measures the runway — the element marked
  `data-scrollytelling-runway`, which every template renders — and falls back to
  the document only when there is none, saying so in the console rather than
  losing the tail of a sequence quietly. `runwayProgress` and `runwayScrollTop`
  are the new pure functions; `SCROLL_MATH_VERSION` is `1.2.0`.

- **The overlays escaped the hero.** Beats, the progress bar, the scroll hint and
  the loading pill were fixed to the viewport, so scrolling past the hero left
  the last heading sitting across whatever came next. They are absolute inside
  the sticky container now, and end where it ends.

- **Rotating the phone moved the reader.** The restore after a resize used the
  document formula too, so a visitor half way through the story came out of the
  rotation somewhere else in it.

- **`anchor: "bottom"` ignored `align`.** Bottom-anchored beats were centred
  regardless, so two of them in a row crossfaded on top of each other with no
  way to separate them from the story file. `align` now places them
  horizontally, and both the runtime scrim and `frames --check` read the band
  the copy actually occupies.

Also: under reduced motion the runway now collapses. A server-rendered template
sizes it before it can know the setting, which left a reduced-motion visitor
with the story as prose followed by several screens of dead scroll under a stuck
image.

**Existing projects:** these fixes are in the engine your project carries a copy
of, so re-run `scrollytelling scaffold .` to take them —
`scrollytelling scaffold . --diff` reports what moved, and neither overwrites a
file you have edited. That last part matters here: the page markup gained
`data-scrollytelling-runway` on the element the hero sticks inside, and if you
have edited that file, adding the attribute is the one change you have to make
by hand. Without it the page keeps scrubbing against the document, which is only
correct while the hero is the whole page — the engine now says so in the console
when it happens.

## 0.4.0 — the Nuxt template

### Added

- **A Nuxt template.** `scrollytelling scaffold ./my-site --template nuxt` —
  Nuxt 4 with Vue single-file components, server-rendered like the Astro one, so
  the story outline and the opening frame are in the HTML before any JavaScript
  runs. The story lives in `app/components/story.js`.

  Two things are specific to Nuxt. `nuxt.config.ts` narrows the component scan
  to `.vue`, because Nuxt would otherwise register `frames.js` and `story.js` as
  components — that is what lets them keep the name and place they have on every
  other template. And `app.vue` disposes the engine on unmount, because Nuxt
  keeps the page alive across client-side navigation and the scroll listener,
  animation frame and decoded frames would otherwise outlive the page.

  Nothing else moved: the engine, the stylesheet, the worker and the frame
  pipeline are the ones the other three templates already use.

## 0.3.0 — three templates, one engine

Three templates instead of one, running the same engine.

### Added

- **`scaffold --template <name>`.** `next` is still the default; `astro` and
  `html` are new, and `--template` with no name lists them. The project records
  which one it came from, so later `frames` and `--diff` runs need no flag, and
  scaffolding a different template over an existing project is refused rather
  than leaving a tree that is neither.

- **An Astro template.** Ships no framework JavaScript, only the engine.

- **A zero-build HTML template.** No `package.json`, no `tsconfig`, no bundler,
  nothing to install. It does need a real HTTP server: module scripts and web
  workers are same-origin only, so `file://` will not work. Its story outline is
  regenerated from `components/story.js` by `frames`, between markers in
  `index.html` — edit the story, not the markup.

### Changed

- **The scrubbing runtime moved into `lib/`, shared by every template.** A fix
  to the decode window, the easing or the scrim is now one change rather than
  one per template. `ScrollSequence.tsx` went from 687 lines to about 135: the
  engine owns the canvas, worker, decode window, animation frame, listeners,
  reduced motion and the copy overlays, and the adapter hands it a container.

- **The engine ships its own stylesheet**, keyed off data attributes and
  themeable through custom properties (`--st-beat-heading-size`,
  `--st-scrim-falloff`, and the rest). Restyling a beat no longer means editing
  markup you no longer own. It also takes the story outline, which was
  previously hidden by a Tailwind utility — so a template without Tailwind gets
  the same behaviour.

- **The frames contract and the story are now JavaScript with types beside
  them** — `frames.js` + `frames.d.ts`, `story.js` + `story.d.ts`. A page with
  no build step cannot import TypeScript, and those are exactly the files it has
  to import. Editors and builds still check them: the templates that have a type
  checker turn on `checkJs`, so a mistyped `align` still fails.

  **Existing projects:** re-run `scrollytelling scaffold .` to pick up the new
  files. It never overwrites anything you have edited, and
  `scrollytelling scaffold . --diff` reports what moved. Your `story.ts` keeps
  working until you switch; the generated contract is what changes name.

### Fixed

- **A page whose opening frames all decoded could report "no frames found".**
  The opening request covers the whole decode window, but only about half of
  those are opening frames, and readiness counted every failure so far.

- **Web workers were not emitted by every bundler.** The engine constructed its
  worker indirectly, and bundlers detect only the literal
  `new Worker(new URL(..., import.meta.url))` form. Turbopack traced it anyway;
  Vite did not, so an Astro build shipped no worker and fell back to
  main-thread decoding with only a console warning.

## 0.2.0 — two silent failures fixed

Two silent failures fixed, and the runtime's decisions moved somewhere they can
be tested.

### Fixed

- **A decode worker that failed to load hung the page forever.** A worker whose
  URL 404s still constructs — the browser hands back a valid `Worker` and
  reports the failure asynchronously — so the `try`/`catch` around construction
  never fired, and the main-thread fallback was gated on the worker being
  absent. Every frame posted went to a worker that would never answer, nothing
  cleared them, and the page sat at a loading percentage indefinitely with no
  error, no console output and no timeout. It now falls back to decoding on the
  main thread, re-requests the frames that were in flight, and warns once naming
  the URL that failed. ([#38](https://github.com/danhnm1203/scrollytelling/issues/38))

- **A freshly scaffolded project could not be built.** `scaffold ./site &&
  npm install && npm run build` failed before any frames were generated. Next
  typechecks during a build, and the placeholder declared `SEQUENCES` as
  `[] as const` — the tuple type `readonly []` — so the three call sites that
  index it did not compile. This affected the whole of a project's life before
  its first `frames` run, which is exactly where a new user starts.
  ([#40](https://github.com/danhnm1203/scrollytelling/issues/40))

- **A page whose opening frames all decoded could report "no frames found".**
  The opening request covers the whole decode window, but only about half of
  those are opening frames. Readiness was checked against every failure so far,
  so frames beyond the opening set failing first could push a perfectly
  renderable page into its empty state.

### Changed

- The runtime's decisions — load-state transitions, which frames to fetch and
  release, the draw parameters, and the choice between worker and main-thread
  decoding — moved into `lib/scroll-engine-state.mjs`, which is plain
  JavaScript with no DOM and is unit-tested directly. The scrubbing component
  now applies those decisions rather than making them.

  **Generated projects gain `lib/scroll-engine-state.mjs` and its `.d.ts`.**
  A new scaffold installs them automatically. An existing project picks them up
  by re-running `scrollytelling scaffold .`, which never overwrites files you
  have edited; `scrollytelling scaffold . --diff` reports what has moved.

- The generated frames placeholder is annotated (`: readonly Sequence[]`) rather
  than `as const`, so it typechecks before any footage has been processed.

### Internal

- `package.json` carried the unscoped name `scrollytelling`, which belongs to a
  different package on npm. Releases have always gone out scoped; the manifest
  now matches, so the tag-driven release workflow can publish.
- `*.tsbuildinfo` is gitignored. `templates/` sets `"incremental": true` and
  ships in the package, so a stray incremental-build artifact would have been
  published.
- Three stale ASCII diagrams corrected. Two described code that had already
  changed: the worker's message protocol named a field that does not exist and
  omitted one that does, and the component's pipeline diagram predated the
  easing step.
