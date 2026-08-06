# Changelog

Notable changes to `@danhnm1203/scrollytelling`.

This file starts at 0.2.0. Earlier releases predate it and are not reconstructed
here — inventing history is worse than admitting it was not kept.

## 0.2.0

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
