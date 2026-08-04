# Spec: scrollytelling — Phase A (video → scrollytelling landing page)

Status: awaiting publication to the issue tracker (`ready-for-agent`)
Derived from: [design](../superpowers/specs/2026-08-04-scrollytelling-design.md) ·
[CEO review](../reviews/2026-08-04-ceo-review-scrollytelling.md) ·
[eng review](../reviews/2026-08-04-eng-review-scrollytelling.md)

---

## Problem Statement

Building an "Apple-style" scroll-scrubbed landing page — where a product clip plays frame by
frame as the visitor scrolls — currently takes a chain of manual steps and produces a page
with visible defects.

The person building it has a video. To get a page, they must find an external tool to export
the video into numbered stills, guess how many stills to export, hand-wire a canvas that maps
scroll position to a frame index, and write the overlay copy blind. The widely-circulated
prompt for this task tells them to hardcode a single background color and a fixed text
opacity.

Both of those hardcodes fail on real footage. Real clips have gradients and changing exposure,
so a page pinned to one background color shows the canvas as a visible rectangle against the
page for every frame whose edges don't match that color. Fixed-opacity white text becomes
unreadable the moment a frame brightens behind it. And a 16:9 clip on a phone either shrinks to
a thin strip in the middle of the screen or gets cropped so hard the subject is cut.

The result is a page that looks correct in the one screenshot the builder checked and wrong
everywhere else — and the defects are the kind nobody notices until a visitor is already on the
page, because nothing errors.

## Solution

A single command turns a video into a finished, deployable landing page.

The builder points the tool at their clip. It samples the clip into a **frame sequence**,
measures each frame while it has the pixels in hand, and generates a Next.js project where the
page reacts to what was measured:

- The **page background tracks each frame's own edge color**, interpolating between frames as
  the visitor scrolls, so the canvas has no visible edge at any scroll position.
- Each copy **beat's scrim** — the darkening behind text — is computed from the luminance of
  the region actually visible behind that specific block, so text stays readable as the footage
  brightens and darkens.
- The tool produces **two sequences**, one framed landscape and one framed portrait, and the
  page picks whichever matches the visitor's screen. A phone gets a composition designed for a
  phone rather than a cropped widescreen frame.

Before the builder writes a word of copy, the tool shows them what the footage is doing — a
luminance table across the scroll range — so beats get placed against the actual moments in the
clip rather than at round numbers. After they write the copy, a second pass checks each beat
against the frames behind it and names the ones that will be hard to read.

The generated project is a normal Next.js app the builder owns. It carries no video tooling, so
cloning and deploying it stays fast.

## User Stories

**Getting from a video to a page**

1. As a landing-page builder, I want to run one command against my video file, so that I get a
   working scroll-scrubbed page without hunting for a frame-export tool.
2. As a landing-page builder, I want the tool to work on a machine with no `ffmpeg` installed,
   so that I don't have to install system packages before I can start.
3. As a landing-page builder, I want to supply a folder of ordered stills instead of a video, so
   that I can use frames I rendered from 3D or exported from another tool.
4. As a landing-page builder, I want frames named and ordered correctly even when the count
   crosses ten, so that my animation doesn't play out of order.
5. As a landing-page builder, I want the first and last frame of my clip preserved exactly, so
   that the moment the visitor lands on and the moment they finish on are the ones I chose.
6. As a landing-page builder, I want to choose how many frames to sample, so that I can trade
   page weight against motion smoothness for my particular clip.
7. As a landing-page builder, I want a warning when my chosen frame count produces a page that
   is too heavy, so that I don't ship something that takes ten seconds to become usable.
8. As a landing-page builder, I want re-running the tool with a new clip to replace the old
   sequence cleanly, so that I can iterate on footage without hand-deleting files.
9. As a landing-page builder, I want a failed run to leave my previous working sequence intact,
   so that a mistake doesn't destroy a page that was working ten minutes ago.

**Writing the story**

