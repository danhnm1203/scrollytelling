# Frames are committed to git

`public/frames/` is deliberately **not** gitignored: a deploy builds from a fresh
clone, and without the frames there is nothing to show.

The cost is that each `frames` run replaces the whole directory, so a project
that iterates on footage accumulates every previous sequence in its history. If
that gets heavy, squash before publishing:

```bash
git reset --soft <commit-before-the-frame-churn> && git commit -m "frames: final sequence"
```
