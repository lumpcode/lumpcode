#!/usr/bin/env bash
# Create a git worktree at <repo>/.worktrees/<branch>, checked out on <branch>.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: add-worktree <branch> [start-point]

Create a git worktree at <repo>/.worktrees/<branch>, checked out on <branch>.

If <branch> already exists locally, or as a unique remote-tracking branch,
that branch is checked out. Otherwise a new branch is created from
<start-point> (default: HEAD).

A slash in the branch name becomes a nested folder
(.worktrees/feat/foo for feat/foo). Worktrees always land in the main
checkout's .worktrees, even if you run this from another worktree.

After the worktree is created, .env files from the main checkout are
copied into matching paths (existing files in the worktree are left
alone), then npm i runs at the worktree root.

Examples:
  scripts/add-worktree.sh feat/daemon-ui
  scripts/add-worktree.sh hotfix origin/dev
  npm run worktree -- feat/daemon-ui
EOF
}

die() {
  printf 'add-worktree: %s\n' "$*" >&2
  exit 1
}

copy_env_files() {
  local src rel dest
  while IFS= read -r -d '' src; do
    rel=${src#"$root"/}
    dest=$path/$rel
    if [ -e "$dest" ]; then
      continue
    fi
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    printf 'add-worktree: copied %s\n' "$rel" >&2
  done < <(
    find "$root" \
      \( -path "$root/.git" -o \
         -path "$root/.worktrees" -o \
         -path "$root/.lumpcode/worktrees" -o \
         -name node_modules \) -prune -o \
      -type f \( -name '.env' -o -name '.env.*' \) -print0
  )
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "${1:-}" = "" ]; then
  usage >&2
  exit 1
fi

branch=$1
start=${2:-HEAD}

case "$branch" in
  -*|*..*|/*|*\\*|*[\'\"]*)
    die "refusing branch name: $branch"
    ;;
esac

common=$(git rev-parse --git-common-dir 2>/dev/null) || {
  script_dir=$(cd "$(dirname "$0")" && pwd)
  cd "$script_dir/.."
  common=$(git rev-parse --git-common-dir 2>/dev/null) || die "not inside a git repository"
}

case "$common" in
  /*) ;;
  *) common=$PWD/$common ;;
esac
root=$(cd "$common/.." && pwd)
cd "$root"

mkdir -p .worktrees
if ! git check-ignore -q .worktrees; then
  printf '%s\n' '.worktrees/' >> .gitignore
  printf 'add-worktree: appended .worktrees/ to .gitignore\n' >&2
fi

path=$root/.worktrees/$branch
mkdir -p "$(dirname "$path")"

if [ -e "$path" ]; then
  die "path already exists: $path"
fi

if git show-ref --verify --quiet "refs/heads/$branch"; then
  git worktree add -- "$path" "$branch"
elif err=$(git worktree add -- "$path" "$branch" 2>&1); then
  :
else
  case "$err" in
    *"invalid reference"*)
      git worktree add -b "$branch" -- "$path" "$start"
      ;;
    *)
      printf '%s\n' "$err" >&2
      exit 1
      ;;
  esac
fi

copy_env_files

if [ -f "$path/package.json" ]; then
  printf 'add-worktree: npm i in %s\n' "$path" >&2
  (
    cd "$path"
    # `npm run` exports allow-scripts as npm_config_allow_scripts. npm 11
    # treats that like a CLI flag and rejects it for a project install.
    # Unset it so the user and project .npmrc still apply.
    unset npm_config_allow_scripts
    npm i
  )
fi

printf '%s\n' "$path"