10. As a landing-page builder, I want to preview a handful of frames before any project exists,
    so that I can decide what the page should say based on what the footage actually shows.
11. As a landing-page builder, I want a luminance table across the scroll range, so that I can
    place copy over calm parts of the footage instead of busy ones.
12. As a landing-page builder, I want to know how much the background color shifts between
    adjacent frames, so that I can tell in advance whether the page background will visibly pulse.
13. As a landing-page builder, I want to edit brand, headline, and copy beats in exactly one
    file, so that I don't have to understand the scrubbing mechanism to change what the page says.
14. As a landing-page builder, I want to declare only the scroll position where each beat is
    clearest, so that adding or moving a beat doesn't require me to recompute anything else.
15. As a landing-page builder, I want a check that reads my finished copy and names the beats
    that will be hard to read against their frames, so that I catch contrast problems before
    opening a browser.
16. As a landing-page builder, I want to place a beat below the subject rather than across it,
    so that hero shots aren't obscured by text.

**What the visitor experiences**

17. As a visitor, I want the animation to follow my scroll precisely in both directions, so that
    the page feels like a physical object I'm controlling rather than a video that plays at me.
18. As a visitor, I want the page to become usable quickly rather than blocking on a full
    download, so that I don't stare at a progress number on a slow connection.
19. As a visitor, I want to see a real image the instant the page paints, so that my first
    impression isn't a spinner.
20. As a visitor scrolling faster than frames can decode, I want the last good frame to stay on
    screen, so that I never see a blank or flashing canvas.
21. As a visitor, I want no visible seam between the animation and the page around it, at any
    scroll position and any window size, so that the page reads as one designed surface.
22. As a visitor on a phone, I want a composition framed for my screen, so that the subject
    isn't cropped away or shrunk into a strip.
23. As a visitor who rotates my phone mid-scroll, I want to stay at the same point in the story,
    so that I'm not silently dropped somewhere else in the narrative.
24. As a visitor, I want the overlay text readable over every frame it appears on, so that I can
    actually read the page's message.
25. As a visitor arriving at a static hero, I want a visible cue that scrolling does something,
    so that I don't leave thinking the page is broken.
26. As a visitor who prefers reduced motion, I want scroll smoothing disabled, so that the page
    respects my system setting.
27. As a visitor using a screen reader, I want one coherent description of the page's message,
    so that I get the content rather than four disconnected fragments read as a wall of text.
28. As a visitor with JavaScript disabled or an unsupported browser, I want to see the poster
    image and the copy, so that the page still communicates something.
29. As a visitor on a memory-constrained phone, I want the page not to crash my browser tab
    during a long scroll session, so that I can actually finish reading it.
30. As someone sharing the page in a chat or on social media, I want a link preview image, so
    that the link looks like a real product page.
31. As a search crawler, I want the page's copy present in the markup, so that the page can be
    found for what it says.

**Failure and recovery**

32. As a landing-page builder, I want a clear message naming the missing dependency and the
    exact command to fix it, so that a fresh clone doesn't fail with an unreadable stack trace.
33. As a landing-page builder whose video reports no duration, I want the tool to fall back to
    counting frames rather than failing, so that unusual containers still work.
34. As a landing-page builder, I want the underlying video tool's own error text when it fails,
    so that I can diagnose a problem with my file rather than guess.
35. As a landing-page builder with one corrupt frame in a long sequence, I want that frame named
    and skipped rather than the whole run aborted, so that one bad file doesn't cost me a rebuild.
36. As a landing-page builder whose disk fills mid-run, I want a clear failure that leaves my
    previous sequence intact, so that I lose the run and not the work.
37. As a landing-page builder whose still images differ slightly in dimensions, I want small
    differences normalized with a warning rather than a hard failure, so that a one-pixel render
    difference doesn't stop me.
38. As a landing-page builder, I want a filename containing shell characters to be handled
    normally, so that the tool is safe to point at arbitrary files.
39. As a landing-page builder, I want the page to tell me plainly when no frames loaded at all,
    so that I don't watch a spinner and assume it's still working.
