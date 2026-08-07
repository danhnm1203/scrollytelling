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

Omit it and `SITE_URL` is `null`, which is what every project that has no use
for it gets.

## `scaffold` options

| Option | Description |
| --- | --- |
| `--template <name>` | Which template to generate. Omit the name to list them. |
| `--force` | Overwrite files you have edited |
| `--diff` | Report template changes since you scaffolded — see [Keeping up with template fixes](../../README.md#keeping-up-with-template-fixes) |

What each template gives you is its own page: [Templates](templates.md).
