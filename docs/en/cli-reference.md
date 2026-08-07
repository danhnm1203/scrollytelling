# CLI reference

```
scrollytelling scaffold <project_dir> [--template <name>] [--force] [--diff]
scrollytelling frames <video|image-dir> <project_dir> [options]
scrollytelling frames --preview <video>
scrollytelling frames --check <project_dir>
```

## `frames` options

| Option | Default | Description |
| --- | --- | --- |
| `--frames <n>` | `50` | Frames in the sequence |
| `--max-width <px>` | `1280` | Longest edge of the encoded webp |
| `--quality <n>` | `82` | webp quality |
| `--focus <0-1>` | `0.5` | Where the portrait crop sits horizontally |
| `--skip-portrait` | off | Build only the landscape sequence |
| `--site-url <url>` | unset | Where the finished page will be served from |
| `--template <name>` | recorded by `scaffold` | Override the template a project was generated from. Rarely needed. |

Input can be a video or a directory of ordered stills.

### `--site-url`

A page cannot work out its own address. `document.baseURI` answers for a browser
that has already fetched the page, and a crawler building a link preview never
runs the page at all — so anything needing an absolute url has to be told at
build time.

Pass the address the page will live at and it is recorded in
`components/frames.js` as `SITE_URL`, ending in a slash so `new URL(path,
SITE_URL)` lands under the site rather than beside it:

```bash
scrollytelling frames ./clip.mp4 . --site-url https://you.github.io/your-repo/
```

Keep the path. A GitHub Pages project site is served from `/<repo>/`, not from
the origin root. The value must be an absolute `http` or `https` url with no
query or fragment; anything else is refused rather than quietly recorded.

## The link preview

Every run writes `og.jpg` — a 1200×630 JPEG cut from the frame the page opens
on, so the preview and the first thing a visitor sees are the same image. It is
JPEG rather than webp because a link unfurler is somebody else's code and webp
support across that set is unverified.

With `--site-url`, the zero-build template's `og:` and `twitter:` tags are
filled from `components/story.js` and the recorded address:

```html
<meta property="og:title"       content="…story.title" />
<meta property="og:description" content="…story.description" />
<meta property="og:url"         content="https://you.github.io/your-repo/" />
<meta property="og:image"       content="https://you.github.io/your-repo/og.jpg" />
```

Without it the image and url tags stay empty and the page previews as a bare
link. That is deliberate: a relative `og:image` resolves against the crawler's
own base and silently fetches something else, which is worse than no card. The
words still fill, because they cost nothing.

The card file is written either way — what `--site-url` decides is whether the
page can point at it.

Delete any of those tags from your page and the command leaves them deleted,
the same rule `<title>` follows. The framework templates render their own head;
Next already does, and Nuxt and Astro are [#79](https://github.com/danhnm1203/scrollytelling/issues/79).

### If your project predates this

`frames` fills tags, it never adds them — a page missing one is missing it on
purpose, and inventing markup in someone's page is not this command's job. So a
project scaffolded before this shipped has no tags to fill, and `scaffold
--diff` will report `index.html` as changed in the template and edited by you.

That report is accurate and adopting is usually the wrong move: it would replace
your copy with the template's. Copy the `og:` and `twitter:` block out of a
fresh scaffold into your page's `<head>` instead, then re-run `frames`.

## `scaffold` options

| Option | Description |
| --- | --- |
| `--template <name>` | Which template to generate. Omit the name to list them. |
| `--force` | Overwrite files you have edited |
| `--diff` | Report template changes since you scaffolded — see [Keeping up with template fixes](../../README.md#keeping-up-with-template-fixes) |

What each template gives you is its own page: [Templates](templates.md).