40. As a landing-page builder, I want individual missing frames named in the console with the
    command that fixes them, so that a partial sequence is a thirty-second problem.

**Owning and maintaining the result**

41. As a landing-page builder, I want the generated project to depend only on what a static site
    needs, so that every clone, CI run, and deploy stays fast.
42. As a landing-page builder, I want the generated project to be mine to edit afterwards, so
    that I'm not locked into the generator's choices.
43. As a landing-page builder, I want the tool never to silently overwrite edits I made, so that
    re-running it is safe.
44. As a landing-page builder, I want to see which template files changed since my project was
    generated, so that I can adopt fixes deliberately rather than being forced or stranded.
45. As a landing-page builder, I want the frames committed with my project, so that a fresh
    clone builds and deploys without regenerating anything.
46. As a landing-page builder, I want guidance on keeping frame history from bloating my repo,
    so that iterating on footage doesn't leave me with a huge clone.

**Adopting and contributing**

47. As a developer who found this project, I want to install and run it with one standard
    command, so that trying it costs me a minute.
48. As a developer, I want to use it without an AI coding agent, so that the tool stands on its own.
49. As a developer, I want a license, so that I know whether I can use this at work.
50. As a contributor, I want the test suite to run without installing system dependencies, so
    that I can contribute from a clean checkout.
51. As a contributor, I want the math that decides how the page looks to be provable without a
    browser, so that I can change it with confidence.
52. As a contributor, I want a test that fails when the copy of shared logic inside the template
    drifts from the source, so that a fix in one place can't silently miss the other.
53. As a maintainer, I want measurement-dependent tests pinned to exact tool versions, so that a
    routine dependency bump doesn't produce mystery test failures.

## Implementation Decisions

**Two-package shape.** The tooling package holds the frame pipeline and its heavy native
dependencies. The generated project holds only what a static Next.js site needs. This is the
decision that keeps clone, CI, and deploy cost off the artifact users actually ship. It is why
the tooling cannot live inside the generated project, and why the generated project cannot
depend on the image or video libraries.

**Distribution is an npm CLI.** Sub-commands for previewing frames, scaffolding a project,
generating frames, and checking copy against footage. Publishing it is what makes the tool
installable and updatable; without it the only install path is copying files by hand. The CLI
is also the interface the agent skill calls, so there is one code path rather than two.

**The generated data module is the only contract between build time and runtime.** The pipeline
writes it; the page reads it. The page never inspects the frames directory or infers a frame
count. This is what allows the frame-extraction half to be replaced later — by a different
decoder, or by an AI generation step in Phase B — without touching the page.

**Multiple sequences are the contract's native shape, not a later addition.** The module exports
an ordered collection of sequences, each carrying its own dimensions, frame count, frame paths,
edge colors, and luminance grid. Selection happens once, at the boundary; nothing downstream
branches on which sequence is active. From a prototype of the alternative — parallel
landscape/portrait exports — every consumer grew a conditional, which is why the collection
shape was chosen before either sequence was implemented:

```
Sequence = {
  id, width, height, totalFrames,
  framePath(i),
  edgeColors[i]  -> [r, g, b]     // that frame's own border color
  lumaGrid[i]    -> number[24]    // 6 columns x 4 rows, row-major, 0..1
}
```

**Sequence selection is a pure numeric comparison, not a media-query string.** The page picks
the sequence whose aspect ratio is closest to the viewport's. This generalises past two
sequences, needs no media-query parsing, and is directly testable. It replaces the media-query
string the design document originally specified.

**All display math lives in one dependency-free module.** Scroll progress, frame index,
sequence selection, scale, visible region, scrim opacity, beat fade, color interpolation, and
page height are pure functions that touch no DOM. This module is authored as plain JavaScript
with separate type declarations, so the test runner imports it with no build step. It is copied
into generated projects, and a test asserts the copy is byte-identical to the source.

