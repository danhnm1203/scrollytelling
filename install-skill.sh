#!/usr/bin/env bash
#
# Installs this skill so an agent can invoke it as /scrollytelling.
#
# The fallback path. Prefer the plugin marketplace or the skills CLI:
#
#   /plugin marketplace add danhnm1203/scrollytelling
#   npx skills add danhnm1203/scrollytelling
#
# This exists for agents those do not cover, and it gets one detail right that
# is easy to miss by hand: the slash command resolves against the directory
# name under ~/.claude/skills, which must match the `name:` in SKILL.md
# exactly. Getting it wrong fails silently — the skill simply never appears.
#
#   ./install-skill.sh              symlink, so `git pull` updates the skill
#   ./install-skill.sh --copy       copy instead, to pin this version

set -euo pipefail

SKILL_NAME="scrollytelling"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_FILE="$SOURCE_DIR/skills/$SKILL_NAME/SKILL.md"
TARGET_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/$SKILL_NAME"

[ -f "$SOURCE_FILE" ] || { echo "No skill at $SOURCE_FILE" >&2; exit 1; }

# The name in the file is the source of truth; the directory has to follow it.
declared="$(awk -F': *' '/^name:/ {print $2; exit}' "$SOURCE_FILE" | tr -d '\r')"
if [ "$declared" != "$SKILL_NAME" ]; then
  echo "SKILL.md declares name '$declared' but this script installs '$SKILL_NAME'." >&2
  echo "They must match or the slash command will not resolve." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

if [ "${1:-}" = "--copy" ]; then
  cp "$SOURCE_FILE" "$TARGET_DIR/SKILL.md"
  how="copied"
else
  ln -sf "$SOURCE_FILE" "$TARGET_DIR/SKILL.md"
  how="symlinked"
fi

echo "Skill $how to $TARGET_DIR/SKILL.md"
echo

if command -v scrollytelling >/dev/null 2>&1; then
  echo "CLI: $(scrollytelling --version) — ready."
else
  echo "The CLI is not on PATH yet. The skill needs it:"
  echo "  npm i -g github:danhnm1203/scrollytelling"
  echo "or run it per-invocation with npx github:danhnm1203/scrollytelling"
fi

echo
echo "Start a new agent session, then call it with /$SKILL_NAME"
