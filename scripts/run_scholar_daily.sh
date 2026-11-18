#!/bin/bash
# Installed as a trusted local copy; never execute scripts from the fetched checkout.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export GIT_TERMINAL_PROMPT=0

readonly state_dir="$HOME/Library/Application Support/JinfaScholarUpdater"
readonly checkout_dir="$state_dir/repository"
readonly remote_url="https://github.com/inFaaa/inFaaa.github.io.git"
readonly stats_path="data/scholar-stats.json"

fail() { printf '%s\n' "$1" >&2; exit 1; }

[[ -d "$state_dir" && ! -L "$state_dir" ]] || fail 'Managed updater directory is missing or is a symlink.'
[[ "$(cat "$state_dir/.managed-scholar-updater")" = 'io.github.infaaa.scholar-updater' ]] || fail 'Managed updater marker does not match.'
[[ -f "$state_dir/update_scholar.py" && ! -L "$state_dir/update_scholar.py" ]] || fail 'Trusted local updater is missing.'
cd "$state_dir"
[[ "$(pwd -P)" = "$state_dir" ]] || fail 'Managed directory resolves to another location.'

printf '\n[%s] Starting daily Scholar update\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')"
if [[ ! -e "$checkout_dir" ]]; then
  /usr/bin/git -c core.hooksPath=/dev/null clone --no-checkout --single-branch --branch main "$remote_url" "$checkout_dir"
fi
[[ -d "$checkout_dir/.git" && ! -L "$checkout_dir" && ! -L "$checkout_dir/.git" ]] || fail 'Expected a dedicated clone, not a linked worktree.'
cd "$checkout_dir"
[[ "$(pwd -P)" = "$checkout_dir" ]] || fail 'Checkout resolves to another directory.'
[[ "$(/usr/bin/git rev-parse --show-toplevel)" = "$checkout_dir" ]] || fail 'Unexpected Git working tree.'
[[ "$(/usr/bin/git remote get-url origin)" = "$remote_url" ]] || fail 'Unexpected origin; refusing to fetch or push.'

# Only this app-owned clone is reset. The user's development checkout is never used.
/usr/bin/git config core.hooksPath /dev/null
/usr/bin/git -c submodule.recurse=false fetch --no-tags origin main
/usr/bin/git -c submodule.recurse=false reset --hard origin/main
[[ -d data && ! -L data && -f "$stats_path" && ! -L "$stats_path" ]] || fail 'Expected a regular citation data file inside the managed checkout.'
/usr/bin/python3 -B "$state_dir/update_scholar.py" --output "$checkout_dir/$stats_path"

if /usr/bin/git diff --quiet -- "$stats_path"; then
  printf '%s\n' 'Citation data is already current.'
  exit 0
fi
/usr/bin/git add -- "$stats_path"
/usr/bin/git -c user.name='Scholar citation updater' \
  -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  -c commit.gpgsign=false commit --only -m 'Update Google Scholar citation count' -- "$stats_path"
# A normal push fails safely if main advanced; no rebase, force push, or unrelated commit.
/usr/bin/git push origin HEAD:main
printf '[%s] Published citation data\n' "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ')"