**Scroll progress is computed directly rather than via an animation library.** A scroll listener
and one division. This removes a dependency from the generated project, keeps progress a pure
function, and eliminates a conflict between a smooth-scrolling library that virtualizes scroll
and a hook that reads native scroll.

**Fit rule.** Compute the aspect mismatch between viewport and sequence. Close match means fill
the viewport and accept a small crop; poor match means fit the whole frame and let the
background handle the remainder. Because the ratio of cover to contain *is* the mismatch, a
formula of the form `min(cover, contain × K)` silently returns cover for every common desktop
aspect — which was the original design's defect and is why the rule is expressed as an explicit
branch on the mismatch.

**Luminance is sampled on a grid, not in vertical bands, and read through the visible region.**
After any crop, the outer columns of the source frame describe pixels that are not on screen.
Scrim computation takes the visible rectangle as an argument and averages only the cells inside it.

**Measurement is one decode into one raw buffer.** Frame decode happens once; the luminance grid
and edge colors are computed from that buffer in plain JavaScript, then the frame is encoded.
This makes the measurement functions pure and directly testable, rather than reachable only
through a whole-pipeline test.

**Frame extraction seeks to computed timestamps.** Cost scales with the number of frames wanted,
not the length of the source. The final timestamp is offset slightly inward, because seeking to
exactly the duration typically yields no output.

**Subprocess invocation passes arguments as an array. No shell.** A regression test passes a
filename containing shell metacharacters.

**The page loads frames in batches and never returns to a loading state.** Once the first batch
is ready, scrolling works. Landing on a frame that hasn't decoded holds the nearest decoded
frame. Decoded frames are held in a window centered on the current position — centered, because
scrubbing backwards is as common as forwards — and the window is sized from a memory budget
rather than a frame count, since decoded bitmaps are pinned until explicitly released and cannot
be evicted by the browser under pressure. Only one sequence stays resident.

**Switching sequences preserves story position.** Sequences may differ in frame count, and page
height derives from frame count, so a naive switch moves the visitor's scroll position under
them. Progress is read before the switch and restored after the new height applies.

**Accessibility is one static semantic block plus a hidden animated layer.** Elements at zero
opacity remain in the accessibility tree, so leaving all beats mounted reads as a wall of text;
hiding them per-beat solves the audio but strips the page for crawlers. A single always-present
block carries the full message; the animated layer is hidden from assistive technology.

**Template version lives in a file the frame pipeline never writes.** The generated data module
is regenerated on every pipeline run, so storing the version there gives two writers and makes
the drift report compare against the wrong baseline.

**The readability report has two modes.** A generation-time mode prints a raw luminance table
across the scroll range, with no beat attribution — beats do not exist yet at that point in the
workflow. A separate check mode runs after copy is written, reads it, and names specific beats.

**Dependency self-check runs before any work.** The pipeline verifies its native dependencies
load and exits with the exact remediation command otherwise, covering both the downloaded video
binary and prebuilt-binary failures on uncommon platforms.

## Testing Decisions

**What makes a good test here.** Assert observable behavior through a real interface: what the
command produced, or what a function returns for a given input. Do not assert on intermediate
steps, internal helper calls, or the order in which the pipeline did its work. A test that
breaks when the measurement algorithm is rewritten but the numbers stay correct is testing the
wrong thing.

**Two seams, confirmed with the developer.**

*Seam 1 — the CLI.* Everything build-time is exercised by invoking the real sub-commands and
asserting on their outputs: files written, generated module contents, exit codes, and messages.
This covers ordering, sampling, measurement, module generation, the write-then-swap safety
property, every error path, argument-array hardening, and both report modes. The pipeline's
internals — including the measurement helpers — are deliberately not tested directly; they are
implementation detail behind this seam. The exception is noted below.

*Seam 2 — the display-math module.* Called directly, since it is consumed by the page and not
reachable through the CLI. This seam exists because the decision to extract these functions was
made specifically so the math that determines the page's appearance is provable without a
browser; testing it only through a browser would forfeit that.

