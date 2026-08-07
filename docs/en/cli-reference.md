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
| `--template <name>` | recorded by `scaffold` | Override the template a project was generated from. Rarely needed. |

Input can be a video or a directory of ordered stills.

## `scaffold` options

| Option | Description |
| --- | --- |
| `--template <name>` | Which template to generate. Omit the name to list them. |
| `--force` | Overwrite files you have edited |
| `--diff` | Report template changes since you scaffolded — see [Keeping up with template fixes](../../README.md#keeping-up-with-template-fixes) |

What each template gives you is its own page: [Templates](templates.md).
