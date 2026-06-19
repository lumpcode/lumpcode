#!/usr/bin/env bash
# Delete local branches that have no matching branch on a remote (default: origin).
set -euo pipefail

REMOTE="origin"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: delete-local-branches-not-on-origin.sh [options]

Deletes local branches whose names do not exist on the given remote.
The current branch is never deleted.

Options:
  --remote <name>  Remote to compare against (default: origin)
  --dry-run        Print branches that would be deleted without deleting them
  -h, --help       Show this help

Examples:
  ./scripts/delete-local-branches-not-on-origin.sh --dry-run
  ./scripts/delete-local-branches-not-on-origin.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      REMOTE="${2:?missing remote name}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Not inside a git repository." >&2
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "Remote not found: $REMOTE" >&2
  exit 1
fi

echo "Fetching and pruning $REMOTE..."
git fetch --prune "$REMOTE"

current_branch="$(git branch --show-current)"
to_delete=()

while IFS= read -r branch; do
  [[ -z "$branch" ]] && continue
  if [[ "$branch" == "$current_branch" ]]; then
    continue
  fi
  if git show-ref --verify --quiet "refs/remotes/${REMOTE}/${branch}"; then
    continue
  fi
  to_delete+=("$branch")
done < <(git for-each-ref --format='%(refname:short)' refs/heads/)

if [[ ${#to_delete[@]} -eq 0 ]]; then
  echo "No local branches to delete (excluding current branch: ${current_branch:-detached HEAD})."
  exit 0
fi

echo "Local branches missing on ${REMOTE}:"
printf '  %s\n' "${to_delete[@]}"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run: no branches deleted."
  exit 0
fi

for branch in "${to_delete[@]}"; do
  git branch -D "$branch"
done

echo "Deleted ${#to_delete[@]} local branch(es)."