**Not a seam: the browser pass.** Driving the built page in a headless browser is verification,
not assertion — its purpose is human judgement about whether copy reads well over footage. It
stays a documented step in the workflow.

**Known coverage gap, accepted deliberately.** The canvas component, the decoder, and the memory
window have no automated coverage under this two-seam design; they are exercised only in the
browser pass. This was raised and accepted rather than adding a DOM or browser-automation seam.
If defects concentrate there, adding that third seam is the response.

**Modules under test.** The display-math module, in full, by direct call: scroll progress
including out-of-range input from elastic scrolling; frame index clamping; sequence selection
across viewport shapes; the fit rule for both matching and mismatching sources; visible-region
computation; scrim selection through that region; beat fade across added, removed, and moved
beats; color interpolation at boundaries; page height across frame counts; and progress
preservation across a page-height change. Plus, through the CLI: ordering across the ten
boundary, sampling that preserves first and last, measurement accuracy against synthesized
inputs with known values, generated-module internal consistency, previous-output survival on
failed runs, non-overwrite without an explicit flag, drift reporting, both report modes,
version-file stability across pipeline runs, shell-metacharacter filenames, and a whole-pipeline
check against a synthesized clip.

**Prior art.** There is none in this repo — it is greenfield. The reference implementation is the
existing Python-based skill of the same shape, whose test suite covers frame ordering, sampling,
measurement, tool discovery, generated-module output, and scaffolding, and which synthesizes its
own test clip rather than committing a fixture. That last property is worth copying: the suite
runs from a clean checkout with no binary fixtures and no system dependencies.

**Measurement tests are pinned.** The whole-pipeline check asserts measured values that depend on
the resampling and encoding behavior of the image and video tools. Both are pinned to exact
versions, and upgrading them is a deliberate act that includes refreshing the expected values.

**One structural test.** The copy of the display-math module inside the template must be
byte-identical to the source. Without it, the suite guarantees nothing about the code the
generated page actually runs.

## Out of Scope

- **Phase B — generating the video itself from prompts.** Producing source footage via image and
  video generation models is a separate effort with its own spec. It consumes paid, asynchronous
  APIs, and it only produces input for this work. The join between them is a video file path;
  nothing here needs to anticipate it.
- **Replacing frame extraction with in-browser video decoding.** Now broadly supported, and it
  would remove the frame payload entirely, but backwards scrubbing remains the hard part and the
  build is heavier. The generated-module contract deliberately keeps this option open.
- **Additional output frameworks.** One Next.js template, done well. Multiple templates means
  maintaining multiple copies of the scrubbing mechanism.
- **Multiple clips or chapters on one page.** Distinct from the landscape/portrait pair of a
  single clip, which is in scope.
- **Automated coverage of the canvas component and decoder.** See the accepted gap above.
- **A staged rollout of the work.** Considered and declined; a single measurement checkpoint
  replaces it.

## Further Notes

**One checkpoint is load-bearing.** Three decisions in this spec are deliberately left to a
measurement taken the first time the scrubbing loop renders: how much of a phone screen is
background after the portrait crop, whether the smooth-scrolling library earns its place, and
what the memory budget for decoded frames should be. Nothing else in the plan pauses, so if one
step gets compressed under time pressure, this should not be the one.

**Two prior findings are worth carrying into implementation.** First: a fit formula of the form
`min(cover, contain × K)` returns cover whenever the aspect mismatch is at or below K, because
that ratio is the mismatch — this defect survived one full review round before being caught by
arithmetic on real viewport sizes. Second: promoting deferred work into current scope invalidates
tasks that were specified assuming it would not exist; pulling the portrait sequence in
invalidated the fit rule, its rationale, and its test, all written for a single source.

**The honest differentiator is portrait-native scrollytelling**, not the adaptive background. On
the devices that carry most landing-page traffic, the adaptive background is compensating for a
frame that doesn't fit the screen. That is why the portrait sequence moved from deferred work
into the core of the design rather than staying a promoted backlog item.
