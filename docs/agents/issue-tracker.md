# Issue tracker

Issues for this repo live in **GitHub Issues** on `danhnm1203/open-scrollytelling`,
managed with the `gh` CLI.

Skills that read from or write to the tracker (`to-tickets`, `to-spec`, `triage`, `qa`)
should use `gh issue create`, `gh issue list`, and `gh issue edit` against that repo.

## Triage labels

The five canonical roles, each label string equal to its name:

| Role | Label |
| --- | --- |
| Needs triage | `needs-triage` |
| Needs info | `needs-info` |
| Ready for agent | `ready-for-agent` |
| Ready for human | `ready-for-human` |
| Won't fix | `wontfix` |

Only `ready-for-agent` and `wontfix` exist on the repo so far; create the others on
first use.

## PRs as a request surface

Off. External pull requests do not enter the triage queue.

## Blocking edges

GitHub has no native "blocked by" field, so each issue states its blockers in a
`## Blocked by` section referencing issue numbers.
