#!/usr/bin/env bash
# Commits a paid run's results and pushes them to the run's branch, shared by
# the diagram-map, diagram-review and narrate workflows.
#
#   ops/save-results.sh <branch> <commit message> <path>...
#
# Paths that do not exist are skipped (a run that stopped early may not have
# written them all). Writes pushed=true and head=<sha> to $GITHUB_OUTPUT only
# after checking that the results commit, or its rebased copy, is on the
# remote branch. A rebase conflict aborts the rebase and fails: the earlier
# loop ignored the failed rebase, and its next push of the unchanged remote
# tip "succeeded", reporting a save that never happened (Astra, PR #134
# review, round 7). The workflows upload the same paths as an artifact first,
# so a failed save never loses the results.
set -uo pipefail

if [ "$#" -lt 3 ]; then echo "usage: save-results.sh <branch> <message> <path>..." >&2; exit 2; fi
branch=$1; msg=$2; shift 2
out=${GITHUB_OUTPUT:-/dev/null}
delay=${SAVE_RETRY_DELAY:-5}

fail() { echo "::error::$1"; exit 1; }

for p in "$@"; do [ -e "$p" ] && git add -- "$p"; done
if git diff --cached --quiet; then echo "Nothing new to save."; exit 0; fi
git commit -q -m "$msg" || fail "Could not commit the results."
# The change itself, independent of where it is applied: survives a rebase.
want=$(git show HEAD | git patch-id --stable | cut -d' ' -f1)
[ -n "$want" ] || fail "Could not fingerprint the results commit."

for attempt in 1 2 3; do
  if [ "$(git show HEAD | git patch-id --stable | cut -d' ' -f1)" != "$want" ]; then
    fail "The results commit is no longer at HEAD; nothing was saved."
  fi
  if git push -q origin "HEAD:$branch"; then
    head=$(git rev-parse HEAD)
    git fetch -q origin "$branch" || fail "Pushed, but could not read the branch back to confirm the save."
    git merge-base --is-ancestor "$head" FETCH_HEAD || fail "Pushed, but $head is not on $branch."
    echo "Saved $head to $branch."
    { echo "pushed=true"; echo "head=$head"; } >> "$out"
    exit 0
  fi
  [ "$attempt" = 3 ] && break
  sleep $((attempt * delay))
  git fetch -q origin "$branch" || continue
  if ! git rebase -q FETCH_HEAD; then
    git rebase --abort 2>/dev/null
    fail "The results conflict with a concurrent update to $branch; not saved to the branch (they are in this run's artifact)."
  fi
done
fail "Could not push the results (they are in this run's artifact)."
