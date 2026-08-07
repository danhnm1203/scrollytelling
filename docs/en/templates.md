# Templates

Next is the default. Passing `--template` with no name lists them:

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

All four run the **same engine**, copied into `lib/` at scaffold time — so a fix
to the scrubbing is one change, not four. What differs is the fifty-odd lines
that hand it a container, and where each framework expects files to live.

Two things worth knowing about `html`: there is no `npm install` and no build,
but the page does need a real HTTP server. Module scripts and web workers are
same-origin only, so opening `index.html` from the filesystem will not work. And
its story outline is regenerated from `components/story.js` by `frames` — edit
the story, not the markup.

The project remembers which template it came from, so later `frames` and
`--diff` runs need no flag. Scaffolding a different template over an existing
project is refused rather than leaving a tree that is neither.
