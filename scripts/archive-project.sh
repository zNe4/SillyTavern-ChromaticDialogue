#!/usr/bin/env bash

set -Eeuo pipefail

usage() {
    cat <<'EOF'
Create a clean ZIP snapshot of the current Git project.

Usage:
  archive-project.sh [options]

Options:
  -o, --output PATH   Write the ZIP to PATH.
                      Default: ../<project>-<UTC time>-<commit>[-dirty].zip
      --tracked-only  Include only Git-tracked files.
      --list          Print the files that would be archived, then exit.
  -h, --help          Show this help.

By default, the archive contains:
  - Git-tracked files.
  - Untracked files that are not excluded by .gitignore.

It always excludes common secrets, logs, editor files, caches, dependencies,
build output, and existing archives.
EOF
}

fail() {
    printf 'Error: %s\n' "$*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

output_path=''
tracked_only=false
list_only=false

while (($# > 0)); do
    case "$1" in
        -o|--output)
            (($# >= 2)) || fail "$1 requires a path"
            output_path=$2
            shift 2
            ;;
        --tracked-only)
            tracked_only=true
            shift
            ;;
        --list)
            list_only=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            fail "Unknown option: $1"
            ;;
    esac
done

require_command git

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
project_root="$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null)" \
    || fail "This script must be inside a Git repository"

project_name="${project_root##*/}"
timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"

if commit="$(git -C "$project_root" rev-parse --short=10 HEAD 2>/dev/null)"; then
    :
else
    commit='unborn'
fi

dirty_suffix=''
if [[ -n "$(git -C "$project_root" status --porcelain --untracked-files=normal)" ]]; then
    dirty_suffix='-dirty'
fi

if [[ -z "$output_path" ]]; then
    output_path="${project_root}/../${project_name}-${timestamp}-${commit}${dirty_suffix}.zip"
elif [[ "$output_path" != /* ]]; then
    output_path="${PWD}/${output_path}"
fi

[[ "$output_path" == *.zip ]] || output_path="${output_path}.zip"

output_dir="${output_path%/*}"
output_name="${output_path##*/}"
[[ "$output_dir" != "$output_path" ]] || output_dir='.'
mkdir -p -- "$output_dir"
output_dir="$(cd -- "$output_dir" && pwd -P)"
output_path="${output_dir}/${output_name}"

[[ ! -e "$output_path" ]] || fail "Output already exists: $output_path"

declare -a candidates=()
if $tracked_only; then
    mapfile -d '' -t candidates < <(
        git -C "$project_root" ls-files -z
    )
else
    mapfile -d '' -t candidates < <(
        git -C "$project_root" ls-files --cached --others --exclude-standard -z
    )
fi

declare -a archive_files=()

for path in "${candidates[@]}"; do
    [[ -n "$path" ]] || continue

    # An example environment file is documentation, not a secret.
    case "$path" in
        .env.example|*/.env.example)
            ;;
        .env|*/.env|.env.*|*/.env.*)
            continue
            ;;
    esac

    case "$path" in
        .git/*|*/.git/*)
            continue
            ;;
        node_modules/*|*/node_modules/*)
            continue
            ;;
        dist/*|*/dist/*|build/*|*/build/*|coverage/*|*/coverage/*)
            continue
            ;;
        .cache/*|*/.cache/*|tmp/*|*/tmp/*)
            continue
            ;;
        data/*)
            continue
            ;;
        *.zip|*.tar|*.tar.gz|*.tgz|*.7z)
            continue
            ;;
        *.log|*.swp|*.swo|*~|.DS_Store|*/.DS_Store|Thumbs.db|*/Thumbs.db)
            continue
            ;;
        secrets.json|*/secrets.json|config.yaml|*/config.yaml)
            continue
            ;;
        *.pem|*.key|*.p12|*.pfx)
            continue
            ;;
    esac

    [[ -e "${project_root}/${path}" || -L "${project_root}/${path}" ]] || continue
    archive_files+=("$path")
done

((${#archive_files[@]} > 0)) || fail "No project files found to archive"

if $list_only; then
    printf '%s\n' "${archive_files[@]}"
    exit 0
fi

require_command zip

(
    cd -- "$project_root"
    zip -q -y "$output_path" "${archive_files[@]}"
)

if command -v unzip >/dev/null 2>&1; then
    unzip -tq "$output_path" >/dev/null \
        || fail "The ZIP was created but failed its integrity check"
fi

archive_size="$(du -h "$output_path" | awk '{print $1}')"

printf 'Created: %s\n' "$output_path"
printf 'Files:   %d\n' "${#archive_files[@]}"
printf 'Size:    %s\n' "$archive_size"
